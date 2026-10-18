import { getIconPack, iconPacks, searchIcons } from "@anivo/render";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  SearchBox,
  Tab,
  TabList,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useMemo, useState } from "react";
import { addElement } from "../commands.js";
import { addIconPackFromFolder } from "../iconPacks.js";
import { notify, withErrors } from "../notify.js";
import { useEditor } from "../store.js";

const useStyles = makeStyles({
  surface: { maxWidth: "640px", width: "100%" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
    gap: tokens.spacingHorizontalXS,
    maxHeight: "360px",
    overflowY: "auto",
    marginTop: tokens.spacingVerticalM,
  },
  cell: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
    padding: tokens.spacingVerticalS,
    border: `1px solid transparent`,
    borderRadius: tokens.borderRadiusMedium,
    background: "transparent",
    color: tokens.colorNeutralForeground1,
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover, border: `1px solid ${tokens.colorNeutralStroke1}` },
  },
  name: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, maxWidth: "68px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
});

/** Inline SVG preview of an icon from a registered pack. */
function IconSvg({ pack, name }: { pack: string; name: string }) {
  const p = getIconPack(pack);
  const data = p?.icons[name];
  if (!data || !p) return null;
  const stroke = p.kind === "stroke";
  return (
    <svg width="28" height="28" viewBox={(data.viewBox ?? p.viewBox).join(" ")} aria-hidden="true">
      {data.d.map((d, i) => (
        <path key={i} d={d} fill={stroke ? "none" : "currentColor"} stroke={stroke ? "currentColor" : "none"} strokeWidth={p.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

export function IconPicker() {
  const styles = useStyles();
  const at = useEditor((s) => s.iconPicker);
  const defaultPack = useEditor((s) => s.scene.settings.defaults.defaultIconPack);
  const [query, setQuery] = useState("");
  const [pack, setPack] = useState<string>(defaultPack);
  const [, setPacksVersion] = useState(0);
  const results = useMemo(() => (query.trim() ? searchIcons(query, { pack, limit: 120 }) : Object.keys(getIconPack(pack)?.icons ?? {}).slice(0, 120).map((name) => ({ pack, name }))), [query, pack]);

  const close = () => useEditor.getState().setIconPicker(null);
  const choose = (name: string) => {
    if (!at) return;
    addElement("icon", { pack, name, x: at.x - 60, y: at.y - 60, width: 120, height: 120 }, "Add icon");
    close();
    useEditor.getState().setTool("select");
  };

  return (
    <Dialog open={at !== null} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Add icon</DialogTitle>
          <DialogContent>
            <TabList selectedValue={pack} onTabSelect={(_, d) => setPack(String(d.value))} size="small">
              {iconPacks().map((p) => (
                <Tab key={p} value={p}>
                  {p === "lucide" ? "Lucide" : p === "fluent" ? "Fluent" : p}
                </Tab>
              ))}
            </TabList>
            <SearchBox placeholder="server, database, user" value={query} onChange={(_, d) => setQuery(d.value)} style={{ width: "100%", marginTop: 8 }} autoFocus aria-label="Search icons" />
            <div className={styles.grid} role="listbox" aria-label="Icons">
              {results.map((r) => (
                <button key={`${r.pack}:${r.name}`} className={styles.cell} onClick={() => choose(r.name)} role="option" aria-selected={false} title={r.name}>
                  <IconSvg pack={r.pack} name={r.name} />
                  <span className={styles.name}>{r.name}</span>
                </button>
              ))}
              {results.length === 0 && <Text>No icons match "{query}".</Text>}
            </div>
          </DialogContent>
          <DialogActions>
            <Button
              appearance="subtle"
              onClick={() =>
                void withErrors(async () => {
                  const r = await addIconPackFromFolder();
                  if (!r) return;
                  setPacksVersion((v) => v + 1);
                  setPack(r.pack);
                  notify(`Added icon pack '${r.pack}': ${r.icons} icons${r.skipped.length ? `. ${r.skipped.length} files did not convert` : ""}`, "success");
                })
              }
            >
              Add icon pack (folder of SVG files)…
            </Button>
            <Button appearance="secondary" onClick={close}>
              Cancel
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
