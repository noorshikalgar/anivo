/**
 * Widgets (docs/05 "Widgets"): ready-made groups of elements, for example a
 * browser window or a stat card. A widget is not a new element type: the
 * insert makes plain elements in a group, so the engine and the renderers do
 * not change, and the user can edit each part.
 */
import type { OperationInput } from "./operations.js";

type Props = Record<string, unknown>;

interface Part {
  /** The part ID: the widget ID + "-" + this. */
  id: string;
  type: "rectangle" | "ellipse" | "diamond" | "text" | "icon" | "code";
  /** Position and size in the base size of the widget. */
  x: number;
  y: number;
  w: number;
  h: number;
  props?: Props;
  /** The text key that gives the label or the content. */
  text?: string;
}

export interface WidgetDef {
  name: string;
  title: string;
  description: string;
  /** The base size. */
  width: number;
  height: number;
  /** Texts the user can set, with their default. */
  texts: Record<string, string>;
  parts: Part[];
}

const none = "transparent";
const s = (style: Props): Props => ({ style });

export const WIDGETS: WidgetDef[] = [
  {
    name: "browser",
    title: "Browser window",
    description: "A window with a title bar, three dots, an address, and a page.",
    width: 640,
    height: 420,
    texts: { url: "https://example.com", page: "" },
    parts: [
      { id: "frame", type: "rectangle", x: 0, y: 0, w: 640, h: 420, props: s({ fill: "surface", cornerRadius: 14 }) },
      { id: "bar", type: "rectangle", x: 0, y: 0, w: 640, h: 52, props: s({ fill: "surface-strong", stroke: none, cornerRadius: 14 }) },
      { id: "dot-1", type: "ellipse", x: 18, y: 18, w: 16, h: 16, props: s({ fill: "danger", stroke: none }) },
      { id: "dot-2", type: "ellipse", x: 42, y: 18, w: 16, h: 16, props: s({ fill: "warning", stroke: none }) },
      { id: "dot-3", type: "ellipse", x: 66, y: 18, w: 16, h: 16, props: s({ fill: "success", stroke: none }) },
      { id: "url", type: "rectangle", x: 100, y: 10, w: 520, h: 32, text: "url", props: s({ fill: "background", stroke: none, cornerRadius: 16, fontSize: 18, textColor: "muted" }) },
      { id: "page", type: "rectangle", x: 20, y: 70, w: 600, h: 330, text: "page", props: s({ fill: "surface-strong", stroke: none, cornerRadius: 8, fontSize: 28 }) },
    ],
  },
  {
    name: "phone",
    title: "Phone",
    description: "A phone with a notch and a screen.",
    width: 260,
    height: 520,
    texts: { screen: "" },
    parts: [
      { id: "body", type: "rectangle", x: 0, y: 0, w: 260, h: 520, props: s({ fill: "surface-strong", strokeWidth: 4, cornerRadius: 44 }) },
      { id: "screen", type: "rectangle", x: 14, y: 44, w: 232, h: 440, text: "screen", props: s({ fill: "surface", stroke: none, cornerRadius: 22, fontSize: 26 }) },
      { id: "notch", type: "rectangle", x: 95, y: 16, w: 70, h: 14, props: s({ fill: "line", stroke: none, cornerRadius: 7 }) },
    ],
  },
  {
    name: "server",
    title: "Server",
    description: "A rack with three units, green lights, and a label.",
    width: 220,
    height: 300,
    texts: { label: "Server" },
    parts: [
      ...[0, 1, 2].flatMap((i): Part[] => [
        { id: `unit-${i + 1}`, type: "rectangle", x: 0, y: i * 80, w: 220, h: 70, props: s({ fill: "surface-strong", cornerRadius: 8 }) },
        { id: `led-${i + 1}`, type: "ellipse", x: 182, y: i * 80 + 27, w: 16, h: 16, props: s({ fill: "success", stroke: none }) },
        { id: `slot-${i + 1}`, type: "rectangle", x: 20, y: i * 80 + 30, w: 120, h: 10, props: s({ fill: "line", stroke: none, cornerRadius: 5 }) },
      ]),
      { id: "label", type: "text", x: 0, y: 248, w: 220, h: 52, text: "label", props: s({ fontSize: 30 }) },
    ],
  },
  {
    name: "database",
    title: "Database",
    description: "A cylinder with a label.",
    width: 220,
    height: 240,
    texts: { label: "Database" },
    parts: [
      { id: "base", type: "ellipse", x: 0, y: 176, w: 220, h: 64, props: s({ fill: "accent-soft", stroke: none }) },
      { id: "body", type: "rectangle", x: 0, y: 32, w: 220, h: 176, text: "label", props: s({ fill: "accent-soft", stroke: none, cornerRadius: 0, fontSize: 30 }) },
      { id: "top", type: "ellipse", x: 0, y: 0, w: 220, h: 64, props: s({ fill: "accent", stroke: none }) },
    ],
  },
  {
    name: "chat",
    title: "Chat bubble",
    description: "A speech bubble with a tail.",
    width: 380,
    height: 150,
    texts: { text: "Hi! How can I help?" },
    parts: [
      { id: "tail", type: "diamond", x: 24, y: 104, w: 44, h: 44, props: s({ fill: "accent-soft", stroke: none }) },
      { id: "bubble", type: "rectangle", x: 0, y: 0, w: 380, h: 126, text: "text", props: s({ fill: "accent-soft", stroke: none, cornerRadius: 26, fontSize: 30 }) },
    ],
  },
  {
    name: "terminal",
    title: "Terminal",
    description: "A terminal window with a command.",
    width: 560,
    height: 300,
    texts: { code: "$ npm run build\n✓ Built in 1.2 s" },
    parts: [
      { id: "frame", type: "rectangle", x: 0, y: 0, w: 560, h: 300, props: s({ fill: "background", cornerRadius: 14 }) },
      { id: "dot-1", type: "ellipse", x: 18, y: 16, w: 14, h: 14, props: s({ fill: "danger", stroke: none }) },
      { id: "dot-2", type: "ellipse", x: 40, y: 16, w: 14, h: 14, props: s({ fill: "warning", stroke: none }) },
      { id: "dot-3", type: "ellipse", x: 62, y: 16, w: 14, h: 14, props: s({ fill: "success", stroke: none }) },
      { id: "code", type: "code", x: 16, y: 46, w: 528, h: 236, text: "code", props: { language: "bash", lineNumbers: false } },
    ],
  },
  {
    name: "stat",
    title: "Stat card",
    description: "A big number with a caption.",
    width: 320,
    height: 190,
    texts: { value: "99.9%", caption: "uptime" },
    parts: [
      { id: "card", type: "rectangle", x: 0, y: 0, w: 320, h: 190, props: s({ fill: "surface", cornerRadius: 18 }) },
      { id: "value", type: "text", x: 20, y: 24, w: 280, h: 90, text: "value", props: s({ fontSize: 68, fontWeight: 700, textColor: "accent" }) },
      { id: "caption", type: "text", x: 20, y: 118, w: 280, h: 46, text: "caption", props: s({ fontSize: 26, textColor: "muted" }) },
    ],
  },
  {
    name: "step-badge",
    title: "Step badge",
    description: "A numbered circle with a label.",
    width: 380,
    height: 84,
    texts: { number: "1", label: "First step" },
    parts: [
      { id: "number", type: "ellipse", x: 0, y: 0, w: 84, h: 84, text: "number", props: s({ fill: "accent", stroke: none, fontSize: 38, fontWeight: 700, textColor: "background" }) },
      { id: "label", type: "text", x: 104, y: 0, w: 276, h: 84, text: "label", props: s({ fontSize: 32, textAlign: "left" }) },
    ],
  },
  {
    name: "progress",
    title: "Progress bar",
    description: "A label, a track, and a filled part (65%).",
    width: 520,
    height: 84,
    texts: { label: "Loading" },
    parts: [
      { id: "label", type: "text", x: 0, y: 0, w: 520, h: 38, text: "label", props: s({ fontSize: 26, textAlign: "left" }) },
      { id: "track", type: "rectangle", x: 0, y: 48, w: 520, h: 30, props: s({ fill: "surface-strong", stroke: none, cornerRadius: 15 }) },
      { id: "bar", type: "rectangle", x: 0, y: 48, w: 338, h: 30, props: s({ fill: "accent", stroke: none, cornerRadius: 15 }) },
    ],
  },
  {
    name: "callout",
    title: "Callout",
    description: "A note with a light bulb.",
    width: 540,
    height: 124,
    texts: { text: "Tip: a cache makes reads fast." },
    parts: [
      { id: "box", type: "rectangle", x: 0, y: 0, w: 540, h: 124, props: s({ fill: "warning-soft", stroke: "warning", cornerRadius: 16 }) },
      { id: "icon", type: "icon", x: 22, y: 22, w: 80, h: 80, props: { pack: "lucide", name: "lightbulb", style: { fill: "warning" } } },
      { id: "text", type: "text", x: 122, y: 12, w: 400, h: 100, text: "text", props: s({ fontSize: 28, textAlign: "left" }) },
    ],
  },
  {
    name: "user-card",
    title: "User card",
    description: "A person with a name and a role.",
    width: 380,
    height: 124,
    texts: { name: "Ada Lovelace", role: "Engineer" },
    parts: [
      { id: "card", type: "rectangle", x: 0, y: 0, w: 380, h: 124, props: s({ fill: "surface", cornerRadius: 18 }) },
      { id: "avatar", type: "icon", x: 20, y: 22, w: 80, h: 80, props: { pack: "lucide", name: "user", style: { fill: "accent" } } },
      { id: "name", type: "text", x: 120, y: 20, w: 240, h: 44, text: "name", props: s({ fontSize: 30, fontWeight: 700, textAlign: "left" }) },
      { id: "role", type: "text", x: 120, y: 64, w: 240, h: 38, text: "role", props: s({ fontSize: 24, textColor: "muted", textAlign: "left" }) },
    ],
  },
];

