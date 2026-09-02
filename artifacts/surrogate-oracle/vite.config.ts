import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import basicSsl from "@vitejs/plugin-basic-ssl";

const LOG_FILEStr = path.resolve(import.meta.dirname, ".oracle-dev-log.jsonl");

// Use the correct LOG_FILE path name (avoid shadowing if needed, keeping LOG_FILE)
const LOG_FILE = path.resolve(import.meta.dirname, ".oracle-dev-log.jsonl");

function oracleLogRelayPlugin() {
  return {
    name: 'oracle-log-relay',
    // Stamp the HTML document with BUILD_ID on every server start.
    // Any proxy or browser that cached the previous HTML will see a changed
    // ETag / content and fetch a fresh copy, pulling in all updated JS modules.
    transformIndexHtml(html: string) {
      return html.replace(
        '</head>',
        `  <meta name="x-build-id" content="${BUILD_ID}" />\n</head>`
      );
    },
    configureServer(server: any) {
      // /bust — cache nuke. 302 redirect with timestamp forces browser to fetch fresh bundle.
      server.middlewares.use('/bust', (_req: any, res: any) => {
        const ts = Date.now();
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Location', `/?_b=${ts}&reset`);
        res.writeHead(302);
        res.end();
      });

      server.middlewares.use('/api/oracle-log', (req: any, res: any) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        let body = '';
        req.on('data', (chunk: any) => { body += chunk; });
        req.on('end', () => {
          try {
            const line = JSON.stringify({ ...JSON.parse(body), _t: Date.now() });
            fs.appendFileSync(LOG_FILE, line + '\n');
          } catch {}
          res.writeHead(204); res.end();
        });
      });
    },
  };
}

const rawPort = process.env.PORT || "5173";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "./";

// Stamp every build with the current epoch so the app can detect stale sessions
const BUILD_ID = Date.now().toString(36);
const execFileAsync = promisify(execFile);

type StoryPageRequest = {
  pageNumber: number;
  sheetIndex: 0 | 1;
  row: number;
  column: number;
  durationSeconds: number;
  soundEffects?: StorySoundEffectRequest[];
  sfx?: StorySoundEffectRequest[];
};

type StoryCharacterTrackRequest = {
  public_url?: string;
  publicUrl?: string;
  start_seconds?: number;
  startSeconds?: number;
  offsetSeconds?: number;
  timing_metadata?: {
    lineCues?: Array<{
      start?: string | number;
      end?: string | number;
      pageOffsetSeconds?: number;
    }>;
  };
  timingMetadata?: StoryCharacterTrackRequest['timing_metadata'];
  rhubarb?: StoryCharacterTrackRequest['timing_metadata'];
};

type StorySoundEffectRequest = {
  url?: string;
  public_url?: string;
  publicUrl?: string;
  assetUrl?: string;
  audioUrl?: string;
  path?: string;
  assetPath?: string;
  base64?: string;
  mimeType?: string;
  pageNumber?: number;
  offsetSeconds?: number;
  offsetMs?: number;
  pageOffsetSeconds?: number;
  startSeconds?: number;
  volume?: number;
};

function decodeDataAsset(asset: unknown): { bytes: Buffer; mimeType: string } {
  if (!asset || typeof asset !== 'object') throw new Error('Story asset is missing.');
  const record = asset as { base64?: unknown; mimeType?: unknown };
  if (typeof record.base64 !== 'string' || record.base64.length > 16_000_000) {
    throw new Error('Story asset is invalid or too large.');
  }
  return {
    bytes: Buffer.from(record.base64, 'base64'),
    mimeType: typeof record.mimeType === 'string' ? record.mimeType : 'application/octet-stream',
  };
}

async function downloadRemoteAsset(url: unknown, label: string, maxBytes = 80_000_000): Promise<Buffer> {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
    throw new Error(`${label} must be an HTTPS URL.`);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label} could not be downloaded (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > maxBytes) throw new Error(`${label} is empty or too large.`);
  return bytes;
}

function finiteNonNegative(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function safeVolume(value: unknown, fallback = 0.65): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(4, number)) : fallback;
}

