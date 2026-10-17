import { useEffect } from "react";
import { useEditor } from "../store.js";

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

/** Global keyboard shortcuts (FR-UX-01). */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const st = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
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
