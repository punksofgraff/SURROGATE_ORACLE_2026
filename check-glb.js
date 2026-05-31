const fs = require('fs');
const path = process.argv[2];
if (!path) { console.log('usage: node check-glb.js <path>'); process.exit(1); }

console.log('Checking:', path);
try {
  const data = fs.readFileSync(path);
  const str = data.toString('utf8');
  const hasVisemes = str.includes('viseme_');
  console.log('  has viseme_ strings:', hasVisemes);
  if (hasVisemes) {
     const matches = str.match(/viseme_[a-zA-Z0-9]+/g);
     console.log('  sample visemes:', [...new Set(matches)].slice(0, 10));
  }
  const hasBlink = str.includes('blink') || str.includes('Blink');
  console.log('  has blink strings:', hasBlink);
  if (hasBlink) {
     const matches = str.match(/[a-zA-Z]*[Bb]link[a-zA-Z]*/g);
     console.log('  sample blinks:', [...new Set(matches)].slice(0, 5));
  }
} catch (e) {
  console.log('  error:', e.message);
}
