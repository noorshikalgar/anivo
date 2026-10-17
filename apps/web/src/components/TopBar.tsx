import { Button, Text, Toolbar, ToolbarButton, ToolbarDivider, Tooltip, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowRedo20Regular, ArrowUndo20Regular, ZoomFit20Regular } from "@fluentui/react-icons";
import { useEditor } from "../store.js";

const useStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    padding: `0 ${tokens.spacingHorizontalM}`,
    height: "48px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  brand: { fontWeight: tokens.fontWeightSemibold, letterSpacing: "0.02em" },
  title: { color: tokens.colorNeutralForeground3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  spacer: { flexGrow: 1 },
});

export function TopBar() {
  const styles = useStyles();
  const title = useEditor((s) => s.scene.meta.title);
  useEditor((s) => s.version);
  const { bus, undo, redo, fitToVideo } = useEditor.getState();

  return (
    <header className={styles.root}>
      <Text size={400} className={styles.brand}>
        Anivo
      </Text>
      <Text size={300} className={styles.title}>
        {title}
      </Text>
      <div className={styles.spacer} />
      <Toolbar aria-label="Edit" size="small">
        <Tooltip content="Undo (Ctrl+Z)" relationship="label">
          <ToolbarButton icon={<ArrowUndo20Regular />} onClick={undo} disabled={!bus.canUndo} />
        </Tooltip>
        <Tooltip content="Redo (Ctrl+Shift+Z)" relationship="label">
          <ToolbarButton icon={<ArrowRedo20Regular />} onClick={redo} disabled={!bus.canRedo} />
        </Tooltip>
        <ToolbarDivider />
        <Tooltip content="Fit video to screen (Shift+1)" relationship="label">
          <Button appearance="subtle" icon={<ZoomFit20Regular />} onClick={fitToVideo} />
        </Tooltip>
      </Toolbar>
    </header>
  );
}
