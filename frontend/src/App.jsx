import { useState, useEffect, useMemo } from "react";
import "./App.css";
import { profile, techStack, scripts } from "./scripts";

// ── Lightweight, dependency-free syntax highlighter ──
const KEYWORDS = {
  bash: ["if", "then", "else", "elif", "fi", "for", "while", "do", "done",
    "case", "esac", "function", "return", "exit", "set", "local", "export",
    "echo", "cd", "mkdir", "rm", "cp", "mv", "tee", "date"],
  python: ["import", "from", "def", "class", "return", "if", "elif", "else",
    "for", "while", "try", "except", "finally", "with", "as", "in", "is", "not",
    "and", "or", "None", "True", "False", "print", "lambda", "raise", "pass"],
  yaml: [],
};

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function applyKeywords(escaped, words) {
  if (!words || !words.length) return escaped;
  const re = new RegExp("\\b(" + words.join("|") + ")\\b", "g");
  return escaped.replace(re, '<span class="t-kw">$1</span>');
}

function highlightLine(line, lang) {
  const words = KEYWORDS[lang] || [];
  const commentTok =
    lang === "python" || lang === "bash" || lang === "yaml" ? "#.*$" : "\\/\\/.*$";
  const master = new RegExp(
    "(" + commentTok + ")|(\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*')|(\\b\\d+(?:\\.\\d+)?\\b)",
    "g"
  );
  let out = "";
  let last = 0;
  let m;
  while ((m = master.exec(line)) !== null) {
    out += applyKeywords(escapeHtml(line.slice(last, m.index)), words);
    const tok = escapeHtml(m[0]);
    if (m[1] !== undefined) out += '<span class="t-com">' + tok + "</span>";
    else if (m[2] !== undefined) out += '<span class="t-str">' + tok + "</span>";
    else out += '<span class="t-num">' + tok + "</span>";
    last = m.index + m[0].length;
    if (m.index === master.lastIndex) master.lastIndex++;
  }
  out += applyKeywords(escapeHtml(line.slice(last)), words);
  return out;
}

// ── Code viewer: window chrome, file tabs, line numbers, copy ──
function CodeViewer({ script }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const file = script.files[active];
  const lines = file.code.replace(/\n$/, "").split("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="viewer">
      <div className="viewer-bar">
        <span className="lights">
          <i className="l-red" /><i className="l-amber" /><i className="l-green" />
        </span>
        <div className="tabs">
          {script.files.map((f, i) => (
            <button
              key={f.name}
              className={"tab" + (i === active ? " tab-on" : "")}
              onClick={() => setActive(i)}
            >
              {f.name}
            </button>
          ))}
        </div>
        <button className="copy" onClick={copy}>
          {copied ? "copied ✓" : "copy"}
        </button>
      </div>
      <pre className="code">
        <code>
          {lines.map((ln, i) => (
            <span className="row" key={i}>
              <span className="gutter">{i + 1}</span>
              <span
                className="line"
                dangerouslySetInnerHTML={{ __html: highlightLine(ln, file.language) || "&nbsp;" }}
              />
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

// ── A single script as a clickable window card ──
function ScriptCard({ script, onOpen }) {
  return (
    <button className="card" onClick={() => onOpen(script)}>
      <div className="card-bar">
        <span className="lights">
          <i className="l-red" /><i className="l-amber" /><i className="l-green" />
        </span>
        <span className="card-file">{script.files[0].name}</span>
        <span className={"lang lang-" + script.language}>{script.language}</span>
      </div>
      <div className="card-body">
        <span className="cat">{script.category}</span>
        <h3>{script.name}</h3>
        <p>{script.description}</p>
        <span className="open-hint">open ↗</span>
      </div>
    </button>
  );
}

// ── Hero with a small boot/typewriter moment ──
function Hero() {
  const full = "./whoami.sh";
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [typed, setTyped] = useState(reduce ? full : "");
  const [done, setDone] = useState(reduce);

  useEffect(() => {
    if (reduce) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTyped(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(id);
        setTimeout(() => setDone(true), 250);
      }
    }, 70);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <header className="hero">
      <div className="terminal">
        <div className="viewer-bar">
          <span className="lights">
            <i className="l-red" /><i className="l-amber" /><i className="l-green" />
          </span>
          <span className="term-title">petar@devops-portfolio: ~</span>
        </div>
        <div className="term-body">
          <p className="prompt">
            <span className="user">petar@devops</span>
            <span className="path">:~$</span> {typed}
            {!done && <span className="cursor" />}
          </p>
          {done && (
            <div className="term-out">
              <h1>{profile.name}</h1>
              <p className="role">{profile.role}</p>
              <p className="tag">{profile.tagline}</p>
              <a className="ghbtn" href={profile.github} target="_blank" rel="noreferrer">
                github.com/{profile.handle} →
              </a>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("All");

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(scripts.map((s) => s.category)))],
    []
  );
  const visible = filter === "All" ? scripts : scripts.filter((s) => s.category === filter);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className="app">
      <div className="grid-bg" aria-hidden="true" />
      <Hero />

      <section className="stack">
        {techStack.map((t) => (
          <span className="chip" key={t.label}>
            <i className="dot" /> {t.icon} {t.label}
          </span>
        ))}
      </section>

      <main className="scripts">
        <div className="scripts-head">
          <h2>
            <span className="hash">#</span> scripts
            <span className="count">{scripts.length}</span>
          </h2>
          <div className="filters">
            {categories.map((c) => (
              <button
                key={c}
                className={"fchip" + (c === filter ? " fchip-on" : "")}
                onClick={() => setFilter(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="card-grid">
          {visible.map((s) => (
            <ScriptCard key={s.id} script={s} onOpen={setOpen} />
          ))}
        </div>
      </main>

      <footer className="footer">
        <span>built with React</span><i className="sep" />
        <span>deployed on Kubernetes</span><i className="sep" />
        <span>monitored with Prometheus</span>
      </footer>

      {open && (
        <div className="modal" onClick={() => setOpen(null)}>
          <div className="modal-inner" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div>
                <span className="cat">{open.category}</span>
                <h3>{open.name}</h3>
                <p className="modal-desc">{open.description}</p>
              </div>
              <button className="x" onClick={() => setOpen(null)}>esc ✕</button>
            </div>
            <CodeViewer script={open} />
            <div className="modal-foot">
              <code>{open.repoPath}</code>
              <a href={profile.github} target="_blank" rel="noreferrer">view on github →</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}