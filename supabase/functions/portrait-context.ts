export interface PortraitScoreContext {
  weightedThemes?: Array<{ theme: string; weight: number }>;
  emotionalWeight?: string;
  alignment?: string;
  archetypeTitle?: string;
  sessionPhase?: string;
  seekerLines?: string[];
}

const ANCHOR_STOPWORDS = new Set([
  'a', 'about', 'after', 'all', 'also', 'am', 'an', 'and', 'are', 'as', 'at',
  'be', 'because', 'been', 'but', 'by', 'can', 'could', 'did', 'do', 'does',
  'for', 'from', 'get', 'got', 'had', 'has', 'have', 'how', 'i', 'if', 'in',
  'into', 'is', 'it', 'just', 'me', 'more', 'my', 'of', 'on', 'or', 'our',
  'so', 'some', 'than', 'that', 'the', 'their', 'them', 'there', 'they',
  'this', 'to', 'too', 'under', 'up', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'who', 'will', 'with', 'would', 'you', 'your',
]);

const EMOTIONAL_ANCHOR_WORDS = new Set([
  'afraid', 'alone', 'angry', 'belong', 'change', 'chosen', 'death', 'dream',
  'fear', 'grief', 'hope', 'identity', 'love', 'lost', 'need', 'pain',
  'remember', 'safe', 'shame', 'truth', 'want', 'worry',
]);
const LOW_SIGNAL_ANCHOR = /^(?:(?:that\s+)?sounds?\s+interesting|okay(?:,?\s+keep\s+going)?|i\s+hear\s+you|sure|yes|no|right)[.!?]*$/i;

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim().slice(0, 220);
}

function anchorWords(line: string): string[] {
  return (line.toLocaleLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{3,}/gu) ?? [])
    .filter(word => !ANCHOR_STOPWORDS.has(word));
}

/**
 * Select stable, high-signal conversation anchors instead of blindly taking
 * the most recent lines. Scores are deterministic, ties prefer the newest
 * line, and the selected anchors are returned in conversation order so the
 * distiller sees a coherent arc.
 */
export function selectConversationAnchors(
  lines: string[] | undefined,
  maxAnchors = 6,
): string[] {
  if (!lines?.length || maxAnchors <= 0) return [];

  const candidates = lines
    .map((line, index) => ({ line: normalizeLine(line), index }))
    .filter(candidate => candidate.line.length > 8)
    .filter(candidate => !LOW_SIGNAL_ANCHOR.test(candidate.line))
    .filter((candidate, index, all) => (
      all.findIndex(other => other.line.toLocaleLowerCase() === candidate.line.toLocaleLowerCase()) === index
    ))
    .map(candidate => {
      const words = anchorWords(candidate.line);
      const uniqueWords = new Set(words);
      const emotionalHits = words.filter(word => EMOTIONAL_ANCHOR_WORDS.has(word)).length;
      const specificity = Array.from(uniqueWords).filter(word => word.length >= 6).length;
      return {
        ...candidate,
        meaningfulWords: uniqueWords,
        score: (specificity * 2) + (emotionalHits * 3) + Math.min(words.length, 12) + (candidate.index / 1000),
      };
    })
    .filter(candidate => candidate.meaningfulWords.size >= 2
      || candidate.score - (candidate.index / 1000) - Math.min(anchorWords(candidate.line).length, 12) >= 3)
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, maxAnchors)
    .sort((a, b) => a.index - b.index);

  return candidates.map(candidate => candidate.line);
}

export const EMOTIONAL_PALETTES: Record<string, string> = {
  raw: 'exposed nerve palette — bleeding reds, torn edges, dripping wet paint, unguarded open expression',
  defended: 'armored palette — cold steel blues, layered stencil masks, geometric barriers over the face',
  numb: 'desaturated fog palette — muted greys with one faint neon pulse, distant vacant gaze, static haze',
  present: 'grounded luminous palette — warm amber and living green, direct steady gaze, crisp clean linework',
  cracked: 'fracture palette — split-face composition, gold light leaking through broken porcelain seams, kintsugi veins',
};

