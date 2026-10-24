import { copyLook, pasteLook } from "../styles.js";
import { useEffect } from "react";
import { addStep, copySelection, deleteKeysAtPlayhead, insertKeysAtPlayhead, deleteSelection, duplicateSelection, groupSelection, nudgeSelection, pasteFromClipboard, selectAll, toggleHideSelection, toggleLockSelection, ungroupSelection } from "../commands.js";
import { cueAtPlayhead } from "../audio.js";
import { pasteImage } from "../images.js";
import { cancelRecording, nextStep } from "../record.js";
import { openFile, saveFile, saveFileAs } from "../files.js";
import { notify, withErrors } from "../notify.js";
import { type Tool, useEditor } from "../store.js";

const TOOL_KEYS: Record<string, Tool> = { v: "select", h: "hand", r: "rectangle", o: "ellipse", d: "diamond", a: "arrow", t: "text", i: "icon", c: "code", p: "path" };

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

let pasteFallback = 0;
/** The time of the last Ctrl+Alt+V (paste style), to ignore the paste event that can follow it. */
let pasteStyleAt = -1e9;

/** Global keyboard shortcuts (FR-UX-01). */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const st = useEditor.getState();
      if (st.presenting || st.screen !== "editor") return;
      if (st.recording) {
        // While a record runs, only these keys work.
        if (e.key.toLowerCase() === "m" || e.key === "ArrowRight") {
          e.preventDefault();
          nextStep();
        } else if (e.key === "Escape") cancelRecording();
        return;
      }
      if (e.key === "F5") {
        e.preventDefault();
        st.pause();
        useEditor.setState({ presenting: true });
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === "Space") {
        e.preventDefault();
        useEditor.setState({ maximized: !st.maximized });
        return;
      }
      if ((mod && e.key.toLowerCase() === "k") || e.key === "F3") {
        e.preventDefault();
        useEditor.setState({ paletteOpen: true });
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void withErrors(async () => (await (e.shiftKey ? saveFileAs() : saveFile())) && notify("Saved", "success"));
      } else if (mod && e.key.toLowerCase() === "e") {
        e.preventDefault();
        useEditor.setState({ exportOpen: true });
      } else if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void withErrors(openFile);
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        toggleLockSelection();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        toggleHideSelection();
      } else if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) ungroupSelection();
        else groupSelection();
      } else if (mod && e.altKey && (e.code === "KeyC" || e.key.toLowerCase() === "c")) {
        e.preventDefault();
        copyLook();
      } else if (mod && e.altKey && (e.code === "KeyV" || e.key.toLowerCase() === "v")) {
        e.preventDefault();
        // Some browsers send a paste event even so: ignore it.
        pasteStyleAt = e.timeStamp;
        pasteLook();
      } else if (mod && e.key.toLowerCase() === "c") {
        void copySelection();
      } else if (mod && e.key.toLowerCase() === "x") {
        void copySelection(true);
      } else if (mod && e.key.toLowerCase() === "v") {
        // The browser sends a paste event next. If it does not (no clipboard access), paste the copy from this page.
        pasteFallback = window.setTimeout(() => void pasteFromClipboard(), 80);
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelection();
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === "Escape") {
        st.setSelection([]);
        st.setTool("select");
      } else if (e.key === "?") {
        e.preventDefault();
        useEditor.setState({ helpOpen: true });
      } else if (!mod && !e.altKey && e.key.toLowerCase() === "m" && st.playing) {
        // M during play: a cue for the next step at the playhead (docs/08).
        const id = cueAtPlayhead();
        if (id) notify(`Cue set for step '${id}'`, "info");
      } else if (!mod && e.code === "KeyI" && st.selection.length > 0 && st.selectedStep !== null) {
        // I: a key at the playhead (Shift: all properties). Alt+I: delete the keys at the playhead.
        e.preventDefault();
        if (e.altKey) {
          const n = deleteKeysAtPlayhead();
          notify(n ? `Deleted ${n} key${n > 1 ? "s" : ""} at the playhead` : "No keys at the playhead", "info");
        } else {
          const n = insertKeysAtPlayhead(e.shiftKey);
          notify(n ? `${e.shiftKey ? "Keys" : "Position key"} at the playhead for ${n} element${n > 1 ? "s" : ""}` : "Move the playhead into a step to add keys", "info");
        }
      } else if (!mod && !e.altKey && e.key.toLowerCase() === "k") {
        const on = !st.autoKey;
        useEditor.setState({ autoKey: on, ...(on ? { timelineOpen: true } : {}) });
        notify(on ? "Recording: changes make keyframes at the playhead" : "Recording is off: changes set the element in all steps", "info");
      } else if (!mod && (e.key === "PageDown" || e.key === "PageUp")) {
        // The next or the previous step (Base is before step 1).
        e.preventDefault();
        const ids = st.scene.steps.map((x) => x.id);
        const i = st.selectedStep === null ? -1 : ids.indexOf(st.selectedStep);
        const j = Math.max(-1, Math.min(ids.length - 1, i + (e.key === "PageDown" ? 1 : -1)));
        st.selectStep(j < 0 ? null : ids[j]!);
      } else if (!mod && !e.altKey && (e.key.toLowerCase() === "j" || e.key.toLowerCase() === "l")) {
        // Shuttle (docs/22 D3): L plays forward, J backward; press again for 2×, 4×, 8×. Space stops.
        const dir = e.key.toLowerCase() === "l" ? 1 : -1;
        const r = st.playing && Math.sign(st.rate) === dir ? Math.min(8, Math.abs(st.rate) * 2) * dir : dir;
        st.play(r);
      } else if (!mod && (e.key === "," || e.key === "." || e.key === "<" || e.key === ">")) {
        // One frame back or forward (Shift: ten frames).
        e.preventDefault();
        const frame = 1000 / st.scene.settings.video.fps;
        const dir = e.key === "," || e.key === "<" ? -1 : 1;
        st.pause();
        useEditor.setState({ playhead: Math.max(0, Math.min(st.timeline.totalMs, Math.round((st.playhead + dir * frame * (e.shiftKey ? 10 : 1)) * 1000) / 1000)), pinStepEnd: false });
      } else if (!mod && !e.altKey && e.key.toLowerCase() === "n") {
        addStep();
      } else if (!mod && !e.altKey && TOOL_KEYS[e.key.toLowerCase()]) {
        st.setTool(TOOL_KEYS[e.key.toLowerCase()]!);
      } else if (e.key === "Enter" && st.selection.length === 1 && st.scene.elements[st.selection[0]!]?.type !== "connector") {
        e.preventDefault();
        st.setEditingText(st.selection[0]!);
      } else if (e.key.startsWith("Arrow") && st.selection.length > 0) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
        const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
        nudgeSelection(dx, dy);
      } else if (e.shiftKey && e.code === "Digit1") {
        st.fitToVideo();
      } else if (e.code === "Space" && !e.repeat && e.target === document.body) {
        // Space alone plays or pauses. Space with a drag pans (see CanvasView).
        e.preventDefault();
        let panned = false;
        const down = () => (panned = true);
        const up = (u: KeyboardEvent) => {
          if (u.code !== "Space") return;
          window.removeEventListener("keyup", up);
          window.removeEventListener("pointerdown", down);
          if (panned) return;
          if (useEditor.getState().playing) st.pause();
          else st.play();
        };
        window.addEventListener("pointerdown", down);
        window.addEventListener("keyup", up);
      }
    };
    window.addEventListener("keydown", onKey);
    // Ctrl+V: the browser sends a paste event with the clipboard data.
    const onPaste = (e: ClipboardEvent) => {
      clearTimeout(pasteFallback);
      if (isTyping(e.target) || useEditor.getState().presenting) return;
      if (e.timeStamp - pasteStyleAt < 300) return void e.preventDefault();
      e.preventDefault();
      const data = e.clipboardData;
      void withErrors(async () => {
        if (!(await pasteImage(data))) await pasteFromClipboard(data?.getData("text/plain"));
      });
    };
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, []);
}
