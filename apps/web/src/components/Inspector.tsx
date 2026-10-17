import { Text, makeStyles, tokens } from "@fluentui/react-components";
import { useEditor } from "../store.js";

const useStyles = makeStyles({
  root: {
    padding: tokens.spacingHorizontalM,
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  muted: { color: tokens.colorNeutralForeground3 },
});

export function Inspector() {
  const styles = useStyles();
  const selection = useEditor((s) => s.selection);
  const elements = useEditor((s) => s.scene.elements);
  const el = selection.length === 1 ? elements[selection[0]!] : undefined;

  return (
    <aside className={styles.root} aria-label="Inspector">
      <Text weight="semibold" size={200} className={styles.muted}>
        Properties
      </Text>
      {el ? (
        <>
          <Text size={400} weight="semibold">
            {el.label?.text ?? el.id}
          </Text>
          <Text size={200} className={styles.muted}>
            {el.type} · ID {el.id}
          </Text>
        </>
      ) : (
        <Text size={200} className={styles.muted}>
          {selection.length > 1 ? `${selection.length} elements selected.` : "Select an element to see its properties."}
        </Text>
      )}
    </aside>
  );
}
