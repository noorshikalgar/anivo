import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Input, MessageBar, MessageBarBody, Spinner, Text } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { notify } from "../notify.js";
import { createShareLink } from "../share.js";
import { useEditor } from "../store.js";

/** Make a share link (FR-SHARE-01). */
export function ShareDialog() {
  const open = useEditor((s) => s.shareOpen);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setLink(null);
    setError(null);
    createShareLink().then(setLink, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [open]);
  const close = () => useEditor.setState({ shareOpen: false });
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface aria-label="Share link" style={{ maxWidth: 560 }}>
        <DialogBody>
          <DialogTitle>Share link</DialogTitle>
          <DialogContent style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {!link && !error && <Spinner size="small" label="Encrypting and uploading…" />}
            {link && (
              <>
                <Input readOnly value={link} aria-label="Link" onFocus={(e) => e.target.select()} />
                <Text size={200}>Anyone with this link can open a copy of the scene. The server keeps only encrypted data; the key is the part after "#", and it never goes to the server.</Text>
              </>
            )}
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>Close</Button>
            <Button appearance="primary" disabled={!link} onClick={() => void navigator.clipboard.writeText(link!).then(() => notify("Link copied", "success"), () => notify("Copy the link from the box.", "info"))}>
              Copy link
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