function effectInputUrl(effect: StorySoundEffectRequest): string | null {
  const value = effect.url ?? effect.public_url ?? effect.publicUrl ?? effect.assetUrl ?? effect.audioUrl;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function localStoryAssetPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || /^https?:\/\//i.test(value)) return null;
  const relative = value.trim().replace(/^\/+/, '').replace(/^public\//i, '');
  if (!relative || relative.includes('..') || !/^[a-zA-Z0-9._/-]+$/.test(relative)) return null;
  const publicRoot = path.resolve(import.meta.dirname, 'public');
  const resolved = path.resolve(publicRoot, relative);
  if (!resolved.startsWith(`${publicRoot}${path.sep}`) || !fs.existsSync(resolved)) return null;
  return resolved;
}

async function discoverStorySoundEffects(
  body: any,
  pages: StoryPageRequest[],
  dir: string,
): Promise<Array<{ file: string; startSeconds: number; volume: number }>> {
  const pageStarts = new Map<number, number>();
  let storyOffset = 0;
  pages.forEach(page => {
    pageStarts.set(page.pageNumber, storyOffset);
    storyOffset += Number(page.durationSeconds);
  });
  const entries: Array<{ effect: StorySoundEffectRequest; pageRelative: boolean }> = [];
  const addEntries = (value: unknown, pageNumber?: number, pageRelative = false) => {
    if (!Array.isArray(value)) return;
    value.forEach(raw => {
      if (!raw || typeof raw !== 'object') return;
      const effect = { ...(raw as StorySoundEffectRequest) };
      if (pageNumber !== undefined && effect.pageNumber === undefined) effect.pageNumber = pageNumber;
      entries.push({ effect, pageRelative: pageRelative || effect.pageNumber !== undefined });
    });
  };
  addEntries(body?.soundEffects);
  addEntries(body?.sfx);
  addEntries(body?.sfxAssets);
  pages.forEach(page => {
    addEntries(page.soundEffects, page.pageNumber, true);
    addEntries(page.sfx, page.pageNumber, true);
  });

  const seen = new Set<string>();
  const discovered: Array<{ file: string; startSeconds: number; volume: number }> = [];
  for (const [index, { effect, pageRelative }] of entries.entries()) {
    const pageNumber = Number(effect.pageNumber);
    const pageStart = pageStarts.get(pageNumber) ?? 0;
    const hasOffsetMs = effect.offsetMs !== undefined;
    const relativeOffset = hasOffsetMs
      ? finiteNonNegative(effect.offsetMs) / 1000
      : finiteNonNegative(effect.pageOffsetSeconds ?? effect.offsetSeconds);
    const startSeconds = effect.startSeconds !== undefined
      ? finiteNonNegative(effect.startSeconds)
      : pageRelative || Number.isInteger(pageNumber)
        ? pageStart + relativeOffset
        : relativeOffset;
    const url = effectInputUrl(effect);
    const dedupeKey = `${url ?? effect.path ?? effect.assetPath ?? effect.base64 ?? ''}:${startSeconds.toFixed(3)}`;
    if (!url && !effect.path && !effect.assetPath && typeof effect.base64 !== 'string') continue;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const mimeType = typeof effect.mimeType === 'string' ? effect.mimeType : 'audio/mpeg';
    const extension = mimeType.includes('wav') ? 'wav' : mimeType.includes('ogg') ? 'ogg' : 'mp3';
    const file = path.join(dir, `sfx-${index}.${extension}`);
    const localPath = localStoryAssetPath(url ?? effect.path ?? effect.assetPath);
    if (typeof effect.base64 === 'string') {
      fs.writeFileSync(file, decodeDataAsset({ base64: effect.base64, mimeType }).bytes);
    } else if (localPath) {
      fs.copyFileSync(localPath, file);
    } else {
      fs.writeFileSync(file, await downloadRemoteAsset(url, `Story sound effect ${index + 1}`, 30_000_000));
    }
    discovered.push({ file, startSeconds, volume: safeVolume(effect.volume) });
  }
  return discovered;
}

async function runFfmpeg(args: string[]): Promise<void> {
  await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 2 * 1024 * 1024 });
}

