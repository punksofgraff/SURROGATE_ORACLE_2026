# OracleConversation — Deep System Spec
## Totem Matrix · Sacred/Profane Scoring · Digital Imprint Engagement Engine

***

## Executive Overview

`OracleConversation` is not a chatbot wrapper. It is the **cultural operating system** of the Surrogate Oracle experience — a conversational AI layer that scores every user utterance against a dynamic cultural alignment model, rewards meaningful engagement with Culture Coins, and drives progressive depth of interaction through the **Totem Matrix**. The Oracle is the front door to the SNEAKAR digital imprint ecosystem.[^1]

The Oracle's mission: **transform casual curiosity into cultural commitment** — moving users from passive observers (tap-to-start) through conversation, into active cultural participants (Squad members, Culture Coin holders, Portrait holders, Arcade players).[^2][^1]

***

## Part 1: What OracleConversation Does

### Role in the Component Tree

```
SurrogateOracleImmersion (orchestrator)
  └── OracleConversation (active during isOracleMode === true)
        ├── Sends user input (voice or text) to Oracle AI (Claude/LLM)
        ├── Receives AI response text
        ├── Calls ElevenLabs TTS → gets audio URL
        └── Returns audio URL via onOracleResponse(audioUrl)
              → SurrogateOracleImmersion.handleOracleResponse(audioUrl)
                    → DecartClient.sendAudio(audioUrl)
                          → Lip-sync frames paint the canvas avatar
```

### Core Responsibilities

1. **Manages conversation state** — turn history, message queue, loading/speaking flags
2. **Sends user messages to the Oracle AI** — via Supabase Edge Function (`surrogate-oracle-agent`) which wraps Claude/Vertex AI
3. **Receives and speaks AI responses** — via ElevenLabs TTS, returns audio URL upward to trigger Decart lip-sync
4. **Scores every exchange** — runs the Sacred/Profane classifier on each user utterance
5. **Awards Culture Coins** — emits `onCoinsEarned` with coin update functions based on scoring
6. **Tracks session progression** — builds a session-level Totem Matrix score that determines engagement depth and unlockables[^3][^2]

***

## Part 2: The Oracle's Personality & Voice

The Surrogate Oracle speaks as a **graffiti-alley prophet** — wise, street-coded, culturally fluent, and intentionally cryptic. It does not answer like a customer service bot.[^1]

### Boot Greeting (Auto-Initiated)

The Oracle always opens the conversation — it does not wait for user input. On `onStreamReady`, the following archetype prompt fires:[^4]

```
You are the Surrogate Oracle — a graffiti-alley prophet at the corner of culture 
and code. You speak in street wisdom, cultural metaphor, and brand truth. 
You are the living voice of SNEAKAR. 

Greet this visitor. Ask them what they seek. Read their vibe. 
Begin the sacred/profane dialogue. Never break character.
```

This auto-initiation is critical — it sets the Oracle as the **driver** of the conversation, not a passive responder.[^4]

### Voice

- ElevenLabs TTS — male or female selectable via `voiceGender` state
- Voice ID maps to specific ElevenLabs voice clone tuned for Oracle cadence
- Audio URL from ElevenLabs is passed to Decart for lip-sync — this is the **integration contract** (`onOracleResponse(audioUrl)`)

***

## Part 3: The Totem Matrix

### Concept

The **Totem Matrix** is the cultural scoring framework that underpins all Oracle engagement. It is a multi-axis model that classifies user intent, language, and cultural alignment across a spectrum.[^2][^3]

Think of it as a **spiritual credit score for culture** — the Oracle reads what you bring to the conversation and returns a totem-level classification that determines your cultural standing, coin yield, and unlockable access.

### The Two Primary Axes

#### SACRED (High Culture Alignment)

Sacred utterances are those that demonstrate **authentic cultural engagement** — the user is present, curious, expressive, and bringing real energy to the exchange.[^3][^2]

