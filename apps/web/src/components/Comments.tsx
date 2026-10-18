import { Button, Text, Textarea, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { CheckmarkCircle20Regular, Delete20Regular } from "@fluentui/react-icons";
import { useState } from "react";
import { useEditor } from "../store.js";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS, marginTop: tokens.spacingVerticalM },
  item: { padding: "6px 8px", borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2, display: "flex", flexDirection: "column", gap: "2px" },
  reply: { marginLeft: "16px" },
  resolved: { opacity: 0.55 },
  head: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
  who: { flexGrow: 1, color: tokens.colorNeutralForeground3 },
  text: { whiteSpace: "pre-wrap" },
});

/** Comments on an element or a step (FR-SHARE-03). */
export function Comments({ kind, id }: { kind: "element" | "step"; id: string }) {
  const styles = useStyles();
  const all = useEditor((s) => s.scene.comments);
  const comments = all.filter((c) => c.target.kind === kind && c.target.id === id);
  const [draft, setDraft] = useState("");
  const apply = (label: string, ops: unknown[]) => useEditor.getState().apply({ label, ops: ops as never });
  const add = (replyTo?: string) => {
    const text = draft.trim();
    if (!text) return;
    apply("Add comment", [{ op: "comment.add", target: { kind, id }, text, author: "You", at: new Date().toISOString(), ...(replyTo ? { replyTo } : {}) }]);
    setDraft("");
  };
  const roots = comments.filter((c) => !c.replyTo);
  const open = roots.find((c) => !c.resolved);
  return (
    <div className={styles.root} aria-label="Comments" role="group">
      <Text size={200} weight="semibold">
        Comments{comments.length ? ` (${comments.length})` : ""}
      </Text>
      {roots.flatMap((c) => [c, ...comments.filter((r) => r.replyTo === c.id)]).map((c) => (
        <div key={c.id} className={mergeClasses(styles.item, c.replyTo && styles.reply, (c.resolved || roots.find((r) => r.id === c.replyTo)?.resolved) && styles.resolved)} role="article" aria-label={`Comment by ${c.author}`}>
          <div className={styles.head}>
            <Text size={100} className={styles.who}>
              {c.author}
              {c.resolved ? " · resolved" : ""}
            </Text>
            {!c.replyTo && (
              <Button size="small" appearance="subtle" icon={<CheckmarkCircle20Regular />} aria-label={c.resolved ? "Open again" : "Resolve"} onClick={() => apply(c.resolved ? "Open comment" : "Resolve comment", [{ op: "comment.update", id: c.id, set: { resolved: !c.resolved } }])} />
            )}
            <Button size="small" appearance="subtle" icon={<Delete20Regular />} aria-label="Delete comment" onClick={() => apply("Delete comment", [{ op: "comment.remove", id: c.id }])} />
          </div>
          <Text size={200} className={styles.text}>
            {c.text}
          </Text>
        </div>
      ))}
      <Textarea size="small" value={draft} placeholder={open ? "Answer, or write a new comment" : "Write a comment"} aria-label="New comment" onChange={(_, d) => setDraft(d.value)} resize="vertical" />
      <div style={{ display: "flex", gap: 6 }}>
        <Button size="small" appearance="primary" disabled={!draft.trim()} onClick={() => add()}>
          Comment
        </Button>
        {open && (
          <Button size="small" disabled={!draft.trim()} onClick={() => add(open.id)}>
            Answer
          </Button>
        )}
      </div>
    </div>
  );
}
