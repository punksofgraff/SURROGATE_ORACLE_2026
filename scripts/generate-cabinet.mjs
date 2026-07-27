/**
 * generate-cabinet.mjs
 * Uploads the arcade cabinet reference image to Tripo3D, polls for completion,
 * and saves the GLB to artifacts/surrogate-oracle/public/arcade-cabinet.glb
 */
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const KEY = process.env.TRIPO3D_API_KEY;
if (!KEY) { console.error('TRIPO3D_API_KEY not set'); process.exit(1); }

const API_HOST = 'api.tripo3d.ai';
const IMG_PATH = new URL('../attached_assets/Arcade_Sneak_Ar_1785188755199.png', import.meta.url).pathname;
const OUT_PATH = new URL('../artifacts/surrogate-oracle/public/arcade-cabinet.glb', import.meta.url).pathname;

function request(method, path_, body, isBuffer = false) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: API_HOST,
      path: path_,
      method,
      headers: {
        'Authorization': 'Bearer ' + KEY,
        ...(body && !isBuffer ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
        ...(isBuffer ? { 'Content-Length': body.length } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 1. Upload image via multipart ─────────────────────────────────────────────
async function uploadImage() {
  const imgData = fs.readFileSync(IMG_PATH);
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="arcade.png"\r\nContent-Type: image/png\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const multipart = Buffer.concat([header, imgData, footer]);

  const opts = {
    hostname: API_HOST,
    path: '/v2/openapi/upload',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + KEY,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': multipart.length,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        console.log('Upload status:', res.statusCode, text.slice(0, 200));
        try { resolve(JSON.parse(text)); } catch { resolve({ raw: text }); }
      });
    });
    req.on('error', reject);
    req.write(multipart);
    req.end();
  });
}

// ── 2. Submit image_to_model task ─────────────────────────────────────────────
async function submitTask(fileToken) {
  const body = JSON.stringify({
    type: 'image_to_model',
    file: { type: 'png', file_token: fileToken },
    model_version: 'v2.0-20240919',
    texture: true,
    pbr: true,
  });
  const res = await request('POST', '/v2/openapi/task', body);
  const data = JSON.parse(res.body.toString());
  console.log('Task submitted:', JSON.stringify(data));
  return data?.data?.task_id;
}

// ── 3. Poll task status ───────────────────────────────────────────────────────
async function pollTask(taskId) {
  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    const res = await request('GET', `/v2/openapi/task/${taskId}`);
    const data = JSON.parse(res.body.toString());
    const status = data?.data?.status;
    const progress = data?.data?.progress ?? 0;
    console.log(`[${i * 5}s] status=${status} progress=${progress}%`);
    if (status === 'success') return data.data;
    if (status === 'failed' || status === 'cancelled') {
      throw new Error('Task failed: ' + JSON.stringify(data));
    }
  }
  throw new Error('Timed out after 600s');
}

// ── 4. Download GLB ───────────────────────────────────────────────────────────
function followRedirects(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft === 0) return reject(new Error('Too many redirects'));
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return followRedirects(res.headers.location, redirectsLeft - 1).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function downloadGlb(taskData) {
  const glbUrl = taskData?.output?.model;
  if (!glbUrl) throw new Error('No model URL in task output: ' + JSON.stringify(taskData?.output));
  console.log('Downloading GLB from:', glbUrl);
  const buf = await followRedirects(glbUrl);
  fs.writeFileSync(OUT_PATH, buf);
  console.log('Saved GLB to', OUT_PATH, buf.length, 'bytes');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Tripo3D Cabinet Generation ===');
  console.log('Image:', IMG_PATH);

  // Upload image
  const uploadResult = await uploadImage();
  const fileToken = uploadResult?.data?.image_token;
  if (!fileToken) {
    console.error('Upload failed, trying text_to_model fallback...');
    // Fallback: text-to-3D description of the cabinet
    const body = JSON.stringify({
      type: 'text_to_model',
      prompt: 'Arcade game cabinet with graffiti street art painted sides, purple and teal color scheme, SNEAKAR text on marquee, large black screen, two joysticks with purple balls, colorful buttons, urban cyberpunk style, standalone 3D model, front-facing view',
      model_version: 'v2.0-20240919',
      texture: true,
      pbr: true,
    });
    const res = await request('POST', '/v2/openapi/task', body);
    const data = JSON.parse(res.body.toString());
    console.log('Text task:', JSON.stringify(data));
    const taskId = data?.data?.task_id;
    if (!taskId) throw new Error('Task submission failed');
    const taskData = await pollTask(taskId);
    await downloadGlb(taskData);
    return;
  }

  console.log('Got file token:', fileToken);
  const taskId = await submitTask(fileToken);
  if (!taskId) throw new Error('No task ID returned');
  
  console.log('Polling task:', taskId);
  const taskData = await pollTask(taskId);
  await downloadGlb(taskData);
  console.log('Done! GLB saved to public/arcade-cabinet.glb');
}

main().catch(e => { console.error('FAILED:', e); process.exit(1); });
