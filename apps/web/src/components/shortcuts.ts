import { useEffect } from "react";
import { addStep, copySelection, deleteSelection, duplicateSelection, groupSelection, nudgeSelection, pasteFromClipboard, selectAll, toggleHideSelection, toggleLockSelection, ungroupSelection } from "../commands.js";
import { cueAtPlayhead } from "../audio.js";
import { cancelRecording, nextStep } from "../record.js";
import { openFile, saveFile, saveFileAs } from "../files.js";
import { notify, withErrors } from "../notify.js";
import { type Tool, useEditor } from "../store.js";

const TOOL_KEYS: Record<string, Tool> = { v: "select", h: "hand", r: "rectangle", o: "ellipse", d: "diamond", a: "arrow", t: "text", i: "icon", c: "code" };

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

/** Global keyboard shortcuts (FR-UX-01). */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const st = useEditor.getState();
      if (st.presenting) return;
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
      if (mod && e.key.toLowerCase() === "k") {
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
      } else if (mod && e.key.toLowerCase() === "c") {
        void copySelection();
      } else if (mod && e.key.toLowerCase() === "x") {
        void copySelection(true);
      } else if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        void pasteFromClipboard();
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
      } else if (!mod && !e.altKey && e.key.toLowerCase() === "m" && st.playing) {
        // M during play: a cue for the next step at the playhead (docs/08).
        const id = cueAtPlayhead();
        if (id) notify(`Cue set for step '${id}'`, "info");
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
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
