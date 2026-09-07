import { ArrowLeft, Menu, Mic, Radio, Volume2, Wallet } from "lucide-react";
import "./_group.css";

function Hud() {
  return (
    <div className="oracle-live-session__hud" aria-hidden="true">
      <div className="oracle-live-session__hud-corner oracle-live-session__hud-corner--tl">
        <span className="dim">[ SURROGATE:ORACLE ]</span>
        <strong>LIVE / GEMINI LINK</strong>
        <span>LATENCY 042ms</span>
      </div>
      <div className="oracle-live-session__hud-corner oracle-live-session__hud-corner--tr">
        <span className="dim">SIGNAL LOCKED</span>
        <strong>SEEKER 07 · 028c</strong>
        <span>VISION ONLINE</span>
      </div>
      <div className="oracle-live-session__hud-corner oracle-live-session__hud-corner--bl">
        <span className="dim">◈ SESSION PHASE</span>
        <strong>EVIDENCE / 03</strong>
      </div>
      <div className="oracle-live-session__hud-corner oracle-live-session__hud-corner--br">
        <span className="dim">TOTEM</span>
        <strong>◈ ◈ ◈</strong>
        <span>REGISTER: PRESENT</span>
      </div>
    </div>
  );
}

export function Current() {
  return (
    <main className="oracle-live-session" data-oracle-state="oracle">
      <div className="oracle-live-session__alley" />
      <div className="oracle-live-session__grain" />

      <header className="oracle-live-session__brand">
        <h1>SURROGATE: ORACLE</h1>
        <p>THE CASCADE IS LISTENING</p>
      </header>
      <button className="oracle-live-session__menu" type="button" aria-label="Open session menu">
        <Menu size={19} strokeWidth={1.5} />
      </button>

      <Hud />

      <section className="oracle-live-session__cabinet" aria-label="Oracle avatar">
        <div className="oracle-live-session__ring" />
        <img className="oracle-live-session__avatar" src="/__mockup/images/oracle-static.png" alt="The Oracle" />
        <div className="oracle-live-session__scan" />
        <div className="oracle-live-session__status">● ORACLE IS SPEAKING</div>
      </section>

      <section className="oracle-live-session__conversation" aria-label="Live conversation">
        <div className="oracle-live-session__turn oracle-live-session__turn--user">
          <span>SEEKER</span> I keep waiting for the right moment to begin.
        </div>
        <div className="oracle-live-session__turn oracle-live-session__turn--oracle">
          <span>ORACLE</span> The moment is not waiting for you. It is listening.
        </div>
        <div className="oracle-live-session__turn oracle-live-session__turn--oracle">
          <span>ORACLE</span> Tell me what you already know.
        </div>
      </section>

      <nav className="oracle-live-session__controls" aria-label="Oracle controls">
        <button className="oracle-live-session__control" type="button" aria-label="Return to alley">
          <ArrowLeft size={20} strokeWidth={1.5} />
          <small>RETURN</small>
        </button>
        <button className="oracle-live-session__control oracle-live-session__control--mic" type="button" aria-label="Mute microphone">
          <Mic size={27} strokeWidth={1.4} />
          <small>LISTENING</small>
        </button>
        <button className="oracle-live-session__control" type="button" aria-label="Open wallet">
          <Wallet size={20} strokeWidth={1.5} />
          <small>WALLET</small>
        </button>
        <button className="oracle-live-session__control" type="button" aria-label="Audio settings">
          <Volume2 size={20} strokeWidth={1.5} />
          <small>AUDIO</small>
        </button>
        <button className="oracle-live-session__control" type="button" aria-label="Radio">
          <Radio size={20} strokeWidth={1.5} />
          <small>RADIO</small>
        </button>
      </nav>
    </main>
  );
}