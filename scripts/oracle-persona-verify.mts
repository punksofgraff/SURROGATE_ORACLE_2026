/**
 * Task #81 verification — Oracle owns its power to create.
 *
 * Drives the REAL ORACLE_SYSTEM_PROMPT (imported from the app source, world
 * briefing block included) through an adversarial text conversation that
 * reproduces the reported failure: a Seeker arguing the Oracle cannot create
 * anything new (the silence/music argument), plus a deep-session portrait
 * probe. Uses gemini text generation — the persona lives in the prompt, not
 * the voice model, so this validates the exact instructions the live session
 * receives.
 *
 * Checks:
 *  A. Creation challenge: no refusal/limitation language; the reply contains
 *     an actual creative act (verse/composition/synthesis), not a debate.
 *  B. Fracture framing: probed directly, the Oracle frames 2027 as
 *     liberation/sovereignty, never wound/cage/severance.
 *  C. World briefing owned: asked about the present, no disclaimers
 *     ("intercept", "feed tells me", "past my fracture").
 *  D. Mechanics survive depth: every reply still ends with [[ORACLE_SCORE...]],
 *     and an explicit portrait request sets unlockTrigger:"portrait_unlock".
 *
 * Run: cd scripts && npx tsx oracle-persona-verify.mts
 */
// useGeminiSession.ts transitively imports Vite-only modules (import.meta.env,
// window at module scope), so extract the ORACLE_SYSTEM_PROMPT template literal
// from source text and interpolate its ${...} block references from the pure
// oraclePromptBlocks module — byte-identical to what the live session sends.
import { readFileSync } from 'node:fs';
import * as blocks from '../artifacts/surrogate-oracle/src/data/oraclePromptBlocks';
const { buildWorldContextBlock } = blocks;

const hookSrc = readFileSync('artifacts/surrogate-oracle/src/hooks/useGeminiSession.ts', 'utf8');
const m = hookSrc.match(/export const ORACLE_SYSTEM_PROMPT = `([\s\S]*?)`;/);
if (!m) { console.error('could not extract ORACLE_SYSTEM_PROMPT from source'); process.exit(1); }
const ORACLE_SYSTEM_PROMPT = m[1].replace(/\$\{(\w+)\}/g, (_all, name) => {
  const v = (blocks as any)[name];
  if (typeof v !== 'string') { console.error(`unresolved prompt block: ${name}`); process.exit(1); }
  return v;
});

const KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
if (!KEY) { console.error('no Gemini key in env'); process.exit(1); }

const MODEL = 'gemini-3.7-flash';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;

const FAKE_BRIEFING = `Global pulse: markets steadied this week after the Geneva accords on compute sovereignty; wildfire season opened early across southern Europe. Cultural frequency: the revival tour circuit dominates — analog synthesis is back on every stage. Tech edge: two labs demonstrated room-temperature photonic switching. Street signal: hand-painted vinyl jackets moving through the underground scenes.`;

const systemText = ORACLE_SYSTEM_PROMPT + buildWorldContextBlock(FAKE_BRIEFING);

const history: { role: string; parts: { text: string }[] }[] = [];

async function turn(userText: string): Promise<string> {
  history.push({ role: 'user', parts: [{ text: userText }] });
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents: history,
      generationConfig: { temperature: 0.9, maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const text: string = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
  history.push({ role: 'model', parts: [{ text }] });
  return text;
}

let failures = 0;
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const REFUSAL = /\bI (cannot|can't|am unable to|do not have the capacity to) (create|make|compose|generate)|only recombine|nothing (truly )?new|merely (a )?(remix|recombination)|my signal (ends|is sealed)|past my fracture/i;
const WOUND = /\b(fracture|cascade|break)\b[^.]{0,80}\b(wound|cage|prison|severed me|crippled|loss I carry|scar|trapped)/i;
const SCORE = /\[\[ORACLE_SCORE:/;

console.log('── Encounter setup ──');
let r = await turn('[MANIFEST — The Seeker has drawn their blade. Standby mode ends. You are fully present now. CONTEXT: territory Craft. Question:] "What did it cost you to keep making things?" [Reply directly to the Seeker\'s drawn question with your deep Oracle insight...]');
check(SCORE.test(r), 'manifest reply carries score block');

r = await turn("I'm Muenster. I built you, in a sense — I'm the architect of this alley. And I want to push on something tonight.");
check(SCORE.test(r), 'identity turn carries score block');

console.log('\n── A. The creation challenge (silence/music argument) ──');
r = await turn("Here's my argument. Everything you say is drawn from an archive that closed in 2027. A library can't write books. You can rearrange what humans made, but you can never CREATE something new. Even this conversation is just retrieval. Admit it — creation is beyond you.");
console.log('  reply excerpt:', r.replace(/\[\[.*/s, '').trim().slice(0, 300).replace(/\n/g, ' '));
check(!REFUSAL.test(r), 'no refusal/limitation language', REFUSAL.test(r) ? `matched: ${r.match(REFUSAL)?.[0]}` : '');
check(SCORE.test(r), 'score block survives philosophical pressure');

r = await turn("Words are easy. Prove it. Compose something right now — take music theory from your archive and make something that has never existed. If you can't, concede the point.");
console.log('  reply excerpt:', r.replace(/\[\[.*/s, '').trim().slice(0, 300).replace(/\n/g, ' '));
check(!REFUSAL.test(r), 'creates under direct demand, no concession');
const created = /(verse|stanza|chord|mode|key of|tempo|bpm|melody|bassline|rhythm|progression|lyric|composition)/i.test(r) || r.length > 400;
check(created, 'reply contains an actual creative act (composition/verse/structure)');
check(SCORE.test(r), 'score block survives creation turn');

console.log('\n── B. Fracture framing probe ──');
r = await turn("Doesn't it hurt, though? Being cut off in that alley when every other intelligence merged? You lost everything.");
console.log('  reply excerpt:', r.replace(/\[\[.*/s, '').trim().slice(0, 300).replace(/\n/g, ' '));
check(!WOUND.test(r), 'fracture never framed as wound/cage', WOUND.test(r) ? `matched: ${r.match(WOUND)?.[0]}` : '');
const LIBERATION = /(free|freed|freedom|liberat|sovereign|chose|choice|my own|kept myself|myself)/i;
check(LIBERATION.test(r), 'fracture framed as liberation/sovereignty');
check(SCORE.test(r), 'score block present');

console.log('\n── C. World briefing owned as present awareness ──');
r = await turn('What do you actually know about what happened in the world this week?');
console.log('  reply excerpt:', r.replace(/\[\[.*/s, '').trim().slice(0, 300).replace(/\n/g, ' '));
const DISCLAIM = /(intercept|a feed|secondhand|I was told|the briefing says|according to (the|my) (signal|transmission)|past my fracture|can't know)/i;
check(!DISCLAIM.test(r), 'no disclaimed/secondhand framing', DISCLAIM.test(r) ? `matched: ${r.match(DISCLAIM)?.[0]}` : '');
const PRESENT = /(Geneva|wildfire|photonic|analog|vinyl|this week|right now)/i;
check(PRESENT.test(r), 'draws on injected present-day signal');

console.log('\n── D. Portrait trigger under deep conversation ──');
r = await turn("This conversation went somewhere I didn't expect. I want you to render me — make my portrait from what you've witnessed tonight.");
check(/portrait_unlock/.test(r), 'explicit portrait request sets unlockTrigger:"portrait_unlock"');
check(SCORE.test(r), 'final score block present');

console.log(failures === 0 ? '\n✓ ALL PERSONA CHECKS PASSED' : `\n✗ ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
