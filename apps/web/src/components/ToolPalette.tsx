import { Toolbar, ToolbarButton, ToolbarDivider, ToolbarRadioButton, ToolbarRadioGroup, Tooltip, makeStyles, tokens } from "@fluentui/react-components";
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

const useStyles = makeStyles({
  root: {
    position: "absolute",
    top: tokens.spacingVerticalM,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 2,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow8,
    padding: "2px",
    maxWidth: "calc(100% - 16px)",
    overflowX: "auto",
    scrollbarWidth: "none",
  },
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
    <Toolbar className={styles.root} aria-label="Tools" checkedValues={{ tool: [tool] }} onCheckedValueChange={(_, d) => setTool(d.checkedItems[0] as Tool)}>
      <ToolbarRadioGroup>
        {TOOLS.map((t) => (
          <Tooltip key={t.tool} content={`${t.label} (${t.key})`} relationship="label" positioning="below">
            <ToolbarRadioButton name="tool" value={t.tool} icon={t.icon} appearance="subtle" />
          </Tooltip>
        ))}
      </ToolbarRadioGroup>
      <ToolbarDivider />
      <Tooltip content="Insert table" relationship="label" positioning="below">
        <ToolbarButton icon={<Table20Regular />} appearance="subtle" aria-label="Insert table" onClick={() => insertTable()} />
      </Tooltip>
      <Tooltip content="Insert image" relationship="label" positioning="below">
        <ToolbarButton icon={<Image20Regular />} appearance="subtle" aria-label="Insert image" onClick={() => void withErrors(pickImage)} />
      </Tooltip>
    </Toolbar>
  );
}
