import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  hasSmokeRunManifest,
  prepareSmokeEvidence,
  smokeEvidencePath,
  writeSmokeRunManifest,
} from './oracle-smoke-evidence.mjs';

const outDir = mkdtempSync(join(tmpdir(), 'oracle-smoke-evidence-'));
writeFileSync(join(outDir, 'smoke-01-dormant.png'), 'stale');
writeFileSync(join(outDir, 'oracle-smoke-evidence.json'), '{}');
writeFileSync(join(outDir, 'oracle-smoke-run.json'), '{}');

const { runId, runDir } = prepareSmokeEvidence(outDir, '20260824T120000000Z-test');
assert.equal(runId, '20260824T120000000Z-test');
assert.equal(hasSmokeRunManifest(runDir), true);
assert.equal(existsSync(join(outDir, 'smoke-01-dormant.png')), false);
assert.equal(existsSync(join(outDir, 'oracle-smoke-evidence.json')), false);
assert.equal(existsSync(join(outDir, 'oracle-smoke-run.json')), false);
assert.equal(existsSync(smokeEvidencePath(runDir)), false);

const manifest = JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8'));
assert.equal(manifest.runId, runId);
assert.equal(manifest.status, 'running');

writeSmokeRunManifest(runDir, { ...manifest, status: 'complete' });
assert.equal(JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8')).status, 'complete');

console.log('smoke evidence isolation fixture passed');