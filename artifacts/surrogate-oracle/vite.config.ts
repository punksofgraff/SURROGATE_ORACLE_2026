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
}> {
  const sheets = Array.isArray(body?.sheets) ? body.sheets : [];
  const pages = Array.isArray(body?.pages) ? body.pages as StoryPageRequest[] : [];
  if (sheets.length !== 2 || pages.length !== 32) throw new Error('A story proof requires two sheets and 32 pages.');
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
    const sheetFiles = sheets.map((asset: unknown, index: number) => {
      const decoded = decodeDataAsset(asset);
      const file = path.join(dir, `sheet-${index}.png`);
      fs.writeFileSync(file, decoded.bytes);
      return file;
    });
    const music = decodeDataAsset(body.music);
    const musicFile = path.join(dir, `music${music.mimeType.includes('wav') ? '.wav' : '.mp3'}`);
    fs.writeFileSync(musicFile, music.bytes);
    const narration = body.narration ? decodeDataAsset(body.narration) : null;
    const narrationFile = narration
      ? path.join(dir, narration.mimeType.includes('wav') ? 'narration.wav' : 'narration.mp3')
      : null;
    if (narration && narrationFile) fs.writeFileSync(narrationFile, narration.bytes);

    const clipFiles: string[] = [];
    for (const page of pages) {
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
    if (narrationFile) {
      await runFfmpeg([
        '-y', '-i', silentFile, '-stream_loop', '-1', '-i', musicFile, '-i', narrationFile,
        '-filter_complex', '[1:a]volume=0.28[music];[2:a]volume=1.0[narration];[music][narration]amix=inputs=2:duration=longest:dropout_transition=2[a]',
        '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', String(duration), finalFile,
      ]);
    } else {
      await runFfmpeg([
        '-y', '-i', silentFile, '-stream_loop', '-1', '-i', musicFile,
        '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', String(duration), finalFile,
      ]);
    }
    const validation = await validateStoryFilm(finalFile, duration);
    return {
      bytes: fs.readFileSync(finalFile),
      narrationAvailable: Boolean(narrationFile),
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
