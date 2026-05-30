# SURROGATE — Build Contract (single source of truth)

> Coordination artifact for the parallel build. Every agent reads this. Do not deviate.
> Companion: `SURROGATE_DEEP_DESIGN.md` (the why), this doc (the exact shapes).

---

## HARD RULES (every agent, no exceptions)

1. **Never rename canonical step-log strings** (`CLAUDE.md` §3). The pressure test asserts them verbatim. New `logStep` calls are fine *if additive*.
2. **Parallel agents create NEW FILES ONLY.** Do **not** edit any existing file. All wiring into existing components is the **main agent's serial job** — leave clearly-named exports for it to import.
3. If a needed shape here is marked `⟨verify⟩`, the Verify track confirms it against live Gemini docs before the main agent hard-codes it.

---

## A. Wire contract — proxy ↔ client (Steps 2 & 4)

**Proxy** (`gemini-live-proxy/index.ts`, new branches in `gemini.onmessage` *before* the line-199 passthrough):

| Gemini server field | Proxy forwards to client as |
|---|---|
| `usageMetadata` | `{ type: 'usage', usage: <usageMetadata> }` |
| `goAway` | `{ type: 'goaway', timeLeft: msg.goAway?.timeLeft }` ⟨verify field name⟩ |
| `sessionResumptionUpdate` | `{ type: 'resume', handle: msg.sessionResumptionUpdate?.newHandle, resumable: msg.sessionResumptionUpdate?.resumable }` ⟨verify field names⟩ |

**Client** (`OracleConversation.tsx`, new branches in `ws.onmessage`):

| type | client action |
|---|---|
| `usage` | store `usage.totalTokenCount` in `debugInfo` (telemetry/UI; non-load-bearing) |
| `goaway` | capture latest resume handle; pre-emptively reconnect within `timeLeft` |
| `resume` | stash `handle` in `resumeHandleRef.current` |

## B. Setup additions — client `session.config` → proxy `setup` (Steps 1, 3, 4)

Proxy `session.config` branch adds to the `setup` object it builds (currently only copies `model`/`systemInstruction`/`generationConfig`):

```js
if (msg.tools) setup.tools = msg.tools;                          // Step 1 — top-level, NOT in generationConfig ⟨verify placement⟩
setup.contextWindowCompression = { slidingWindow: {} };          // Step 3 — web-verified
if (msg.sessionResumption) setup.sessionResumption = msg.sessionResumption;  // Step 4
```

Client sends in `session.config`: `tools: []`, and on reconnect `sessionResumption: { handle: resumeHandleRef.current }` (fresh connect: `sessionResumption: {}`).

## C. Data contract — `OracleScore` (UNCHANGED — do not rename fields)

```ts
{ alignment: 'sacred'|'profane', coinAward: number,
  totemAdvancement: 'none'|'stay'|'ascend'|'descend', totemLevel: number,
  unlockTrigger: 'portrait_unlock'|'squad_invite'|'arcade_token'|null,
  sessionPhase: 'claim'|'evidence'|'cost'|'mirror', archetypeTitle: string|null, themes?: string[] }
```
World events (UNCHANGED): `oracle:alignment`, `oracle:totem:ascend`, `oracle:unlock`, `oracle:artifact`.

## D. Archetype title format (Canon track)

`The {Cost} {Territory-noun}` — composed, not picked. Canon = guide rails; Oracle riffs the noun.

- **Cost** ∈ `Unfinished · Indebted · Performer · Severed · Keeper · Outpaced · Witness` (maps to totem 1–7, design §I.1/I.3)
- **Territory** noun from the 5 knives: Library of Me→*Self*, Connection & Debt→*Bond*, Machine Mirror→*Signal*, Social Construct→*Mask*, Industrial Question→*Craft*
- Grid is **5 × 7 = 35 cells.** Existing stubs must fall out of it: Self×Unfinished=*The Unfinished King*, Self×Severed=*The Phantom*, Signal×Witness=*The Chronicler*.

## E. SeekerEcho schema — greenfield persistence (Persistence track)

New Supabase table `seeker_echo` (do NOT alter `user_wallets`):
```sql
seeker_echo ( id uuid pk, seeker_key text unique,  -- wallet_address or ip
  name text, last_archetype text, totem_level int default 0,
  last_cost text, alignment text, visit_count int default 1,
  last_seen_at timestamptz, created_at timestamptz )
```
Keyed by wallet/ip. Read on entry (returning-Seeker, design §I.5), write on `onSessionEnd`. The wiring of `onSessionEnd` (currently discards its args at `SurrogateOracleImmersion.tsx:749`) is the **main agent's** job — Persistence track only delivers the migration + edge fn + a `useSeekerEcho` hook.

## F. Territory delivery (Step 0 — main agent, serial)

The Oracle currently receives only the knife *question* text, never the territory label or themes (Ledger C2). Step 0 enriches the existing hidden-text send (`SurrogateOracleImmersion.tsx:459`) to carry territory + themes, framed so it reads as the designed first-exchange seed (mid-session injection is otherwise hazardous — `OracleConversation.tsx:563–566`). **Serial, hands-on. Not parallelized.**

---

## ✅ MAIN-AGENT WIRING LEDGER — completed 2026-05-30

