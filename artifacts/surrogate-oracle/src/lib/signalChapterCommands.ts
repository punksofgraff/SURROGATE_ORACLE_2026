const normalize = (text: string): string =>
  text.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const OPEN_CHAPTERS_COMMAND =
  /^(?:(?:hey|okay)\s+)?(?:oracle\s+)?(?:(?:please\s+)?(?:open(?:\s+up)?|show(?:\s+me)?|view|bring\s+up)\s+(?:(?:me|my|the)\s+)?(?:(?:saved|signal)\s+)?chapters|(?:my\s+)?chapters)$/;

/** Exact, low-ambiguity phrase used by typed and spoken Oracle controls. */
export function isSignalChaptersCommand(text: string): boolean {
  return OPEN_CHAPTERS_COMMAND.test(normalize(text));
}