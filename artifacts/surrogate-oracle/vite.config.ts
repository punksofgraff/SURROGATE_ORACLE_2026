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
  shotPlan?: {
    treatment?: string;
    subjectFocus?: string;
    actionBeat?: string;
    environmentBeat?: string;
    cameraMove?: string;
    performanceCue?: string;
    soundCue?: string;
    soundOffsetSeconds?: number;
    lipSyncMode?: string;
    focusX?: number;
    focusY?: number;
  };
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

function storyPerformanceFilter(page: StoryPageRequest): string {
  const plan = page.shotPlan;
  if (!plan?.treatment || !plan.actionBeat || !plan.environmentBeat || !plan.cameraMove || !plan.performanceCue) {
    throw new Error(`Story page ${page.pageNumber} has no authored performance plan.`);
  }
  const phase = (page.pageNumber * 0.73).toFixed(3);
  const centerX = `(iw-1280)/2`;
  const centerY = `(ih-720)/2`;
  const cameraByTreatment: Record<string, { x: string; y: string; stage: string }> = {
    'shoreline-reveal': {
      x: `${centerX}+760*sin(2*PI*(t+${phase})/${page.durationSeconds})`,
      y: `${centerY}+34*cos(2*PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'wave-splash': {
      x: `${centerX}+190*sin(2*PI*(t+${phase})/${page.durationSeconds})`,
      y: `${centerY}-90*sin(PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'underwater-drift': {
      x: `${centerX}+520*sin(2*PI*(t+${phase})/${page.durationSeconds})`,
      y: `${centerY}+170*cos(2*PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'comic-reaction': {
      x: `${centerX}+if(lt(t,${page.durationSeconds / 2}),-260+520*t/${page.durationSeconds / 2},260-520*(t-${page.durationSeconds / 2})/${page.durationSeconds / 2})`,
      y: `${centerY}+24*sin(2*PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'tunnel-pull': {
      x: `${centerX}+260*sin(PI*(t+${phase})/${page.durationSeconds})`,
      y: `${centerY}+180*sin(PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'threshold-crossing': {
      x: `${centerX}-520+1040*t/${page.durationSeconds}`,
      y: `${centerY}+70*sin(2*PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'coral-welcome': {
      x: `${centerX}+360*sin(PI*(t+${phase})/${page.durationSeconds})`,
      y: `${centerY}-120*sin(PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'creature-approach': {
      x: `${centerX}+150*sin(2*PI*(t+${phase})/${page.durationSeconds})`,
      y: `${centerY}+80*cos(PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'impact-shake': {
      x: `${centerX}+if(lt(t,0.42),115*cos(38*t),36*sin(18*t)*exp(-1.8*(t-0.42)))`,
      y: `${centerY}+if(lt(t,0.42),70*sin(42*t),22*cos(16*t)*exp(-1.8*(t-0.42)))`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'rescue-rush': {
      x: `${centerX}-760+1520*t/${page.durationSeconds}`,
      y: `${centerY}+55*sin(4*PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'group-release': {
      x: `${centerX}+420*sin(PI*(t+${phase})/${page.durationSeconds})`,
      y: `${centerY}+110*cos(PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'moonrise-float': {
      x: `${centerX}+130*sin(PI*(t+${phase})/${page.durationSeconds})`,
      y: `${centerY}-300*t/${page.durationSeconds}`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'bedtime-settle': {
      x: `${centerX}+if(lt(t,${page.durationSeconds / 2}),-180+360*t/${page.durationSeconds / 2},180-360*(t-${page.durationSeconds / 2})/${page.durationSeconds / 2})`,
      y: `${centerY}+20*sin(2*PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'portal-glide': {
      x: `${centerX}+300*sin(PI*(t+${phase})/${page.durationSeconds})`,
      y: `${centerY}+260*sin(PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'hero-entrance': {
      x: `${centerX}-820+1640*t/${page.durationSeconds}`,
      y: `${centerY}+35*sin(6*PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'cave-collapse': {
      x: `${centerX}+if(lt(t,0.6),120*sin(30*t),80*sin(11*t)*exp(-1.6*(t-0.6)))`,
      y: `${centerY}+if(lt(t,0.6),-120*t/0.6,34*cos(14*t)*exp(-1.4*(t-0.6)))`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'forest-breath': {
      x: `${centerX}+280*sin(2*PI*(t+${phase})/${page.durationSeconds})`,
      y: `${centerY}+100*sin(2*PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'monster-reveal': {
      x: `${centerX}+if(lt(t,${page.durationSeconds * 0.38}),-460+920*t/${page.durationSeconds * 0.38},460-920*(t-${page.durationSeconds * 0.38})/${page.durationSeconds * 0.62})`,
      y: `${centerY}+80*cos(PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'listening-hold': {
      x: `${centerX}+80*sin(PI*(t+${phase})/${page.durationSeconds})`,
      y: `${centerY}+38*cos(PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'teamwork-montage': {
      x: `${centerX}+if(lt(t,${page.durationSeconds / 3}),-500+1500*t/(${page.durationSeconds}/3),if(lt(t,${page.durationSeconds * 2 / 3}),500-1000*(t-${page.durationSeconds / 3})/(${page.durationSeconds}/3),-500+1000*(t-${page.durationSeconds * 2 / 3})/(${page.durationSeconds}/3)))`,
      y: `${centerY}+55*sin(6*PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'kindness-bloom': {
      x: `${centerX}+170*sin(PI*(t+${phase})/${page.durationSeconds})`,
      y: `${centerY}+90*sin(PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
    'signal-farewell': {
      x: `${centerX}+440*sin(PI*(t+${phase})/${page.durationSeconds})`,
      y: `${centerY}+180*cos(PI*(t+${phase})/${page.durationSeconds})`,
      stage: 'scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160',
    },
  };
  const camera = cameraByTreatment[plan.treatment] ?? cameraByTreatment['listening-hold'];
  const fadeOutStart = Math.max(0.1, Number(page.durationSeconds) - 0.22);
  const panel = `crop=iw/4:ih/4:${page.column}*iw/4:${page.row}*ih/4`;
  return [
    panel,
    camera.stage,
    `crop=1280:720:x='${camera.x}':y='${camera.y}'`,
    'setsar=1',
    'fps=24',
    'format=yuv420p',
    'fade=t=in:st=0:d=0.22',
    `fade=t=out:st=${fadeOutStart}:d=0.22`,
  ].join(',');
}

function storyCellPerformanceFilter(page: StoryPageRequest): string {
  const phase = (page.pageNumber * 0.73).toFixed(3);
  const duration = Math.max(0.1, Number(page.durationSeconds));
  const x = `(iw-1280)/2+${120 + (page.pageNumber % 4) * 40}*sin(2*PI*(t+${phase})/${duration})`;
  const y = `(ih-720)/2+${38 + (page.pageNumber % 3) * 12}*cos(PI*(t+${phase})/${duration})`;
  const fadeOutStart = Math.max(0.1, duration - 0.22);
  return [
    'scale=3840:2160:force_original_aspect_ratio=increase',
    'crop=3840:2160',
    `crop=1280:720:x='${x}':y='${y}'`,
    'setsar=1',
    'fps=24',
    'format=yuv420p',
    'fade=t=in:st=0:d=0.22',
    `fade=t=out:st=${fadeOutStart}:d=0.22`,
  ].join(',');
}

type AuthoredStoryEffect = { file: string; startSeconds: number; volume: number };

function authoredCueFilter(cue: string, duration: number): string {
  const safeDuration = Math.max(0.16, Math.min(1.2, duration));
  switch (cue) {
    case 'splash':
      return `anoisesrc=color=white:amplitude=0.2:duration=${safeDuration},lowpass=f=2600,afade=t=out:st=${Math.max(0.05, safeDuration - 0.25)}:d=0.25`;
    case 'impact':
      return `sine=frequency=82:duration=${safeDuration},afade=t=out:st=${Math.max(0.05, safeDuration - 0.3)}:d=0.3`;
    case 'portal':
      return `sine=frequency=330:duration=${safeDuration}, vibrato=f=5:d=0.3,afade=t=out:st=${Math.max(0.05, safeDuration - 0.35)}:d=0.35`;
    case 'sparkle':
    case 'web':
      return `sine=frequency=880:duration=${safeDuration},afade=t=out:st=${Math.max(0.05, safeDuration - 0.28)}:d=0.28`;
    case 'growl':
      return `sine=frequency=96:duration=${safeDuration},lowpass=f=900,afade=t=out:st=${Math.max(0.05, safeDuration - 0.3)}:d=0.3`;
    case 'release':
    case 'farewell':
      return `sine=frequency=523.25:duration=${safeDuration},afade=t=out:st=${Math.max(0.05, safeDuration - 0.4)}:d=0.4`;
    case 'shore':
    case 'water':
    case 'forest':
      return `anoisesrc=color=brown:amplitude=0.045:duration=${safeDuration},lowpass=f=1400,afade=t=out:st=${Math.max(0.05, safeDuration - 0.3)}:d=0.3`;
    case 'night':
    case 'settle':
    case 'kindness':
      return `sine=frequency=220:duration=${safeDuration},afade=t=out:st=${Math.max(0.05, safeDuration - 0.45)}:d=0.45`;
    default:
      return '';
  }
}

async function createAuthoredStoryEffects(
  pages: StoryPageRequest[],
  dir: string,
): Promise<AuthoredStoryEffect[]> {
  let storyOffset = 0;
  const effects: AuthoredStoryEffect[] = [];
  for (const page of pages) {
    const cue = page.shotPlan?.soundCue ?? 'none';
    const filter = authoredCueFilter(cue, cue === 'impact' || cue === 'splash' ? 0.55 : 0.8);
    if (filter) {
      const file = path.join(dir, `authored-${String(page.pageNumber).padStart(2, '0')}-${cue}.wav`);
      await runFfmpeg(['-y', '-f', 'lavfi', '-i', filter, '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', file]);
      effects.push({
        file,
        startSeconds: storyOffset + Math.max(0, Number(page.shotPlan?.soundOffsetSeconds) || 0),
        volume: cue === 'impact' || cue === 'growl' ? 0.2 : 0.12,
      });
    }
    storyOffset += Number(page.durationSeconds);
  }
  return effects;
}

async function hasAudioStream(file: string): Promise<boolean> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_type',
    '-of', 'csv=p=0',
    file,
  ], { maxBuffer: 64 * 1024 });
  return stdout.trim().length > 0;
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

async function probeStoryVideo(file: string): Promise<{ durationSeconds: number; audioTrackPresent: boolean }> {
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
  if (!Number.isFinite(durationSeconds)) throw new Error('Hosted workflow film duration could not be measured.');
  return {
    durationSeconds,
    audioTrackPresent: Boolean(probe.streams?.some(stream => stream.codec_type === 'audio')),
  };
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
  const cellUrls = Array.isArray(body?.cellUrls) ? body.cellUrls : [];
  const chunkUrls = Array.isArray(body?.chunkUrls) ? body.chunkUrls : [];
  const pollinationsShotFiles = Array.isArray(body?.pollinationsShotFiles)
    ? body.pollinationsShotFiles.filter((file: unknown): file is string => typeof file === 'string')
    : [];
  const hostedFilmUrl = typeof body?.hostedFilmUrl === 'string' ? body.hostedFilmUrl : '';
  const pages = Array.isArray(body?.pages) ? body.pages as StoryPageRequest[] : [];
  const usingRemoteScenes = sceneUrls.length === 32;
  const usingRemoteCells = cellUrls.length === 32;
  const usingRemoteChunks = chunkUrls.length === 10;
  const usingPollinationsShots = pollinationsShotFiles.length === 32
    && pollinationsShotFiles.every(file => file.startsWith(os.tmpdir()) && fs.existsSync(file));
  const usingHostedFilm = Boolean(hostedFilmUrl);
  if ((!usingRemoteScenes && !usingRemoteCells && !usingRemoteChunks && !usingPollinationsShots && !usingHostedFilm && sheets.length !== 2) || pages.length !== 32) {
    throw new Error('Story assembly requires one validated hosted film, ten H3 chunk URLs, 32 hosted scene URLs, 32 persisted cell URLs, 32 open short-shot files, or two sheets, plus 32 pages.');
  }
  const duration = pages.reduce((sum, page) => sum + Number(page.durationSeconds || 0), 0);
  const orderedPages = pages.every((page, index) => page.pageNumber === index + 1
    && page.sheetIndex === (index < 16 ? 0 : 1)
    && page.row === Math.floor((index % 16) / 4)
    && page.column === index % 4);
  const hasPerformancePlan = pages.every(page => Boolean(
    page.shotPlan?.treatment
      && page.shotPlan.actionBeat
      && page.shotPlan.environmentBeat
      && page.shotPlan.cameraMove
      && page.shotPlan.performanceCue,
  ));
  if (!orderedPages || !hasPerformancePlan || !pages.every(page => Number.isInteger(page.pageNumber) && page.sheetIndex >= 0 && page.sheetIndex <= 1
    && page.row >= 0 && page.row < 4 && page.column >= 0 && page.column < 4
    && Number(page.durationSeconds) > 0 && Number(page.durationSeconds) <= 10)
    || duration < 100 || duration > 180) {
    throw new Error('Story pages must be contiguous 01–32 in sheet order with a non-generic performance plan and valid 4×4 timing.');
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-story-'));
  try {
    const sheetFiles = usingRemoteScenes || usingRemoteCells || usingRemoteChunks || usingPollinationsShots || usingHostedFilm ? [] : sheets.map((asset: unknown, index: number) => {
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
    if (usingHostedFilm) {
      const remoteFile = path.join(dir, 'hosted-workflow-film.mp4');
      fs.writeFileSync(remoteFile, await downloadRemoteAsset(hostedFilmUrl, 'Validated hosted story film'));
      const hostedProbe = await probeStoryVideo(remoteFile);
      if (Math.abs(hostedProbe.durationSeconds - duration) > 0.75) {
        throw new Error(`Hosted workflow film duration validation failed (${hostedProbe.durationSeconds.toFixed(2)}s; expected ${duration}s).`);
      }
      const clipFile = path.join(dir, 'hosted-workflow-clip.mp4');
      const visual = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p';
      const clipArgs = ['-y', '-i', remoteFile];
      if (!hostedProbe.audioTrackPresent) {
        clipArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
      }
      clipArgs.push(
        '-vf', visual,
        '-t', String(duration),
        '-map', '0:v:0',
        '-map', hostedProbe.audioTrackPresent ? '0:a:0' : '1:a:0',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-ar', '48000',
        '-ac', '2',
        '-b:a', '96k',
        clipFile,
      );
      await runFfmpeg(clipArgs);
      clipFiles.push(clipFile);
    } else if (usingRemoteCells) {
      for (const [index, page] of pages.entries()) {
        const remoteFile = path.join(dir, `cell-${String(page.pageNumber).padStart(2, '0')}.jpg`);
        fs.writeFileSync(remoteFile, await downloadRemoteAsset(cellUrls[index], `Persisted story cell ${page.pageNumber}`));
        const clipFile = path.join(dir, `page-${String(page.pageNumber).padStart(2, '0')}.mp4`);
        await runFfmpeg([
          '-y', '-loop', '1', '-i', remoteFile,
          '-vf', storyCellPerformanceFilter(page),
          '-t', String(page.durationSeconds),
          '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          clipFile,
        ]);
        clipFiles.push(clipFile);
      }
    } else if (usingRemoteChunks) {
      const chunkSizes = [4, 4, ...Array.from({ length: 8 }, () => 3)];
      let pageCursor = 0;
      for (const [index, chunkUrl] of chunkUrls.entries()) {
        const pageGroup = pages.slice(pageCursor, pageCursor + chunkSizes[index]);
        pageCursor += pageGroup.length;
        const targetDuration = pageGroup.reduce((sum, page) => sum + Number(page.durationSeconds || 0), 0);
        const remoteFile = path.join(dir, `h3-chunk-${String(index + 1).padStart(2, '0')}.mp4`);
        fs.writeFileSync(remoteFile, await downloadRemoteAsset(chunkUrl, `MiniMax H3 chunk ${index + 1}`));
        const clipFile = path.join(dir, `h3-page-group-${String(index + 1).padStart(2, '0')}.mp4`);
        const remoteHasAudio = await hasAudioStream(remoteFile);
        const clipArgs = ['-y', '-i', remoteFile];
        if (!remoteHasAudio) {
          clipArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
        }
        const visual = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p';
        clipArgs.push(
          '-vf', visual,
          '-t', String(targetDuration),
          '-map', '0:v:0',
          '-map', remoteHasAudio ? '0:a:0' : '1:a:0',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-ar', '48000',
          '-ac', '2',
          '-b:a', '96k',
          clipFile,
        );
        await runFfmpeg(clipArgs);
        clipFiles.push(clipFile);
      }
    } else if (usingPollinationsShots) {
      for (const [index, page] of pages.entries()) {
        const clipFile = path.join(dir, `pollinations-page-${String(page.pageNumber).padStart(2, '0')}.mp4`);
        await runFfmpeg([
          '-y', '-i', pollinationsShotFiles[index],
          '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p',
          '-t', String(page.durationSeconds),
          '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          clipFile,
        ]);
        clipFiles.push(clipFile);
      }
    } else if (usingRemoteScenes) {
      for (const [index, page] of pages.entries()) {
        const remoteFile = path.join(dir, `remote-${String(page.pageNumber).padStart(2, '0')}.mp4`);
        fs.writeFileSync(remoteFile, await downloadRemoteAsset(sceneUrls[index], `Hosted scene ${page.pageNumber}`));
        const clipFile = path.join(dir, `page-${String(page.pageNumber).padStart(2, '0')}.mp4`);
        const fadeOutStart = Math.max(0.1, Number(page.durationSeconds) - 0.22);
        const visual = `scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p,fade=t=in:st=0:d=0.22,fade=t=out:st=${fadeOutStart}:d=0.22`;
        const remoteHasAudio = await hasAudioStream(remoteFile);
        const clipArgs = ['-y', '-i', remoteFile];
        if (!remoteHasAudio) {
          clipArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
        }
        clipArgs.push(
          '-vf', visual,
          '-t', String(page.durationSeconds),
          '-map', '0:v:0',
          '-map', remoteHasAudio ? '0:a:0' : '1:a:0',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-ar', '48000',
          '-ac', '2',
          '-b:a', '96k',
          clipFile,
        );
        await runFfmpeg(clipArgs);
        clipFiles.push(clipFile);
      }
    } else for (const page of pages) {
      const clipFile = path.join(dir, `page-${String(page.pageNumber).padStart(2, '0')}.mp4`);
      const visual = storyPerformanceFilter(page);
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
    const authoredSoundEffects = await createAuthoredStoryEffects(pages, dir);
    const audioArgs: string[] = ['-y', '-i', silentFile, '-stream_loop', '-1', '-i', musicFile];
    if (narrationFile) audioArgs.push('-i', narrationFile);
    characterFiles.forEach(({ file }) => audioArgs.push('-i', file));
    soundEffects.forEach(effect => audioArgs.push('-i', effect.file));
    authoredSoundEffects.forEach(effect => audioArgs.push('-i', effect.file));
     const preservesNativeAudio = usingRemoteScenes || usingRemoteChunks || usingHostedFilm;
    const audioLabels = preservesNativeAudio ? ['[native]', '[music]'] : ['[music]'];
    const filters = preservesNativeAudio
      ? ['[0:a]volume=0.34[native]', '[1:a]volume=0.28[music]']
      : ['[1:a]volume=0.28[music]'];
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
    authoredSoundEffects.forEach((effect, index) => {
      const label = `authored${index}`;
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
      soundEffectsMixed: soundEffects.length + authoredSoundEffects.length,
      characterTimingApplied: timingApplied,
      ...validation,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function renderPollinationsShortShotStory(body: any): Promise<{
  bytes: Buffer;
  narrationAvailable: boolean;
  durationSeconds: number;
  audioTrackPresent: boolean;
  soundEffectsMixed: number;
  characterTimingApplied: number;
}> {
  const apiKey = process.env.POLLINATIONS_API_KEY;
  if (!apiKey) {
    throw new Error('Pollinations free-first lane is not configured: add the server-side POLLINATIONS_API_KEY secret, then retry. No paid provider was attempted.');
  }
  const cellUrls = Array.isArray(body?.cellUrls) ? body.cellUrls : [];
  const pages = Array.isArray(body?.pages) ? body.pages : [];
  if (cellUrls.length !== 32 || pages.length !== 32) {
    throw new Error('Pollinations short-shot assembly requires exactly 32 persisted cell URLs and 32 ordered pages.');
  }

  const catalogResponse = await fetch('https://gen.pollinations.ai/video/models?community=false', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!catalogResponse.ok) {
    throw new Error(`Pollinations model catalog could not be checked (${catalogResponse.status}); no video request was submitted.`);
  }
  const catalog = await catalogResponse.json() as Array<{
    name?: string;
    paid_only?: boolean | null;
    input_modalities?: string[];
    video_capabilities?: string[];
    allowed_durations?: number[] | null;
    max_duration?: number;
  }>;
  const requestedModel = typeof body?.model === 'string' ? body.model : 'nova-reel';
  const model = catalog.find(item => item.name === requestedModel);
  if (!model) throw new Error(`Pollinations model ${requestedModel} is not available to this account; no paid fallback was attempted.`);
  if (model.paid_only === true) {
    throw new Error(`Pollinations model ${requestedModel} is marked paid-only; the free-first lane refused it and submitted nothing.`);
  }
  if (!model.input_modalities?.includes('image') || !model.video_capabilities?.includes('start_frame')) {
    throw new Error(`Pollinations model ${requestedModel} does not support image-to-video start frames; no fallback was attempted.`);
  }
  const duration = model.allowed_durations?.includes(6)
    ? 6
    : model.allowed_durations?.find(value => value >= 4 && value <= 10)
      ?? (Number(model.max_duration) >= 6 ? 6 : 0);
  if (!duration) throw new Error(`Pollinations model ${requestedModel} has no supported short-shot duration; no request was submitted.`);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-pollinations-story-'));
  try {
    const shotFiles: string[] = [];
    for (const [index, page] of pages.entries()) {
      const prompt = [
        'Animate this single child-friendly illustrated story panel as a living story shot.',
        'Preserve the characters, costume, setting, composition, and readable artwork. Do not redesign the panel.',
        `Action: ${page.shotPlan?.actionBeat ?? page.narration ?? 'gentle character movement and environmental life'}.`,
        `Environment: ${page.shotPlan?.environmentBeat ?? 'subtle living background motion'}.`,
        `Performance cue: ${page.shotPlan?.performanceCue ?? 'clear expressive character action'}.`,
        'Use real character and prop movement, not only a camera pan or zoom. No text overlays, logos, or new panels.',
      ].join(' ');
      const params = new URLSearchParams({
        model: requestedModel,
        image: cellUrls[index],
        duration: String(duration),
        aspectRatio: '16:9',
        resolution: '480p',
        audio: 'false',
        safe: 'true',
      });
      const response = await fetch(`https://gen.pollinations.ai/video/${encodeURIComponent(prompt)}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 800);
        throw new Error(`Pollinations shot ${index + 1}/32 failed (${response.status})${detail ? `: ${detail}` : '.'}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 80_000_000) throw new Error(`Pollinations shot ${index + 1}/32 was empty or too large.`);
      const file = path.join(dir, `shot-${String(index + 1).padStart(2, '0')}.mp4`);
      fs.writeFileSync(file, bytes);
      shotFiles.push(file);
    }
    return stitchIllustrationStory({ ...body, pollinationsShotFiles: shotFiles });
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
      server.middlewares.use('/api/pollinations-story-stitch', (req: any, res: any) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
          if (body.length > 48_000_000) req.destroy(new Error('Pollinations story request is too large.'));
        });
        req.on('end', async () => {
          try {
            const result = await renderPollinationsShortShotStory(JSON.parse(body));
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
              'X-Story-Provider': 'pollinations',
            });
            res.end(result.bytes);
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Pollinations story stitch failed.' }));
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
