# Open Task Backlog Audit

Audit date: 2026-10-08  
Scope: the 67 open items present before this audit task was added (39 Drafts and 28 Active items). Task #404 is excluded from the scope.

## Outcome

The backlog is mostly valid. Three Drafts are clearly already delivered, and one pair of Drafts is a single release-check task. Several others have partial implementation but still need verification or a narrower remaining scope.

No task statuses were changed: existing items can be archived from the project's Tasks panel, not from this conversation. The exact archive and consolidation list is below. Three plans were updated to describe their remaining work accurately: #4, #7, and #260.

## Recommended next work

1. **#87 — Stop anyone with the public key from reading seekers' private conversations.** Treat as the top privacy review. Direct public table reads are blocked, but the return path still accepts a session identifier as its read capability, and continuity can fall back to short raw excerpts. Verify ownership and minimize what can be returned.
2. **#86 — Keep the session trace archive from growing forever.** No retention or expiry policy was found for session traces. Define and enforce a retention window.
3. **#349 — Verify malformed story jobs stay read-only in runtime fixtures.** Already Active and in progress; finish the safe runtime proof before any provider-backed story operation.
4. **#386 — Make sure the Oracle stays visible without GPU support.** The live Oracle canvas is currently gated on a renderer; the static fallback is not shown in Oracle mode. Verify and close the blank-avatar path.
5. **#389 — Catch stale free-session ledgers before they block fresh seekers.** Protect admission for new users; follow with #390's operator reset only after the ledger behavior is understood.
6. **#401 and #400 — Catch viseme-to-face disconnects, then verify mouth clarity on a real phone.** These directly cover the reported closed-mouth/neck-motion issue; automated regression and device proof are different acceptance criteria.
7. **#403 and #402 — Catch radio-to-neural regressions, then verify the pulse on a real device.** These cover the recent radio/neural behavior report; do not treat a desktop preview as device proof.
8. **#379 — Switch Live failover only when Gemini reports quota exhaustion.** Keep this ahead of any failover expansion to avoid switching providers for unrelated failures.

## Drafts (39)

