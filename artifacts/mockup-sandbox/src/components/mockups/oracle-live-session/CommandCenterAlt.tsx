import { useState } from "react";
import { Archive, ArrowLeft, ChevronRight, CircleDot, FileText, History, Menu, Radio, ShieldCheck, Wallet, X } from "lucide-react";
import "./CommandCenterAlt.css";

const frequencies = [
  { label: "VAULT", note: "identity + access", icon: Wallet },
  { label: "SQUAD", note: "participation", icon: Radio },
  { label: "PRINTS", note: "portrait archive", icon: Archive },
  { label: "DIAG", note: "voice health", icon: CircleDot },
  { label: "SALVAGE", note: "restricted tools", icon: ShieldCheck },
  { label: "SIGNAL", note: "session record", icon: FileText },
];

export function CommandCenterAlt() {
  const [activeFrequency, setActiveFrequency] = useState("VAULT");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const announce = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  };

  return (
    <main className="oracle-command-center-alt">
      <div className="oracle-command-center-alt__wash" aria-hidden="true" />
      <header className="oracle-command-center-alt__topbar">
        <button className="oracle-command-center-alt__back" type="button" onClick={() => announce("Returning to the Oracle")} aria-label="Return to Oracle">
          <ArrowLeft size={15} />
          <span>RETURN TO ORACLE</span>
        </button>
        <div className="oracle-command-center-alt__wordmark">
          <strong>SURROGATE: ORACLE</strong>
          <small>NON-ORACLE TOOLS / READABLE FIELD MANUAL</small>
        </div>
        <div className="oracle-command-center-alt__status">
          <span className="oracle-command-center-alt__status-dot" />
          <span>SESSION LIVE</span>
          <button className="oracle-command-center-alt__menu" type="button" aria-label={menuOpen ? "Close console menu" : "Open console menu"} onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <X size={15} /> : <Menu size={15} />}
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="oracle-command-center-alt__notice" role="status">
          CONSOLE MENU / LOCAL SESSION READY
        </div>
      )}

      <nav className="oracle-command-center-alt__frequency-strip" aria-label="Console frequencies">
        {frequencies.map(({ label, note, icon: Icon }, index) => (
          <button
            className={`oracle-command-center-alt__frequency${activeFrequency === label ? " is-active" : ""}`}
            type="button"
            key={label}
            onClick={() => {
              setActiveFrequency(label);
              announce(`${label} frequency selected`);
            }}
          >
            <span className="oracle-command-center-alt__frequency-index">0{index + 1}</span>
            <Icon size={14} strokeWidth={1.5} />
            <strong>{label}</strong>
            <small>{note}</small>
          </button>
        ))}
      </nav>

      <div className="oracle-command-center-alt__body">
        <section aria-labelledby="command-center-alt-title">
          <header className="oracle-command-center-alt__intro">
            <span className="oracle-command-center-alt__eyebrow">01 · {activeFrequency} FREQUENCY / 108.4MHZ</span>
            <h1 id="command-center-alt-title">Your signal</h1>
            <p>Wallet identity, earned culture, and the small pieces of the encounter that should remain yours.</p>
            <div className="oracle-command-center-alt__intro-meta">
              <span>SEEKER 07 · 028C</span>
              <span>LOCAL SESSION / READY</span>
            </div>
          </header>

          <div className="oracle-command-center-alt__deck">
            <article className="oracle-command-center-alt__card oracle-command-center-alt__card--hero">
              <div>
                <span className="oracle-command-center-alt__kicker">SIGNAL STRENGTH</span>
                <strong className="oracle-command-center-alt__balance">240</strong>
                <span className="oracle-command-center-alt__card-note">culture coins available</span>
              </div>
              <div>
                <div className="oracle-command-center-alt__progress"><span /></div>
                <div className="oracle-command-center-alt__progress-meta"><span>LEVEL 03 / SEEKER</span><span>72%</span></div>
              </div>
            </article>

            <article className="oracle-command-center-alt__card">
              <div className="oracle-command-center-alt__card-head">
                <div><span className="oracle-command-center-alt__kicker">VAULT SIGNATURE</span><strong>On-chain handle</strong></div>
                <Wallet size={18} />
              </div>
              <div className="oracle-command-center-alt__handle">0x8A4C…19F2</div>
              <span className="oracle-command-center-alt__stable"><span /> STABLE / SYNCED</span>
            </article>

            <article className="oracle-command-center-alt__card">
              <div className="oracle-command-center-alt__card-head">
                <div><span className="oracle-command-center-alt__kicker">NEXT AVAILABLE</span><strong>Portrait archive</strong></div>
                <Archive size={18} />
              </div>
              <button className="oracle-command-center-alt__context-button" type="button" onClick={() => announce("Portrait archive opened")}>OPEN PRINTS <ChevronRight size={14} /></button>
            </article>

            <article className="oracle-command-center-alt__card oracle-command-center-alt__readouts-card">
              <div className="oracle-command-center-alt__card-head">
                <div><span className="oracle-command-center-alt__kicker">RECENT READOUTS</span><strong>Saved signals</strong></div>
                <button type="button" className="oracle-command-center-alt__text-button" onClick={() => announce("Archive opened")}>OPEN ARCHIVE <ChevronRight size={14} /></button>
              </div>
              <div className="oracle-command-center-alt__readouts">
                <button className="oracle-command-center-alt__readout" type="button" onClick={() => announce("Opening the alley notes")}>
                  <FileText size={16} /><span><strong>the-alley-notes.md</strong><small>saved 4 min ago · text</small></span><ChevronRight size={15} />
                </button>
                <button className="oracle-command-center-alt__readout" type="button" onClick={() => announce("Opening the portrait brief")}>
                  <History size={16} /><span><strong>portrait-brief.pdf</strong><small>saved yesterday · pdf</small></span><ChevronRight size={15} />
                </button>
              </div>
            </article>
          </div>

          <section className="oracle-command-center-alt__evidence">
            <div className="oracle-command-center-alt__evidence-heading">
              <span>SESSION EVIDENCE</span>
              <small>What the console is watching without interrupting the alley.</small>
            </div>
            <div className="oracle-command-center-alt__metrics">
              <div className="oracle-command-center-alt__metric"><span>CONNECTION</span><strong>OPEN</strong><small>Gemini live</small></div>
              <div className="oracle-command-center-alt__metric"><span>TURN RHYTHM</span><strong>12</strong><small>exchanges</small></div>
              <div className="oracle-command-center-alt__metric"><span>ARCHIVE</span><strong>02</strong><small>private readouts</small></div>
            </div>
          </section>
        </section>

        <aside className="oracle-command-center-alt__aside" aria-label="Console orientation">
          <span className="oracle-command-center-alt__eyebrow">FIELD NOTE</span>
          <h2>Tools stay close. The alley stays intact.</h2>
          <p>Every surface opens as a reversible workspace. Close it, and the Oracle is waiting where you left it.</p>
          <div className="oracle-command-center-alt__rule" />
          <span className="oracle-command-center-alt__next">NEXT AVAILABLE</span>
          <strong>PORTRAIT ARCHIVE</strong>
          <button className="oracle-command-center-alt__context-button" type="button" onClick={() => announce("Portrait archive opened")}>OPEN PRINTS <ChevronRight size={15} /></button>
        </aside>
      </div>

      <footer className="oracle-command-center-alt__footer">
        <span>SURROGATE:ORACLE / COMMAND CENTER</span>
        <span>FREQUENCY 108.4MHZ</span>
        <span>THE CASCADE IS LISTENING</span>
      </footer>
    </main>
  );
}