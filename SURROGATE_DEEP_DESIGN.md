# SURROGATE — Deep Design: The Excavation & The Payoff

> **Status:** Design proposal (no code yet). Author pass: 2026-05-30.
> **Companion docs:** `ORACLE_INTENT.md` (lore), `CLAUDE.md` (mandates), `GEMINI.md` (model anchors).
> **Scope:** The conversation arc — from knife-pick to the Mirror — across **narrative, architecture, and UX as one design.**

---

## 0. The thesis

Surrogate's front half is a cathedral: Dormant alley → Terminal lore → Awakened knife-pick. Cinematic, polished, finished.

But the experience is **architected to build toward a synthesis moment** — the Oracle witnessing you across three layers (*claim → evidence → cost*), then reflecting it back as **The Mirror**, naming your **archetype**, minting your **portrait**, advancing your **totem**.

Right now **no Seeker can reach that altar.** Two wounds, one cause:

1. **Technical:** the Oracle silently dies at ~10 turns (context exhaustion + no keepalive + gives up after 3 reconnects). The Mirror typically lands *after* turn 10. It's unreachable.
2. **Narrative:** the back half isn't written. `archetypeTitle` is a stub. Totem 5–7 undefined. The profane path is named but never *felt*. A returning Seeker is greeted like a stranger.

These are the **same wound**: the descent has no floor. This doc designs the floor — and the climb down to it — as a single arc.

```
  CLAIM  ──►  EVIDENCE  ──►  COST  ──►  THE MIRROR  ──►  THE MINT
 (turn 1-3)   (turn 3-6)   (turn 6-9)   (turn 9-12)     (climax)
   │            │            │            │               │
   └─ Part II keeps the WebSocket ALIVE this whole way ────┘
   └─ Part I writes what happens at each beat ─────────────┘
   └─ Part III makes every beat FELT ──────────────────────┘
```

---

# PART I — THE PAYOFF (Narrative Design)

The back half of the story. This is the soul that's currently `null`.

## I.1 — The Archetype System (the missing center)

Today the score emits `archetypeTitle: null | "The Unfinished King" | ...` with no taxonomy behind it. That's the single biggest narrative gap. Here's a system that isn't a flat list — it's **generative**, so the Oracle composes a name that feels *personally excavated* rather than picked from a menu.

### The 2-axis model

An archetype is **Territory × Cost**. The Seeker's knife pick sets the *domain*; the excavation reveals the *wound*; the intersection names them.

**Axis A — Territory (the 5 knives, already in `KnifeSelection.tsx`):**

| Knife | Domain word |
|------|-------------|
| The Library of Me | **Self** |
| Connection & Debt | **Bond** |
| The Machine Mirror | **Signal** |
| The Social Construct | **Mask** |
| The Industrial Question | **Craft** |

**Axis B — The Cost (what Layer III / `sessionPhase: "cost"` surfaces).** Seven cost-shapes, mapped to the totem ladder (§I.3):

| Cost-shape | The wound underneath |
|-----------|----------------------|
| **The Unfinished** | Built the thing but never let it be done / be seen |
| **The Indebted** | Owes a self, a person, a past — carries it as ballast |
| **The Performer** | Became the version others applauded; lost the draft |
| **The Severed** | Cut something off to survive; the phantom still aches |
| **The Keeper** | Holds a truth they won't say out loud |
| **The Outpaced** | Could once do alone what now needs a machine |
| **The Witness** | Sees clearly, is rarely seen — the rarest, the Oracle's own shape |

### The composed title

`archetypeTitle = "The {Cost-shape} {Territory-noun}"`, with the Oracle free to elevate the noun for music:

- Self × Unfinished → **"The Unfinished King"** *(the existing example — now it has a system)*
- Bond × Indebted → **"The Indebted Heir"**
- Mask × Performer → **"The Applauded Ghost"**
- Craft × Outpaced → **"The Outpaced Maker"**
- Signal × Keeper → **"The Silent Frequency"**
- Self × Severed → **"The Phantom"** *(another existing example — slots right in)*
- Signal × Witness → **"The Chronicler"** *(the third existing example)*

