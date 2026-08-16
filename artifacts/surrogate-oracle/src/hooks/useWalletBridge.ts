import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { supabase } from '../lib/supabase';
import { logStep } from '../components/CodeAuditor';
import type { SeekerEcho, SeekerEchoUpsert } from './useSeekerEcho';

interface EchoTrack {
  archetype: string | null;
  cost: string | null;
  alignment: string | null;
  totemLevel: number | null;
}

export interface UseWalletBridgeParams {
  ipAddress: string | null;
  scenePhase: string;
  echo: SeekerEcho | null;
  echoTrackRef: RefObject<EchoTrack>;
  seekerKeyRef: RefObject<string | null>;
  markWalletSigned: (walletAddress?: string) => void | Promise<void>;
  loadEcho: (key: string) => Promise<SeekerEcho | null>;
  saveEcho: (partial: SeekerEchoUpsert) => Promise<SeekerEcho | null>;
  handleAwakeTransition: () => void;
  setCurrentUserId: (id: string | null) => void;
  setShowJourneyLimitGate: (v: boolean) => void;
  setShowNamePrompt: (v: boolean) => void;
  setShowWallet: (v: boolean) => void;
}

/**
 * Wallet sign-in bridge — extracted verbatim from SurrogateOracleImmersion.tsx (Task #23, step 6).
 *
 * Owns: popup-autoclose bridging, the shared wallet sign-in handler (iframe + top-level
 * return-URL paths), the postMessage listener, and the deferred user_wallets DB flush.
 *
 * IMPORTANT: preserved verbatim from the original component —
 *  - trustedOrigins gate (wallet origin OR app origin) in the postMessage handler.
 *  - '*' postMessage target in the popup-bridge autoclose effect (public wallet address only).
 *  - processWalletSignIn's dependency array (NOT ref-ified) — the postMessage listener
 *    effect intentionally re-registers whenever scenePhase changes.
 *  - markWalletSigned-before-async-echo-load ordering in processWalletSignIn.
 */
