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

createRoot(document.getElementById("root")!).render(<RootBoundary><App /></RootBoundary>);
