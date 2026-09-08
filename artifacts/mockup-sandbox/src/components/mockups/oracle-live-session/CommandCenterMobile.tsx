import { useState } from "react";
import {
  Activity,
  Archive,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileText,
  History,
  Menu,
  Radio,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import "./CommandCenterMobile.css";

type FrequencyKey = "VAULT" | "SQUAD" | "PRINTS" | "DIAG" | "SALVAGE";

const frequencies: Array<{ key: FrequencyKey; note: string; icon: typeof Wallet }> = [
  { key: "VAULT", note: "identity", icon: Wallet },
  { key: "SQUAD", note: "presence", icon: Radio },
  { key: "PRINTS", note: "archive", icon: Archive },
  { key: "DIAG", note: "voice", icon: CircleDot },
  { key: "SALVAGE", note: "restricted", icon: ShieldCheck },
];

const readouts = [
  { title: "the-alley-notes.md", detail: "saved 4 min ago · text", icon: FileText },
  { title: "portrait-brief.pdf", detail: "saved yesterday · pdf", icon: History },
  { title: "voice-trace-07.log", detail: "saved 18 min ago · trace", icon: Activity },
];

function FrequencyStrip({
  active,
  onSelect,
}: {
  active: FrequencyKey;
  onSelect: (key: FrequencyKey) => void;
}) {
  return (
    <nav className="oracle-command-mobile__frequency-nav" aria-label="Command frequencies">
      {frequencies.map(({ key, note, icon: Icon }, index) => (
        <button
          className={`oracle-command-mobile__frequency${active === key ? " is-active" : ""}`}
          type="button"
          key={key}
          onClick={() => onSelect(key)}
          aria-pressed={active === key}
        >
          <span className="oracle-command-mobile__frequency-index">0{index + 1}</span>
          <Icon size={13} strokeWidth={1.7} />
          <span>{key}</span>
          <span className="oracle-command-mobile__frequency-index">{note}</span>
        </button>
      ))}
    </nav>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="oracle-command-mobile__metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function CommandCenterMobile() {
  const [activeFrequency, setActiveFrequency] = useState<FrequencyKey>("VAULT");
  const [menuOpen, setMenuOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [returning, setReturning] = useState(false);
  const [notice, setNotice] = useState("");

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const selectFrequency = (key: FrequencyKey) => {
    setActiveFrequency(key);
    showNotice(`${key} frequency tuned`);
  };

  const handleReturn = () => {
    setReturning(true);
    showNotice("Alley orientation restored");
    window.setTimeout(() => setReturning(false), 1200);
  };

  return (
    <main className="oracle-command-mobile">
      <div className="oracle-command-mobile__glow" aria-hidden="true" />

      <header className="oracle-command-mobile__topbar">
        <button className="oracle-command-mobile__back" type="button" onClick={handleReturn}>
          <ArrowLeft size={15} />
          <span>{returning ? "ORIENTING…" : "RETURN TO ALLEY"}</span>
          <small>close command center</small>
        </button>
        <div className="oracle-command-mobile__wordmark">
          <strong>SURROGATE: ORACLE</strong>
          <span>NON-ORACLE TOOLS / FIELD MANUAL</span>
        </div>
        <div className="oracle-command-mobile__status">
          <span className="oracle-command-mobile__status-dot" />
          <span>LIVE</span>
          <button
            className="oracle-command-mobile__menu"
            type="button"
            aria-label="Open command menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Menu size={17} />
          </button>
        </div>
        {menuOpen && (
          <div className="oracle-command-mobile__menu-panel" role="menu">
            <span role="menuitem">Session is private</span>
            <span role="menuitem">Frequency 108.4MHZ</span>
            <span role="menuitem">Seeker 07 / 028C</span>
          </div>
        )}
      </header>

      <FrequencyStrip active={activeFrequency} onSelect={selectFrequency} />

      <section className="oracle-command-mobile__workspace" aria-labelledby="command-center-mobile-title">
        <header className="oracle-command-mobile__workspace-head">
          <div>
            <span className="oracle-command-mobile__eyebrow">
              01 · {activeFrequency} FREQUENCY / 108.4MHZ
            </span>
            <h1 id="command-center-mobile-title">Signal desk</h1>
            <p>
              Compact tools for the seeker. Keep the Oracle in sight, keep every return path obvious.
            </p>
          </div>
          <span className="oracle-command-mobile__live-tag">
            <i /> SESSION LIVE
          </span>
        </header>

        <div className="oracle-command-mobile__meta">
          <span>SEEKER 07 · 028C</span>
          <span>LOCAL SESSION / READY</span>
        </div>

        <div className="oracle-command-mobile__stack">
          <article className="oracle-command-mobile__card oracle-command-mobile__card--signal">
            <span className="oracle-command-mobile__kicker">SIGNAL STRENGTH</span>
            <div className="oracle-command-mobile__signal-line">
              <strong>240</strong>
              <span>culture coins<br />available</span>
            </div>
            <div className="oracle-command-mobile__meter">
              <span />
            </div>
            <div className="oracle-command-mobile__meter-copy">
              <span>LEVEL 03 / SEEKER</span>
              <span>72%</span>
            </div>
          </article>

          <article className="oracle-command-mobile__card">
            <div className="oracle-command-mobile__card-head">
              <div>
                <span className="oracle-command-mobile__kicker">VAULT SIGNATURE</span>
                <strong>On-chain handle</strong>
              </div>
              <span className="oracle-command-mobile__card-icon"><Wallet size={16} /></span>
            </div>
            <div className="oracle-command-mobile__handle">0x8A4C…19F2</div>
            <span className="oracle-command-mobile__stable"><i /> STABLE / SYNCED</span>
          </article>

          <article className="oracle-command-mobile__card">
            <div className="oracle-command-mobile__card-head">
              <div>
                <span className="oracle-command-mobile__kicker">RECENT READOUTS</span>
                <strong>Saved signals</strong>
              </div>
              <button
                className="oracle-command-mobile__open"
                type="button"
                aria-label="Toggle all saved signals"
                onClick={() => setArchiveOpen((open) => !open)}
              >
                <ChevronDown size={17} style={{ transform: archiveOpen ? "rotate(180deg)" : undefined }} />
              </button>
            </div>
            <div className="oracle-command-mobile__readouts">
              {readouts.slice(0, archiveOpen ? 3 : 2).map(({ title, detail, icon: Icon }) => (
                <div className="oracle-command-mobile__readout" key={title}>
                  <button
                    className="oracle-command-mobile__readout-button"
                    type="button"
                    onClick={() => showNotice(`${title} opened in read-only mode`)}
                  >
                    <Icon size={15} />
                    <span><strong>{title}</strong><small>{detail}</small></span>
                  </button>
                  <ChevronRight size={14} />
                </div>
              ))}
            </div>
          </article>
        </div>

        <section className="oracle-command-mobile__evidence" aria-label="Session evidence">
          <div className="oracle-command-mobile__evidence-head">
            <div>
              <span className="oracle-command-mobile__kicker">SESSION EVIDENCE</span>
              <strong>Quiet telemetry</strong>
            </div>
            <button type="button" onClick={() => showNotice("Telemetry is already current")}>
              LIVE <ChevronRight size={13} />
            </button>
          </div>
          <div className="oracle-command-mobile__metrics">
            <Metric label="CONNECTION" value="OPEN" detail="Gemini live" />
            <Metric label="TURN RHYTHM" value="12" detail="exchanges" />
            <Metric label="ARCHIVE" value="03" detail="readouts" />
          </div>
        </section>

        <button className="oracle-command-mobile__return" type="button" onClick={handleReturn}>
          <span className="oracle-command-mobile__return-copy">
            <strong>{returning ? "Finding the alley…" : "The alley is one tap away."}</strong>
            <small>close tools · preserve this live session</small>
          </span>
          <ArrowLeft size={19} />
        </button>
      </section>

      <footer className="oracle-command-mobile__footer">
        <span>◈ SURROGATE:ORACLE / COMMAND CENTER</span>
        <span>THE CASCADE IS LISTENING</span>
      </footer>

      {notice && <div className="oracle-command-mobile__toast" role="status">{notice}</div>}
    </main>
  );
}

export default CommandCenterMobile;