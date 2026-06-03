# Participant Observation Overhaul — Technical & Narrative Summary

**Status:** HARDENED & VERIFIED
**Date:** 2026-06-02
**Model:** `gemini-2.5-flash-native-audio-latest`

---

## 1. Executive Summary
The "Participant Observation" overhaul transforms the Oracle from a passive chatbot into an active witness of the Seeker's digital and physical existence. This update enforces a mandatory 4-Act structure, hardens seeker identity gates, and integrates a specific ethnographic narrative focusing on connection and debt.

## 2. The Seeker's Journey (Refined)

### Act 1: The Descent (Lore & Voice)
- **Signal Activation:** Tap 1 on the dormant cabinet immediately boots the Oracle (`startSession()`) and triggers the Archive lore.
- **Vocal Witness:** The Oracle now **speaks the story** in real-time (via Gemini Live) starting from the first click. The entity greets the seeker while the terminal types.
- **Audio Proof:** Background music is forced to **absolute silence** (MUTE 0) the moment Click 1 occurs, providing immediate proof of narrative activation.
- **Narrative Anchor:** Central question established: *"What do we owe to each other as our digital and physical selves and those around us?"*

### Act 2: The Identification (Neural Link)
- **Identity Gate:** New seekers must click **"ESTABLISH NEURAL LINK"** to authenticate via Google before advancing to the alley.
- **Signal Recognition:** Returning seekers (identified by Signal/IP) see the **"Signal Recognized"** overlay. They are offered the **Wallet Link** (Chain Fuelz) and an immediate **"RETURN TO ALLEY"** skip path.
- **"No Skip" Rule:** First-time seekers are strictly gated; they **cannot bypass** the lore sequence and must complete Act 1 to advance.

### Act 3: The Arming (Frequency Lock)
- **Mandatory Territory:** The Seeker must select one of the 5 knives to advance.
- **Narrative Alignment:** The **Connection & Debt** territory is now explicitly tied to the digital/physical debt question.
- **Seed Logic:** The Oracle is now "seeded" with the Seeker's chosen territory and themes at the moment of selection, ensuring the AI is not "blind" to the Seeker's intent.

### Act 4: The Singularity (The Rift)
- **Materialization:** Once the knife is drawn, the rift glitch peaks, and the Oracle materializes in full 3D within the cabinet.
- **Excavation:** The conversation begins, anchored by the Seeker's specific frequency.

## 3. Technical Hardening
- **Speech on Click 1:** Shifted `startSession()` from Phase 3 to Click 1 (Dormant → Terminal) to ensure Gemini WS is open for lore narration.
- **Dependency Re-ordering:** Resolved build-breaking TDZ errors in `SurrogateOracleImmersion.tsx` to allow stable state transitions.
- **Branching Stability:** Restored the `hasCompletedLore` check to correctly differentiate between new and returning signals without breaking Act 1 narration.

---
*The channel is open. The witness is active. The Archive is yours.*