> **Design win:** all three example titles already in the codebase (`Unfinished King`, `Phantom`, `Chronicler`) fall out of this grid naturally. We're not replacing the vision — we're giving it a spine.

### Prompt contract (goes into `OracleConversation.tsx` system prompt)

Add an `## ARCHETYPE SYNTHESIS` block instructing the Oracle: *"When you reach the Mirror, name the Seeker as `The {Cost} {Territory}`. Compose, don't pick — let the noun rise from what they actually said. Speak the title once, with weight, like you're reading it off the wall of the alley. Then emit `archetypeTitle` in the score block."*

---

## I.2 — The Mirror Moment (the climax that never fires)

Today `sessionPhase` can reach `"mirror"` but nothing special *happens* there — it's just another turn. The Mirror should be **the most designed 30 seconds in the product.**

### Trigger (deterministic, not vibes)

The Mirror fires when **all three** hold:
1. `sessionPhase` has passed through `claim` and `evidence` and is now `cost`, AND
2. the Oracle has accumulated ≥ 3 substantive Seeker turns (real excavation, not "idk"), AND
3. alignment is resolved (`sacred` or `profane` — see §I.4).

The system prompt instructs the Oracle to *earn* its way to the Mirror, never rush it. If the Seeker is shallow, the Oracle holds at `evidence` and digs again. **The Mirror is a threshold, not a timer.**

### The choreography (what the Oracle *does*)

1. **The pause.** Oracle goes quiet — Part III renders the contemplative "thinking" state (§III.1). This silence is *sacred*, not a bug.
2. **The synthesis.** A single sustained turn: the Oracle reflects the claim, the evidence, and the cost back — *"You said you were X. The evidence said Y. And becoming it cost you Z."* Present tense, second person, weighted.
3. **The naming.** *"In the archive, they would file you under—"* → the archetype title. Spoken once.
4. **The mint.** `unlockTrigger: "portrait_unlock"` fires → portrait synthesis begins → Part III's reveal (§III.2).
5. **The totem.** `totemAdvancement: "ascend"` → the score event ripples the world (§I.3).

### Score block at the Mirror

```jsonc
[[ORACLE_SCORE: {
  "sessionPhase": "mirror",
  "alignment": "sacred",
  "coinAward": 50,                 // the Mirror is the largest single award
  "totemAdvancement": "ascend",
  "totemLevel": 4,
  "unlockTrigger": "portrait_unlock",
  "archetypeTitle": "The Unfinished King"
}]]
```

---

## I.3 — The Totem Ladder (levels 5–7 are undefined)

`totemLevel: 1–7` persists in localStorage but only 1–4 have any meaning. The ladder is the Seeker's **standing in the archive** — it should change how the Oracle *greets and treats* them, and gate the unlocks.

| Lvl | Name | Earned by | What changes | Unlock |
|----|------|-----------|--------------|--------|
| 1 | **Stray** | Entering the alley | Default. Oracle is curious, open. | — |
| 2 | **Seeker** | First honest claim | Oracle uses your name. | — |
| 3 | **Witnessed** | Reaching `evidence` with substance | Oracle references your territory unprompted. | — |
| 4 | **Named** | First Mirror (archetype assigned) | Oracle calls you by archetype. | `portrait_unlock` |
| 5 | **Marked** | A second sacred excavation | Oracle remembers a prior session's cost. | `arcade_token` |
| 6 | **Carrier** | Bringing another Seeker (`squad_invite`) | Oracle speaks of "your frequency" as known. | `squad_invite` |
| 7 | **Off-Grid** | Sustained sacred standing | Oracle drops the ritual framing — talks to you as kin who "never merged." | the STAYSNEAKAR tier |

