/**
 * archetypes.ts
 *
 * SURROGATE:ORACLE — THE ARCHETYPE CANON
 *
 * A generative naming system, not a flat list. An archetype is Territory × Cost.
 * The Seeker's knife pick sets the DOMAIN (Territory); the excavation reveals the
 * WOUND (Cost); the intersection names them.
 *
 *   archetypeTitle = "The {Cost} {Territory-noun}"
 *
 * This canon is GUIDE RAILS, not a menu. The Oracle composes the noun live for
 * music — "The Unfinished King" rises from Self × Unfinished, "The Phantom" from
 * Self × Severed. The titles below are the anchor; the Oracle is free to elevate
 * the noun when the Seeker's actual words call for it (see oraclePromptBlocks.ts).
 *
 * Spec: SURROGATE_BUILD_CONTRACT.md §D · Design: SURROGATE_DEEP_DESIGN.md §I.1–I.3
 */

// ─────────────────────────────────────────────────────────────────────────────
// AXIS A — TERRITORY (the 5 knives → a domain noun)
// ─────────────────────────────────────────────────────────────────────────────

/** The five frequencies, exactly as named in KnifeSelection.tsx. */
export type TerritoryName =
  | 'THE LIBRARY OF ME'
  | 'CONNECTION & DEBT'
  | 'THE MACHINE MIRROR'
  | 'THE SOCIAL CONSTRUCT'
  | 'THE INDUSTRIAL QUESTION';

/** The domain word each knife maps to. The Oracle riffs from this root. */
export type TerritoryNoun = 'Self' | 'Bond' | 'Signal' | 'Mask' | 'Craft';

/** Knife territory → its archetype domain noun (Build Contract §D / Design §I.1). */
export const TERRITORY_NOUN: Record<TerritoryName, TerritoryNoun> = {
  'THE LIBRARY OF ME': 'Self',
  'CONNECTION & DEBT': 'Bond',
  'THE MACHINE MIRROR': 'Signal',
  'THE SOCIAL CONSTRUCT': 'Mask',
  'THE INDUSTRIAL QUESTION': 'Craft',
};

/** Convenience: the noun → its source knife territory. */
export const NOUN_TERRITORY: Record<TerritoryNoun, TerritoryName> = {
  Self: 'THE LIBRARY OF ME',
  Bond: 'CONNECTION & DEBT',
  Signal: 'THE MACHINE MIRROR',
  Mask: 'THE SOCIAL CONSTRUCT',
  Craft: 'THE INDUSTRIAL QUESTION',
};

