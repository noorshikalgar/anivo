import { Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Input } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { withErrors } from "../notify.js";
import { useEditor } from "../store.js";
import { saveSelectionAsWidget } from "../widgets.js";
import { Btn } from "./ui.js";

/** Ask for a name, then save the selection as a user widget. */
export function SaveWidgetDialog() {
  const open = useEditor((s) => s.saveWidgetOpen);
  const [name, setName] = useState("");
  useEffect(() => {
    if (open) setName(useEditor.getState().selection[0] ?? "Widget");
  }, [open]);
  const close = () => useEditor.setState({ saveWidgetOpen: false });
  const save = () => {
    close();
    void withErrors(() => saveSelectionAsWidget(name));
  };
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface aria-label="Save as widget" style={{ maxWidth: "380px" }}>
        <DialogBody>
          <DialogTitle>Save as widget</DialogTitle>
          <DialogContent>
            <Input
              autoFocus
              style={{ width: "100%" }}
              aria-label="Widget name"
              value={name}
              onChange={(_, d) => setName(d.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") save();
              }}
            />
            <p style={{ fontSize: 12, color: "var(--ui-muted)", marginBottom: 0 }}>The widget is in this browser. Insert it from the Widgets button of the toolbar, in any scene.</p>
          </DialogContent>
          <DialogActions>
            <Btn onClick={close}>Cancel</Btn>
            <Btn primary onClick={save}>
              Save
            </Btn>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