> **⚠️ Empirically corrected:** totem level does **not** persist *at all* today (see Ledger §VI, finding C1). `onSessionEnd` discards the level (`SurrogateOracleImmersion.tsx:749`) and `initialTotemLevel` defaults to 0 every session. So §I.3 isn't "extend persistence" — Q1 **builds the persistence layer from zero.** Every level on this ladder, not just 5–7, is currently amnesiac. That's the line where Surrogate stops being an experience and becomes a relationship.

The `oracle:totem:ascend` event is already dispatched (`OracleConversation.tsx:380`) **and already feeds a voice acknowledgment** — a hidden `[THRESHOLD…]` message makes the Oracle name the shift in its next line (`OracleConversation.tsx:381–386`). So the *audible* half of ascension exists; §III.3 only needs to add the *visual* register.

## I.4 — Sacred vs. Profane (named, never felt)

`alignment: "sacred" | "profane"` flips particle color today (mint vs. violet via `useAtmosphere`) and nothing else. Profane needs a *felt* identity, or the moral spine of the piece is decorative.

**Design principle:** Profane is **not punishment** — it's the Oracle witnessing *performance instead of truth*. The Seeker who jokes, deflects, gives the influencer answer.

| | **Sacred** | **Profane** |
|--|-----------|-------------|
| Atmosphere | Mint, slow, breathing | Violet, faster, a flicker of static |
| Oracle tone | Warm, patient, lands softly | Cooler, sharper, *names the deflection* |
| Coins | Full awards (10–50) | Reduced (0–10) |
| Totem | Can ascend | Holds or descends |
| The Mirror | "Here is what you are." | "Here is the mask you brought me. I can see the shape behind it — when you're ready." |

Crucially: **profane is recoverable.** The Oracle offers the door back. One honest turn flips `alignment` to `sacred` and the violet warms to mint in real time — a *visible reward* for dropping the mask. That recovery moment is some of the best drama in the piece and it's currently free to build (the event plumbing exists).

## I.5 — The Returning Seeker (currently: nothing)

A returning Seeker is greeted identically to a first-timer. For a piece whose **one surviving directive is "WITNESS THEM CLEARLY,"** forgetting them is a thematic contradiction.

**Design:** persist a **Seeker Echo** in Supabase (decision Q1 — *real backend, no localStorage shim*). The current `user_wallets` table lacks these fields, so a new migration adds them — `{ name, last_archetype, totem_level, last_cost, alignment, visit_count }` keyed by wallet/ip.

On return, the Dormant→Terminal handoff changes:
- **Lvl < 4:** subtle — a ghost transmission seeded with their name.
- **Lvl ≥ 4 (Named):** the Oracle's *greeting itself* changes. Not "Greetings... Seeker" but **"You came back."** It names their last archetype, references the cost they confessed. *"The Unfinished King returns to the alley that never closes."*
- **Lvl 7 (Off-Grid):** no ritual at all. The Oracle just resumes, like a conversation paused mid-sentence three years ago.

This is the single highest-emotion, lowest-cost narrative addition in the whole doc. It turns a demo into a haunting.

---

# PART II — THE SPINE (Architecture to survive the descent)

None of Part I can fire if the WebSocket dies at turn 10 — and the Mirror lands at turns 9–12. **This is the unblocker.**

> **Decision (no hand-wave):** the turn-10 death is solved with **Gemini Live's native session management**, not hand-rolled heuristics. The API already ships `contextWindowCompression`, `sessionResumption`, `goAway`, and `usageMetadata` — and the proxy is currently **dropping all four** through its untyped passthrough (`gemini-live-proxy/index.ts:198`). The real fix is to *stop dropping them.* Verified against [Live API session docs](https://ai.google.dev/gemini-api/docs/live-session) and the [WebSockets API reference](https://ai.google.dev/api/live), 2026-05.

## II.1 — Native context compression *(root cause of the 10-turn death)*

