import SurrogateOracleImmersion from './components/SurrogateOracleImmersion';
import { CodeAuditor } from './components/CodeAuditor';
import { TraceViewer } from './components/TraceViewer';
import { initSessionTraceListeners } from './lib/sessionTrace';

// Install trace listeners at module load so boot-time steps (before
// OracleConversation mounts and binds the session id) are buffered, not lost.
// No-op unless a developer has set localStorage.oracle_trace_token — real
// seeker sessions are never captured or uploaded.
initSessionTraceListeners();

function App() {
  return (
    <>
      <SurrogateOracleImmersion />
      <CodeAuditor />
      <TraceViewer />
    </>
  );
}

export default App;
