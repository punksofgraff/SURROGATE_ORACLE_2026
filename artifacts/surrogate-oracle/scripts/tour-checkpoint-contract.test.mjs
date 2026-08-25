import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewTourTrace } from '../src/lib/tourTraceContract.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = ['fresh', 'returning', 'manual-advance', 'interrupted-preview'];
const load = (name) => JSON.parse(readFileSync(join(here, 'fixtures', `tour-${name}.json`), 'utf8'));

for (const name of fixtures) {
  const review = reviewTourTrace(load(name));
  assert.deepEqual(review.missing, [], `${name} should have every required checkpoint`);
  assert.ok(review.sessionConfigPresent, `${name} should include session config`);
  assert.equal(review.cards.length, 3, `${name} should cover all tour cards`);
}

const complete = load('fresh');
for (const required of ['session_config', 'card_flush', 'preview_request', 'first_playable_audio', 'first_letter_landing']) {
  const broken = required === 'session_config'
    ? complete.filter((row) => !(row.event_type === 'step' && String(row.payload.label).includes('SESSION CONFIG')))
    : complete.filter((row) => row.payload.checkpoint !== required);
  const review = reviewTourTrace(broken);
  assert.ok(review.missing.length > 0, `removing ${required} must fail the contract`);
}

const warnings = reviewTourTrace(load('interrupted-preview'));
assert.ok(warnings.warnings.includes('card_1:duplicate_preview'));
assert.ok(warnings.warnings.includes('card_1:timeout_fallback'));
assert.ok(warnings.warnings.includes('card_1:interrupted_preview'));
assert.equal(warnings.missing.length, 0, 'review warnings must not become missing evidence');

console.log(`tour checkpoint fixtures passed (${fixtures.length} traces; required-evidence mutations fail)`);