| Ref | Title | Disposition |
|---|---|---|
| #3 | Protect mic from being left on after resetting the Oracle journey | **Archive.** Phase exit releases the microphone and a new connection clears the armed auto-restart state; the requested protection is present. |
| #4 | Keep the 5/5 unlock chime inside the Oracle audio mix | **Keep; narrowed.** The 5/5 chime already fires for typed and spoken entries, but it connects directly to output instead of honoring the existing mute/radio mix. The plan now covers that gap. |
| #7 | Preserve full history when IP sessions move to a wallet | **Keep; narrowed.** Recent IP traits are carried over, but session and visit totals are omitted. The plan now targets safe counter reconciliation without double-counting. |
| #8 | Show the wallet address as the seeker's identity badge in the alley UI | **Keep.** The address appears in wallet/menu surfaces, not as the default, visible identity badge described by the task. |
| #15 | Keep the avatar subtly alive while the seeker is choosing their knife | **Keep; verify the final treatment.** A preview exists, but the awakened preview is more visible than the suggested level and the requested soft treatment is not established. |
| #38 | Warm knife entry and show landing particles | **Keep; verify.** Prewarming and particle typography are present in parts of the entry flow; the full first-time/returning/tour handoff and landing-particle behavior are not proven. |
| #39 | Prevent wallet returning seekers from hearing a delayed greeting | **Keep as verification.** The greeting now starts immediately and prewarming is present; the required live wallet-return timing check remains. |
| #55 | Confirm the avatar-freeze fix when the audio worklet fails | **Keep.** A fallback exists, but there is no forced-worklet-failure proof covering the freeze case. |
| #56 | Make lip-sync more expressive when the audio worklet fails | **Archive.** The fallback already classifies spectral bands into multiple viseme shapes rather than driving only a single open-mouth shape. |
| #62 | Prevent the Oracle's head from snapping when the seeker moves suddenly | **Keep.** Gaze interpolation exists, but the requested target-velocity limit and mode-switch pressure test are not present. |
| #72 | Show the Talisman Card when seekers exit through the menu | **Keep.** The menu exit still follows a direct exit path rather than the Talisman flow. |
| #74 | Cache the alley fragment pool across refreshes | **Keep; lower priority.** The fragment pool is fetched for the current mount; persistence across refresh is not present. |
| #82 | Voice sessions can lose their backup key when paid Gemini credits run out | **Keep; operationally gated.** Recheck the failure behavior without inspecting secret values or making provider calls. Coordinate with #379's quota-only failover rule. |
| #83 | Keep web lookups working when the shared key's search quota runs out | **Keep.** The current key fallback does not cover the alternate key/retry behavior described in the task. |
| #86 | Keep the session trace archive from growing forever | **Keep; high priority.** No trace retention or expiry policy was found. |
| #87 | Stop anyone with the public key from reading seekers' private conversations | **Keep; highest privacy priority.** Direct public table reads are blocked, but session ownership and the continuity fallback still need review. |
| #88 | Confirm a real voice session leaves a complete trace | **Keep.** Requires an actual session to prove turns, barge-in, and disconnect evidence. |
| #89 | Confirm on a real iPhone that mic taps leave the Oracle's voice untouched | **Keep.** This depends on physical iPhone audio-session behavior. |
| #90 | Give mobile seekers gentle spatial presence without the jarring HRTF switch | **Park.** Optional experience work; do not re-enable mobile HRTF as a shortcut. |
| #91 | Move mic capture off a deprecated browser API | **Keep.** The deprecated capture path remains in use. |
| #115 | Confirm Gemini distillation is actually shaping portraits | **Keep.** Source flow exists, but a provider-backed output comparison is still needed; do not make that call during this audit. |
| #116 | Prevent minted NFT portraits from going blank after Replicate URLs expire | **Archive.** Both Replicate portrait paths re-host images to durable storage rather than persisting expiring delivery URLs. |
| #142 | Confirm the Reduced Motion particle fix holds on a real iPhone | **Keep.** The device-specific Reduced Motion proof is still outstanding. |
| #143 | Stop the particle field going blank when Safari is mislabelled unsupported | **Keep as verification.** The unsupported-WebGL branch now promotes to a usable tier when WebGL is available; the Safari-specific empty/populated renderer cases still need coverage. This differs from #386's no-renderer fallback. |
| #159 | Confirm portrait reveal does not interrupt a live Oracle session on mobile | **Keep.** Requires a mobile live-session check. |
| #181 | Let seekers complete checkout inside the subscription modal | **Keep.** Purchase-flow UX; distinct from webhook correctness in #182. |
| #182 | Confirm RevenueCat events cannot silently downgrade or duplicate access | **Keep.** Payment entitlement integrity remains a separate verification need. |
| #184 | Confirm real browsers connect while direct Gemini clients are blocked | **Keep.** Security-boundary verification; do not probe production without authorization. |
| #256 | Catch Comfy reference-schema regressions before premium films fail | **Park.** Keep as a fixture guard, but do not enable or call a hosted premium-video lane under the current zero-cost policy. |
| #257 | Confirm Sacred alignment never flashes on mobile | **Keep.** Mobile visual verification remains outstanding. |
| #260 | Run Oracle and tour contract checks on every release | **Keep; expanded.** Now includes #274's tour checkpoint guard and depends on both existing contract tasks. |
| #274 | Run the tour checkpoint guard before every release | **Merge into #260; archive this duplicate.** Its acceptance criteria are now included in #260. |
| #298 | Confirm portrait retries never duplicate a generation request | **Keep.** The request guard needs a regression check. |
| #308 | Confirm the finished story film plays and downloads on iOS Safari | **Keep.** Requires the iOS Safari playback/download path. |
| #316 | Use character voices as reference audio when premium video access returns | **Park.** Explicitly contingent on premium-video access returning; do not run now. |
| #317 | Catch character audio regressions before a story release | **Keep.** A useful local/release regression guard independent of paid video generation. |
| #342 | Catch review-history filter regressions before a story release | **Keep.** The review filter still needs a regression check. |
| #359 | Let reviewers stage original replacements for source-policy blocks | **Keep.** Human-reviewed replacement staging remains valid work. |
| #360 | Run provider recovery fixtures through the deployed story-job boundary | **Keep.** Valuable boundary coverage; use sanitized fixtures and do not submit provider work. |

## Active (28)

Accepted and underway work was reviewed but not canceled or re-scoped.

