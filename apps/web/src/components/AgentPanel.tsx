import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Switch,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useState } from "react";
import { acceptAll, acceptPending, connectAgent, disconnectAgent, rejectPending, setReview } from "../agent.js";
import { useEditor } from "../store.js";

const useStyles = makeStyles({
  panel: {
    position: "absolute",
    top: "64px",
    right: "12px",
    width: "min(300px, calc(100% - 24px))",
    maxHeight: "60%",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
    zIndex: 10,
  },
  head: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS },
  list: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS, overflowY: "auto" },
  item: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS, padding: tokens.spacingVerticalXS, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  label: { flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  muted: { color: tokens.colorNeutralForeground3 },
  code: { fontFamily: tokens.fontFamilyMonospace, backgroundColor: tokens.colorNeutralBackground3, padding: "2px 6px", borderRadius: tokens.borderRadiusSmall },
});

/** Dialog: connect the editor to `anivo mcp --attach --web` with the pairing code. */
export function ConnectAgentDialog() {
  const styles = useStyles();
  const open = useEditor((s) => s.connectOpen);
  const [port, setPort] = useState("47811");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => useEditor.setState({ connectOpen: false });
  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await connectAgent(Number(port), code);
      close();
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface aria-label="Connect agent" style={{ maxWidth: 520 }}>
        <DialogBody>
          <DialogTitle>Connect an agent</DialogTitle>
          <DialogContent style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Text>
              Add the Anivo MCP server to your agent with <span className={styles.code}>anivo mcp --attach --web</span>. The server shows a pairing code (the agent can tell it to you). Type the code here.
            </Text>
            <div style={{ display: "flex", gap: 12 }}>
              <Field label="Port" size="small" style={{ width: 110 }}>
                <Input size="small" value={port} onChange={(_, d) => setPort(d.value.replace(/\D/g, ""))} />
              </Field>
              <Field label="Pairing code" size="small" style={{ flexGrow: 1 }}>
                <Input size="small" value={code} placeholder="1234-5678" onChange={(_, d) => setCode(d.value)} onKeyDown={(e) => e.key === "Enter" && void connect()} autoFocus />
              </Field>
            </div>
            <Text size={200} className={styles.muted}>
              The editor connects to this computer only (127.0.0.1). The browser can ask for permission to use the local network: allow it. Agent changes wait for your review until you turn review off.
            </Text>
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>Cancel</Button>
            <Button appearance="primary" disabled={busy || !/^\d{4}-\d{4}$/.test(code.trim()) || !port} onClick={() => void connect()}>
              {busy ? "Connecting…" : "Connect"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** Agent status and the review queue (FR-AGENT-09). */
export function AgentPanel() {
  const styles = useStyles();
  const agent = useEditor((s) => s.agent);
  if (!agent || agent.status !== "connected") return null;
  return (
    <div className={styles.panel} role="region" aria-label="Agent">
      <div className={styles.head}>
        <Badge color="success" shape="circular" size="small" />
        <Text weight="semibold" style={{ flexGrow: 1 }}>
          Agent connected
        </Text>
        <Button size="small" appearance="subtle" onClick={disconnectAgent}>
          Disconnect
        </Button>
      </div>
      <Switch label="Review agent changes" checked={agent.review} onChange={(_, d) => setReview(d.checked)} />
      {agent.review &&
        (agent.pending.length === 0 ? (
          <Text size={200} className={styles.muted}>
            No changes wait for review.
          </Text>
        ) : (
          <>
            <div className={styles.list} aria-label="Pending agent changes">
              {agent.pending.map((p) => (
                <div key={p.id} className={styles.item}>
                  <Text size={200} className={styles.label} title={p.label}>
                    {p.label}
                  </Text>
                  <Button size="small" appearance="primary" onClick={() => acceptPending(p.id)} aria-label={`Accept ${p.label}`}>
                    Accept
                  </Button>
                  <Button size="small" onClick={() => rejectPending(p.id)} aria-label={`Reject ${p.label}`}>
                    Reject
                  </Button>
                </div>
              ))}
            </div>
            <Button size="small" onClick={acceptAll}>
              Accept all ({agent.pending.length})
            </Button>
          </>
        ))}
    </div>
  );
}