export function buildDistillInstruction(basePrompt: string, ctx: PortraitScoreContext): string {
  const parts: string[] = [
    'You are a visual art prompt engineer for a cyberpunk graffiti oracle. Create ONE image-generation prompt, under 400 characters, plain text only.',
    `MANDATORY base style (always keep): "${basePrompt.slice(0, 300)}"`,
  ];
  if (ctx.weightedThemes?.length) {
    const total = ctx.weightedThemes.reduce((sum, theme) => sum + Math.max(1, theme.weight), 0);
    const ranked = ctx.weightedThemes
      .slice(0, 6)
      .map(theme => `${theme.theme} (${Math.round((Math.max(1, theme.weight) / total) * 100)}%)`)
      .join(', ');
    parts.push(`Theme dominance — give each theme visual space PROPORTIONAL to its percentage; the top theme must visibly dominate: ${ranked}.`);
  }
  if (ctx.emotionalWeight && EMOTIONAL_PALETTES[ctx.emotionalWeight]) {
    parts.push(`Emotional register "${ctx.emotionalWeight}" — infuse this mood: ${EMOTIONAL_PALETTES[ctx.emotionalWeight]}.`);
  }
  if (ctx.archetypeTitle) {
    parts.push(`The subject's revealed archetype is "${ctx.archetypeTitle}" — let this title shape the figure's posture and iconography.`);
  }
  if (ctx.sessionPhase) {
    parts.push(`Session phase "${ctx.sessionPhase}" — make the image feel like this stage of the journey.`);
  }
  if (ctx.alignment) {
    parts.push(`Alignment: ${ctx.alignment === 'sacred' ? 'sacred — halo geometry, ascending light' : 'profane — inverted glyphs, smoldering underglow'}.`);
  }
  const anchors = selectConversationAnchors(ctx.seekerLines);
  if (anchors.length) {
    parts.push(
      'What the seeker confessed (distill into 1-2 symbolic visual elements woven into the portrait — do NOT quote or transcribe their words into the prompt):',
      ...anchors.map(line => `- "${line.replace(/"/g, "'")}"`),
    );
  }
  parts.push('Output ONLY the final image prompt.');
  return parts.join('\n');
}

const THEME_DESCRIPTIONS: Record<string, string> = {
  oracle: 'mystical digital consciousness with prophetic vision',
  cyberpunk: 'neon-lit digital rebellion and cyber aesthetic',
  graffiti: 'street art spray paint with raw urban energy',
  mystical: 'ethereal cosmic oracle energy and astral glow',
  consciousness: 'expanded awareness, transcendence, neural webs',
  wisdom: 'ancient knowledge channelled through modern circuitry',
  archetype: 'revealed identity rendered as symbolic iconography',
  sneakar: 'streetwear prophet with holographic SNEAKAR elements',
  neon: 'glowing geometric neon light patterns',
  digital: 'pixelated digital consciousness and data streams',
  'hip-hop': 'urban oracle, rhythm and cultural power',
  'culture-coin': 'golden cultural currency aura and mystical wealth',
  punk: 'rebellious street energy, spikes, spray paint',
  future: 'evolutionary transcendence in underground trainyard',
  transformation: 'metamorphosis with SNEAKAR branded wings',
  connection: 'interconnected culture networks pulsing with light',
};

