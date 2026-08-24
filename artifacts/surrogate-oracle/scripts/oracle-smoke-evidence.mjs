import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const LEGACY_SMOKE_SCREENSHOT = /^smoke-\d{2}-.+\.png$/;
const SMOKE_RUN_DIRECTORY = /^smoke-run-/;

export function createSmokeRunId(now = new Date(), pid = process.pid) {
  const timestamp = now.toISOString().replace(/[-:.]/g, '');
  return `${timestamp}-${pid}`;
}

export function clearSmokeEvidence(outDir) {
  mkdirSync(outDir, { recursive: true });

  for (const entry of readdirSync(outDir)) {
    if (
      LEGACY_SMOKE_SCREENSHOT.test(entry) ||
      entry === 'oracle-smoke-evidence.json' ||
      entry === 'oracle-smoke-run.json' ||
      SMOKE_RUN_DIRECTORY.test(entry)
    ) {
      rmSync(join(outDir, entry), { recursive: true, force: true });
    }
  }
}

/**
 * Remove evidence from older runner versions and create an isolated directory
 * for this attempt. A run directory is never reused, so partial output cannot
 * be mistaken for a complete release verification.
 */
export function prepareSmokeEvidence(outDir, runId = createSmokeRunId()) {
  clearSmokeEvidence(outDir);

  const runDir = join(outDir, `smoke-run-${runId}`);
  mkdirSync(runDir);
  writeSmokeRunManifest(runDir, { runId, status: 'running', startedAt: new Date().toISOString() });
  return { runId, runDir };
}

export function writeSmokeRunManifest(runDir, manifest) {
  writeFileSync(join(runDir, 'run.json'), JSON.stringify(manifest, null, 2) + '\n');
}

export function smokeEvidencePath(runDir) {
  return join(runDir, 'oracle-smoke-evidence.json');
}

export function smokeRunManifestPath(runDir) {
  return join(runDir, 'run.json');
}

export function hasSmokeRunManifest(runDir) {
  return existsSync(smokeRunManifestPath(runDir));
}