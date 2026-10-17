import { makeStyles, tokens } from "@fluentui/react-components";
import { useEffect, useRef, useState } from "react";
import { currentBoxes, setElementText } from "../commands.js";
import { useEditor } from "../store.js";

const useStyles = makeStyles({
  input: {
    position: "absolute",
    zIndex: 3,
    resize: "none",
    border: `1px solid ${tokens.colorBrandStroke1}`,
    borderRadius: tokens.borderRadiusSmall,
    outline: "none",
    background: "rgba(15, 23, 32, 0.85)",
    color: "#E6EDF3",
    textAlign: "center",
    fontFamily: "Inter, sans-serif",
    lineHeight: 1.25,
    padding: "4px",
    boxSizing: "border-box",
    overflow: "hidden",
  },
});

/**
 * Inline editor for a label or a text element. Enter or a click outside saves.
 * Shift+Enter adds a new line. Escape cancels.
 */
export function TextEditor() {
  const styles = useStyles();
  const id = useEditor((s) => s.editingText);
  const el = useEditor((s) => (s.editingText ? s.scene.elements[s.editingText] : undefined));
  const view = useEditor((s) => s.view);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!el) return;
    setText(el.type === "text" ? el.content.text : (el.label?.text ?? ""));
    requestAnimationFrame(() => ref.current?.select());
  }, [id]);

  if (!id || !el) return null;
  const close = (save: boolean) => {
    if (save) setElementText(id, text);
    useEditor.getState().setEditingText(null);
  };
  const fontSize = (el.style.fontSize ?? 32) * view.zoom;
  const isIcon = el.type === "icon";
  const b = currentBoxes()(id) ?? { x: el.x, y: el.y, width: el.width, height: el.height };
  const box = isIcon ? { x: b.x - 80, y: b.y + b.height + 4, width: b.width + 160, height: 48 } : b;

  return (
    <textarea
      ref={ref}
      className={styles.input}
      aria-label="Element text"
      value={text}
      style={{
        left: (box.x - view.x) * view.zoom,
        top: (box.y - view.y) * view.zoom,
        width: Math.max(80, box.width * view.zoom),
        height: Math.max(fontSize * 1.6, box.height * view.zoom),
        fontSize,
        paddingTop: Math.max(4, (box.height * view.zoom - fontSize * 1.25) / 2),
      }}
      onChange={(e) => setText(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => close(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") close(false);
        else if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          close(true);
        }
      }}
    />
  );
}
