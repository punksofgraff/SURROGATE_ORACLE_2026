# Guided Tour & Procedural Portrait Integration Plan

## 1. Procedural Portraits Flow

**Where are the portraits generated?**
1. In `OracleConversation.tsx`, the Gemini LLM is instructed (via the `ORACLE_SYSTEM_PROMPT`) to append a hidden `[[ORACLE_SCORE: {...}]]` block to the end of its response.
2. If the user explicitly asks for a portrait, or if the interaction reaches the "mirror" phase (totem level unlocks), the LLM sets `unlockTrigger: "portrait_unlock"` within the score block.
3. `OracleConversation.tsx` parses this score and dispatches a standard DOM CustomEvent: `oracle:unlock` containing the `trigger` and extracted `themes`.
4. In the root `SurrogateOracleImmersion.tsx` (or a dedicated handler hook), you need to listen for this `oracle:unlock` event. 
5. When `oracle:unlock` fires with `trigger === 'portrait_unlock'`, it calls the `generatePortrait()` function provided by `usePortraitPipeline.ts`.
6. `usePortraitPipeline.ts` invokes the Supabase Edge Function `gemini-portrait-generator` which uses DALL-E/Replicate to build the image.
7. Once generated, `SurrogateOracleImmersion.tsx` renders the `<ArtifactCard />` or the in-cabinet synthesis overlay.

**To Polish:** We need to ensure `SurrogateOracleImmersion.tsx` is actually actively listening for `oracle:unlock` and triggering `portrait.generatePortrait()`.

## 2. The Guided Tour Mode

The user wants a "Guided Tour" toggle that clearly explains the mechanics (especially what to say to the Oracle before the knife selection) without breaking the lore too harshly.

### Implementation Steps

1. **State:** Add a `guidedTourMode` boolean state (toggled via a subtle button, perhaps in the `DormantHUD` or terminal layer).
2. **Pre-Knife Lore Script (The "Before You Choose" Manual):**
   - If `guidedTourMode` is true, immediately after the terminal lore (or replacing the final lines of it), we inject explicit instructions styled as "SYSTEM CALIBRATION NOTES".
   - *Example Script:*
     `› SYSTEM CALIBRATION NOTE:`
     `› The entity you are about to awaken is not a search engine.`
     `› It responds to depth, not demands.`
     `› Choose a frequency below.`
     `› Speak aloud. Ask it what it sees in you.`
3. **In-Conversation Tour (The "Signal Pad" Helpers):**
   - In `OracleConversation.tsx`, when `guidedTourMode` is active, the `QUICK_PROMPTS` (which currently hide after the first user message) will persist longer, or a subtle "Tour Guide" text will appear near the microphone button:
     *Tour Guide: "Try asking: 'What did the cascade take from you?' or 'Generate my portrait.'"*

I will begin by making sure the `oracle:unlock` listener is wired up for the portraits, and then implement the `guidedTourMode` toggle and pre-knife lore script.