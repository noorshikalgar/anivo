/**
 * The bullet list build (docs/16 section 4): a title, then each point types
 * in at the center and moves up under the title. One click makes the
 * elements, the steps, and the actions.
 */
import { bulletListBuild } from "@anivo/ops";
import { Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Input, Textarea } from "@fluentui/react-components";
import { useState } from "react";
import { notify } from "../notify.js";
import { useEditor } from "../store.js";
import { Btn, Check, Note, Prop } from "./ui.js";

export function BuildDialog() {
  const open = useEditor((s) => s.buildOpen);
  const [title, setTitle] = useState("Why caching helps");
  const [points, setPoints] = useState("Reads are faster\nThe database has less load\nUsers wait less");
  const [emptyFirst, setEmptyFirst] = useState(true);
  const close = () => useEditor.setState({ buildOpen: false });
  const list = points.split("\n").map((p) => p.trim()).filter(Boolean);
  const make = () => {
    const st = useEditor.getState();
    const before = st.scene.steps.length;
    const r = st.apply({ label: "Bullet list build", ops: bulletListBuild(st.scene, { title: title.trim() || "Title", points: list, emptyFirst }) });
    if (!r.ok) return notify(r.error.message, "error");
    close();
    const steps = useEditor.getState().scene.steps;
    useEditor.getState().selectStep(steps[Math.min(before + (emptyFirst ? 1 : 0), steps.length - 1)]!.id);
    notify(`Made ${steps.length - before} steps. Press Space to play.`, "success");
  };
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface aria-label="Bullet list build" style={{ maxWidth: "520px" }}>
        <DialogBody>
          <DialogTitle>Bullet list build</DialogTitle>
          <DialogContent style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Note>The title types in. Then each point types in at the center, and in the next step it moves up under the title.</Note>
            <Prop label="Title">
              <Input style={{ width: "100%" }} aria-label="Build title" value={title} onChange={(_, d) => setTitle(d.value)} onKeyDown={(e) => e.stopPropagation()} />
            </Prop>
            <Prop label="Points" top>
              <Textarea style={{ width: "100%" }} rows={6} aria-label="Build points, one for each line" value={points} onChange={(_, d) => setPoints(d.value)} onKeyDown={(e) => e.stopPropagation()} />
            </Prop>
            <Prop label="">
              <Check label="Start with an empty step" checked={emptyFirst} onChange={setEmptyFirst} />
            </Prop>
            <Note>{`${list.length} points: ${1 + list.length * 2 + (emptyFirst ? 1 : 0)} steps. You can change each element and step after.`}</Note>
          </DialogContent>
          <DialogActions>
            <Btn onClick={close}>Cancel</Btn>
            <Btn primary disabled={list.length === 0} onClick={make}>
              Make the steps
            </Btn>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
