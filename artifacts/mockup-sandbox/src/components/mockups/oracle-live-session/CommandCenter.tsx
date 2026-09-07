import { Archive, ArrowLeft, ChevronRight, CircleDot, FileText, History, Menu, Radio, ShieldCheck, Wallet } from "lucide-react";
import "./_group.css";
import "./command-center.css";

const frequencies = [
  { label: "VAULT", note: "identity + access", active: true, icon: Wallet },
  { label: "SQUAD", note: "participation", icon: Radio },
  { label: "PRINTS", note: "portrait archive", icon: Archive },
  { label: "DIAG", note: "voice health", icon: CircleDot },
  { label: "SALVAGE", note: "restricted tools", icon: ShieldCheck },
  { label: "SIGNAL", note: "session record", icon: FileText },
];

function SideRail() {
  return (
    <aside className="oracle-command-center__rail" aria-label="Console frequencies">
      <div className="oracle-command-center__rail-head">
        <span className="oracle-command-center__rail-kicker">COMMAND CENTER</span>
        <strong>ORIENTATION</strong>
        <span>06 frequencies / 01 seeker</span>
      </div>
      <nav className="oracle-command-center__frequencies">
        {frequencies.map(({ label, note, active, icon: Icon }, index) => (
          <button className={`oracle-command-center__frequency${active ? " is-active" : ""}`} type="button" key={label}>
            <span className="oracle-command-center__frequency-index">0{index + 1}</span>
            <Icon size={15} strokeWidth={1.5} />
            <span className="oracle-command-center__frequency-copy">
              <strong>{label}</strong>
              <small>{note}</small>
            </span>
            {active && <span className="oracle-command-center__frequency-mark">●</span>}
          </button>
        ))}
      </nav>
      <div className="oracle-command-center__rail-foot">
        <span>ESC / CLOSE</span>
        <span>RETURN TO ALLEY ↗</span>
      </div>
    </aside>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="oracle-command-center__metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function CommandCenter() {
  return (
    <main className="oracle-command-center">
      <div className="oracle-command-center__alley" />
      <div className="oracle-command-center__wash" />

      <header className="oracle-command-center__topbar">
        <button className="oracle-command-center__back" type="button" aria-label="Return to Oracle">
          <ArrowLeft size={16} />
          <span>RETURN TO ORACLE</span>
        </button>
        <div className="oracle-command-center__wordmark">
          <span>SURROGATE: ORACLE</span>
          <small>NON-ORACLE TOOLS / READABLE FIELD MANUAL</small>
        </div>
        <div className="oracle-command-center__status">
          <span className="oracle-command-center__status-dot" />
          <span>SESSION LIVE</span>
          <button type="button" aria-label="Open console menu"><Menu size={17} /></button>
        </div>
      </header>

      <div className="oracle-command-center__body">
        <SideRail />

        <section className="oracle-command-center__workspace" aria-labelledby="command-center-title">
          <header className="oracle-command-center__workspace-head">
            <div>
              <span className="oracle-command-center__eyebrow">01 · VAULT FREQUENCY / 108.4MHZ</span>
              <h1 id="command-center-title">Your signal</h1>
              <p>Wallet identity, earned culture, and the small pieces of the encounter that should remain yours.</p>
            </div>
            <div className="oracle-command-center__workspace-meta">
              <span>SEEKER 07 · 028C</span>
              <span>LOCAL SESSION / READY</span>
            </div>
          </header>

          <div className="oracle-command-center__divider" />

          <div className="oracle-command-center__grid">
            <article className="oracle-command-center__card oracle-command-center__card--hero">
              <div className="oracle-command-center__card-kicker">SIGNAL STRENGTH</div>
              <strong className="oracle-command-center__balance">240</strong>
              <span className="oracle-command-center__card-note">culture coins available</span>
              <div className="oracle-command-center__progress"><span /></div>
              <div className="oracle-command-center__progress-meta"><span>LEVEL 03 / SEEKER</span><span>72%</span></div>
            </article>

            <article className="oracle-command-center__card">
              <div className="oracle-command-center__card-head">
                <div><span className="oracle-command-center__card-kicker">VAULT SIGNATURE</span><strong>On-chain handle</strong></div>
                <Wallet size={18} />
              </div>
              <div className="oracle-command-center__handle">0x8A4C…19F2</div>
              <span className="oracle-command-center__stable"><span /> STABLE / SYNCED</span>
            </article>

            <article className="oracle-command-center__card oracle-command-center__card--wide">
              <div className="oracle-command-center__card-head">
                <div><span className="oracle-command-center__card-kicker">RECENT READOUTS</span><strong>Saved signals</strong></div>
                <button type="button" className="oracle-command-center__text-button">OPEN ARCHIVE <ChevronRight size={14} /></button>
              </div>
              <div className="oracle-command-center__readouts">
                <div className="oracle-command-center__readout"><FileText size={16} /><span><strong>the-alley-notes.md</strong><small>saved 4 min ago · text</small></span><ChevronRight size={15} /></div>
                <div className="oracle-command-center__readout"><History size={16} /><span><strong>portrait-brief.pdf</strong><small>saved yesterday · pdf</small></span><ChevronRight size={15} /></div>
              </div>
            </article>
          </div>

          <section className="oracle-command-center__lower">
            <div className="oracle-command-center__section-heading">
              <span>SESSION EVIDENCE</span>
              <small>What the console is watching without interrupting the alley.</small>
            </div>
            <div className="oracle-command-center__metrics">
              <Metric label="CONNECTION" value="OPEN" detail="Gemini live" />
              <Metric label="TURN RHYTHM" value="12" detail="exchanges" />
              <Metric label="ARCHIVE" value="02" detail="private readouts" />
            </div>
          </section>
        </section>

        <aside className="oracle-command-center__context-panel" aria-label="Console orientation">
          <span className="oracle-command-center__eyebrow">FIELD NOTE</span>
          <h2>Tools stay close. The alley stays intact.</h2>
          <p>Every surface opens as a reversible workspace. Close it, and the Oracle is waiting where you left it.</p>
          <div className="oracle-command-center__context-rule" />
          <span className="oracle-command-center__context-label">NEXT AVAILABLE</span>
          <strong>PORTRAIT ARCHIVE</strong>
          <button className="oracle-command-center__context-button" type="button">OPEN PRINTS <ChevronRight size={15} /></button>
        </aside>
      </div>

      <footer className="oracle-command-center__footer">
        <span>◈ SURROGATE:ORACLE / COMMAND CENTER</span>
        <span>FREQUENCY 108.4MHZ</span>
        <span>THE CASCADE IS LISTENING</span>
      </footer>
    </main>
  );
}