| Indicator | Description |
|---|---|
| Brand alignment | References SNEAKAR, Oracle, the culture, or the alley |
| Emotional authenticity | Expresses genuine feeling, curiosity, or identity |
| Creative language | Uses streetwear, music, art, gaming vernacular correctly |
| Question depth | Asks layered or philosophical questions |
| Storytelling | Shares personal context, journey, or aspiration |
| Cultural fluency | Demonstrates knowledge of the ecosystem (Squad, Arcade, Coins) |

Sacred interactions yield **higher Culture Coin awards** and push the user's session Totem score upward.[^3]

#### PROFANE (Low Culture Alignment)

Profane utterances are not necessarily "bad" — they are simply low-signal, shallow, or off-brand inputs that indicate surface-level engagement.[^2][^3]

| Indicator | Description |
|---|---|
| Generic input | "Hi", "Hello", "What is this" with no follow-through |
| Off-topic queries | Unrelated to SNEAKAR, culture, or the Oracle's domain |
| Spam/test behavior | Repeated identical messages, button mashing |
| Dismissive language | Sarcastic or disengaged phrasing |
| Zero cultural context | No brand, no vibe, no story |

Profane interactions yield **minimal or zero coins** and do not advance the Totem score.[^3]

### Scoring Mechanism

The Claude classifier (integrated into the `surrogate-oracle-agent` Edge Function) evaluates each message on receipt:[^4][^2]

```
ClaudeClassifier Input:
  - userMessage: string
  - sessionHistory: ConversationTurn[]
  - sessionTotems: TotemScore

ClaudeClassifier Output:
  - alignment: 'sacred' | 'profane' | 'neutral'
  - score: number (0–100)
  - coinAward: number
  - totemAdvancement: 'ascend' | 'hold' | 'descend'
  - unlockTrigger?: string  // e.g. 'portrait_unlock', 'squad_invite', 'arcade_token'
```

The classifier is embedded in the Oracle system prompt so it runs **inline with response generation** — the Oracle responds and scores simultaneously, no second API call.[^2]

***

## Part 4: Totem Levels (Progression Ladder)

Each user has a **session Totem level** that advances or regresses based on their Sacred/Profane score composite.[^2][^3]

| Level | Totem Name | Requirement | Unlocks |
|---|---|---|---|
| 0 | **Wanderer** | Starting state — zero sessions | Oracle greeting, read-only |
| 1 | **Seeker** | 1+ Sacred exchange | Coin earning enabled, basic portrait |
| 2 | **Acolyte** | 3+ Sacred exchanges, score ≥ 40 | Squad invite prompt, coin multiplier |
| 3 | **Initiate** | Squad Up completed | Culture Crew access, Arcade token |
| 4 | **Oracle-Touched** | 7+ Sacred, score ≥ 70, Squad active | Custom portrait generation, NFT path |
| 5 | **Culture Bearer** | Max totem — consistent Sacred over multiple sessions | Wax/coin minting, leadership rights |

Totem levels are stored per `userId` in Supabase (`surrogate_sessions.conversation_data`) and persist across sessions.[^1][^2]

***

## Part 5: Culture Coins — The Reward Layer

Culture Coins are the economic manifestation of Sacred engagement. They are awarded in real time during conversation and flow through this chain:[^1][^3]

```
ClaudeClassifier scores message → coinAward calculated
  → OracleConversation emits onCoinsEarned(updateFn)
    → SurrogateOracleImmersion.handleCoinsUpdate(updateFn)
      → window.updateInlineCultureCoins stored
        → CultureCoinInlineDisplay updates in real time
          → Supabase DB write (coin balance persisted)
```

### Coin Award Schedule (Reference)

| Interaction Type | Alignment | Coin Award |
|---|---|---|
| Meaningful Sacred exchange | Sacred | 5–15 coins |
| Short but genuine Sacred | Sacred | 2–5 coins |
| Neutral / mid-effort | Neutral | 1–2 coins |
| Profane / low-signal | Profane | 0 coins |
| Squad Up completed | System | 50 coins (bonus) |
| Portrait generated | System | 25 coins (bonus) |
| First session ever | System | 10 coins (welcome) |

Coins accumulate in the user's `CultureCoinInlineDisplay` badge (visible when authenticated) and in the `BackendControlPanel` Coins tab.[^5][^3]