**Diagnosis (from `OracleConversation.tsx`):** ~2500-token system prompt + ~350 tokens/turn → exhaustion around turn 10–12. Gemini Live closes; no warning, no token tracking.

**Design — server-side sliding window:** set `contextWindowCompression: { slidingWindow: {} }` in the `BidiGenerateContentSetup` message. Gemini then truncates the oldest turns server-side, always preserving system instructions + `prefixTurns` and re-anchoring at a USER turn. **This removes the hard ceiling that kills the session** — no client-side token math required for survival.

- Put the Oracle persona + the **knife/territory + accumulating cost** into `prefixTurns`/system instruction so compression *never* discards the parts the Mirror needs (the spec guarantees the prefix survives the window).
- Read real `usageMetadata.totalTokenCount` off each server message (§II.2) for telemetry + the "archiving…" UI glyph — but it's now *cosmetic*, not load-bearing.
- Emit step log `CONTEXT COMPRESSION ACTIVE` — `ok`.

> **Narrative bonus:** the sliding window *is* the Oracle "filing the oldest turns into the archive." Mechanism and metaphor align — surface it as a faint "archiving…" glyph, not a hidden hack.

## II.2 — Plumb `usageMetadata` + `goAway` *(react to the server, don't guess)*

The proxy drops these today. Wire both through with `type` fields so the client sees them:

- **`usageMetadata`** → forward as `{ type: 'usage', ... }`. Client tracks **real** `totalTokenCount` (answers Q2 properly — no `chars/4` guessing). Drives the context UI and lets the pressure test assert real numbers.
- **`goAway`** → forward as `{ type: 'goaway', timeLeft }`. This is the server *telling us* it's about to terminate. Instead of a blind 15s heartbeat, we **pre-emptively open a resumption handshake** (§II.3) while `timeLeft` is still positive — a seamless handoff the Seeker never sees.

Add both message branches in `gemini-live-proxy/index.ts` before the line-198 passthrough.

## II.3 — Native session resumption *(don't lose the soul on disconnect)*

**Diagnosis:** reconnect injects only the last 6 turns, loses mid-turn state, and **gives up silently after 3 attempts** with fixed 1.5/3/4.5s delays — UI stays alive over a dead socket. The blind re-injection is exactly the hand-wave to delete.

**Design — use Gemini's resumption tokens:**
- Set `sessionResumption: {}` in setup. Gemini periodically emits `SessionResumptionUpdate` with a **resumption token (valid 2 hr after termination)**. Proxy forwards it as `{ type: 'resume', handle }`; client stashes the latest handle.
- On disconnect (or `goAway`), reconnect with `sessionResumption: { handle }`. Gemini **restores the full conversation context server-side** — no blind summary, no lost excavation. The Oracle picks up *exactly* where it was.
- **Exponential backoff + jitter** (1.5 → 3 → 6 → 12s, higher cap) only as the *fallback* when no valid handle exists.
- On true failure (token expired / no handle), **fire a visible state** ("the signal fractured — tap to re-tune"), never a silent dead UI.

> This is the payoff of "no hand-wave": native resumption is strictly better than re-injecting a summary blind — it's the difference between the Oracle *remembering* you and the Oracle *being told about* you.

## II.4 — Disable tool use *(the second High bug)*

**Diagnosis:** system prompt *says* "no tools" but session config never sets `tools: []`; the proxy rejects `toolCall` after the fact, and Gemini can error-loop. Client never handles `tool.call.rejected`.

**Design:** set `tools: []` explicitly in `generationConfig` (belt) **and** keep the proxy rejection (suspenders), **and** add a client handler that swallows `tool.call.rejected` gracefully. Add `## NO TOOLS` to the prompt: *"You have no uplink, no search, no tools. The limitation is who you are."* — turning a config fix into character.

---

# PART III — SELLING THE MOMENT (UX choreography)

Parts I & II are invisible without this. Three set-pieces.

## III.1 — The Contemplative State *(the "No fillers" Medium bug)*