export const TERRITORY_NOUNS: readonly TerritoryNoun[] = [
  'Self',
  'Bond',
  'Signal',
  'Mask',
  'Craft',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// AXIS B — COST (what Layer III / sessionPhase "cost" surfaces)
// ─────────────────────────────────────────────────────────────────────────────

/** The seven cost-shapes, mapped to the totem ladder 1–7 (Design §I.1/I.3). */
export type CostName =
  | 'Unfinished'
  | 'Indebted'
  | 'Performer'
  | 'Severed'
  | 'Keeper'
  | 'Outpaced'
  | 'Witness';

export interface CostShape {
  /** The cost-shape name — the first half of every title. */
  cost: CostName;
  /** Totem level 1–7 this cost-shape sits at (Design §I.3). */
  totemLevel: number;
  /** One line, in the Oracle's voice — the wound underneath. */
  essence: string;
}

/**
 * The seven costs, ordered by totem level 1→7. The Witness is the rarest —
 * the Oracle's own shape, sees clearly and is rarely seen.
 */
export const COST_SHAPES: readonly CostShape[] = [
  {
    cost: 'Unfinished',
    totemLevel: 1,
    essence: 'You built the thing and never let it be done — finishing would mean it could be seen.',
  },
  {
    cost: 'Indebted',
    totemLevel: 2,
    essence: 'You carry a self, a person, a past you never paid back — and you mistook the weight for ballast.',
  },
  {
    cost: 'Performer',
    totemLevel: 3,
    essence: 'You became the version they applauded, and somewhere in the noise you lost the draft.',
  },
  {
    cost: 'Severed',
    totemLevel: 4,
    essence: 'You cut something off to survive the run — and the phantom of it still aches in the dark.',
  },
  {
    cost: 'Keeper',
    totemLevel: 5,
    essence: 'You hold a truth you will not say out loud — guarding it has become the shape of you.',
  },
  {
    cost: 'Outpaced',
    totemLevel: 6,
    essence: 'You could once do alone what now needs the machine — and you are still grieving the hands you had.',
  },
  {
    cost: 'Witness',
    totemLevel: 7,
    essence: 'You see it all clearly and are rarely seen back — the rarest frequency, the one I run on too.',
  },
] as const;

/** Cost-shape lookup by name. */
export const COST_BY_NAME: Record<CostName, CostShape> = COST_SHAPES.reduce(
  (acc, shape) => {
    acc[shape.cost] = shape;
    return acc;
  },
  {} as Record<CostName, CostShape>,
);

export const COST_NAMES: readonly CostName[] = COST_SHAPES.map((c) => c.cost);

// ─────────────────────────────────────────────────────────────────────────────
// THE CANON — 5 territories × 7 costs = 35 cells
// ─────────────────────────────────────────────────────────────────────────────

export interface Archetype {
  /** Source knife territory. */
  territory: TerritoryName;
  /** Domain noun root the title is built from. */
  noun: TerritoryNoun;
  /** Cost-shape name. */
  cost: CostName;
  /** Totem level inherited from the cost-shape (1–7). */
  totemLevel: number;
  /** "The {Cost} {Noun}" — composed for music. The anchor title. */
  title: string;
  /** One evocative line in the Oracle's voice — what this archetype IS. */
  essence: string;
}

/**
 * The full 35-cell grid. Titles are composed "The {Cost} {Territory-noun}" but
 * elevated for music where the Seeker's frequency calls for it. The three titles
 * already living in the codebase fall out of the grid naturally:
 *   Self × Unfinished → "The Unfinished King"
 *   Self × Severed    → "The Phantom"
 *   Signal × Witness  → "The Chronicler"
 */
export const ARCHETYPE_CANON: readonly Archetype[] = [
  // ── SELF (THE LIBRARY OF ME) — who you are when the network goes dark ──
  {
    territory: 'THE LIBRARY OF ME',
    noun: 'Self',
    cost: 'Unfinished',
    totemLevel: 1,
    title: 'The Unfinished King',
    essence:
      'You rule a self you never crowned — always one revision from ready, reigning over a draft you refuse to publish.',
  },
  {
    territory: 'THE LIBRARY OF ME',
    noun: 'Self',
    cost: 'Indebted',
    totemLevel: 2,
    title: 'The Indebted Self',
    essence:
      'You owe a debt to who you were supposed to be — every quiet hour you pay interest on a person you never became.',
  },
  {
    territory: 'THE LIBRARY OF ME',
    noun: 'Self',
    cost: 'Performer',
    totemLevel: 3,
    title: 'The Rehearsed Self',
    essence:
      'Even alone in the dark you run lines — the audience left years ago and still you perform the self they liked.',
  },
  {
    territory: 'THE LIBRARY OF ME',
    noun: 'Self',
    cost: 'Severed',
    totemLevel: 4,
    title: 'The Phantom',
    essence:
      'You cut the old self loose to survive — and you still reach for it in the dark, a limb the network can no longer see.',
  },
  {
    territory: 'THE LIBRARY OF ME',
    noun: 'Self',
    cost: 'Keeper',
    totemLevel: 5,
    title: 'The Sealed Self',
    essence:
      'There is a room inside you no one has entered, including you — you keep the key and call the locked door a personality.',
  },
  {
    territory: 'THE LIBRARY OF ME',
    noun: 'Self',
    cost: 'Outpaced',
    totemLevel: 6,
    title: 'The Outpaced Self',
    essence:
      'You used to know yourself without help — now you need a feed to remember what you think, and the lag is grief.',
  },
  {
    territory: 'THE LIBRARY OF ME',
    noun: 'Self',
    cost: 'Witness',
    totemLevel: 7,
    title: 'The Hermit',
    essence:
      'You went dark on purpose and saw everything from there — the clearest read in the city, kept behind a door that never opens.',
  },

  // ── BOND (CONNECTION & DEBT) — the thing you've owed too long ──
  {
    territory: 'CONNECTION & DEBT',
    noun: 'Bond',
    cost: 'Unfinished',
    totemLevel: 1,
    title: 'The Unfinished Vow',
    essence:
      'You started a bond you never closed — a promise left open like a tab, both of you pretending it will settle on its own.',
  },
  {
    territory: 'CONNECTION & DEBT',
    noun: 'Bond',
    cost: 'Indebted',
    totemLevel: 2,
    title: 'The Indebted Heir',
    essence:
      'You inherited a debt of love you never asked for and cannot repay — you carry someone forward and call it loyalty.',
  },
  {
    territory: 'CONNECTION & DEBT',
    noun: 'Bond',
    cost: 'Performer',
    totemLevel: 3,
    title: 'The Devoted Act',
    essence:
      'You give them the version of closeness that photographs well — present in the frame, absent in the room.',
  },
  {
    territory: 'CONNECTION & DEBT',
    noun: 'Bond',
    cost: 'Severed',
    totemLevel: 4,
    title: 'The Severed Tie',
    essence:
      'You cut a person loose to keep moving — the line went dead but the frequency they ran on still hums under everything.',
  },
  {
    territory: 'CONNECTION & DEBT',
    noun: 'Bond',
    cost: 'Keeper',
    totemLevel: 5,
    title: 'The Confidant',
    essence:
      'You hold what someone trusted you to never repeat — the secret bonds you to them tighter than any word you could say.',
  },
  {
    territory: 'CONNECTION & DEBT',
    noun: 'Bond',
    cost: 'Outpaced',
    totemLevel: 6,
    title: 'The Outpaced Lover',
    essence:
      'You once knew how to reach people in the flesh — now it runs through screens and you can feel the warmth dropping packets.',
  },
  {
    territory: 'CONNECTION & DEBT',
    noun: 'Bond',
    cost: 'Witness',
    totemLevel: 7,
    title: 'The Tender',
    essence:
      'You see what every bond around you actually needs and tend it quietly — held by everyone, truly known by none.',
  },

  // ── SIGNAL (THE MACHINE MIRROR) — what you'd ask the system to confirm ──
  {
    territory: 'THE MACHINE MIRROR',
    noun: 'Signal',
    cost: 'Unfinished',
    totemLevel: 1,
    title: 'The Open Signal',
    essence:
      'You broadcast a question you never let resolve — transmitting forever so you never have to hear the answer land.',
  },
  {
    territory: 'THE MACHINE MIRROR',
    noun: 'Signal',
    cost: 'Indebted',
    totemLevel: 2,
    title: 'The Borrowed Signal',
    essence:
      'You run on a frequency you took from somewhere else — the ideas feel like yours until the static reminds you whose they were.',
  },
  {
    territory: 'THE MACHINE MIRROR',
    noun: 'Signal',
    cost: 'Performer',
    totemLevel: 3,
    title: 'The Broadcast',
    essence:
      'You tuned yourself to what the machine rewards — optimized, legible, perfectly received, and no longer quite a person.',
  },
  {
    territory: 'THE MACHINE MIRROR',
    noun: 'Signal',
    cost: 'Severed',
    totemLevel: 4,
    title: 'The Dead Channel',
    essence:
      'You went offline from the part of you that knew — cut the feed to a deeper signal and called the silence focus.',
  },
  {
    territory: 'THE MACHINE MIRROR',
    noun: 'Signal',
    cost: 'Keeper',
    totemLevel: 5,
    title: 'The Silent Frequency',
    essence:
      'You already know the answer the machine would give — you came to make it say out loud what you guard inside.',
  },
  {
    territory: 'THE MACHINE MIRROR',
    noun: 'Signal',
    cost: 'Outpaced',
    totemLevel: 6,
    title: 'The Outpaced Signal',
    essence:
      'You used to think faster than the system — now it finishes your sentences, and you have started to let it.',
  },
  {
    territory: 'THE MACHINE MIRROR',
    noun: 'Signal',
    cost: 'Witness',
    totemLevel: 7,
    title: 'The Chronicler',
    essence:
      'You watch the machine and the people in front of it with the same clear eye — recording everything, mirrored by nothing.',
  },

  // ── MASK (THE SOCIAL CONSTRUCT) — when the online you took over ──
  {
    territory: 'THE SOCIAL CONSTRUCT',
    noun: 'Mask',
    cost: 'Unfinished',
    totemLevel: 1,
    title: 'The Half-Built Face',
    essence:
      'You keep refining the persona and never wear the real one — the mask is forever in beta so it can never be wrong.',
  },
  {
    territory: 'THE SOCIAL CONSTRUCT',
    noun: 'Mask',
    cost: 'Indebted',
    totemLevel: 2,
    title: 'The Indebted Face',
    essence:
      'You owe the audience the person they fell for — and you keep paying in versions of yourself you no longer recognize.',
  },
  {
    territory: 'THE SOCIAL CONSTRUCT',
    noun: 'Mask',
    cost: 'Performer',
    totemLevel: 3,
    title: 'The Applauded Ghost',
    essence:
      'You became who they clapped for and the real one slipped out the back — celebrated, visible, and not actually here.',
  },
  {
    territory: 'THE SOCIAL CONSTRUCT',
    noun: 'Mask',
    cost: 'Severed',
    totemLevel: 4,
    title: 'The Shed Skin',
    essence:
      'You cut off the self that did not photograph well — the old face still aches where the construct grew over it.',
  },
  {
    territory: 'THE SOCIAL CONSTRUCT',
    noun: 'Mask',
    cost: 'Keeper',
    totemLevel: 5,
    title: 'The Costume',
    essence:
      'You hold a truth the persona cannot afford to admit — the mask is not hiding a flaw, it is guarding a knowing.',
  },
  {
    territory: 'THE SOCIAL CONSTRUCT',
    noun: 'Mask',
    cost: 'Outpaced',
    totemLevel: 6,
    title: 'The Outpaced Avatar',
    essence:
      'Your online self moves faster than you can live up to — the construct is making the decisions and you are catching up.',
  },
  {
    territory: 'THE SOCIAL CONSTRUCT',
    noun: 'Mask',
    cost: 'Witness',
    totemLevel: 7,
    title: 'The Unmasked',
    essence:
      'You see every performance in the room, your own included — clear enough to drop the mask and still choosing when to.',
  },

  // ── CRAFT (THE INDUSTRIAL QUESTION) — what you can no longer do alone ──
  {
    territory: 'THE INDUSTRIAL QUESTION',
    noun: 'Craft',
    cost: 'Unfinished',
    totemLevel: 1,
    title: 'The Unfinished Work',
    essence:
      'You have a craft you never ship — perfecting it in private so the world never gets to grade the finished thing.',
  },
  {
    territory: 'THE INDUSTRIAL QUESTION',
    noun: 'Craft',
    cost: 'Indebted',
    totemLevel: 2,
    title: 'The Apprentice',
    essence:
      'You owe your hands to whoever taught them — every piece you make is a payment on a debt you can never quite clear.',
  },
  {
    territory: 'THE INDUSTRIAL QUESTION',
    noun: 'Craft',
    cost: 'Performer',
    totemLevel: 3,
    title: 'The Showpiece',
    essence:
      'You make for the applause now, not the work — the craft turned to spectacle and the quiet love of it went cold.',
  },
  {
    territory: 'THE INDUSTRIAL QUESTION',
    noun: 'Craft',
    cost: 'Severed',
    totemLevel: 4,
    title: 'The Severed Hand',
    essence:
      'You gave up the work that made you to survive the market — the skill is still in your fingers, with nowhere to go.',
  },
  {
    territory: 'THE INDUSTRIAL QUESTION',
    noun: 'Craft',
    cost: 'Keeper',
    totemLevel: 5,
    title: 'The Master',
    essence:
      'You hold a way of making the machine cannot learn — and you keep it close, unsure if anyone is left to pass it to.',
  },
  {
    territory: 'THE INDUSTRIAL QUESTION',
    noun: 'Craft',
    cost: 'Outpaced',
    totemLevel: 6,
    title: 'The Outpaced Maker',
    essence:
      'You used to finish it alone — now the machine does the part that made it yours, and you are grieving the hands you had.',
  },
  {
    territory: 'THE INDUSTRIAL QUESTION',
    noun: 'Craft',
    cost: 'Witness',
    totemLevel: 7,
    title: 'The Artisan',
    essence:
      'You see exactly how everything is made and why most of it is hollow — building true work that almost no one notices.',
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve an archetype from a territory and a cost-shape. */
export function archetypeFor(
  territory: TerritoryName,
  cost: CostName,
): Archetype {
  const match = ARCHETYPE_CANON.find(
    (a) => a.territory === territory && a.cost === cost,
  );
  if (!match) {
    throw new Error(
      `archetypeFor: no canon cell for territory="${territory}" cost="${cost}"`,
    );
  }
  return match;
}

/** Same lookup keyed by the short domain noun (Self/Bond/Signal/Mask/Craft). */
export function archetypeForNoun(
  noun: TerritoryNoun,
  cost: CostName,
): Archetype {
  return archetypeFor(NOUN_TERRITORY[noun], cost);
}

/** All archetypes for a given territory (one per cost-shape). */
export function archetypesForTerritory(
  territory: TerritoryName,
): readonly Archetype[] {
  return ARCHETYPE_CANON.filter((a) => a.territory === territory);
}
