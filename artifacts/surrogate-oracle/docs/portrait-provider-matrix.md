# Portrait provider matrix

Last controlled check: 2026-09-08. The matrix records what the portrait
contract can currently prove, rather than treating a listed model or a present
secret as a successful generation.

| Provider | Model / route | Controlled outcome | Typical latency | Quality observation | Cost / free status | Production policy |
| --- | --- | --- | --- | --- | --- | --- |
| Nano Banana 2 Lite | `gemini-3.1-flash-lite-image` | Ready when the paid Gemini key is configured; image bytes are stored durably | 10–30s | Good; conversation prompt survives | Paid, low-cost candidate | First paid rung |
| Nano Banana 2 | `gemini-3.1-flash-image` | Ready as a quality escalation; same paid-key boundary | 10–30s | High; use after Lite | Paid | Second paid rung |
| Vertex Imagen | `imagen-3.0-generate-002` express | Degraded in this environment: the stored key has returned `ACCESS_TOKEN_TYPE_UNSUPPORTED`; breaker prevents repeated probing | 10–30s when healthy | High when available | Paid, low-cost candidate; not free | Optional escalation after Gemini |
| Hugging Face | `black-forest-labs/FLUX.1-schnell` router | Not guaranteed: router capability and account quota are independent | 30s+ | Good but variable | Free/account-limited with a token | Explicit opt-in plus key only; breaker-gated |
| Replicate Try for Free | live reviewed catalog | Account eligibility is required; failures are classified and duplicate claims suppressed | 30s+ | Variable by selected model | Free/account-limited | Explicit opt-in, catalog-gated, re-host output |
| Pollinations | `flux` image URL | URL construction succeeds without a key; remote completion latency is not a synchronous contract | Redirect-only | Variable | Free | Final no-key fallback; no false latency claim |

## Fixture coverage

The provider contract suite exercises two contrasting conversations
(belonging/hope versus isolation/grief), all six provider records, and:

- anchor selection that is deterministic, deduplicated, high-signal, and not
  merely the latest six lines;
- prompt differentiation from themes, emotional register, archetype, phase,
  alignment, and conversation anchors;
- privacy rejection for emails, URLs, handles, identifiers, and copied
  transcript spans;
- Lite-first ordering, explicit Hugging Face gating, and no paid Replicate
  fallback unless separately enabled;
- provider outage, quota, duplicate-retry, and Pollinations final-fallback
  behavior through mocked provider results.

The live provider checks remain opt-in because a "free" label is not a promise
of quota or account eligibility, and the paid rungs should never be charged by
a test run accidentally.