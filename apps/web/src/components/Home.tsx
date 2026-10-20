import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Text,
  Toast,
  ToastTitle,
  Toaster,
  makeStyles,
  tokens,
  useId,
  useToastController,
} from "@fluentui/react-components";
import { Add20Regular, ChevronLeft20Regular, ChevronRight20Regular, ArrowDownload20Regular, Copy20Regular, Delete20Regular, DocumentArrowUp20Regular, FolderOpen20Regular, MoreHorizontal20Regular, Rename20Regular, Search20Regular } from "@fluentui/react-icons";
import { TEMPLATES } from "@anivo/schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { hasFileSystemAccess, newFromTemplate, newScene, openDroppedFile, openFile, openFromLibrary, openRecent, recentFiles, runImport } from "../files.js";
import { type LibraryEntry, deleteFromLibrary, duplicateInLibrary, libraryFileBytes, listScenes, renameInLibrary } from "../library.js";
import { withErrors } from "../notify.js";
import { useEditor } from "../store.js";
import { formatTime } from "./PlaybackBar.js";
import { TemplateThumb } from "./TemplateGallery.js";
import { PHONE, useMedia } from "./useMedia.js";

const useStyles = makeStyles({
  root: { height: "100%", overflowY: "auto", backgroundColor: tokens.colorNeutralBackground2, color: tokens.colorNeutralForeground1 },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
    padding: `${tokens.spacingVerticalM} clamp(16px, 4vw, 48px)`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  brand: { fontWeight: tokens.fontWeightSemibold, letterSpacing: "0.02em", marginRight: "auto" },
  search: { width: "min(320px, 100%)", flexGrow: 0, "@media (max-width: 1023px)": { order: 10, width: "100%", maxWidth: "none" } },
  main: { padding: `${tokens.spacingVerticalXL} clamp(16px, 4vw, 48px) ${tokens.spacingVerticalXXXL}`, maxWidth: "1440px", margin: "0 auto", display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXXL },
  section: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  sectionHead: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM, flexWrap: "wrap" },
  sectionTitle: { marginRight: "auto" },
  // Padding inside the scroll box: the hover outline of a card is not cut at the edges.
  templates: { display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(220px, 260px)", gap: tokens.spacingHorizontalM, overflowX: "auto", padding: "3px 3px 10px", scrollSnapType: "x proximity", scrollBehavior: "smooth", scrollbarWidth: "thin" },
  rowWrap: { position: "relative" },
  rowArrow: {
    position: "absolute",
    top: "50%",
    transform: "translateY(-60%)",
    zIndex: 2,
    width: "32px",
    height: "32px",
    borderRadius: "16px",
    border: "1px solid var(--ui-outline)",
    backgroundColor: "var(--ui-header)",
    color: "var(--ui-text)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
    ":hover": { backgroundColor: "var(--ui-widget)" },
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(240px, 100%), 1fr))", gap: tokens.spacingHorizontalL },
  card: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    outline: `1px solid ${tokens.colorNeutralStroke2}`,
    scrollSnapAlign: "start",
    ":hover": { outline: `1px solid ${tokens.colorNeutralStroke1Hover}`, boxShadow: tokens.shadow8 },
    ":focus-within": { outline: `2px solid ${tokens.colorBrandStroke1}` },
  },
  open: {
    border: "none",
    padding: 0,
    background: "none",
    color: "inherit",
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    outline: "none",
    // The whole card opens the scene.
    "::after": { content: '""', position: "absolute", inset: 0, borderRadius: tokens.borderRadiusXLarge },
  },
  thumbBox: { width: "100%", aspectRatio: "16 / 9", borderRadius: tokens.borderRadiusLarge, backgroundColor: tokens.colorNeutralBackground3, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumb: { maxWidth: "100%", maxHeight: "100%", display: "block" },
  templateThumb: { width: "100%", aspectRatio: "16 / 9", borderRadius: tokens.borderRadiusLarge },
  titleRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS, minWidth: 0 },
  title: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexGrow: 1 },
  more: { position: "relative", zIndex: 1 },
  muted: { color: tokens.colorNeutralForeground3 },
  badge: {
    position: "absolute",
    top: tokens.spacingVerticalM,
    left: tokens.spacingHorizontalM,
    padding: `0 ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase100,
    lineHeight: "18px",
    backgroundColor: "rgba(0,0,0,0.55)",
    color: "#fff",
  },
  blank: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: tokens.spacingVerticalXS, border: `1px dashed ${tokens.colorNeutralStroke1}` },
  empty: { padding: tokens.spacingVerticalXXL, textAlign: "center", border: `1px dashed ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusXLarge, display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, alignItems: "center" },
  files: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
  drop: { outline: `3px dashed ${tokens.colorBrandStroke1}`, outlineOffset: "-8px" },
});

