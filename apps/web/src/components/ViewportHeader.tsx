/**
 * The header of the viewport (docs/15): the View menu, the place in the
 * video, the overlay toggle, and the zoom.
 */
import { Menu, MenuDivider, MenuItem, MenuItemCheckbox, MenuList, MenuPopover, MenuTrigger, makeStyles } from "@fluentui/react-components";
import { Eye16Regular, EyeOff16Regular, ZoomFit16Regular } from "@fluentui/react-icons";
import { useEditor } from "../store.js";
import { formatTime } from "./PlaybackBar.js";
import { IconButton, MenuButtonSmall } from "./ui.js";

const useStyles = makeStyles({
  root: { display: "flex", alignItems: "center", gap: "4px", height: "26px", padding: "0 4px 0 6px", backgroundColor: "var(--ui-header)", color: "var(--ui-text)", fontSize: "12px", borderBottom: "1px solid var(--ui-line)", minWidth: 0 },
  menu: { height: "22px", padding: "0 8px", border: "none", borderRadius: "4px", background: "none", color: "var(--ui-text)", font: "inherit", fontSize: "12px", cursor: "pointer", ":hover": { backgroundColor: "var(--ui-hover)" } },
  where: { flexGrow: 1, minWidth: 0, color: "var(--ui-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingLeft: "6px" },
  whereName: { color: "var(--ui-text)" },
  zoom: { minWidth: "44px", height: "22px", padding: "0 6px", border: "none", borderRadius: "4px", backgroundColor: "var(--ui-widget)", color: "var(--ui-text)", font: "inherit", fontSize: "11px", fontVariantNumeric: "tabular-nums", cursor: "pointer", ":hover": { backgroundColor: "var(--ui-widget-hover)" } },
});

export function ViewportHeader() {
  const s = useStyles();
  const zoom = useEditor((st) => st.view.zoom);
  const ghosts = useEditor((st) => st.showGhosts);
  const playhead = useEditor((st) => st.playhead);
  const selected = useEditor((st) => st.selectedStep);
  const steps = useEditor((st) => st.scene.steps);
  const timelineOpen = useEditor((st) => st.timelineOpen);
  const index = steps.findIndex((x) => x.id === selected);
  const { fitToVideo, viewport, zoomAt } = useEditor.getState();
  const zoomTo = (z: number) => zoomAt(z / useEditor.getState().view.zoom, viewport.width / 2, viewport.height / 2);
  return (
    <div className={s.root} role="toolbar" aria-label="Viewport">
      <Menu checkedValues={{ view: [...(ghosts ? ["ghosts"] : []), ...(timelineOpen ? ["timeline"] : [])] }} onCheckedValueChange={(_, d) => useEditor.setState({ showGhosts: d.checkedItems.includes("ghosts"), timelineOpen: d.checkedItems.includes("timeline") })}>
        <MenuTrigger disableButtonEnhancement>
          <MenuButtonSmall className={s.menu}>View</MenuButtonSmall>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            <MenuItem secondaryContent="Shift+1" onClick={fitToVideo}>
              Fit the video
            </MenuItem>
            <MenuItem onClick={() => zoomTo(1)}>Zoom 100%</MenuItem>
            <MenuItem onClick={() => zoomTo(zoom * 1.25)}>Zoom in</MenuItem>
            <MenuItem onClick={() => zoomTo(zoom / 1.25)}>Zoom out</MenuItem>
            <MenuDivider />
            <MenuItemCheckbox name="view" value="ghosts">
              Show hidden elements (faint)
            </MenuItemCheckbox>
            <MenuItemCheckbox name="view" value="timeline">
              Timeline
            </MenuItemCheckbox>
            <MenuDivider />
            <MenuItem secondaryContent="Ctrl+Space" onClick={() => useEditor.setState((st) => ({ maximized: !st.maximized }))}>
              Maximize the viewport
            </MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>
      <div className={s.where}>
        {selected === null ? <span className={s.whereName}>Base</span> : <span className={s.whereName}>{`Step ${index + 1} · ${steps[index]?.title ?? ""}`}</span>}
        {" · "}
        {formatTime(playhead)}
      </div>
      <IconButton label={ghosts ? "Hide the faint elements that are not visible now" : "Show the elements that are not visible now (faint)"} pressed={ghosts} icon={<Eye16Regular />} offIcon={<EyeOff16Regular />} onClick={() => useEditor.setState({ showGhosts: !ghosts })} />
      <IconButton label="Fit the video (Shift+1)" icon={<ZoomFit16Regular />} onClick={fitToVideo} />
      <button type="button" className={s.zoom} title="Zoom. Click to fit the video." onClick={fitToVideo}>
        {Math.round(zoom * 100)}%
      </button>
    </div>
  );
}
