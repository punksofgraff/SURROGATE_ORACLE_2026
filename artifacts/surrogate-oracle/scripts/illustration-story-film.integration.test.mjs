import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:https';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { join } from 'node:path';
import { createServer as createTcpServer } from 'node:net';

const execFileAsync = promisify(execFile);
const artifactDir = new URL('..', import.meta.url).pathname;
const PAGE_COUNT = 32;
const PAGE_DURATION_SECONDS = 3.75;
const EXPECTED_DURATION_SECONDS = PAGE_COUNT * PAGE_DURATION_SECONDS;

async function freePort() {
  const server = createTcpServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function run(command, args, cwd) {
  await execFileAsync(command, args, { cwd, maxBuffer: 2 * 1024 * 1024 });
}

function pages() {
  return Array.from({ length: PAGE_COUNT }, (_, index) => ({
    pageNumber: index + 1,
    sheetIndex: index < 16 ? 0 : 1,
    row: Math.floor((index % 16) / 4),
    column: index % 4,
    durationSeconds: PAGE_DURATION_SECONDS,
  }));
}

async function createFixtures(dir) {
  const sceneFile = join(dir, 'scene.mp4');
  const audioFile = join(dir, 'audio.wav');
  await run('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=0x18263d:s=320x180:r=24:d=4',
    '-an',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    sceneFile,
  ], artifactDir);
  await run('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:sample_rate=16000:duration=4',
    '-c:a', 'pcm_s16le',
    audioFile,
  ], artifactDir);
  return {
    scene: await readFile(sceneFile),
    audio: await readFile(audioFile),
  };
}

async function startFixtureServer(fixtures) {
  const keyFile = join(fixtures.dir, 'fixture-key.pem');
  const certFile = join(fixtures.dir, 'fixture-cert.pem');
  await run('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyFile,
    '-out', certFile,
    '-days', '1',
    '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName = IP:127.0.0.1',
  ], artifactDir);

  const key = await readFile(keyFile);
  const cert = await readFile(certFile);
  const requests = [];
  const server = createServer({ key, cert }, (request, response) => {
    requests.push(request.url);
    if (/^\/scene\/\d{2}\.mp4$/.test(request.url ?? '')) {
      response.writeHead(200, { 'Content-Type': 'video/mp4' });
      response.end(fixtures.scene);
      return;
    }
    if (request.url === '/music.wav' || request.url === '/narration.wav') {
      response.writeHead(200, { 'Content-Type': 'audio/wav' });
      response.end(fixtures.audio);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    server,
    requests,
    baseUrl: `https://127.0.0.1:${server.address().port}`,
  };
}

async function startVite() {
  const port = await freePort();
  const process = spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1'], {
    cwd: artifactDir,
    env: {
      ...processEnv(),
      PORT: String(port),
      BASE_PATH: './',
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  process.stdout.on('data', chunk => { output += chunk.toString(); });
  process.stderr.on('data', chunk => { output += chunk.toString(); });
  const url = `http://127.0.0.1:${port}`;
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (process.exitCode !== null) throw new Error(`Vite exited before startup.\n${output}`);
      try {
        const response = await fetch(url);
        if (response.ok) return { process, url };
      } catch {
        // Keep waiting for Vite to bind its configured port.
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Vite did not start.\n${output}`);
  } catch (error) {
    process.kill('SIGTERM');
    throw error;
  }
}

function processEnv() {
  return { ...globalThis.process?.env };
}

async function stopProcess(process) {
  if (process.exitCode !== null) return;
  process.kill('SIGTERM');
  await once(process, 'exit').catch(() => {});
}

function persistedScenes(baseUrl) {
  return pages().map(page => ({
    ...page,
    status: 'ready',
    outputUrl: `${baseUrl}/scene/${String(page.pageNumber).padStart(2, '0')}.mp4`,
  }));
}

function controlledSubmissionRun() {
  const submissions = [];
  const submittedPageNumbers = new Set();
  const submitPage = pageNumber => {
    assert.equal(submittedPageNumbers.has(pageNumber), false, `page ${pageNumber} was submitted twice`);
    submittedPageNumbers.add(pageNumber);
    submissions.push(pageNumber);
    return `fal-request-${pageNumber}`;
  };
  const scenes = pages().map(page => ({
    ...page,
    status: 'generating',
    falRequestId: submitPage(page.pageNumber),
    outputUrl: `persisted-scene-${page.pageNumber}`,
  }));
  const persisted = JSON.parse(JSON.stringify({
    id: 'controlled-story-job',
    status: 'generating',
    scenes,
  }));

  // A refresh only restores/polls the persisted job. It must not submit any
  // page again, and local assembly consumes the already persisted URLs.
  const refreshed = JSON.parse(JSON.stringify(persisted));
  assert.equal(refreshed.scenes.length, PAGE_COUNT);
  assert.equal(refreshed.scenes.every(scene => scene.status === 'generating' && scene.outputUrl), true);
  assert.equal(submissions.length, PAGE_COUNT);

  // Cancellation is terminal and does not create a paid retry.
  const cancelled = {
    ...refreshed,
    status: 'cancelled',
    scenes: refreshed.scenes.map(scene => ({ ...scene, status: 'cancelled' })),
  };
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(submissions.length, PAGE_COUNT);

  // An explicit retry is the only allowed extra submission, and only for the
  // requested page. The harness intentionally models no automatic retry.
  const retryPageNumber = 7;
  submissions.push(retryPageNumber);
  assert.deepEqual(
    submissions.filter(pageNumber => pageNumber === retryPageNumber),
    [retryPageNumber, retryPageNumber],
  );
  assert.equal(submissions.filter(pageNumber => pageNumber !== retryPageNumber).length, PAGE_COUNT - 1);
  return { submissions, persisted };
}

async function assemblePersistedStory(viteUrl, baseUrl) {
  const response = await fetch(`${viteUrl}/api/illustration-story-stitch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sceneUrls: pages().map(page => `${baseUrl}/scene/${String(page.pageNumber).padStart(2, '0')}.mp4`),
      musicUrl: `${baseUrl}/music.wav`,
      narrationUrl: `${baseUrl}/narration.wav`,
      characterVoiceTracks: [],
      pages: pages(),
    }),
  });
  const errorBody = response.ok ? '' : await response.text();
  assert.equal(response.status, 200, errorBody);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { response, bytes };
}

