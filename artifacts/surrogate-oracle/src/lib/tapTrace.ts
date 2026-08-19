/**
 * tapTrace.ts — capture-phase pointer tap logger.
 *
 * When dev tracing is enabled (oracle_trace_token set), installs ONE
 * document-level pointerup listener in capture phase. For every tap on an
 * interactive control it emits a 'tap' traceEvent with:
 *   - selector path to the resolved interactive ancestor
 *   - raw client X/Y
 *   - class of the top element at that point (elementFromPoint)
 *
 * This makes tap-theft bugs (wrong element receiving the event) directly
 * visible in the trace — no more inferring from CSS geometry.
 *
 * Rules:
 *   - Only interactive elements: button, a[href], [role=button], inputs,
 *     select, textarea, [tabindex], and elements with known Oracle classes.
 *   - Never logs text content, input values, or aria-labels (PII risk).
 *   - Fully silent on any error; never throws.
 *   - Idempotent: second call is a no-op.
 */

import { isTracingEnabled, traceEvent } from './sessionTrace';

/** Oracle-specific interactive class prefixes worth naming in the selector. */
const ORACLE_INTERACTIVE_CLASSES = [
  'oracle-exit-btn',
  'oc-summon-hud__btn',
  'oc-send-btn',
  'oracle-mic-btn',
  'oracle-knife-card',
  'oracle-center',
  'oracle-hamburger',
];

/** Build a short, stable selector path for an element. Never includes text. */
function selectorPath(el: Element | null): string {
  if (!el) return '(none)';
  const parts: string[] = [];
  let cur: Element | null = el;
  for (let depth = 0; depth < 5 && cur && cur !== document.body; depth++) {
    const tag = cur.tagName.toLowerCase();
    const id = cur.id ? `#${cur.id.slice(0, 24)}` : '';
    // Pick the most informative class: Oracle-specific first, then first class
    const cls = cur.classList.length
      ? '.' + (
          ORACLE_INTERACTIVE_CLASSES.find(c => cur!.classList.contains(c))
          ?? [...cur.classList].filter(c => c.length < 40)[0]
          ?? ''
        )
      : '';
    const role = cur.getAttribute('role') ? `[role=${cur.getAttribute('role')}]` : '';
    parts.unshift(`${tag}${id}${cls}${role}`);
    cur = cur.parentElement;
  }
  return parts.join(' > ') || el.tagName.toLowerCase();
}

/** Find the nearest interactive ancestor (or the element itself). */
function resolveInteractive(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  let el: Element | null = target;
  for (let depth = 0; depth < 8 && el && el !== document.body; depth++) {
    const tag = el.tagName.toLowerCase();
    if (
      tag === 'button' ||
      tag === 'a' ||
      tag === 'input' ||
      tag === 'select' ||
      tag === 'textarea' ||
      el.getAttribute('role') === 'button' ||
      el.getAttribute('tabindex') !== null ||
      ORACLE_INTERACTIVE_CLASSES.some(c => el!.classList.contains(c))
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

let installed = false;

export function installTapTrace(): void {
  if (installed || typeof document === 'undefined' || !isTracingEnabled()) return;
  installed = true;

  document.addEventListener(
    'pointerup',
    (e: PointerEvent) => {
      try {
        const interactive = resolveInteractive(e.target);
        if (!interactive) return; // tap on non-interactive area — skip

        const x = Math.round(e.clientX);
        const y = Math.round(e.clientY);
        const topEl = document.elementFromPoint(x, y);

        traceEvent('tap', {
          target: selectorPath(interactive),
          x,
          y,
          top_el: topEl ? selectorPath(topEl) : '(none)',
          // True when the element that received the event is a different
          // interactive ancestor than the element at the tap point — the
          // classic tap-theft signature.
          mismatch: topEl
            ? topEl.closest('button, a, [role=button]') !== interactive &&
              !interactive.contains(topEl)
            : false,
        });
      } catch {
        /* absolutely silent — tap tracing must never affect a session */
      }
    },
    { capture: true, passive: true },
  );
}