export function getWidget(name: string): WidgetDef | undefined {
  return WIDGETS.find((w) => w.name === name);
}

export interface WidgetOptions {
  /** The group ID. The parts get "<id>-<part>". */
  id: string;
  x: number;
  y: number;
  /** The size of the widget; the parts scale. Default: the base size. */
  width?: number;
  height?: number;
  texts?: Record<string, string>;
}

/** The operations that insert a widget as a group of plain elements. */
export function widgetOps(def: WidgetDef, o: WidgetOptions): OperationInput[] {
  const sx = (o.width ?? def.width) / def.width;
  const sy = (o.height ?? def.height) / def.height;
  const k = Math.min(sx, sy);
  const texts = { ...def.texts, ...o.texts };
  const ops: OperationInput[] = [{ op: "element.add", id: o.id, type: "group", props: {} }];
  for (const p of def.parts) {
    const props: Props = { ...(p.props ?? {}), parentId: o.id, x: Math.round(o.x + p.x * sx), y: Math.round(o.y + p.y * sy), width: Math.max(4, Math.round(p.w * sx)), height: Math.max(4, Math.round(p.h * sy)) };
    const style = props["style"] as Props | undefined;
    if (style && typeof style["fontSize"] === "number" && k !== 1) props["style"] = { ...style, fontSize: Math.max(12, Math.round((style["fontSize"] as number) * k)) };
    if (p.text !== undefined) {
      const t = texts[p.text] ?? "";
      if (p.type === "text") props["content"] = { text: t };
      else if (p.type === "code") props["code"] = t;
      else if (t) props["label"] = t;
    }
    ops.push({ op: "element.add", id: `${o.id}-${p.id}`, type: p.type, props });
  }
  return ops;
}
