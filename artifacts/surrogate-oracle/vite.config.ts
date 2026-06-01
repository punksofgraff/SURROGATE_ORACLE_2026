import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const LOG_FILE = path.resolve(import.meta.dirname, ".oracle-dev-log.jsonl");

function oracleLogRelayPlugin() {
  return {
    name: 'oracle-log-relay',
    configureServer(server: any) {
      // /bust — hard-reload escape hatch. Visit this URL to nuke browser cache and reload.
      server.middlewares.use('/bust', (_req: any, res: any) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!doctype html><html><head>
          <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
          <meta http-equiv="Pragma" content="no-cache">
          <meta http-equiv="Expires" content="0">
        </head><body><script>
          if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(r => r.forEach(sw => sw.unregister()));
          location.replace('/?_bust=' + Date.now());
        </script></body></html>`);
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

const basePath = process.env.BASE_PATH || "/";

// Stamp every build with the current epoch so the app can detect stale sessions
const BUILD_ID = Date.now().toString(36);

export default defineConfig({
  base: basePath,
  envPrefix: ['VITE_', 'SUPABASE_'],
  define: {
    // Injected at build time — use import.meta.env.VITE_BUILD_ID in components
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    oracleLogRelayPlugin(),
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
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