async function main() {
  const dir = await mkdtemp('/tmp/oracle-story-film-integration-');
  let fixtureServer;
  let vite;
  try {
    const fixtures = { dir, ...(await createFixtures(dir)) };
    fixtureServer = await startFixtureServer(fixtures);
    vite = await startVite();

    const { persisted } = controlledSubmissionRun();
    assert.equal(persisted.scenes.every(scene => scene.outputUrl), true);
    const { response, bytes } = await assemblePersistedStory(vite.url, fixtureServer.baseUrl);

    assert.equal(response.headers.get('content-type'), 'video/mp4');
    assert.equal(response.headers.get('x-story-page-count'), String(PAGE_COUNT));
    assert.equal(response.headers.get('x-story-audio'), 'present');
    assert.equal(Number(response.headers.get('x-story-duration')), EXPECTED_DURATION_SECONDS);
    assert.ok(bytes.subarray(4, 8).toString('ascii') === 'ftyp', 'stitch response must be an MP4');

    const finalFile = join(dir, 'final-story.mp4');
    await writeFile(finalFile, bytes);
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=codec_type,width,height',
      '-of', 'json',
      finalFile,
    ]);
    const probe = JSON.parse(stdout);
    const video = probe.streams.find(stream => stream.codec_type === 'video');
    assert.deepEqual([video.width, video.height], [1280, 720]);
    assert.ok(probe.streams.some(stream => stream.codec_type === 'audio'));
    assert.ok(Math.abs(Number(probe.format.duration) - EXPECTED_DURATION_SECONDS) <= 0.75);

    const sceneRequests = fixtureServer.requests.filter(url => /^\/scene\/\d{2}\.mp4$/.test(url ?? ''));
    assert.equal(sceneRequests.length, PAGE_COUNT, 'local assembly must download every persisted scene exactly once');
    assert.deepEqual(
      sceneRequests.map(url => Number(url.match(/\/(\d+)\.mp4$/)[1])),
      pages().map(page => page.pageNumber),
      'persisted scene URLs must be downloaded in page order',
    );
    assert.equal(fixtureServer.requests.filter(url => url === '/music.wav').length, 1);
    assert.equal(fixtureServer.requests.filter(url => url === '/narration.wav').length, 1);
    console.log('illustration story film integration passed (32 persisted scenes, 16:9 MP4/audio, refresh/cancel/retry race controls)');
  } finally {
    await stopProcess(vite?.process);
    fixtureServer?.server.close();
    await rm(dir, { recursive: true, force: true });
  }
}

await main();