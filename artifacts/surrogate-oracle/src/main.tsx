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
  componentDidCatch(error: Error) { console.error('[ROOT CRASH]', error); }
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
if (new URLSearchParams(window.location.search).has('reset')) {
  localStorage.clear();
  sessionStorage.clear();
  window.location.replace(window.location.pathname);
}
if (new URLSearchParams(window.location.search).has('fresh')) {
  ['oracle_lore_completed','oracle_active_session_id','oracle_steps_sticky'].forEach(k => localStorage.removeItem(k));
  window.location.replace(window.location.pathname);
}

createRoot(document.getElementById("root")!).render(<RootBoundary><App /></RootBoundary>);
