/**
 * The message build (docs/17 P3): choose who sends and who gets the message.
 * Anivo finds the arrows between them. One step types the text in a bubble,
 * the next step sends the bubble along the arrows.
 */
import { findArrowPath, messageBuild } from "@anivo/ops";
import { Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Input, Textarea } from "@fluentui/react-components";
import { useEffect, useMemo, useState } from "react";
import { notify } from "../notify.js";
import { useEditor } from "../store.js";
import { SelectField } from "./fields.js";
import { Btn, Note, Prop } from "./ui.js";

const nameOf = (el: { id: string; type: string; label?: { text: string } | undefined; content?: { text: string } }) => (el.type === "text" ? el.content?.text : el.label?.text)?.split("\n")[0] || el.id;

export function MessageDialog() {
  const open = useEditor((s) => s.messageOpen);
  const elements = useEditor((s) => s.scene.elements);
  const scene = useEditor((s) => s.scene);
  const selection = useEditor((s) => s.selection);
  const nodes = useMemo(() => Object.values(elements).filter((e) => e.type !== "connector" && e.type !== "group"), [elements]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [text, setText] = useState("Hi Bob! Meet at 7?");
  const [typeCaption, setTypeCaption] = useState<string | null>(null);
  const [sendCaption, setSendCaption] = useState<string | null>(null);
  // Start from the selection: the first selected element sends, the second gets the message.
  useEffect(() => {
    if (!open) return;
    const sel = selection.filter((id) => nodes.some((n) => n.id === id));
    setFrom(sel[0] ?? nodes[0]?.id ?? "");
    setTo(sel[1] ?? nodes.find((n) => n.id !== sel[0])?.id ?? "");
    setTypeCaption(null);
    setSendCaption(null);
  }, [open]);
  const close = () => useEditor.setState({ messageOpen: false });
  const path = from && to ? findArrowPath(scene, from, to) : undefined;
  const fromName = elements[from] ? nameOf(elements[from] as never) : from;
  const toName = elements[to] ? nameOf(elements[to] as never) : to;
  const typeText = typeCaption ?? `${fromName} types a message.`;
  const sendText = sendCaption ?? `The message goes to ${toName}.`;
  const route = path ? [from, ...path.map((h) => { const c = elements[h.arrow]; return c?.type === "connector" ? ((h.reverse ? c.start : c.end).kind === "bound" ? ((h.reverse ? c.start : c.end) as { elementId: string }).elementId : "?") : "?"; })] : [];
  const options = nodes.map((n) => ({ value: n.id, text: `${nameOf(n as never)} (${n.id})` }));

  const make = () => {
    const st = useEditor.getState();
    const before = st.scene.steps.length;
    const b = messageBuild(st.scene, { from, to, text: text.trim() || "Hi", typeCaption: typeText.trim(), sendCaption: sendText.trim() });
    if ("error" in b) return notify(b.error, "error");
    const r = st.apply({ label: "Message build", ops: b.ops });
    if (!r.ok) return notify(r.error.message, "error");
    close();
    const steps = useEditor.getState().scene.steps;
    useEditor.getState().selectStep(steps[before]!.id);
    useEditor.getState().setSelection([b.id]);
    notify("Made 2 steps: the message types, then it goes along the arrows. Press Space to play.", "success");
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface aria-label="Message build" style={{ maxWidth: "520px" }}>
        <DialogBody>
          <DialogTitle>Message</DialogTitle>
          <DialogContent style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Note>The text types in a bubble at the sender. In the next step, the bubble moves along the arrows to the receiver (2.4 s on each arrow).</Note>
            <SelectField label="From" value={from} options={options} onCommit={setFrom} />
            <SelectField label="To" value={to} options={options} onCommit={setTo} />
            <Prop label="Path">
              <span style={{ color: path ? "var(--ui-text)" : "var(--colorPaletteRedForeground1, #e06c6c)", fontSize: 12 }}>{path ? route.join(" → ") : "No arrows connect them. Draw arrows first."}</span>
            </Prop>
            <Prop label="Message" top>
              <Textarea style={{ width: "100%" }} rows={2} aria-label="Message text" value={text} onChange={(_, d) => setText(d.value)} onKeyDown={(e) => e.stopPropagation()} />
            </Prop>
            <Prop label="Caption 1">
              <Input style={{ width: "100%" }} aria-label="Caption of the typing step" value={typeText} onChange={(_, d) => setTypeCaption(d.value)} onKeyDown={(e) => e.stopPropagation()} />
            </Prop>
            <Prop label="Caption 2">
              <Input style={{ width: "100%" }} aria-label="Caption of the sending step" value={sendText} onChange={(_, d) => setSendCaption(d.value)} onKeyDown={(e) => e.stopPropagation()} />
            </Prop>
          </DialogContent>
          <DialogActions>
            <Btn onClick={close}>Cancel</Btn>
            <Btn primary disabled={!path} onClick={make}>
              Make the steps
            </Btn>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
