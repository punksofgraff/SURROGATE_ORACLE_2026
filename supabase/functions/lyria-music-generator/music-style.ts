export type MusicStyleResolution = {
  prompt: string;
  slugs: string[];
  genres: string[];
  descriptors: string[];
};

export function styleBlendInstruction(resolution: MusicStyleResolution): string {
  return resolution.descriptors.length
    ? `Resolved style blend (keep every element): ${resolution.descriptors.join('; ')}.`
    : '';
}

type StyleEntry = {
  slug: string;
  aliases: string[];
  descriptor: string;
  kind: 'artist' | 'genre';
};

const STYLE_CATALOG: StyleEntry[] = [
  { slug: 'reggae', aliases: ['reggae', 'roots reggae', 'dub'], descriptor: 'reggae offbeat guitar skank, one-drop pulse, warm bass', kind: 'genre' },
  { slug: 'drum-and-bass', aliases: ['drum and bass', 'drum n bass', 'drum & bass', 'dnb', 'jungle'], descriptor: 'drum-and-bass breakbeats, rolling sub-bass, fast syncopated propulsion', kind: 'genre' },
  { slug: 'jazz', aliases: ['jazz', 'bebop', 'swing', 'cool jazz', 'hard bop', 'hard-bop'], descriptor: 'jazz harmony, conversational improvisation, acoustic bass and ride cymbal', kind: 'genre' },
  { slug: 'modern-jazz-piano', aliases: ['brad mehldau', 'mehldau'], descriptor: 'exploratory modern jazz piano', kind: 'artist' },
  { slug: 'abstract-hip-hop-rhythm', aliases: ['qwel'], descriptor: 'abstract spoken-word hip-hop rhythmic energy', kind: 'artist' },
  { slug: 'angular-jazz-guitar', aliases: ['kurt rosenwinkel', 'rosenwinkel'], descriptor: 'angular lyrical electric-guitar harmony', kind: 'artist' },
  { slug: 'dynamic-acoustic-jazz-drums', aliases: ['bryan blade', 'brian blade', 'blade'], descriptor: 'dynamic acoustic jazz drumming', kind: 'artist' },
  { slug: 'modal-jazz-trumpet', aliases: ['miles davis', 'miles'], descriptor: 'spacious modal-jazz trumpet phrasing', kind: 'artist' },
  { slug: 'angular-piano-jazz', aliases: ['thelonious monk', 'monk'], descriptor: 'angular, percussive piano-jazz phrasing', kind: 'artist' },
  { slug: 'electric-jazz-funk', aliases: ['herbie hancock', 'hancock'], descriptor: 'inventive electric-jazz funk keyboards', kind: 'artist' },
  { slug: 'swung-sample-hip-hop', aliases: ['j dilla', 'dilla'], descriptor: 'loose, swung sample-based hip-hop rhythm', kind: 'artist' },
  { slug: 'cosmic-beat-electronica', aliases: ['flying lotus', 'flylo'], descriptor: 'cosmic, fractured beat-driven electronica', kind: 'artist' },
  { slug: 'intricate-breakbeat-electronica', aliases: ['aphex twin', 'aphex'], descriptor: 'intricate, textural breakbeat electronica', kind: 'artist' },
  { slug: 'cinematic-trip-hop', aliases: ['portishead'], descriptor: 'cinematic, nocturnal trip-hop atmosphere', kind: 'artist' },
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
  if (alias.includes(' ') || alias.length < 5) return false;
  const maxDistance = alias.length >= 8 ? 2 : 1;
  return promptWords.some((word) =>
    word.length >= 5 &&
    Math.abs(word.length - alias.length) <= maxDistance &&
    editDistance(word, alias) <= maxDistance
  );
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
  const matches = STYLE_CATALOG.filter((style) =>
    style.aliases.some((alias) => matchesAlias(normalizedPrompt, normalizeMusicText(alias)))
  );
  let distilled = prompt;
  for (const style of matches) {
    // Artist names are replaced for provider safety; genre words remain in the
    // seeker brief and are also summarized explicitly below.
    if (style.kind === 'artist') {
      for (const alias of style.aliases) distilled = replaceAlias(distilled, alias, style.descriptor);
    }
  }
  return {
    prompt: distilled,
    slugs: matches.map((style) => style.slug),
    genres: matches.filter((style) => style.kind === 'genre').map((style) => style.slug),
    descriptors: matches.map((style) => style.descriptor),
  };
}