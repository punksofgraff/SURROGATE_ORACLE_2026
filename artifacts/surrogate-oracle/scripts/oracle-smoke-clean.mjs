import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clearSmokeEvidence } from './oracle-smoke-evidence.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
clearSmokeEvidence(join(scriptDir, '../screenshots'));
console.log('smoke evidence cleared');