const SIZES = [
  { label: "Landscape 16:9", hint: "YouTube, slides", width: 1920, height: 1080 },
  { label: "Vertical 9:16", hint: "Shorts, Reels, TikTok", width: 1080, height: 1920 },
  { label: "Square 1:1", hint: "Posts", width: 1080, height: 1080 },
];

function ratio(w: number, h: number): string {
  const r = w / h;
  if (Math.abs(r - 16 / 9) < 0.02) return "16:9";
  if (Math.abs(r - 9 / 16) < 0.02) return "9:16";
  if (Math.abs(r - 1) < 0.02) return "1:1";
  if (Math.abs(r - 4 / 3) < 0.02) return "4:3";
  return `${w}×${h}`;
}

function ago(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ms).toLocaleDateString();
}

function download(name: string, bytes: Uint8Array): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

function SceneCard({ e, onRename, onDelete }: { e: LibraryEntry; onRename: () => void; onDelete: () => void }) {
  const styles = useStyles();
  const meta = `${ago(e.updatedAt)} · ${e.steps} ${e.steps === 1 ? "step" : "steps"} · ${formatTime(e.durationMs)}`;
  return (
    <article className={styles.card} aria-label={e.title}>
      <button className={styles.open} onClick={() => void withErrors(() => openFromLibrary(e.id))} aria-label={`Open ${e.title}`}>
        <div className={styles.thumbBox}>{e.thumb ? <img src={e.thumb} alt="" className={styles.thumb} /> : null}</div>
      </button>
      <span className={styles.badge}>{ratio(e.width, e.height)}</span>
      <div className={styles.titleRow}>
        <Text weight="semibold" className={styles.title} title={e.title}>
          {e.title}
        </Text>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button className={styles.more} appearance="subtle" size="small" icon={<MoreHorizontal20Regular />} aria-label={`More actions for ${e.title}`} />
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem icon={<FolderOpen20Regular />} onClick={() => void withErrors(() => openFromLibrary(e.id))}>
                Open
              </MenuItem>
              <MenuItem icon={<Rename20Regular />} onClick={onRename}>
                Rename
              </MenuItem>
              <MenuItem icon={<Copy20Regular />} onClick={() => void withErrors(async () => void (await duplicateInLibrary(e.id)))}>
                Duplicate
              </MenuItem>
              <MenuItem icon={<ArrowDownload20Regular />} onClick={() => void withErrors(async () => { const f = await libraryFileBytes(e.id); download(f.name, f.bytes); })}>
                Download .anivo file
              </MenuItem>
              <MenuItem icon={<Delete20Regular />} onClick={onDelete}>
                Delete
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
      <Text size={200} className={styles.muted}>
        {meta}
      </Text>
    </article>
  );
}

