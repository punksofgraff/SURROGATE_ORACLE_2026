/**
 * Normalize browser runtime failures before they are retained as smoke
 * evidence. The return value deliberately contains only JSON-safe primitives.
 *
 * This module is also imported by src/main.tsx, so the browser and the smoke
 * runner use the same handling for strings, Error objects, and ErrorEvent-like
 * values. Run the focused fixture with:
 *
 *   pnpm run runtime-evidence-test
 */

const asRecord = (value) => (
  value !== null && typeof value === 'object' ? value : undefined
);

const stringValue = (value) => (
  typeof value === 'string' && value.length > 0 ? value : undefined
);

const finiteNumber = (value) => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);

const errorDetails = (value) => {
  const record = asRecord(value);
  return {
    message: stringValue(record?.message) ?? (value instanceof Error ? value.message : undefined),
    stack: stringValue(record?.stack) ?? (value instanceof Error ? value.stack : undefined),
    name: stringValue(record?.name) ?? (value instanceof Error ? value.name : undefined),
  };
};

/**
 * @param {unknown} value ErrorEvent-like value, rejection reason, or Error
 * @param {'pageerror'|'unhandledrejection'|'root-crash'|'console'} type
 * @returns {Record<string, string|number>}
 */
export function normalizeRuntimeError(value, type) {
  const event = asRecord(value);
  const reasonValue = type === 'unhandledrejection' && event && 'reason' in event
    ? event.reason
    : value;
  const details = errorDetails(reasonValue);
  const eventError = errorDetails(event?.error);
  const message = details.message
    ?? eventError.message
    ?? stringValue(event?.message)
    ?? String(reasonValue);
  const stack = details.stack ?? eventError.stack ?? stringValue(event?.stack);
  const source = stringValue(event?.source) ?? stringValue(event?.filename) ?? stringValue(eventError.source);
  const line = finiteNumber(event?.line) ?? finiteNumber(event?.lineno);
  const column = finiteNumber(event?.column) ?? finiteNumber(event?.colno);
  const result = { type, message };

  if (source) result.source = source;
  if (line !== undefined) result.line = line;
  if (column !== undefined) result.column = column;
  if (stack) result.stack = stack;
  if (type === 'unhandledrejection') result.reason = details.message ?? String(reasonValue);
  const name = details.name ?? eventError.name;
  if (name) result.name = name;

  return result;
}