| Ref | Title | Disposition |
|---|---|---|
| #349 | Verify malformed story jobs stay read-only in runtime fixtures | **Keep; in progress.** Finish the safe read-only proof. |
| #355 | Exercise story cell order review against Supabase | **Keep.** Use the intended non-production environment; no production mutation. |
| #356 | Confirm one ten-chunk story pass works with the live H3 queue | **Hold; do not execute.** This explicitly requires paid H3 requests and conflicts with the current zero-cost video policy. Recommend canceling or replacing it with a no-provider fixture only with user approval. |
| #357 | Catch partial FAL batches before paid story runs | **Keep.** Run as a fixture/contract check; do not start paid story work. |
| #362 | Confirm the free portrait fallback with an eligible Replicate account | **Hold.** The shared account is not evidence of free quota; proceed only with verified eligibility and explicit provider authorization. |
| #363 | Let approved original replacement art use a compatible free image model | **Hold.** Requires a genuinely eligible no-cost model and explicit approval before any provider call. |
| #364 | Keep completed open story shots recoverable after refresh | **Keep.** Persistence/recovery work does not require a provider run. |
| #367 | Confirm wallet return works on the published site | **Keep.** Published-site verification remains outstanding. |
| #368 | Keep the unlock and share panel out of the primary mobile view | **Keep.** Mobile layout acceptance remains outstanding. |
| #369 | Confirm knife and archive cards scroll cleanly on a real phone | **Keep.** Requires a real-phone check. |
| #374 | Confirm the command center returns cleanly to the Oracle on mobile | **Keep.** Can be tested in the same phone session as #377, but has a distinct return-flow criterion. |
| #375 | Catch keyboard focus regressions across console surfaces | **Keep.** Accessibility coverage remains useful. |
| #377 | Confirm the command center still reads clearly on a real iPhone | **Keep.** Can share a device pass with #374; readability remains separate. |
| #378 | Keep session evidence current while seekers move through the console | **Keep.** Evidence freshness during navigation remains distinct from session trace completeness. |
| #379 | Switch Live failover only when Gemini reports quota exhaustion | **Keep; high priority.** Preserve the narrow quota-only failover rule. |
| #381 | Run the live portrait provider matrix before enabling optional free lanes | **Hold paid/account-limited lanes.** Do not run a provider matrix that may incur charges without explicit approval; first keep fixture results separate from any approved live free-lane check. |
| #382 | Remove the duplicate legacy prompt helpers from the portrait edge function | **Keep.** The duplicate local prompt helpers are still present alongside the shared versions. |
| #385 | Confirm supported devices use the WebGPU Oracle renderer | **Keep.** Requires supported-device verification. |
| #386 | Make sure the Oracle stays visible without GPU support | **Keep; high priority.** The live avatar renderer is gated when no GPU backend is detected, and the static avatar fallback is not shown during Oracle mode. |
| #389 | Catch stale free-session ledgers before they block fresh seekers | **Keep; high priority.** Prevents a stale ledger from denying a new session. |
| #390 | Give operators a safe way to reset free-session admission | **Keep.** Keep the reset narrow and auditable; do not use it as a substitute for #389's ledger fix. |
| #394 | Measure chapter saves and returns without collecting private text | **Keep.** Preserve the privacy boundary while measuring aggregate outcomes. |
| #397 | Confirm the Chapters voice command never triggers an Oracle reply | **Keep.** This is a distinct interaction-safety check. |
| #398 | Keep the Oracle's thinking voice available when its audio service fails | **Keep.** Resilience/fallback behavior remains open. |
| #400 | Verify the Oracle's mouth moves clearly during live speech on a real phone | **Keep.** Manual device proof for the reported mouth/neck mismatch. |
| #401 | Catch viseme-to-face disconnects before the Oracle ships | **Keep; high priority.** Automated guard for the same speech-to-mouth path as #400, not a duplicate of the device check. |
| #402 | Confirm the neural radio pulse stays steady during a real Oracle exchange | **Keep.** Requires a real-device exchange. |
| #403 | Catch radio-to-neural signal regressions before an Oracle release | **Keep; high priority.** Automated guard for the radio/neural handoff. |

## Counts and task-panel actions

- Baseline audited: **67 open tasks** — 39 Drafts and 28 Active.
- Statuses actually changed: **0**. Plan text was updated for #4 and #7; #260 now also covers #274.
- Once #404 closes, the original backlog remains **67 open tasks** until the archive list below is applied.
- Recommended cull: archive #3, #56, and #116; merge #274 into #260 and archive #274.
- Projected count after those four archive actions: **63 open tasks** — 35 Drafts and 28 Active.
- No Active task is recommended for cancellation without approval. #356 is the only clear policy conflict; it should remain held until the user approves a no-cost rewrite or cancellation.
- The task view exposes each item's last-updated time, but not a full change timeline; historical edits could not be audited.
- No new follow-up tasks are proposed: each concrete remaining gap is already represented by one or more items in this backlog.
