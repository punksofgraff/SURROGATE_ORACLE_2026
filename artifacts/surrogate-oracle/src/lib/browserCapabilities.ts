/**
 * browserCapabilities.ts — Shared browser feature-detection helpers.
 *
 * Consolidates detection logic that was previously duplicated across the XR,
 * parallax, and audio/conversation modules (AudioContext construction,
 * iframe detection, DeviceOrientation permission gating).
 */

/**
 * Creates a new AudioContext, falling back to the WebKit-prefixed constructor
 * for older Safari builds. Centralizes the `window.AudioContext ||
 * window.webkitAudioContext` pattern previously repeated in oracleSfx.ts,
 * PCMPlayer.ts, visemeDetector.ts, and OracleConversation.tsx.
 */
export function createAudioContext(options?: AudioContextOptions): AudioContext {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  return options ? new AudioContextCtor(options) : new AudioContextCtor();
}

/**
 * True on touch-primary devices (phones/tablets), where the OS audio session
 * is shared between capture and playback and mic activation reconfigures it
 * (iOS voice-processing mode, Android communications routing). Capability
 * check rather than UA sniffing, matching the useParallax convention —
 * catches iPads in desktop mode and iOS Chrome.
 */
export function isTouchPrimaryDevice(): boolean {
  try {
    // maxTouchPoints > 0 alone would match touchscreen laptops, but those report
    // a fine primary pointer — the (pointer: coarse) guard excludes them.
    return navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/**
 * Quest Browser exposes touch-like input, but its intended output is a
 * headset, not a phone speaker. Keep this narrow rather than enabling HRTF
 * for every Android touch device.
 */
export function isQuestHeadset(): boolean {
  try {
    const ua = navigator.userAgent || '';
    const questUserAgent = /OculusBrowser|Quest(?:\s?2|\s?3|\s?Pro)?|Meta Quest/i.test(ua);
    // Some headset browsers can reduce or alter their UA. WebXR plus an
    // Android/touch profile is the safe capability fallback; navigator.xr
    // alone would also match ordinary desktop WebXR browsers.
    const androidWebXR = /Android/i.test(ua)
      && navigator.maxTouchPoints > 0
      && 'xr' in navigator;
    return questUserAgent || androidWebXR;
  } catch {
    return false;
  }
}

/**
 * True when running inside an iframe (same-origin or cross-origin). Fails
 * safe to `true` when the cross-origin check itself throws, since we can't
 * prove we're top-level in that case.
 */
export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin iframe — access to window.top throws
  }
}

/**
 * True when the DeviceOrientationEvent API requires an explicit permission
 * request (iOS 13+ Safari). False on Android/desktop, where the event fires
 * without a prompt.
 */
export function needsDeviceOrientationPermission(): boolean {
  const DE = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };
  return typeof DE?.requestPermission === 'function';
}

/**
 * Requests DeviceOrientation permission (iOS Safari only). Must be called
 * from within a user-gesture handler (e.g. a `touchstart` listener).
 * Resolves to `true` when the API is unsupported (no permission needed) or
 * permission was granted; `false` if denied or the request throws.
 */
export async function requestDeviceOrientationPermission(logPrefix: string): Promise<boolean> {
  const DE = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };
  if (typeof DE?.requestPermission !== 'function') return true;
  try {
    const result = await DE.requestPermission();
    return result === 'granted';
  } catch (err) {
    console.warn(`${logPrefix} DeviceOrientation permission request failed or unsupported:`, err);
    return false;
  }
}