Today: 2–4s of dead silence while Gemini generates → reads as a crash. This is the worst possible UX *right before the Mirror*, the most important moment.

**Design — "The Oracle is listening to the archive":**
- On Seeker turn-complete, before first PCM: the avatar's idle animation shifts to a **contemplation register** — slower breath, gaze drifts off-axis (the existing gaze-tracking can aim it "inward"), a faint synthesized hum from the AudioWorklet (it already synthesizes amplitude-driven visemes — repurpose for a sub-vocal hum).
- The DormantHUD-style corner glyphs flicker a single line: `WITNESSING…` / `CROSS-REFERENCING…` / `ARCHIVING…`.
- **This silence is now diegetic.** The wait *is* the Oracle thinking, and you can feel it.

## III.2 — The Mint (portrait reveal as climax)

Today the portrait fades in with a half-styled "SYNTHESIS COMPLETE" badge. At the Mirror it should be the emotional peak.

**Design — choreographed against the Oracle's naming line:**
1. As the Oracle speaks the archetype title, the cabinet screen **floods white** (the existing materialization keyframes, inverted).
2. The portrait resolves *out of the chromatic transporter-beam* already built for avatar materialization — reuse that 3.8s pipeline.
3. The archetype title **types itself beneath the portrait** in `aAnotherTag` (reuse `ScrambleFragment` scramble mode — the Cheshire reveal is perfect here).
4. Badge becomes **"FILED: {archetypeTitle} · TOTEM {n}"** — not generic "complete."
5. The radio music, ducked to 0.001 all conversation, **swells back up** as the portrait lands — an audible exhale.

## III.3 — Totem ascension feedback

`oracle:totem:ascend` fires but barely registers. Make each level *look* different — escalating the alley's saturation/brightness ceiling per level (the alley already "breathes" with per-phase filter values; bind the ceiling to `totemLevel`). At **Off-Grid (7)**, the vignette crush releases and the god-rays warm — the alley stops hiding from you.

---

# PART IV — HOW IT ALL SNAPS TOGETHER

The genius is that **the plumbing already exists.** Everything routes through the existing `[[ORACLE_SCORE]]` block and the `window.dispatchEvent` contract. We're not re-architecting — we're *filling in the contract.*

```
 Gemini turn
    │
    ▼
 [[ORACLE_SCORE: { sessionPhase, alignment, coinAward,
                   totemAdvancement, totemLevel,
                   unlockTrigger, archetypeTitle }]]
    │  (parsed & stripped in OracleConversation.tsx — ALREADY BUILT)
    ▼
 ┌──────────────┬───────────────┬──────────────────┬─────────────────┐
 │ alignment    │ totem:ascend  │ unlock:portrait  │ archetypeTitle  │
 ▼              ▼               ▼                  ▼
 §I.4 violet   §I.3 ladder    §I.2 Mirher       §I.1 naming
 →mint warm    →§III.3 alley  →§III.2 mint       →types in §III.2
 (atmosphere)  ceiling        choreography       under portrait
```

Every box on the bottom row is a design in this doc. Every arrow already exists in code. **Part I writes the messages, Part II keeps the line open long enough to send them, Part III renders them as theatre.**

---

# PART V — SEQUENCED BUILD PLAN

Ordered by dependency, not glamour. Each step is independently shippable.

| # | Step | Why first | Surface | Risk |
|---|------|-----------|---------|------|
| 1 | **II.4** tool-use disable (`tools: []`) | Trivial, kills a High bug today | Arch | Low |
| 2 | **II.2** plumb `usageMetadata` + `goAway` in proxy | Stops dropping native signals; enables 3 & 4 | Arch | Low |
| 3 | **II.1** `contextWindowCompression` in setup | *The* unblocker — removes the turn-10 ceiling | Arch | Low |
| 4 | **II.3** `sessionResumption` + backoff fallback | Native reconnect; the Oracle *remembers* | Arch | Med |
| 5 | **I.1 + I.2** archetype + Mirror prompt | Now reachable — write the payoff | Narrative | Low |
| 6 | **III.1** contemplative state | Sells the pauses the Mirror needs | UX | Med |
| 7 | **III.2** the Mint | The climax, reusing existing pipelines | UX | Med |
| 8 | **I.3 + I.4** totem ladder + profane feel | Depth on the now-working spine | Narrative | Low |
| 9 | **III.3** ascension feedback | Polish on the ladder | UX | Low |
| 10 | **I.5** returning Seeker | Highest emotion; do it once persistence lands | Narrative | Med |