/** The home screen: start a scene, or open one of the library (FR-FILE-09). */
export function Home() {
  const styles = useStyles();
  const phone = useMedia(PHONE);
  // The template row scrolls sideways: arrows show when there is more to see, and the wheel scrolls it.
  const rowRef = useRef<HTMLDivElement>(null);
  const [rowEdge, setRowEdge] = useState({ left: false, right: false });
  const updateEdges = () => {
    const el = rowRef.current;
    if (el) setRowEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    updateEdges();
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollBy({ left: e.deltaY, behavior: "auto" });
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", wheel);
    };
  }, []);
  const version = useEditor((s) => s.libraryVersion);
  const [scenes, setScenes] = useState<LibraryEntry[] | null>(null);
  const [recent, setRecent] = useState<Awaited<ReturnType<typeof recentFiles>>>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<LibraryEntry | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const toasterId = useId("home-toaster");
  const { dispatchToast } = useToastController(toasterId);
  const notice = useEditor((s) => s.notice);
  useEffect(() => {
    if (notice) dispatchToast(<Toast><ToastTitle>{notice.text}</ToastTitle></Toast>, { intent: notice.intent, timeout: notice.intent === "error" ? 8000 : 2500, position: "bottom" });
  }, [notice]);

  useEffect(() => {
    void listScenes().then(setScenes);
  }, [version]);
  useEffect(() => {
    if (hasFileSystemAccess) void recentFiles().then(setRecent);
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (scenes ?? []).filter((e) => !q || e.title.toLowerCase().includes(q));
    return sort === "name" ? [...list].sort((a, b) => a.title.localeCompare(b.title)) : list;
  }, [scenes, query, sort]);
  const templates = TEMPLATES.filter((t) => !query.trim() || t.title.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div
      className={`${styles.root} ${dragOver ? styles.drop : ""}`}
      onDragOver={(ev) => {
        if (ev.dataTransfer.types.includes("Files")) {
          ev.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(ev) => {
        ev.preventDefault();
        setDragOver(false);
        const file = ev.dataTransfer.files[0];
        if (file) void withErrors(() => openDroppedFile(file));
      }}
    >
      <header className={styles.header}>
        <Text size={500} className={styles.brand}>
          Anivo
        </Text>
        <Input className={styles.search} contentBefore={<Search20Regular />} placeholder="Search scenes and templates" value={query} onChange={(_, d) => setQuery(d.value)} aria-label="Search scenes and templates" />
        <Button icon={<FolderOpen20Regular />} onClick={() => void withErrors(openFile)} aria-label="Open file">
          {phone ? null : "Open file"}
        </Button>
        <Button icon={<DocumentArrowUp20Regular />} onClick={() => void withErrors(runImport)} aria-label="Import diagram">
          {phone ? null : "Import diagram"}
        </Button>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <MenuButton appearance="primary" icon={<Add20Regular />} aria-label="New scene">
              {phone ? "New" : "New scene"}
            </MenuButton>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {SIZES.map((s) => (
                <MenuItem key={s.label} secondaryContent={s.hint} onClick={() => newScene({ width: s.width, height: s.height })}>
                  {s.label}
                </MenuItem>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
      </header>

      <main className={styles.main}>
        <section className={styles.section} aria-labelledby="home-start">
          <Text id="home-start" as="h2" size={500} weight="semibold">
            Start a new scene
          </Text>
          <div className={styles.rowWrap}>
          {rowEdge.left && (
            <button type="button" className={styles.rowArrow} style={{ left: "-12px" }} aria-label="Scroll the templates left" onClick={() => rowRef.current?.scrollBy({ left: -(rowRef.current.clientWidth * 0.8) })}>
              <ChevronLeft20Regular />
            </button>
          )}
          {rowEdge.right && (
            <button type="button" className={styles.rowArrow} style={{ right: "-12px" }} aria-label="Scroll the templates right" onClick={() => rowRef.current?.scrollBy({ left: rowRef.current.clientWidth * 0.8 })}>
              <ChevronRight20Regular />
            </button>
          )}
          <div ref={rowRef} className={styles.templates} role="list" aria-label="Templates" onScroll={updateEdges}>
            {SIZES.slice(0, 2).map((s) => (
              <div key={s.label} role="listitem" className={styles.card}>
                <button className={styles.open} onClick={() => newScene({ width: s.width, height: s.height })} aria-label={`Blank ${s.label}`}>
                  <div className={`${styles.thumbBox} ${styles.blank}`}>
                    <Add20Regular />
                    <Text size={200}>{s.label}</Text>
                  </div>
                </button>
                <Text weight="semibold">Blank {s.label.split(" ")[0]!.toLowerCase()}</Text>
                <Text size={200} className={styles.muted}>
                  {s.hint}
                </Text>
              </div>
            ))}
            {templates.map((t) => (
              <div key={t.name} role="listitem" className={styles.card}>
                <button className={styles.open} onClick={() => void withErrors(() => newFromTemplate(t.name))} aria-label={`Template: ${t.title}`}>
                  <TemplateThumb name={t.name} />
                </button>
                <Text weight="semibold" className={styles.title} title={t.title}>
                  {t.title}
                </Text>
                <Text size={200} className={styles.muted}>
                  {t.description}
                </Text>
              </div>
            ))}
          </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="home-scenes">
          <div className={styles.sectionHead}>
            <Text id="home-scenes" as="h2" size={500} weight="semibold" className={styles.sectionTitle}>
              Your scenes
            </Text>
            <Dropdown aria-label="Sort scenes" value={sort === "recent" ? "Last edited" : "Name"} selectedOptions={[sort]} onOptionSelect={(_, d) => setSort(d.optionValue as "recent" | "name")} style={{ minWidth: "140px" }}>
              <Option value="recent">Last edited</Option>
              <Option value="name">Name</Option>
            </Dropdown>
          </div>
          {scenes === null ? null : shown.length === 0 ? (
            <div className={styles.empty}>
              <Text weight="semibold">{query.trim() ? "No scene has this name." : "No scenes yet."}</Text>
              <Text size={200} className={styles.muted}>
                {query.trim() ? "Try another word." : "Start from a template or a blank scene. Anivo saves your scenes in this browser. You can also drop an .anivo file here."}
              </Text>
            </div>
          ) : (
            <div className={styles.grid} role="list" aria-label="Your scenes">
              {shown.map((e) => (
                <div key={e.id} role="listitem">
                  <SceneCard e={e} onRename={() => setRenaming({ id: e.id, title: e.title })} onDelete={() => setDeleting(e)} />
                </div>
              ))}
            </div>
          )}
        </section>

        {recent.length > 0 && (
          <section className={styles.section} aria-labelledby="home-files">
            <Text id="home-files" as="h2" size={400} weight="semibold">
              Files on this computer
            </Text>
            <div className={styles.files}>
              {recent.map((r) => (
                <Button key={r.name} icon={<FolderOpen20Regular />} onClick={() => void withErrors(() => openRecent(r))}>
                  {r.name}
                </Button>
              ))}
            </div>
          </section>
        )}
      </main>

      <Dialog open={renaming !== null} onOpenChange={(_, d) => !d.open && setRenaming(null)}>
        <DialogSurface aria-label="Rename scene">
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              const r = renaming;
              setRenaming(null);
              if (r && r.title.trim()) void withErrors(() => renameInLibrary(r.id, r.title.trim()));
            }}
          >
            <DialogBody>
              <DialogTitle>Rename scene</DialogTitle>
              <DialogContent>
                <Input autoFocus style={{ width: "100%" }} value={renaming?.title ?? ""} onChange={(_, d) => renaming && setRenaming({ ...renaming, title: d.value })} aria-label="Scene name" />
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setRenaming(null)}>
                  Cancel
                </Button>
                <Button appearance="primary" type="submit">
                  Rename
                </Button>
              </DialogActions>
            </DialogBody>
          </form>
        </DialogSurface>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(_, d) => !d.open && setDeleting(null)}>
        <DialogSurface aria-label="Delete scene">
          <DialogBody>
            <DialogTitle>Delete “{deleting?.title}”?</DialogTitle>
            <DialogContent>This removes the scene from this browser. You cannot undo it. Files that you saved on your computer stay.</DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={() => {
                  const d = deleting;
                  setDeleting(null);
                  if (d) void withErrors(() => deleteFromLibrary(d.id));
                }}
              >
                Delete
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <Toaster toasterId={toasterId} />
    </div>
  );
}
