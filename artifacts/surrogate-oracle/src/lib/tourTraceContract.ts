export const REQUIRED_TOUR_CHECKPOINTS = [
  'card_flush',
  'preview_request',
  'first_playable_audio',
  'first_letter_landing',
] as const;
export const EXPECTED_TOUR_CARD_INDICES = [1, 2, 3] as const;

export type RequiredTourCheckpoint = (typeof REQUIRED_TOUR_CHECKPOINTS)[number];
export type TourTraceRow = {
  event_type: string;
  payload: Record<string, unknown>;
};

export type TourCardEvidence = {
  cardIndex: number;
  territory: string;
  checkpoints: Partial<Record<string, TourTraceRow[]>>;
  missing: RequiredTourCheckpoint[];
  warnings: string[];
};

export type TourTraceReview = {
  sessionConfigPresent: boolean;
  missing: string[];
  warnings: string[];
  cards: TourCardEvidence[];
  profile: string[];
};

function cardIndex(row: TourTraceRow): number {
  const explicit = Number(row.payload.card_index);
  if (Number.isFinite(explicit)) return explicit;
  const match = String(row.payload.label ?? '').match(/\[(\d+)\]/);
  return match ? Number(match[1]) : NaN;
}

export function reviewTourTrace(rows: TourTraceRow[]): TourTraceReview {
  const sessionConfigPresent = rows.some((row) =>
    row.event_type === 'step' && String(row.payload.label ?? '').includes('SESSION CONFIG'),
  );
  const grouped = new Map<number, TourCardEvidence>();

  for (const row of rows) {
    const index = cardIndex(row);
    const checkpoint = String(row.payload.checkpoint ?? '').toLowerCase();
    if (!Number.isFinite(index) || row.event_type !== 'tour_checkpoint' || !checkpoint) continue;
    const evidence = grouped.get(index) ?? {
      cardIndex: index,
      territory: String(row.payload.territory ?? `CARD ${index}`),
      checkpoints: {},
      missing: [],
      warnings: [],
    };
    if (row.payload.territory) evidence.territory = String(row.payload.territory);
    evidence.checkpoints[checkpoint] = [...(evidence.checkpoints[checkpoint] ?? []), row];
    grouped.set(index, evidence);
  }

  const cards = EXPECTED_TOUR_CARD_INDICES.map((index) => grouped.get(index) ?? {
    cardIndex: index,
    territory: `CARD ${index}`,
    checkpoints: {},
    missing: [...REQUIRED_TOUR_CHECKPOINTS],
    warnings: [],
  });
  const missing: string[] = sessionConfigPresent ? [] : ['session_config'];
  const warnings: string[] = [];
  for (const card of cards) {
    card.missing = REQUIRED_TOUR_CHECKPOINTS.filter((name) => !card.checkpoints[name]?.length);
    missing.push(...card.missing.map((name) => `card_${card.cardIndex}:${name}`));
    if ((card.checkpoints.preview_request?.length ?? 0) > 1) {
      card.warnings.push('duplicate_preview');
      warnings.push(`card_${card.cardIndex}:duplicate_preview`);
    }
    if (card.checkpoints.preview_timeout?.length) {
      card.warnings.push('timeout_fallback');
      warnings.push(`card_${card.cardIndex}:timeout_fallback`);
    }
    if (card.checkpoints.preview_interrupted?.length) {
      card.warnings.push('interrupted_preview');
      warnings.push(`card_${card.cardIndex}:interrupted_preview`);
    }
  }

  const profile: string[] = [
    rows.some((row) => row.event_type === 'oracle_phase_entered' && row.payload.is_returning === true)
      ? 'RETURNING' : 'FRESH',
  ];
  if (rows.some((row) => row.event_type === 'tour_checkpoint' && row.payload.checkpoint === 'manual_advance')) {
    profile.push('MANUAL ADVANCE');
  }
  if (warnings.some((warning) => warning.endsWith('interrupted_preview'))) profile.push('INTERRUPTED PREVIEW');

  return { sessionConfigPresent, missing, warnings, cards, profile };
}