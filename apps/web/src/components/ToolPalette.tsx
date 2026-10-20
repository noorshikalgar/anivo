import { Toolbar, ToolbarButton, ToolbarDivider, ToolbarRadioButton, ToolbarRadioGroup, Tooltip, makeStyles } from "@fluentui/react-components";
import {
  ArrowRight20Regular,
  Circle20Regular,
  Code20Regular,
  Cursor20Regular,
  Diamond20Regular,
  HandLeft20Regular,
  Icons20Regular,
  Image20Regular,
  RectangleLandscape20Regular,
  Table20Regular,
  TextT20Regular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { insertTable } from "../commands.js";
import { pickImage } from "../images.js";
import { withErrors } from "../notify.js";
import { type Tool, useEditor } from "../store.js";
import { WidgetsGallery } from "./WidgetsGallery.js";

const useStyles = makeStyles({
  // The toolbar of the viewport (docs/15): a column of tools on the left, as in Blender.
  root: {
    position: "absolute",
    top: "8px",
    left: "8px",
    zIndex: 2,
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "3px",
    borderRadius: "6px",
    backgroundColor: "color-mix(in srgb, var(--ui-header) 92%, transparent)",
    boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
    maxHeight: "calc(100% - 16px)",
    overflowY: "auto",
    scrollbarWidth: "none",
  },
  btn: {
    width: "30px",
    height: "30px",
    minWidth: "30px",
    borderRadius: "4px",
    color: "var(--ui-text)",
    "[aria-checked='true'], [aria-pressed='true']": { backgroundColor: "var(--ui-select)", color: "#fff" },
    "&[aria-checked='true'] .fui-Button__icon": { color: "#fff" },
    ":hover": { backgroundColor: "var(--ui-hover)" },
  },
  divider: { height: "1px", width: "auto", margin: "3px 2px", backgroundColor: "var(--ui-line)", minHeight: "1px" },
});

export const TOOLS: { tool: Tool; label: string; key: string; icon: ReactElement }[] = [
  { tool: "select", label: "Select", key: "V", icon: <Cursor20Regular /> },
  { tool: "hand", label: "Hand", key: "H", icon: <HandLeft20Regular /> },
  { tool: "rectangle", label: "Rectangle", key: "R", icon: <RectangleLandscape20Regular /> },
  { tool: "ellipse", label: "Ellipse", key: "O", icon: <Circle20Regular /> },
  { tool: "diamond", label: "Diamond", key: "D", icon: <Diamond20Regular /> },
  { tool: "arrow", label: "Arrow", key: "A", icon: <ArrowRight20Regular /> },
  { tool: "text", label: "Text", key: "T", icon: <TextT20Regular /> },
  { tool: "icon", label: "Icon", key: "I", icon: <Icons20Regular /> },
  { tool: "code", label: "Code block", key: "C", icon: <Code20Regular /> },
];

export function ToolPalette() {
  const styles = useStyles();
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  return (
    <Toolbar vertical className={styles.root} aria-label="Tools" checkedValues={{ tool: [tool] }} onCheckedValueChange={(_, d) => setTool(d.checkedItems[0] as Tool)}>
      <ToolbarRadioGroup style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {TOOLS.map((t, i) => (
          <span key={t.tool} style={{ display: "contents" }}>
            {(i === 2 || i === 6) && <ToolbarDivider className={styles.divider} />}
            <Tooltip content={`${t.label} (${t.key})`} relationship="label" positioning="after">
              <ToolbarRadioButton className={styles.btn} name="tool" value={t.tool} icon={t.icon} appearance="subtle" />
            </Tooltip>
          </span>
        ))}
      </ToolbarRadioGroup>
      <ToolbarDivider className={styles.divider} />
      <Tooltip content="Insert table" relationship="label" positioning="after">
        <ToolbarButton className={styles.btn} icon={<Table20Regular />} appearance="subtle" aria-label="Insert table" onClick={() => insertTable()} />
      </Tooltip>
      <Tooltip content="Insert image" relationship="label" positioning="after">
        <ToolbarButton className={styles.btn} icon={<Image20Regular />} appearance="subtle" aria-label="Insert image" onClick={() => void withErrors(pickImage)} />
      </Tooltip>
      <WidgetsGallery />
    </Toolbar>
  );
}
