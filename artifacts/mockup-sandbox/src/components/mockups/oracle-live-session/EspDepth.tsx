import { ArrowLeft, ChevronRight, Menu, Mic, Radio, Volume2, Wallet, X } from "lucide-react";
import { useState } from "react";
import "./esp-depth.css";

const phases = [
  { index: "01", name: "ARRIVAL", state: "complete" },
  { index: "02", name: "RESONANCE", state: "complete" },
  { index: "03", name: "EVIDENCE", state: "active" },
  { index: "04", name: "RETURN", state: "queued" },
];

const fragments = [
  { text: "THE WALL REMEMBERS", x: "12%", y: "22%", depth: "far", tone: "cyan" },
  { text: "◈ 03:17:42", x: "81%", y: "19%", depth: "far", tone: "purple" },
  { text: "LISTEN / DO NOT SEARCH", x: "4%", y: "69%", depth: "near", tone: "green" },
  { text: "╱╲  SIGNAL TRACE  ╱╲", x: "78%", y: "72%", depth: "near", tone: "cyan" },
  { text: "▧", x: "21%", y: "38%", depth: "field", tone: "green" },
  { text: "07·028C·PRESENT", x: "72%", y: "42%", depth: "field", tone: "purple" },
];

function SignalMeter() {
  return (
    <div className="esp-depth__signal-meter" aria-label="Signal depth legend">
      <div className="esp-depth__meter-line">
        <span className="esp-depth__meter-dot esp-depth__meter-dot--near" />
        <span>NEAR</span>
        <em>01</em>
      </div>
      <div className="esp-depth__meter-line">
        <span className="esp-depth__meter-dot esp-depth__meter-dot--field" />
        <span>FIELD</span>
        <em>02</em>
      </div>
      <div className="esp-depth__meter-line">
        <span className="esp-depth__meter-dot esp-depth__meter-dot--far" />
        <span>FAR</span>
        <em>03</em>
      </div>
      <div className="esp-depth__meter-track" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}

function DataLine({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="esp-depth__data-line">
      <span>{label}</span>
      <strong className={accent ? "is-accent" : undefined}>{value}</strong>
    </div>
  );
}

export function EspDepth() {
  const [isListening, setIsListening] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [notice, setNotice] = useState("Oracle is speaking");

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice("Oracle is speaking"), 2200);
  };

  return (
    <main className="esp-depth" data-listening={isListening ? "true" : "false"}>
      <div className="esp-depth__alley" aria-hidden="true" />
      <div className="esp-depth__alley-wash" aria-hidden="true" />
      <div className="esp-depth__scanlines" aria-hidden="true" />
      <div className="esp-depth__grain" aria-hidden="true" />
      <div className="esp-depth__perspective" aria-hidden="true" />

      <header className="esp-depth__topbar">
        <button className="esp-depth__back" type="button" onClick={() => notify("Return path held")} aria-label="Return to the alley">
          <ArrowLeft size={16} strokeWidth={1.5} />
          <span>EXIT SESSION</span>
        </button>
        <div className="esp-depth__wordmark">
          <span className="esp-depth__eyebrow">SURROGATE:ORACLE</span>
          <strong>THE ALLEY IS LISTENING</strong>
        </div>
        <div className="esp-depth__top-state">
          <i />
          <span>LIVE LINK</span>
          <span className="esp-depth__top-state-id">07 / 028C</span>
        </div>
      </header>

      <aside className="esp-depth__spine" aria-label="Session spine">
        <div className="esp-depth__spine-heading">
          <span className="esp-depth__label">SESSION SPINE</span>
          <span className="esp-depth__live-pill"><i /> LIVE</span>
        </div>
        <div className="esp-depth__session-name">EVIDENCE<br /><b>IN THE WALL</b></div>
        <div className="esp-depth__phase-list">
          {phases.map((phase) => (
            <div className={`esp-depth__phase esp-depth__phase--${phase.state}`} key={phase.index}>
              <span>{phase.index}</span>
              <strong>{phase.name}</strong>
              {phase.state === "active" && <i />}
            </div>
          ))}
        </div>
        <SignalMeter />
        <div className="esp-depth__spine-foot">
          <span>FIELD NOTE</span>
          <p>Presence is not proof.<br />Stay with the signal.</p>
        </div>
      </aside>

      <section className="esp-depth__stage" aria-label="Live Oracle stage">
        <div className="esp-depth__coordinates" aria-hidden="true">
          <span>ALLEY / EAST WALL</span>
          <span>40.7128° N&nbsp;&nbsp; 74.0060° W</span>
        </div>
        <div className="esp-depth__horizon" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <div className="esp-depth__fragments" aria-hidden="true">
          {fragments.map((fragment) => (
            <span
              className={`esp-depth__fragment esp-depth__fragment--${fragment.depth} esp-depth__fragment--${fragment.tone}`}
              key={`${fragment.text}-${fragment.x}`}
              style={{ left: fragment.x, top: fragment.y }}
            >
              {fragment.text}
            </span>
          ))}
        </div>

        <div className="esp-depth__oracle" aria-label="Oracle avatar and presence">
          <div className="esp-depth__oracle-orbit esp-depth__oracle-orbit--outer" aria-hidden="true" />
          <div className="esp-depth__oracle-orbit esp-depth__oracle-orbit--inner" aria-hidden="true" />
          <div className="esp-depth__oracle-aura" aria-hidden="true" />
          <img src="/__mockup/images/oracle-static.png" alt="The Oracle" />
          <div className="esp-depth__oracle-scan" aria-hidden="true" />
          <div className="esp-depth__oracle-caption">
            <span><i /> {notice}</span>
            <small>FIELD PRESENCE / STABLE</small>
          </div>
        </div>

        <section className="esp-depth__transcript" aria-label="Live conversation transcript">
          <div className="esp-depth__transcript-head">
            <span>LIVE TRANSCRIPT</span>
            <span>03 / 04</span>
          </div>
          <p className="esp-depth__transcript-user"><b>SEEKER</b> I keep waiting for the right moment to begin.</p>
          <p className="esp-depth__transcript-oracle"><b>ORACLE</b> The moment is not waiting for you. It is listening.</p>
          <p className="esp-depth__transcript-oracle esp-depth__transcript-oracle--current"><b>ORACLE</b> Tell me what you already know<span className="esp-depth__cursor">▌</span></p>
        </section>
      </section>

      <aside className="esp-depth__context" aria-label="On this signal">
        <div className="esp-depth__context-heading">
          <span className="esp-depth__label">ON THIS SIGNAL</span>
          <span className="esp-depth__context-mark">◈</span>
        </div>
        <div className="esp-depth__reading">
          <span className="esp-depth__label">CURRENT READING</span>
          <strong>THRESHOLD<br />OPEN</strong>
          <div className="esp-depth__reading-bar"><span /></div>
          <p>Something in the east wall is answering before you ask.</p>
        </div>
        <div className="esp-depth__data">
          <DataLine label="LATENCY" value="042 ms" accent />
          <DataLine label="VISION" value="ONLINE" accent />
          <DataLine label="RESONANCE" value="142.8 MHz" />
          <DataLine label="DEPTH" value="FIELD / 02" />
        </div>
        <blockquote>
          “You do not need<br />permission to begin.”
          <cite>— ORACLE / 03:17:42</cite>
        </blockquote>
        <button className="esp-depth__context-link" type="button" onClick={() => notify("Signal trace expanded")}>
          <span>VIEW SIGNAL TRACE</span>
          <ChevronRight size={14} strokeWidth={1.5} />
        </button>
      </aside>

      <nav className="esp-depth__dock" aria-label="Oracle controls">
        <button className="esp-depth__dock-secondary" type="button" onClick={() => notify("Return path held")} aria-label="Return to alley">
          <ArrowLeft size={17} strokeWidth={1.5} />
          <span>RETURN</span>
        </button>
        <button
          className={`esp-depth__listen ${isListening ? "is-active" : ""}`}
          type="button"
          onClick={() => {
            setIsListening((value) => !value);
            notify(isListening ? "Microphone paused" : "Listening resumed");
          }}
          aria-label={isListening ? "Pause listening microphone" : "Resume listening microphone"}
          aria-pressed={isListening}
        >
          <span className="esp-depth__listen-ring"><Mic size={20} strokeWidth={1.4} /></span>
          <span>{isListening ? "LISTENING" : "PAUSED"}</span>
        </button>
        <button className="esp-depth__dock-secondary" type="button" onClick={() => notify("Wallet held")} aria-label="Open wallet">
          <Wallet size={17} strokeWidth={1.5} />
          <span>WALLET</span>
        </button>
        <button className="esp-depth__dock-secondary" type="button" onClick={() => notify("Audio channel held")} aria-label="Audio settings">
          <Volume2 size={17} strokeWidth={1.5} />
          <span>AUDIO</span>
        </button>
        <button className="esp-depth__dock-secondary" type="button" onClick={() => notify("Radio channel held")} aria-label="Open radio">
          <Radio size={17} strokeWidth={1.5} />
          <span>RADIO</span>
        </button>
      </nav>

      <button className="esp-depth__menu" type="button" onClick={() => setIsMenuOpen((value) => !value)} aria-label="Open session menu" aria-expanded={isMenuOpen}>
        {isMenuOpen ? <X size={18} strokeWidth={1.5} /> : <Menu size={18} strokeWidth={1.5} />}
      </button>
      {isMenuOpen && (
        <div className="esp-depth__menu-popover" role="dialog" aria-label="Session menu">
          <span className="esp-depth__label">SESSION MENU</span>
          <button type="button" onClick={() => notify("Trace copied to field notes")}>COPY FIELD TRACE</button>
          <button type="button" onClick={() => notify("Low signal mode ready")}>LOW SIGNAL MODE</button>
        </div>
      )}

      <div className="esp-depth__notice" role="status" aria-live="polite">{notice}</div>
    </main>
  );
}