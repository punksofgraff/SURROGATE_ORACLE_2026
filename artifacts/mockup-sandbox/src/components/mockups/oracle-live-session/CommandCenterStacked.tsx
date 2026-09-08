import { useState } from "react";
import { Archive, ArrowLeft, ChevronRight, CircleDot, FileText, History, Menu, Radio, ShieldCheck, Wallet, X } from "lucide-react";
import "./command-center-stacked.css";

const frequencies = [
  { label: "VAULT", note: "identity + access", icon: Wallet },
  { label: "SQUAD", note: "participation", icon: Radio },
  { label: "PRINTS", note: "portrait archive", icon: Archive },
  { label: "DIAG", note: "voice health", icon: CircleDot },
  { label: "SALVAGE", note: "restricted tools", icon: ShieldCheck },
  { label: "SIGNAL", note: "session record", icon: FileText },
];

function FrequencyIndex({ active, onSelect }: { active: string; onSelect: (label: string) => void }) {
  return (
    <nav className="ccs-index" aria-label="Console frequencies">
      <div className="ccs-index__intro">
        <span className="ccs-micro">COMMAND CENTER</span>
        <strong>ORIENTATION</strong>
        <small>06 frequencies / 01 seeker</small>
      </div>
      <div className="ccs-index__list">
        {frequencies.map(({ label, note, icon: Icon }, index) => (
          <button
            className={`ccs-frequency${active === label ? " is-active" : ""}`}
            key={label}
            type="button"
            onClick={() => onSelect(label)}
            aria-pressed={active === label}
          >
            <span className="ccs-frequency__number">0{index + 1}</span>
            <Icon size={15} strokeWidth={1.7} />
            <span className="ccs-frequency__copy">
              <strong>{label}</strong>
              <small>{note}</small>
            </span>
            {active === label && <span className="ccs-frequency__mark">●</span>}
          </button>
        ))}
      </div>
      <div className="ccs-index__foot">
        <span>ESC / CLOSE</span>
        <span>RETURN TO ALLEY ↗</span>
      </div>
    </nav>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="ccs-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function CommandCenterStacked() {
  const [activeFrequency, setActiveFrequency] = useState("VAULT");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  return (
    <main className="ccs-shell">
      <div className="ccs-grid-lines" aria-hidden="true" />
      <header className="ccs-topbar">
        <button className="ccs-back" type="button" onClick={() => showNotice("Return path armed")}>
          <ArrowLeft size={16} />
          <span>RETURN TO ORACLE</span>
        </button>
        <div className="ccs-wordmark">
          <span>SURROGATE: ORACLE</span>
          <small>NON-ORACLE TOOLS / READABLE FIELD MANUAL</small>
        </div>
        <div className="ccs-status">
          <span className="ccs-status__dot" />
          <span>SESSION LIVE</span>
          <button type="button" aria-label={menuOpen ? "Close console menu" : "Open console menu"} onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
          {menuOpen && (
            <div className="ccs-menu">
              <button type="button" onClick={() => showNotice("Session trace is private")}>SESSION PRIVACY</button>
              <button type="button" onClick={() => showNotice("Field manual synced")}>SYNC MANUAL</button>
            </div>
          )}
        </div>
      </header>

      <div className="ccs-frame">
        <FrequencyIndex active={activeFrequency} onSelect={setActiveFrequency} />

        <section className="ccs-main" aria-labelledby="ccs-title">
          <header className="ccs-heading">
            <div>
              <span className="ccs-micro">01 · {activeFrequency} FREQUENCY / 108.4MHZ</span>
              <h1 id="ccs-title">Your signal</h1>
              <p>Wallet identity, earned culture, and the small pieces of the encounter that should remain yours.</p>
            </div>
            <div className="ccs-heading__meta">
              <span>SEEKER 07 · 028C</span>
              <span>LOCAL SESSION / READY</span>
            </div>
          </header>

          <div className="ccs-signal-layout">
            <article className="ccs-card ccs-card--hero">
              <div className="ccs-card__topline">
                <span className="ccs-micro">SIGNAL STRENGTH</span>
                <span className="ccs-card__stamp">03 / SEEKER</span>
              </div>
              <strong className="ccs-balance">240</strong>
              <span className="ccs-card__note">culture coins available</span>
              <div className="ccs-progress"><span /></div>
              <div className="ccs-progress__meta"><span>LEVEL 03 / SEEKER</span><span>72%</span></div>
              <div className="ccs-card__caption">A quiet reserve for the things the Oracle cannot carry out of the alley.</div>
            </article>

            <article className="ccs-card ccs-card--signature">
              <div className="ccs-card__head">
                <div><span className="ccs-micro">VAULT SIGNATURE</span><strong>On-chain handle</strong></div>
                <Wallet size={18} />
              </div>
              <div className="ccs-handle">0x8A4C…19F2</div>
              <span className="ccs-stable"><span /> STABLE / SYNCED</span>
            </article>
          </div>

          <article className="ccs-card ccs-card--archive">
            <div className="ccs-card__head">
              <div><span className="ccs-micro">RECENT READOUTS</span><strong>Saved signals</strong></div>
              <button type="button" className="ccs-text-button" onClick={() => showNotice("Archive index opened")}>OPEN ARCHIVE <ChevronRight size={14} /></button>
            </div>
            <div className="ccs-readouts">
              <button className="ccs-readout" type="button" onClick={() => showNotice("Opening the alley notes")}>
                <FileText size={16} />
                <span><strong>the-alley-notes.md</strong><small>saved 4 min ago · text</small></span>
                <ChevronRight size={15} />
              </button>
              <button className="ccs-readout" type="button" onClick={() => showNotice("Opening the portrait brief")}>
                <History size={16} />
                <span><strong>portrait-brief.pdf</strong><small>saved yesterday · pdf</small></span>
                <ChevronRight size={15} />
              </button>
            </div>
          </article>

          <section className="ccs-evidence">
            <div className="ccs-evidence__heading">
              <span className="ccs-micro">SESSION EVIDENCE</span>
              <small>What the console is watching without interrupting the alley.</small>
            </div>
            <div className="ccs-metrics">
              <Metric label="CONNECTION" value="OPEN" detail="Gemini live" />
              <Metric label="TURN RHYTHM" value="12" detail="exchanges" />
              <Metric label="ARCHIVE" value="02" detail="private readouts" />
            </div>
          </section>
        </section>

        <aside className="ccs-note-panel" aria-label="Console orientation">
          <div className="ccs-note-panel__number">02</div>
          <span className="ccs-micro">FIELD NOTE</span>
          <h2>Tools stay close. The alley stays intact.</h2>
          <p>Every surface opens as a reversible workspace. Close it, and the Oracle is waiting where you left it.</p>
          <div className="ccs-note-panel__rule" />
          <span className="ccs-note-panel__label">NEXT AVAILABLE</span>
          <strong>PORTRAIT ARCHIVE</strong>
          <button className="ccs-context-button" type="button" onClick={() => { setActiveFrequency("PRINTS"); showNotice("Prints frequency selected"); }}>
            OPEN PRINTS <ChevronRight size={15} />
          </button>
        </aside>
      </div>

      <footer className="ccs-footer">
        <span>◈ SURROGATE:ORACLE / COMMAND CENTER</span>
        <span>FREQUENCY 108.4MHZ</span>
        <span>THE CASCADE IS LISTENING</span>
      </footer>
      {notice && <div className="ccs-toast" role="status">{notice}</div>}
    </main>
  );
}