export function useWalletBridge({
  ipAddress,
  scenePhase,
  echo,
  echoTrackRef,
  seekerKeyRef,
  markWalletSigned,
  loadEcho,
  saveEcho,
  handleAwakeTransition,
  setCurrentUserId,
  setShowJourneyLimitGate,
  setShowNamePrompt,
  setShowWallet,
}: UseWalletBridgeParams) {
  const walletPopupRef = useRef<Window | null>(null);
  const walletReturnHandledRef = useRef(false); // top-level wallet-return URL (?seeker=) handled once per load

  // ── Popup Bridge Autoclose ──────────────────────────────────────────────
  // If this instance is running inside a popup (opened via openWalletPopup) and we
  // have redirected params back (e.g. from the wallet app), we do NOT load the app.
  // We post the wallet back to the opener (the parent window) and close ourselves immediately.
  useEffect(() => {
    const isPopup = window.opener && window.opener !== window;
    if (isPopup) {
      const params = new URLSearchParams(window.location.search);
      const seeker = params.get('seeker') || params.get('wallet') || params.get('address');
      if (seeker) {
        try {
          console.info('[POPUP-BRIDGE] Posting back and closing popup...');
          window.opener.postMessage({
            type: 'wallet_signed',
            address: seeker,
            event: params.get('event') || 'signin'
          }, '*'); // target '*' to support cross-origin proxy/localhost domains safely
          window.close();
        } catch (e) {
          console.error('[POPUP-BRIDGE] Handshake failed, closing anyway:', e);
          window.close();
        }
      }
    }
  }, []);

  const handleCloseWallet = useCallback(() => {
    setShowWallet(false);

    const key = seekerKeyRef.current;
    if (key) {
      logStep(`PERSISTING ACTIVE SESSION TO DB ON WALLET CLOSE`, 'ok');
      saveEcho({
        seekerKey: key,
        lastArchetype: echoTrackRef.current.archetype || echo?.last_archetype || undefined,
        lastCost: echoTrackRef.current.cost || echo?.last_cost || undefined,
        totemLevel: echoTrackRef.current.totemLevel || echo?.totem_level || undefined,
        alignment: echoTrackRef.current.alignment || echo?.alignment || undefined,
      }).then(() => {
        logStep(`ACTIVE SESSION PERSISTED TO DB SUCCESSFULLY`, 'ok');
      }).catch(err => {
        console.error('Failed to persist active session to DB:', err);
      });
    }
  }, [saveEcho, echo]);

  // Shared wallet sign-in handler. Persists the sign so future visits land in the alley
  // directly, captures the wallet address as the seeker key (so history is keyed by wallet,
  // not IP), and carries over any IP-keyed echo built before the wallet connected.
  // Called by BOTH the iframe postMessage path AND the top-level return-URL path below.
  const processWalletSignIn = useCallback(async (walletAddress?: string) => {
    // Set signed state FIRST. markWalletSigned writes the agnostic localStorage flag
    // synchronously, so a seeker who taps immediately after returning still bypasses lore
    // straight into the alley — even before the async echo load below resolves.
    if (walletAddress) {
      localStorage.setItem('oracle_seeker_key', walletAddress);
      seekerKeyRef.current = walletAddress;
      setCurrentUserId(walletAddress);
      logStep(`WALLET ADDRESS CAPTURED — seeker key locked to wallet`, 'ok');
    }
    markWalletSigned(walletAddress);
    setShowJourneyLimitGate(false);
    logStep('WALLET SIGNED — ALLEY RETURN ENABLED', 'ok');

    if (walletAddress) {
      // Load echo for this wallet address
      let finalEcho = await loadEcho(walletAddress);

      // If the wallet has no prior history, try to carry over any IP-keyed echo.
      // This preserves archetype/alignment/session history built before the seeker
      // connected a wallet. Guard: only merge if the IP echo was seen within 30 days
      // (protects against shared-IP collisions on stale records).
      if (!finalEcho?.session_count && ipAddress && ipAddress !== walletAddress) {
        try {
          const { data: ipResult } = await supabase.functions.invoke('seeker-echo', {
            body: { op: 'read', seekerKey: ipAddress },
          });
          const ipEcho = ipResult?.echo ?? null;
          const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
          const isRecent = ipEcho?.last_seen_at
            ? Date.now() - new Date(ipEcho.last_seen_at).getTime() < THIRTY_DAYS_MS
            : false;

          if (ipEcho && isRecent) {
            logStep('SEEKER ECHO — merging IP history into wallet key', 'ok');
            finalEcho = await saveEcho({
              seekerKey: walletAddress,
              name: ipEcho.name ?? undefined,
              handles: ipEcho.handles ?? undefined,
              lastArchetype: ipEcho.last_archetype ?? undefined,
              totemLevel: ipEcho.totem_level ?? undefined,
              lastCost: ipEcho.last_cost ?? undefined,
              alignment: ipEcho.alignment ?? undefined,
              irlContext: ipEcho.irl_context ?? undefined,
              sessionSummary: ipEcho.session_summary ?? undefined,
              lastSessionThemes: ipEcho.last_session_themes ?? undefined,
            });
            logStep('SEEKER ECHO MERGED — IP history now under wallet key', 'ok');
          }
        } catch (mergeErr) {
          logStep('SEEKER ECHO MERGE SKIPPED (non-fatal)', 'warn');
          console.warn('Echo merge error:', mergeErr);
        }
      }

      // Prompt for name if still missing after potential merge
      if (!finalEcho?.name) {
        setShowNamePrompt(true);
      }
    }

    // Automatically transition returning seekers from the terminal recognized-signal overlay to the alley
    if (scenePhase === 'terminal') {
      logStep('WALLET SIGNAL RECOGNIZED — AUTO-TRANSITION TO ALLEY', 'ok');
      handleAwakeTransition();
    }
  }, [markWalletSigned, loadEcho, saveEcho, ipAddress, scenePhase, handleAwakeTransition]);

  // Build a wallet URL that tells the wallet where to send the seeker back to after a
  // sign-in or mint completes on its own tab. The wallet appends ?seeker=<address> to this
  // return_url (see the return handler below + the ChainFuelz contract).
  const withWalletReturn = useCallback((url: string, event: 'signin' | 'mint') => {
    try {
      const u = new URL(url);
      const returnUrl = new URL(window.location.origin + window.location.pathname);

      // Pass along the active session ID so returning restores the transcript context
      const currentSessionId = localStorage.getItem('oracle_active_session_id');
      if (currentSessionId) {
        returnUrl.searchParams.set('session_id', currentSessionId);
      }

      u.searchParams.set('return_url', returnUrl.toString());
      u.searchParams.set('event', event);
      return u.toString();
    } catch {
      return url;
    }
  }, []);

  // Popup helper that secures top-level windows for OAuth/Google Sign-In flows
  const openWalletPopup = useCallback((url: string) => {
    if (walletPopupRef.current && !walletPopupRef.current.closed) {
      try { walletPopupRef.current.close(); } catch {}
    }

    const width = 500;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      url,
      'SurrogateWalletPopup',
      `width=${width},height=${height},left=${left},top=${top},status=yes,toolbar=no,menubar=no,location=yes,resizable=yes`
    );

    walletPopupRef.current = popup;
    logStep('WALLET POPUP OPENED — OAuth supported', 'ok');
  }, []);

  // Iframe & Popup path: wallet signs and posts back via postMessage.
  //
  // Diagnostics: this postMessage handshake is the most opaque leg of the wallet pipe.
  // We control the origin gate + the accepted message shapes; the wallet controls what it
  // actually emits and from which origin. When a sign-in "does nothing", this lets us pin
  // the break to OUR side (origin/shape mismatch we silently dropped) vs THEIRS (wallet
  // never posted back). We log every plausibly-wallet message — including rejected ones —
  // tagged [WALLET-BRIDGE]. Wallet addresses are public keys, not secrets.
  useEffect(() => {
    const handleWalletMessage = (e: MessageEvent) => {
      const data = e.data;
      const looksWalletRelated =
        e.origin.includes('thesurrogate.me') ||
        (!!data && typeof data === 'object' && typeof data.type === 'string' && data.type.includes('wallet'));

      if (looksWalletRelated) {
        const shape = data && typeof data === 'object'
          ? { type: data.type, keys: Object.keys(data) }
          : { raw: data };
        console.info('[WALLET-BRIDGE] inbound', { origin: e.origin, ...shape });
        logStep(`WALLET BRIDGE — msg from ${e.origin} (${data?.type ?? 'no-type'})`, 'ok');
      }

      // Trust the wallet origin AND our own origin: the popup-bridge redirects
      // back to the app (app origin) and re-posts wallet_signed to the opener,
      // so same-origin messages are a legitimate (and inherently safe) path.
      const trustedOrigins = ['https://wallet.thesurrogate.me', window.location.origin];
      if (!trustedOrigins.includes(e.origin)) {
        if (looksWalletRelated) {
          console.warn('[WALLET-BRIDGE] REJECTED — untrusted origin (expected wallet or app origin):', e.origin);
          logStep(`WALLET BRIDGE — REJECTED foreign origin ${e.origin}`, 'warn');
        }
        return;
      }

      if (e.data?.type === 'open_popup' || e.data?.type === 'open_auth_popup' || e.data?.type === 'open_wallet_popup' || e.data?.type === 'wallet_open_popup' || e.data?.type === 'request_popup') {
        const popupUrl = e.data.url || 'https://wallet.thesurrogate.me';
        console.info('[WALLET-BRIDGE] opening popup requested by iframe:', popupUrl);
        logStep('WALLET BRIDGE — secure popup requested by iframe', 'ok');
        openWalletPopup(popupUrl);
        return;
      }

      if (e.data?.type === 'wallet_signed' || e.data?.type === 'wallet_connected') {
        const walletAddress: string | undefined =
          e.data.address || e.data.wallet_address || e.data.publicKey || undefined;
        console.info(`[WALLET-BRIDGE] accepted ${e.data.type} — address present:`, !!walletAddress);
        logStep(
          `WALLET BRIDGE — accepted ${e.data.type}${walletAddress ? ' (address captured)' : ' (NO address field!)'}`,
          walletAddress ? 'ok' : 'warn',
        );
        void processWalletSignIn(walletAddress);

        // Auto-close secure popup on successful handshake
        if (walletPopupRef.current) {
          try { walletPopupRef.current.close(); } catch {}
          walletPopupRef.current = null;
          logStep('WALLET POPUP CLOSED', 'ok');
        }
      } else if (looksWalletRelated) {
        console.warn('[WALLET-BRIDGE] wallet-origin message with unrecognized type:', e.data?.type);
        logStep(`WALLET BRIDGE — unrecognized type "${e.data?.type}" from wallet origin`, 'warn');
      }
    };
    window.addEventListener('message', handleWalletMessage);
    return () => window.removeEventListener('message', handleWalletMessage);
  }, [processWalletSignIn]);

  // Top-level return path: when sign-in or minting happens on the wallet's own tab
  // (wallet.thesurrogate.me), it returns the seeker to the site with
  //   ?seeker=<walletAddress>[&event=signin|mint]
  // (aliases accepted: ?wallet=, ?address=). This is what makes a tab sign-in / mint
  // "return to the experience" instead of dropping the seeker on a fresh home screen and
  // looping. We route it through the same processWalletSignIn() as the iframe path, then
  // strip the params so a refresh/share doesn't replay them. Ref-guarded to run once.
  useEffect(() => {
    if (walletReturnHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const seeker = params.get('seeker') || params.get('wallet') || params.get('address');
    if (!seeker) return;
    walletReturnHandledRef.current = true;

    const event = params.get('event'); // optional: 'signin' | 'mint'
    const sessionId = params.get('session_id');
    if (sessionId) {
      localStorage.setItem('oracle_active_session_id', sessionId);
    }

    logStep(`WALLET RETURN DETECTED${event ? ` (${event})` : ''} — activating seeker`, 'ok');
    void processWalletSignIn(seeker);
    // NOTE: no deferred DB flush needed anymore — user-wallet-sync derives the
    // caller IP server-side, so markWalletSigned persists even before the local
    // IP check resolves.

    // Strip wallet params but preserve any others (e.g. ?devui, ?newuser).
    params.delete('seeker');
    params.delete('wallet');
    params.delete('address');
    params.delete('event');
    params.delete('session_id');
    const qs = params.toString();
    const newUrl = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);
  }, [processWalletSignIn, ipAddress]);

  return {
    processWalletSignIn,
    withWalletReturn,
    openWalletPopup,
    handleCloseWallet,
  };
}
