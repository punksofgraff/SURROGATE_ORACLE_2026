const normalizeCommand = (text: string): string =>
  text.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function isCopilotPersonaCommand(text: string): boolean {
  const normalized = normalizeCommand(text);
  if (normalized === 'oracle copilot' || normalized === 'copilot oracle' || normalized === 'copilot mode') {
    return true;
  }
  return /\b(?:switch|change|enter|activate|enable|use|turn\s+on|put\s+me\s+in|take\s+me\s+to|want|would\s+like|let's\s+use)\b.{0,36}\bcopilot\b/i.test(text);
}

// Searching is opt-in: ordinary factual questions remain private to the live
// conversation unless the Seeker explicitly asks to search, look up, or research.
export function isExplicitGroundingRequest(text: string): boolean {
  return /\b(?:search(?:\s+the\s+(?:web|internet))?|look\s+up|research|find\s+(?:out|the\s+latest|current|recent)|ground\s+(?:this|that|your\s+answer)|use\s+(?:web|internet|search))\b/i.test(text);
}

export function isMusicGenerationRequest(text: string): boolean {
  return /\b(?:make|generate|compose|create|produce|build|drop|play|want|need|give\s+me|I'd\s+like|make\s+me|play\s+me)\b[^.!?]{0,80}\b(?:beat|track|music|song|soundtrack|soundscape|instrumental|audio)\b/i.test(text);
}

export function isExplicitLyriaRequest(text: string): boolean {
  return /\blyria\b/i.test(text) && isMusicGenerationRequest(text);
}
