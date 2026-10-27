/** Landing intro: Dixi speaks (a waveform), the voice flattens into a line, "DIXI" rises out of it, then the black
 *  curtain splits open along that line and the hero rises in. CSS only (globals.css), so it plays from first paint,
 *  before any JS. pointer-events: none, so it never blocks the page; skipped under reduced motion. */
const BARS = [0.3, 0.55, 0.85, 0.5, 1, 0.65, 0.9, 0.45, 0.7, 0.35, 0.25];

export function Intro() {
  return (
    <div aria-hidden="true" className="intro">
      <div className="intro-curtain intro-top">
        <p className="intro-word">
          {[...'DIXI'].map((c, i) => (
            <span key={i} style={{ animationDelay: `${0.9 + i * 0.07}s` }}>
              {c}
            </span>
          ))}
        </p>
      </div>
      <div className="intro-curtain intro-bottom">
        <p className="intro-sub">
          <span>I have spoken</span>
        </p>
      </div>
      <div className="intro-wave">
        {BARS.map((h, i) => (
          <span key={i} style={{ height: `${h * 100}%`, animationDelay: `${-i * 0.11}s` }} />
        ))}
      </div>
      <span className="intro-line" />
    </div>
  );
}
