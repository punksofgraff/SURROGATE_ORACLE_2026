#!/usr/bin/env node
/**
 * watch-log.mjs — Live Oracle session log tail
 * Run: node watch-log.mjs
 * Then click through the app in the browser. Every logStep() call appears here in real time.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const LOG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.oracle-dev-log.jsonl');
const COLORS = {
  ok:      '\x1b[32m',  // green
  warn:    '\x1b[33m',  // yellow
  err:     '\x1b[31m',  // red
  pending: '\x1b[36m',  // cyan
};
const ICONS = { ok: '✓', warn: '⚠', err: '✗', pending: '…' };
const RESET = '\x1b[0m';
const DIM   = '\x1b[2m';

function fmt(line) {
  try {
    const o = JSON.parse(line.trim());
    if (!o.label) return null;
    const c    = COLORS[o.status] || '';
    const icon = ICONS[o.status]  || '·';
    const ts   = new Date(o._t).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const stat = (o.status || '').toUpperCase().padEnd(7);
    return `${DIM}${ts}${RESET} ${c}${icon} ${stat}${RESET} ${c}${o.label}${RESET}`;
  } catch { return null; }
}

// Print any existing tail
let existingSize = 0;
if (fs.existsSync(LOG)) {
  const content = fs.readFileSync(LOG, 'utf8');
  existingSize = Buffer.byteLength(content);
  const lines = content.trim().split('\n').filter(Boolean).slice(-20);
  if (lines.length) {
    console.log(`\x1b[2m── last ${lines.length} entries ──\x1b[0m`);
    lines.forEach(l => { const f = fmt(l); if (f) console.log(f); });
    console.log(`\x1b[2m── watching for new entries ──\x1b[0m`);
  }
}

// Watch for new writes
let buf = '';
const watcher = fs.watch(LOG, { persistent: true }, () => {
  try {
    const stat = fs.statSync(LOG);
    if (stat.size <= existingSize) return;
    const fd     = fs.openSync(LOG, 'r');
    const chunk  = Buffer.alloc(stat.size - existingSize);
    fs.readSync(fd, chunk, 0, chunk.length, existingSize);
    fs.closeSync(fd);
    existingSize = stat.size;
    buf += chunk.toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop(); // keep incomplete last line
    lines.filter(Boolean).forEach(l => { const f = fmt(l); if (f) console.log(f); });
  } catch {}
});

console.log(`\x1b[36mWatching ${LOG}\x1b[0m`);
console.log(`\x1b[2mOpen http://localhost:5173/?newuser and click through. Ctrl+C to stop.\x1b[0m\n`);

process.on('SIGINT', () => { watcher.close(); process.exit(0); });
