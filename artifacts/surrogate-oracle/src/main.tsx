import { createRoot } from "react-dom/client";
import { Component, type ReactNode } from "react";
import App from "./App";
import "./index.css";

class RootBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidMount() {
    window.addEventListener('error', this.handleWindowError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }
  componentWillUnmount() {
    window.removeEventListener('error', this.handleWindowError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }
  private handleWindowError = (event: ErrorEvent) => {
    console.error('[ROOT RUNTIME ERROR]', {
      message: event.message || 'Unknown window error',
      source: event.filename || undefined,
      line: event.lineno || undefined,
      column: event.colno || undefined,
      stack: event.error?.stack || undefined,
    });
  };
  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    console.error('[ROOT UNHANDLED REJECTION]', {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      reason,
    });
  };
  componentDidCatch(error: Error) {
    console.error('[ROOT CRASH]', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: '#000', color: '#ff4466', fontFamily: 'monospace', padding: 32, fontSize: 14, whiteSpace: 'pre-wrap' }}>
          {'ROOT CRASH — open DevTools > Console for full trace\n\n'}
          {String(this.state.error)}
          {'\n\n'}
          {this.state.error.stack}
        </div>
      );
    }
    return this.props.children;
  }
}

// ?reset — nuke all localStorage and reload clean (dev escape hatch)
// ?fresh — clear only journey/lore state, keep auth
const _sp = new URLSearchParams(window.location.search);
if (_sp.has('reset')) {
  localStorage.clear();
  sessionStorage.clear();
  window.location.replace('/?newuser');
} else if (_sp.has('fresh')) {
  // Remove fixed-name keys
  ['oracle_lore_completed','oracle_active_session_id','oracle_steps_sticky','oracle_wallet_signed'].forEach(k => localStorage.removeItem(k));
  // Remove IP-keyed variants (pattern match — IP is unknown at this point)
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith('oracle_wallet_signed_') || k.startsWith('surrogate_lore_completed_')) {
      localStorage.removeItem(k);
    }
  }
  window.location.replace('/?newuser');
}

createRoot(document.getElementById("root")!).render(<RootBoundary><App /></RootBoundary>);
