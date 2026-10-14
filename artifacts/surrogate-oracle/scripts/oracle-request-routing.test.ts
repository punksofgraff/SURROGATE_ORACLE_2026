import assert from 'node:assert/strict';
import {
  isCopilotPersonaCommand,
  isExplicitGroundingRequest,
  isExplicitLyriaRequest,
  isMusicGenerationRequest,
} from '../src/lib/oracleRequestRouting';

const copilotCommands = [
  'Oracle Copilot',
  'Switch me to Copilot',
  'I want to use Copilot',
  'Put me in Copilot mode',
  'Activate Copilot, please',
];
for (const command of copilotCommands) {
  assert.equal(isCopilotPersonaCommand(command), true, `recognizes Copilot command: ${command}`);
}
for (const ordinaryMention of ['Copilot is interesting', 'Can you explain Copilot?', 'Oracle']) {
  assert.equal(isCopilotPersonaCommand(ordinaryMention), false, `does not switch on ordinary mention: ${ordinaryMention}`);
}

for (const query of ['Search the web for current Mars mission updates', 'Look up the latest on this', 'Research this claim']) {
  assert.equal(isExplicitGroundingRequest(query), true, `routes explicit search: ${query}`);
}
assert.equal(isExplicitGroundingRequest('What is the capital of France?'), false, 'ordinary questions do not trigger external search');

for (const request of [
  'Generate music with Lyria',
  'I want Lyria to create a beat',
  'Use Lyria to compose a soundtrack',
]) {
  assert.equal(isExplicitLyriaRequest(request), true, `recognizes explicit Lyria request: ${request}`);
}
assert.equal(isExplicitLyriaRequest('I like Lyria'), false, 'a mention of Lyria is not generation consent');

for (const request of ['Make me a song', 'I want a track', 'Play me a beat']) {
  assert.equal(isMusicGenerationRequest(request), true, `recognizes natural music request: ${request}`);
}
assert.equal(isMusicGenerationRequest('That song reminds me of home'), false, 'music mention is not generation consent');

console.log('Oracle request routing contracts passed.');