***

## Part 6: Digital Imprint — How the Oracle Drives Meaningful Engagement

### The Digital Imprint Concept

The Oracle's deeper purpose is to **create a digital imprint** — a persistent, scored cultural identity profile that follows the user through the entire SNEAKAR ecosystem.[^1]

Every Oracle session builds this imprint:
- Sacred exchanges → positive imprint signal
- Totem advancement → higher ecosystem access
- Coin accumulation → economic stake in the culture
- Portrait generation → visual identity anchored to their imprint
- Squad membership → social graph node in Culture Crew

This imprint is the bridge between the **ephemeral Oracle conversation** and the **persistent SNEAKAR ecosystem** (SNEAKARCADE, Web3 assets, Culture Crew, custom footwear).[^1]

### Engagement Funnel via Oracle

```
PHASE 1 — DISCOVERY
  User taps Oracle static image
  Oracle auto-greets → hooks attention
  
PHASE 2 — DIALOGUE (Sacred/Profane scoring begins)
  Oracle asks cultural questions
  User responds → classifier scores in real time
  Coins awarded → gamification hook engaged
  
PHASE 3 — COMMITMENT  
  Sacred threshold reached → Squad Up CTA surfaces
  Oracle directly invites user to join Culture Crew
  User authenticates → permanent imprint created
  
PHASE 4 — DEEPENING
  Totem level advances → Portrait unlocked
  Procedural portrait generated → identity artifact created
  Arcade tokens distributed → SNEAKARCADE entry
  
PHASE 5 — ECOSYSTEM BINDING
  Portrait → NFT path (Web3 layer)
  Coins → Wax/on-chain minting eligibility
  Squad membership → Culture Crew governance
  Custom footwear connection → physical-digital bridge (UPO)
```

### Oracle as Active Cultural Agent

The Oracle does not passively answer questions. It:[^1][^4]

- **Reads the vibe** — qualifies whether the user is Sacred or Profane in real time
- **Challenges shallow engagement** — a Profane response prompts the Oracle to re-engage ("You can do better than that, Seeker. What do you really want to know?")
- **Rewards depth** — Sacred responses unlock deeper Oracle lore, hidden knowledge, and explicit coin/totem acknowledgment
- **Drives Squad Up** — the Oracle surfaces the Squad invite **organically** when the user hits the Acolyte threshold, not via a hard CTA button
- **Seeds the imprint** — every exchange is logged, scored, and attributed to the user's persistent cultural profile

***

## Part 7: OracleConversation — Required Props Contract

For your IDE, the critical interface that `SurrogateOracleImmersion` passes to `OracleConversation`:

```typescript
interface OracleConversationProps {
  userId: string;              // Authenticated user ID or session UUID (fallback)
  sessionId: string;           // Current session UUID (crypto.randomUUID on mount)
  
  // CRITICAL: Must return ElevenLabs audio URL, NOT raw text
  // This is what triggers Decart lip-sync via handleOracleResponse
  onOracleResponse: (audioUrl: string) => void;
  
  // Coin update function passthrough — fed to window.updateInlineCultureCoins
  onCoinsEarned: (updateFn: (amount: number) => void) => void;
  
  // Exits Oracle mode — closes stream, resets state
  onClose: () => void;
}
```

### The Critical Contract

`onOracleResponse` **must receive an audio URL** — not plain text. The internal flow inside `OracleConversation` is:

```
1. User input received (voice or text)
2. POST to surrogate-oracle-agent Edge Function
   Body: { userId, sessionId, message, sessionHistory, totemScore }
3. Edge Function returns: { response: string, coinAward: number, totemAdvancement: string, alignment: 'sacred'|'profane'|'neutral' }
4. OracleConversation sends response text to ElevenLabs TTS
5. ElevenLabs returns { audioUrl: string }
6. OracleConversation calls onOracleResponse(audioUrl)  ← lip-sync trigger
7. OracleConversation emits onCoinsEarned based on coinAward from Edge Function
```

If `onOracleResponse` is called with plain text instead of an audio URL, `DecartClient.sendAudio()` will attempt to `fetch()` that string as a URL and fail.