export function buildBasePrompt(themes: string[], context?: PortraitScoreContext): string {
  let ordered = themes;
  let dominantClause = '';
  if (context?.weightedThemes?.length) {
    ordered = [...context.weightedThemes]
      .sort((a, b) => b.weight - a.weight)
      .map(theme => theme.theme);
    const top = ordered[0];
    dominantClause = ` Dominant motif (give it the most visual space): ${THEME_DESCRIPTIONS[top] ?? top}.`;
  }
  const desc = ordered.map(theme => THEME_DESCRIPTIONS[theme] ?? theme).filter(Boolean).join(', ');
  const mood = context?.emotionalWeight && EMOTIONAL_PALETTES[context.emotionalWeight]
    ? ` Mood: ${EMOTIONAL_PALETTES[context.emotionalWeight]}.`
    : '';
  const archetype = context?.archetypeTitle
    ? ` The figure embodies the archetype "${context.archetypeTitle}".`
    : '';
  const alignment = context?.alignment === 'sacred'
    ? ' Sacred alignment: halo geometry, ascending light, gilded reverence.'
    : context?.alignment === 'profane'
      ? ' Profane alignment: inverted glyphs, smoldering underglow, defiant shadow.'
      : '';
  return `FreakDali cyberpunk graffiti oracle portrait: ${desc}.${dominantClause}${mood}${archetype}${alignment} SNEAKAR branded elements, Culture Coin golden accents, neon geometric face patterns, holographic effects. High quality digital art masterpiece, portrait orientation.`;
}

const GUARD_STOPWORDS = new Set([
  'the', 'and', 'that', 'this', 'with', 'for', 'was', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'his', 'she', 'him', 'they',
  'have', 'had', 'has', 'were', 'been', 'from', 'into', 'out', 'our', 'your', 'their', 'them', 'then', 'than', 'what', 'when',
  'where', 'who', 'how', 'why', 'will', 'would', 'could', 'should', 'still', 'just', 'like', 'one', 'two', 'more', 'very',
  'about', 'over', 'under', 'some', 'every', 'never', 'always', 'there', 'here', 'because', 'only', 'even', 'also', 'after', 'before',
]);

export function promptLeaksSeekerLines(prompt: string, seekerLines: string[], basePrompt: string): boolean {
  const normalize = (value: string) =>
    value.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const normalizedPrompt = normalize(prompt);
  const rawPrompt = prompt.toLowerCase();
  const baseVocabulary = new Set(normalize(basePrompt).split(' '));

  for (const line of seekerLines) {
    const raw = line.toLowerCase();
    const sensitive: string[] = [
      ...(raw.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g) ?? []),
      ...(raw.match(/(?:https?:\/\/|www\.)\S+/g) ?? []),
      ...(raw.match(/(?<![\w.])@[a-z0-9_]{3,}/g) ?? []),
      ...((raw.match(/\d[\d\s().-]{2,}\d/g) ?? []).filter(match => (match.match(/\d/g) ?? []).length >= 4)),
    ];
    for (const token of sensitive) {
      const normalizedToken = normalize(token);
      if (rawPrompt.includes(token) || (normalizedToken && normalizedPrompt.includes(normalizedToken)) ||
          (normalizedToken && normalizedPrompt.includes(normalizedToken.replace(/\s/g, '')))) return true;
    }

    const words = normalize(line).split(' ').filter(Boolean);
    for (const word of words) {
      const isUnicode = /[^\x00-\x7f]/.test(word);
      const hasDigit = /\p{N}/u.test(word);
      const isLongId = word.length >= 12;
      if ((isUnicode || hasDigit || isLongId) && word.length >= 2 && normalizedPrompt.includes(word)) return true;
    }
    for (const word of words) {
      if (word.length >= 5 && !GUARD_STOPWORDS.has(word) && !baseVocabulary.has(word) && normalizedPrompt.includes(word)) return true;
    }
    if (words.length === 1) continue;
    if (words.length === 2) {
      if (normalizedPrompt.includes(words.join(' '))) return true;
      continue;
    }
    for (let i = 0; i + 3 <= words.length; i++) {
      if (normalizedPrompt.includes(words.slice(i, i + 3).join(' '))) return true;
    }
    for (let i = 0; i + 2 <= words.length; i++) {
      const [a, b] = words.slice(i, i + 2);
      if (!GUARD_STOPWORDS.has(a) && !GUARD_STOPWORDS.has(b) &&
          !(baseVocabulary.has(a) && baseVocabulary.has(b)) &&
          normalizedPrompt.includes(`${a} ${b}`)) return true;
    }
  }
  return false;
}