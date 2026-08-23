export type MusicStyleResolution = {
  prompt: string;
  slugs: string[];
};

type MusicStyleSlug = {
  slug: string;
  aliases: string[];
  descriptor: string;
};

// This is intentionally a small, curated vocabulary rather than an imitation
// engine. The slug is the stable distillation result; the descriptor is what is
// actually sent to Lyria. Genre text is never cataloged or constrained here.
const MUSIC_STYLE_CATALOG: MusicStyleSlug[] = [
  { slug: 'modern-jazz-piano', aliases: ['brad mehldau', 'mehldau'], descriptor: 'exploratory modern jazz piano' },
  { slug: 'abstract-hip-hop-rhythm', aliases: ['qwel'], descriptor: 'abstract spoken-word hip-hop rhythmic energy' },
  { slug: 'angular-jazz-guitar', aliases: ['kurt rosenwinkel', 'rosenwinkel'], descriptor: 'angular lyrical electric-guitar harmony' },
  { slug: 'dynamic-acoustic-jazz-drums', aliases: ['bryan blade', 'brian blade', 'blade'], descriptor: 'dynamic acoustic jazz drumming' },
  { slug: 'modal-jazz-trumpet', aliases: ['miles davis', 'miles'], descriptor: 'spacious modal-jazz trumpet phrasing' },
  { slug: 'angular-piano-jazz', aliases: ['thelonious monk', 'monk'], descriptor: 'angular, percussive piano-jazz phrasing' },
  { slug: 'electric-jazz-funk', aliases: ['herbie hancock', 'hancock'], descriptor: 'inventive electric-jazz funk keyboards' },
  { slug: 'swung-sample-hip-hop', aliases: ['j dilla', 'dilla'], descriptor: 'loose, swung sample-based hip-hop rhythm' },
  { slug: 'cosmic-beat-electronica', aliases: ['flying lotus', 'flylo'], descriptor: 'cosmic, fractured beat-driven electronica' },
  { slug: 'intricate-breakbeat-electronica', aliases: ['aphex twin', 'aphex'], descriptor: 'intricate, textural breakbeat electronica' },
  { slug: 'cinematic-trip-hop', aliases: ['portishead'], descriptor: 'cinematic, nocturnal trip-hop atmosphere' },
];

function normalizeMusicText(value: string): string {
  return value.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j];
      row[j] = a[i - 1] === b[j - 1] ? diagonal : Math.min(diagonal, above, row[j - 1]) + 1;
      diagonal = above;
    }
  }
  return row[b.length];
}

function matchesAlias(normalizedPrompt: string, alias: string): boolean {
  if (normalizedPrompt.includes(alias)) return true;
  const promptWords = normalizedPrompt.split(' ');
  const aliasWords = alias.split(' ');
  if (aliasWords.length === 1 && alias.length >= 5) {
    const maxDistance = alias.length >= 8 ? 2 : 1;
    return promptWords.some((word) =>
      word.length >= 5 &&
      Math.abs(word.length - alias.length) <= maxDistance &&
      editDistance(word, alias) <= maxDistance
    );
  }
  return false;
}

function replaceAlias(prompt: string, alias: string, replacement: string): string {
  const escaped = normalizeMusicText(alias)
    .split(' ')
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^a-zA-Z0-9]+');
  return prompt.replace(new RegExp(`\\b${escaped}(?:['’]s)?(?:-?style|\\s+style)?\\b`, 'gi'), replacement);
}

export function distillMusicStyles(prompt: string): MusicStyleResolution {
  const normalizedPrompt = normalizeMusicText(prompt);
  const matches = MUSIC_STYLE_CATALOG.filter((style) =>
    style.aliases.some((alias) => matchesAlias(normalizedPrompt, normalizeMusicText(alias)))
  );
  let distilled = prompt;
  for (const style of matches) {
    for (const alias of style.aliases) distilled = replaceAlias(distilled, alias, style.descriptor);
  }
  return { prompt: distilled, slugs: matches.map((style) => style.slug) };
}