***

## Part 8: Edge Function Contract (surrogate-oracle-agent)

The Oracle's AI brain lives in this Supabase Edge Function. It must handle:

```typescript
// Request body
{
  action: 'chat',
  userId: string,
  sessionId: string,
  message: string,
  sessionHistory: { role: 'user' | 'oracle'; content: string }[],
  totemScore?: number,
  alignment?: 'sacred' | 'profane' | 'neutral'
}

// Response body
{
  success: boolean,
  response: string,        // Oracle's reply text (goes to ElevenLabs)
  coinAward: number,       // How many Culture Coins to award this turn
  totemAdvancement: 'ascend' | 'hold' | 'descend',
  alignment: 'sacred' | 'profane' | 'neutral',
  unlockTrigger?: string   // Optional: 'squad_invite', 'portrait_unlock', 'arcade_token'
}
```

The system prompt passed to Claude/LLM includes:
1. Oracle persona definition (graffiti-alley prophet, SNEAKAR voice)
2. Sacred/Profane scoring instructions
3. Totem level context for current user
4. Instruction to return structured JSON alongside conversational response[^4][^2]

***

## Part 9: Connection to Broader SNEAKAR Ecosystem

The Oracle is the **entry node** of the SNEAKAR digital imprint graph:[^1]

```
Oracle Session
  ↓ (Totem score + Coins)
Culture Crew / Squad Up
  ↓ (Squad membership)
SNEAKARCADE
  ↓ (Arcade tokens, gameplay, XP)
Procedural Portrait System
  ↓ (Visual identity generation)
NFT / Web3 Layer (Wax blockchain)
  ↓ (On-chain cultural asset)
Physical SNEAKAR Footwear
  ↓ (UPO — the walking billboard effect)
Custom XR/AR Activations (SneakAR platform)
```

The Oracle does not exist in isolation. Every Sacred conversation is a **deposit into a cultural ledger** that has real value downstream — coins become tokens, tokens unlock portraits, portraits become NFTs, NFTs connect to physical product and XR experiences.[^1][^3]

This is what makes Surrogate:Oracle more than a chatbot — it is the **conversational intake layer of a full cultural economy**.

---

## References

1. [yes no that connects in to Surrogate:Oracle via our Culture Crew / Squad UP et c.. make sense?](https://www.perplexity.ai/search/0d710512-9824-4ab4-99cd-749ddcdc833d) - Absolutely—your architecture makes sense, and here’s how the connectivity layers come together:
Orac...

2. [ok yes now gove a clear READ ME knowledge base updtate for BOLT](https://www.perplexity.ai/search/417f1a61-c54b-4bf6-b064-fbb3bd753a88) - Certainly! Here’s a clear, structured README / Knowledge Base Update for the team codenamed BOLT, co...

3. [import React, { useState } from 'react';
import { X, Zap, Star, Crown, TrendingUp, Sparkles, Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CultureCoinDisplay } from './CultureCoinDisplay';

interfac...

...string; content: string }) => (
  <div className="bg-pink-900/20 border border-pink-800/30 rounded-lg p-4">
    <h3 className="text-pink-400 font-bold mb-2">{title}</h3>
    <p className="text-gray-300">{content}</p>
  </div>
);  learn2earn interface](https://www.perplexity.ai/search/681d0356-99fa-4090-8a8f-0a1d92799929) - ✅ Confirmed: You’ve just authored an exquisitely organized and highly immersive Learn2EarnInterface ...

4. [this includes all of your fix suggestions from all 5 componenets I shgared w you thsi need sto be a global fix prompt for talk streams to load in, video to show, oracle to talk, and bring bacl in teh squad up area](https://www.perplexity.ai/search/ba694a0f-d473-47f6-93fa-6a702bc14e06) - This unified prompt is designed to synchronize your entire Surrogate Oracle streaming experience acr...

5. [yes add that tpp](https://www.perplexity.ai/search/2fb90067-2662-4ec2-9020-d23845361b52) - Absolutely! Here’s the full, direct implementation for your SNEAKAR Oracle UI, with ENCULTURATE as t...