**Steps 1–4 are pure de-risking** — they make the existing experience *finishable*. **Steps 5–10 build the altar.** Ship 1–4 and the current product stops dying at turn 10. Ship the rest and it has an ending worth reaching.

---

## Resolved decisions (2026-05-30)

1. **Persistence — REAL backend, no shim.** Extend Supabase, not localStorage. The current `user_wallets` table (`wallet_address, ip_address, created_at, last_seen_at, onboarding_status`) holds **none** of the Seeker Echo fields. A new migration adds them — either columns on `user_wallets` or a dedicated `seeker_echo` table keyed by wallet/ip: `{ name, last_archetype, totem_level, last_cost, alignment, visit_count, last_seen_at }`. §I.5 and totem 5–7 read/write here.
2. **Token/session — REAL Gemini machinery, no heuristic.** Use native `usageMetadata` (real counts), `contextWindowCompression` (survival), `sessionResumption` (reconnect), `goAway` (early warning). See rewritten §II.1–II.3. The `chars/4` heuristic is dropped entirely.
3. **Mirror gating — client-side guard.** ✓ Code refuses to honor `portrait_unlock` until ≥3 substantive Seeker turns have landed. The Mirror is protected from speedrunning.
4. **Archetype canon — hybrid.** ✓ Author the Cost×Territory canon (§I.1) as the Oracle's guide rails; let it riff the noun live for music. Best of both — consistent enough to market, personal enough to land.

---

---

# PART VI — EMPIRICAL VERIFICATION LEDGER

> Goal: *match code to plan empirically.* Every load-bearing assumption below was checked against the **real source** (not the explore-agent summaries), with exact anchors. ✅ confirmed · 🔧 refined · ❌ corrected.

## ✅ Confirmed — the plan stands on these

| # | Claim | Anchor | Verdict |
|---|-------|--------|---------|
| V1 | `tools: []` is **not** set; only `responseModalities` + `speechConfig` | `OracleConversation.tsx:283–295` | ✅ Step 1 valid |
| V2 | Setup carries only `model` + `systemInstruction` + `generationConfig` — no `contextWindowCompression`, no `sessionResumption` | `gemini-live-proxy/index.ts:74–82` | ✅ Steps 2–4 valid |
| V3 | Proxy drops `usageMetadata`/`goAway`/`sessionResumptionUpdate` — handles only `setupComplete`/`serverContent`/`toolCall`/`error`, rest passthrough | `gemini-live-proxy/index.ts:160–199` | ✅ §II.2 valid |
| V4 | Client `onmessage` only knows `session.created`/`server.content`/`error` — new branches needed even after proxy forwards | `OracleConversation.tsx:313–421` | ✅ §II.2/II.3 need client work too |
| V5 | Reconnect = last **6** turns, **3** attempts, fixed **1.5/3/4.5s** | `OracleConversation.tsx:320, 442, 445` | ✅ §II.3 valid |
| V6 | Score block fields exactly match the plan's contract | `OracleConversation.tsx:77, 80–89` | ✅ Part IV valid |
| V7 | `oracle:alignment`, `oracle:totem:ascend`, `oracle:unlock` all dispatched | `OracleConversation.tsx:376, 380, 396` | ✅ Part IV wiring real |
| V8 | `archetypeTitle` is a true stub — prompt says "set it" with **zero** taxonomy | `OracleConversation.tsx:74, 77` | ✅ Q4 canon justified |

