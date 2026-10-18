/**
 * Speaker notes in a second window (FR-PLAY-03). Present mode shows the video on
 * one screen; this window shows the notes, the script line, the next step, and a timer.
 * The window is a blank page of the same origin, so the editor writes its content directly.
 */
export interface NotesView {
  stepLabel: string;
  title: string;
  notes: string;
  script: string;
  next: string;
}

export interface NotesWindow {
  update(v: NotesView): void;
  close(): void;
  readonly closed: boolean;
}

const CSS = `
body { margin: 0; padding: 24px; background: #0f1720; color: #e6edf3; font: 16px/1.5 system-ui, sans-serif; display: flex; flex-direction: column; gap: 16px; height: 100vh; box-sizing: border-box; }
header { display: flex; justify-content: space-between; align-items: baseline; color: #8b98a5; }
#timer { font-variant-numeric: tabular-nums; font-size: 28px; color: #e6edf3; }
h1 { margin: 0; font-size: 28px; }
#notes { flex: 1; overflow: auto; font-size: 24px; white-space: pre-wrap; }
#script { color: #f5b84a; font-size: 20px; white-space: pre-wrap; }
#next { color: #8b98a5; }
nav { display: flex; gap: 8px; }
button { font: inherit; padding: 8px 16px; border-radius: 8px; border: 1px solid #5b6b7a; background: #1b2631; color: inherit; cursor: pointer; }
`;

/** Open the notes window. Returns null if the browser blocked the window. */
export function openNotesWindow(onNext: () => void, onPrev: () => void): NotesWindow | null {
  const w = window.open("", "anivo-notes", "popup,width=720,height=540");
  if (!w) return null;
  const d = w.document;
  d.title = "Anivo speaker notes";
  d.head.innerHTML = `<meta charset="utf-8"><style>${CSS}</style>`;
  d.body.innerHTML = `<header><span id="step"></span><span id="timer">0:00</span></header>
    <h1 id="title"></h1><div id="script"></div><div id="notes"></div><div id="next"></div>
    <nav><button id="prev">← Back</button><button id="nextBtn">Next →</button></nav>`;
  const $ = (id: string) => d.getElementById(id)!;
  $("prev").addEventListener("click", onPrev);
  $("nextBtn").addEventListener("click", onNext);
  d.addEventListener("keydown", (e) => {
    if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) {
      e.preventDefault();
      onNext();
    } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) {
      e.preventDefault();
      onPrev();
    }
  });
  const start = Date.now();
  const timer = w.setInterval(() => {
    const s = Math.floor((Date.now() - start) / 1000);
    $("timer").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, 500);
  return {
    update(v) {
      if (w.closed) return;
      $("step").textContent = v.stepLabel;
      $("title").textContent = v.title;
      $("script").textContent = v.script;
      $("notes").textContent = v.notes || "No notes for this step.";
      $("next").textContent = v.next ? `Next: ${v.next}` : "This is the last step.";
    },
    close() {
      w.clearInterval(timer);
      if (!w.closed) w.close();
    },
    get closed() {
      return w.closed;
    },
  };
}