Serial wiring of the parallel-track deliverables into existing components. Steps 1–4
(native session management) were already wired in a prior pass; the items below close
out the Returning-Seeker / archetype-grid feature.

### Step 0 — Territory delivery ✅
`SurrogateOracleImmersion.tsx` · `handleKnifeClick` — the hidden first-exchange send now
carries `knife.territory` + `knife.themes` framed as the excavation seed (not a bare
question), so the Oracle can hold the territory all the way to the Mirror.

### Steps C/D — Archetype + prompt blocks wired into the system prompt ✅
`OracleConversation.tsx` — imports `ARCHETYPE_SYNTHESIS_BLOCK`, `TOTEM_LADDER_BLOCK`,
`SACRED_PROFANE_BLOCK` from `data/oraclePromptBlocks.ts` and appends all three to
`ORACLE_SYSTEM_PROMPT` (after the SCORING block). `OracleScore` shape UNCHANGED.
`data/archetypes.ts` `COST_NAMES` used in the parent to derive `last_cost` from the
composed title.

### Step E — SeekerEcho persistence wired ✅
`SurrogateOracleImmersion.tsx`:
- `useSeekerEcho()` instantiated; `seekerKeyRef` = `currentUserId ?? ipAddress`.
- **Read on entry:** `handleFirstTap` calls `loadEcho(key)`; `echo.totem_level` seeds
  the Oracle via the new `initialTotemLevel={echo?.totem_level ?? 0}` prop.
- **Track:** new `onTurnComplete={handleTurnComplete}` captures latest
  `archetypeTitle` / derived cost / alignment into `echoTrackRef`.
- **Write on exit:** `onSessionEnd={handleSessionEnd}` calls `saveEcho({...})` then
  `exitOracleMode()`. (Previously `onSessionEnd` discarded its args.)

### Verification
- `tsc --noEmit`: clean in all touched files (2 remaining errors are pre-existing in
  `src/lib/visemeDetector.ts`, untouched).

### ⚠️ STILL REQUIRED — ops, not code (not yet done)
- [ ] Apply migration `20260626000000_seeker_echo.sql` to Supabase (creates `seeker_echo`).
- [ ] Deploy edge fn: `npx supabase functions deploy seeker-echo --no-verify-jwt`.
- [ ] Deploy proxy: `npx supabase functions deploy gemini-live-proxy --no-verify-jwt`
      (carries the Steps 1/3/4 setup changes).
- [ ] `name` is never captured client-side — `saveEcho` omits it; the Oracle asks the
      Seeker's name in-conversation but it isn't parsed back. Future: parse from a score
      field or turn text if name persistence is wanted.

---

## ✅ ADDENDUM — Seeker IRL resolution (web-grounded), 2026-05-30

> Request: "parse it for web tools to define seeker irl." Routed out-of-band so it does
> NOT undo Step 1 (live WS `tools:[]`) or the Oracle's no-uplink / signal-ends-2027 lore.

**Pipeline (all out-of-band — the live audio WS stays tool-free):**
1. **Parse** — Oracle emits a one-time hidden `[[SEEKER_IRL: {name, handles}]]` marker the
   first turn it learns the Seeker's identity. Additive — `ORACLE_SCORE` untouched.
   `OracleConversation.tsx`: `parseSeekerIrl()`, `seekerIdentifiedRef`, new
   `onSeekerIdentified(name, handles)` prop; marker stripped from the displayed turn.
   New step log: `SEEKER IDENTITY CAPTURED`.
2. **Web tool** — new edge fn `supabase/functions/seeker-define/index.ts` runs Gemini
   `generateContent` with `tools:[{ googleSearch:{} }]` on the volunteered name + handles
   (+ knife territory/themes to disambiguate). Returns `{ definition, confident, sources }`.
   Logs `UNRESOLVED:` honestly when it can't place them.
3. **Client** — `hooks/useSeekerDefine.ts` (`defineSeeker`). Parent
   `SurrogateOracleImmersion.tsx` wires `onSeekerIdentified → defineSeeker → saveEcho`,
   stashing the drawn knife in `lastKnifeRef` for disambiguation.
4. **Persist** — `seeker_echo.irl_context` (added to migration + `ALTER ... IF NOT EXISTS`);
   `seeker-echo` edge fn upsert + `useSeekerEcho` types extended (`irlContext` / `irl_context`).
   This also finally captures `name` (closes the earlier name-never-parsed gap).

**Deliberate boundary (needs your call to cross):** the IRL dossier is stored on our side,
NOT injected into the Oracle's live voice — speaking live web facts would break the
"signal ends at 2027 / no uplink" persona AND risk the live tool-use crash. Feeding a
sanitized recognition back to the Oracle is a gated follow-up, off by default.

### ⚠️ STILL REQUIRED — ops
- [ ] Re-apply migration `20260626000000_seeker_echo.sql` (now includes `irl_context`).
- [ ] Deploy edge fn: `npx supabase functions deploy seeker-define --no-verify-jwt`.
- [ ] Confirm `GOOGLE_AI_API_KEY` secret is set for `seeker-define` (shared key).
- [ ] (unchanged) deploy `seeker-echo` + `gemini-live-proxy`.