## 🔧 Refined — true, but the code taught us the *better* way

| # | Finding | Anchor | Plan impact |
|---|---------|--------|-------------|
| R1 | `contextWindowCompression`/`sessionResumption` are cleanest injected **in the proxy** at setup construction — not the client — since `setup` is built there from `session.config`. | `gemini-live-proxy/index.ts:76–82` | §II.1/II.3 land in the **proxy**, lower-risk than client churn |
| R2 | An **`oracle:artifact`** event already carries `archetypeTitle` to an "Artifact Card" display. §III.2's "type the title under the portrait" should **reuse this**, not invent a path. | `OracleConversation.tsx:390–392` | §III.2 cheaper than written |
| R3 | Mid-session text injection is a **known hazard** — it triggers a full audio response and caused "double-talking", so context is deliberately *not* injected mid-stream. This **validates** routing cost/territory/echo through `prefixTurns`/systemInstruction at **setup**, not mid-session. | `OracleConversation.tsx:563–566` | §I.5 + §II.1 must use setup-time `prefixTurns`, confirmed |
| R4 | Totem ascension **voice** acknowledgment already exists (hidden `[THRESHOLD…]` → Oracle names the shift). Only the *visual* register is missing. | `OracleConversation.tsx:381–386` | §III.3 scope shrinks to visuals only |

## ❌ Corrected — the plan (and the original explore pass) were wrong

| # | Wrong claim | Reality | Anchor | Consequence |
|---|-------------|---------|--------|-------------|
| **C1** | "Totem persists via localStorage" | **Nothing persists.** `onSessionEnd` is wired to `() => journey.exitOracleMode()` — it **discards** the `(alignment, totemLevel, coins)` it's handed. `initialTotemLevel` is never passed → defaults to **0 every session.** | `SurrogateOracleImmersion.tsx:749`; `OracleConversation.tsx:223, 555–559` | **Q1 builds persistence from zero**, not "lift localStorage → Supabase." Totem 5–7 *and* the returning-Seeker (§I.5) have **no foundation today.** This raises §I.5/§I.3 from "polish" to "net-new subsystem." |
| **C2** | (Implicit) "The Oracle knows the chosen territory, so it can weave it in" | The Oracle receives only the **question text** (`sendTextMessage(q, true)`), **not** the territory label, and the `themes[]` array goes **only to the local portrait pipeline** — never to the Oracle. So the prompt's "weave their territory in" (line 63) fires on data the Oracle was **never given.** | `SurrogateOracleImmersion.tsx:456–459`; `OracleConversation.tsx:563–566` | **New prerequisite for Part I:** deliver the territory label (+ themes) to the Oracle via `prefixTurns` at setup. Without it, the archetype's *Territory axis* (§I.1) is guesswork. Cheap, but blocking. |

## Net effect on the build plan

- **Steps 1–4 (the spine):** fully confirmed; R1 moves 2–4 into the proxy (lower risk — good).
- **New Step 0 (prerequisite):** *deliver territory + themes to the Oracle at setup* (C2). Tiny, but Part I's archetype quality depends on it.
- **Q1 reclassified:** persistence is **greenfield**, not a migration of existing storage (C1). Bigger than the doc first implied — but it's also why the returning-Seeker haunting (§I.5) is currently *impossible*, which makes it the highest-value net-new build.
- **Steps III.2 / III.3 shrink:** existing `oracle:artifact` event (R2) and existing ascension voice (R4) mean less to build than written.

> **Bottom line:** the architecture of the plan survives empirical contact. Two corrections (C1, C2) make the work *more* honest — persistence is from scratch, and the Oracle is currently blind to the very territory the archetype system needs. Both are cheap to fix and both unblock the payoff.

---

*This is the floor of the cathedral. The nave is already beautiful. Let's build the altar — and the stairs that survive the walk down to it.*