async function validateStoryFilm(file: string, expectedDuration: number): Promise<{ durationSeconds: number; audioTrackPresent: boolean }> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type',
    '-of', 'json',
    file,
  ], { maxBuffer: 256 * 1024 });
  const probe = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string }>;
  };
  const durationSeconds = Number(probe.format?.duration);
  const audioTrackPresent = Boolean(probe.streams?.some(stream => stream.codec_type === 'audio'));
  if (!Number.isFinite(durationSeconds) || Math.abs(durationSeconds - expectedDuration) > 0.75) {
    throw new Error(`Story film duration validation failed (${Number.isFinite(durationSeconds) ? `${durationSeconds.toFixed(2)}s` : 'unknown'}; expected ${expectedDuration}s).`);
  }
  if (!audioTrackPresent) throw new Error('Story film validation failed: the final MP4 has no audio track.');
  return { durationSeconds, audioTrackPresent };
}

async function stitchIllustrationStory(body: any): Promise<{
  bytes: Buffer;
  narrationAvailable: boolean;
  durationSeconds: number;
  audioTrackPresent: boolean;
  soundEffectsMixed: number;
  characterTimingApplied: number;
}> {
  const sheets = Array.isArray(body?.sheets) ? body.sheets : [];
  const sceneUrls = Array.isArray(body?.sceneUrls) ? body.sceneUrls : [];
  const pages = Array.isArray(body?.pages) ? body.pages as StoryPageRequest[] : [];
  const usingRemoteScenes = sceneUrls.length === 32;
  if ((!usingRemoteScenes && sheets.length !== 2) || pages.length !== 32) {
    throw new Error('Story assembly requires either 32 FAL scene URLs or two sheets, plus 32 pages.');
  }
  const duration = pages.reduce((sum, page) => sum + Number(page.durationSeconds || 0), 0);
  const orderedPages = pages.every((page, index) => page.pageNumber === index + 1
    && page.sheetIndex === (index < 16 ? 0 : 1)
    && page.row === Math.floor((index % 16) / 4)
    && page.column === index % 4);
  if (!orderedPages || !pages.every(page => Number.isInteger(page.pageNumber) && page.sheetIndex >= 0 && page.sheetIndex <= 1
    && page.row >= 0 && page.row < 4 && page.column >= 0 && page.column < 4
    && Number(page.durationSeconds) > 0 && Number(page.durationSeconds) <= 10)
    || duration < 100 || duration > 180) {
    throw new Error('Story pages must be contiguous 01–32 in sheet order with valid 4×4 coordinates and timing.');
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-story-'));
  try {
    const sheetFiles = usingRemoteScenes ? [] : sheets.map((asset: unknown, index: number) => {
      const decoded = decodeDataAsset(asset);
      const file = path.join(dir, `sheet-${index}.png`);
      fs.writeFileSync(file, decoded.bytes);
      return file;
    });
    const music = body.music
      ? decodeDataAsset(body.music)
      : typeof body.musicUrl === 'string'
        ? { bytes: await downloadRemoteAsset(body.musicUrl, 'Persisted Lyria soundtrack', 40_000_000), mimeType: 'audio/mpeg' }
        : null;
    if (!music) throw new Error('Story assembly requires a Lyria soundtrack or persisted music URL.');
    const musicFile = path.join(dir, `music${music.mimeType.includes('wav') ? '.wav' : '.mp3'}`);
    fs.writeFileSync(musicFile, music.bytes);
    const narration = body.narration
      ? decodeDataAsset(body.narration)
      : typeof body.narrationUrl === 'string'
        ? { bytes: await downloadRemoteAsset(body.narrationUrl, 'Persisted story narration', 40_000_000), mimeType: 'audio/wav' }
        : null;
    const narrationFile = narration
      ? path.join(dir, narration.mimeType.includes('wav') ? 'narration.wav' : 'narration.mp3')
      : null;
    if (narration && narrationFile) fs.writeFileSync(narrationFile, narration.bytes);

    const clipFiles: string[] = [];
    if (usingRemoteScenes) {
      for (const [index, page] of pages.entries()) {
        const remoteFile = path.join(dir, `remote-${String(page.pageNumber).padStart(2, '0')}.mp4`);
        fs.writeFileSync(remoteFile, await downloadRemoteAsset(sceneUrls[index], `FAL scene ${page.pageNumber}`));
        const clipFile = path.join(dir, `page-${String(page.pageNumber).padStart(2, '0')}.mp4`);
        const fadeOutStart = Math.max(0.1, Number(page.durationSeconds) - 0.22);
        const visual = `scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p,fade=t=in:st=0:d=0.22,fade=t=out:st=${fadeOutStart}:d=0.22`;
        await runFfmpeg([
          '-y', '-i', remoteFile,
          '-vf', visual, '-t', String(page.durationSeconds),
          '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', clipFile,
        ]);
        clipFiles.push(clipFile);
      }
    } else for (const page of pages) {
      const clipFile = path.join(dir, `page-${String(page.pageNumber).padStart(2, '0')}.mp4`);
      const fadeOutStart = Math.max(0.1, Number(page.durationSeconds) - 0.22);
      const crop = `crop=iw/4:ih/4:${page.column}*iw/4:${page.row}*ih/4`;
      const visual = `${crop},scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.0007,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x720:fps=24,fade=t=in:st=0:d=0.22,fade=t=out:st=${fadeOutStart}:d=0.22`;
      await runFfmpeg([
        '-y', '-loop', '1', '-i', sheetFiles[page.sheetIndex],
        '-vf', visual, '-t', String(page.durationSeconds), '-r', '24',
        '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', clipFile,
      ]);
      clipFiles.push(clipFile);
    }

    const concatFile = path.join(dir, 'story.ffconcat');
    fs.writeFileSync(concatFile, [
      'ffconcat version 1.0',
      ...clipFiles.map(file => `file '${file.replace(/'/g, `'\\''`)}'`),
    ].join('\n'));
    const silentFile = path.join(dir, 'story-silent.mp4');
    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', silentFile]);

    const finalFile = path.join(dir, 'surrogate-story.mp4');
    const characterTracks = Array.isArray(body?.characterVoiceTracks)
      ? body.characterVoiceTracks as StoryCharacterTrackRequest[]
      : [];
    const characterFiles: Array<{ file: string; track: StoryCharacterTrackRequest }> = [];
    for (const [index, track] of characterTracks.entries()) {
      const url = track?.public_url ?? track?.publicUrl;
      if (!url) continue;
      const file = path.join(dir, `character-${index}.wav`);
      fs.writeFileSync(file, await downloadRemoteAsset(url, `Character track ${index + 1}`, 30_000_000));
      characterFiles.push({ file, track });
    }
    const soundEffects = await discoverStorySoundEffects(body, pages, dir);
    const audioArgs: string[] = ['-y', '-i', silentFile, '-stream_loop', '-1', '-i', musicFile];
    if (narrationFile) audioArgs.push('-i', narrationFile);
    characterFiles.forEach(({ file }) => audioArgs.push('-i', file));
    soundEffects.forEach(effect => audioArgs.push('-i', effect.file));
    const audioLabels = ['[music]'];
    const filters = ['[1:a]volume=0.28[music]'];
    if (narrationFile) {
      filters.push('[2:a]volume=1.0[narration]');
      audioLabels.push('[narration]');
    }
    let nextInput = narrationFile ? 3 : 2;
    let timingApplied = 0;
    characterFiles.forEach(({ track }, index) => {
      const timing = track?.timing_metadata ?? track?.timingMetadata ?? track?.rhubarb;
      const lineCues = Array.isArray(timing?.lineCues) ? timing.lineCues : [];
      const usableCues = lineCues.flatMap(cue => {
        const start = finiteNonNegative(cue.start, -1);
        const end = finiteNonNegative(cue.end, -1);
        if (start < 0 || end <= start) return [];
        return [{
          start,
          end,
          pageOffsetSeconds: finiteNonNegative(cue.pageOffsetSeconds),
        }];
      });
      if (usableCues.length) {
        usableCues.forEach((cue, cueIndex) => {
          const label = `character${index}_${cueIndex}`;
          const delayMs = Math.round(cue.pageOffsetSeconds * 1000);
          filters.push(
            `[${nextInput}:a]atrim=start=${cue.start.toFixed(3)}:end=${cue.end.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},volume=0.78[${label}]`,
          );
          audioLabels.push(`[${label}]`);
        });
        timingApplied += 1;
      } else {
        const startSeconds = finiteNonNegative(track?.start_seconds ?? track?.startSeconds ?? track?.offsetSeconds);
        const label = `character${index}`;
        const delayMs = Math.round(startSeconds * 1000);
        filters.push(`[${nextInput}:a]adelay=${delayMs}|${delayMs},volume=0.78[${label}]`);
        audioLabels.push(`[${label}]`);
      }
      nextInput += 1;
    });
    soundEffects.forEach((effect, index) => {
      const label = `sfx${index}`;
      const delayMs = Math.round(effect.startSeconds * 1000);
      filters.push(
        `[${nextInput}:a]asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},volume=${effect.volume.toFixed(3)}[${label}]`,
      );
      audioLabels.push(`[${label}]`);
      nextInput += 1;
    });
    filters.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=2[a]`);
    await runFfmpeg([
      ...audioArgs,
      '-filter_complex', filters.join(';'),
      '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', String(duration), finalFile,
    ]);
    const validation = await validateStoryFilm(finalFile, duration);
    return {
      bytes: fs.readFileSync(finalFile),
      narrationAvailable: Boolean(narrationFile),
      soundEffectsMixed: soundEffects.length,
      characterTimingApplied: timingApplied,
      ...validation,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function illustrationStoryStitchPlugin() {
  return {
    name: 'illustration-story-stitch',
    configureServer(server: any) {
      server.middlewares.use('/api/illustration-story-stitch', (req: any, res: any) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
          if (body.length > 48_000_000) req.destroy(new Error('Story request is too large.'));
        });
        req.on('end', async () => {
          try {
            const result = await stitchIllustrationStory(JSON.parse(body));
            res.writeHead(200, {
              'Content-Type': 'video/mp4',
              'Content-Length': result.bytes.length,
              'Cache-Control': 'no-store',
              'X-Story-Page-Count': '32',
              'X-Story-Narration': result.narrationAvailable ? 'available' : 'unavailable',
              'X-Story-Duration': String(result.durationSeconds),
              'X-Story-Audio': result.audioTrackPresent ? 'present' : 'missing',
            'X-Story-SFX': String(result.soundEffectsMixed),
            'X-Story-Character-Timing': String(result.characterTimingApplied),
            });
            res.end(result.bytes);
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Story stitch failed.' }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  envPrefix: ['VITE_', 'SUPABASE_'],
  define: {
    // Injected at build time — use import.meta.env.VITE_BUILD_ID in components
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(BUILD_ID),
  },
  // Strip console/debugger from production builds — keeps demo diagnostics in `pnpm dev`
  // but removes ~76 console.* calls (noise + minor cost) from a built/preview deploy.
  // logStep() (the live HUD relay) is unaffected.
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    oracleLogRelayPlugin(),
    illustrationStoryStitchPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    watch: {
      ignored: ['**/.oracle-dev-log.jsonl'],
    },
    // Force no-cache on every dev response — browser won't reuse stale JS/CSS
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      // Delegate the features the embedded wallet iframe needs to the wallet origin.
      // NOTE: this header is DEV-ONLY — production serves a static build (no server to
      // emit headers), and Permissions-Policy is ignored as an HTML <meta>. In production
      // the iframe `allow=` attribute (see SurrogateOracleImmersion.tsx) is the sole,
      // spec-compliant delegation mechanism and already carries the full feature set.
      // A Permissions-Policy header only constrains the features it names; anything omitted
      // keeps its default `self` allowlist, so this list is parity/intent, not a gate.
      'Permissions-Policy': 'publickey-credentials-get=(self "https://wallet.thesurrogate.me"), publickey-credentials-create=(self "https://wallet.thesurrogate.me"), payment=(self "https://wallet.thesurrogate.me"), clipboard-write=(self "https://wallet.thesurrogate.me")',
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
