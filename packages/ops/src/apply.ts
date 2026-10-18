import { alignScript } from "./align.js";
import { Action, AssetRef, AudioTrack, Comment, type ConnectorElement, Element, ElementId, type Scene, SceneSettings, ScriptLine, Step, tableCellBox, tableCellId } from "@anivo/schema";
import type { z } from "zod";
import type { Operation } from "./operations.js";
import { autoLayout } from "@anivo/layout";
import { keyBetween } from "./order.js";

export interface OpError {
  code:
    | "invalid-op"
    | "unknown-element"
    | "unknown-step"
    | "unknown-action"
    | "duplicate-id"
    | "invalid-element"
    | "invalid-step"
    | "invalid-action"
    | "invalid-settings"
    | "invalid-audio"
    | "unknown-audio"
    | "invalid-scene"
    | "conflict";
  message: string;
  path: string;
  hint?: string;
}

export class OpFailure extends Error {
  constructor(readonly error: OpError) {
    super(error.message);
  }
}

const fail = (error: OpError): never => {
  throw new OpFailure(error);
};

/** Records the old value of each touched entity, so the bus can undo the transaction. */
export interface Snapshot {
  elements: Map<string, Element | undefined>;
  steps?: Scene["steps"];
  settings?: Scene["settings"];
  meta?: Scene["meta"];
  audio?: Scene["audio"];
  script?: Scene["script"];
  assets?: Scene["assets"];
  comments?: Scene["comments"];
}

function zodMessage(err: z.ZodError): string {
  return err.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/** Lower-case readable ID from text. */
export function slugify(text: string): string {
  let s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (!s) return "";
  if (!/^[a-z]/.test(s)) s = `e-${s}`;
  return s;
}

/**
 * A mutable working copy of a scene for one transaction. It copies each
 * entity before the first change (copy-on-write), so the old scene stays
 * unchanged and can share unchanged entities with the new scene.
 */
export class Draft {
  readonly elements: Record<string, Element>;
  steps: Scene["steps"];
  settings: Scene["settings"];
  meta: Scene["meta"];
  audio: Scene["audio"];
  script: Scene["script"];
  assets: Scene["assets"];
  comments: Scene["comments"];
  readonly before: Snapshot = { elements: new Map() };
  readonly created: string[] = [];
  private stepsCopied = false;

  constructor(private readonly base: Scene) {
    this.elements = { ...base.elements };
    this.steps = base.steps;
    this.settings = base.settings;
    this.meta = base.meta;
    this.audio = base.audio;
    this.script = base.script;
    this.assets = base.assets;
    this.comments = base.comments;
  }

  finish(): Scene {
    return { ...this.base, meta: this.meta, settings: this.settings, elements: this.elements, steps: this.steps, audio: this.audio, script: this.script, assets: this.assets, comments: this.comments };
  }

  /** IDs of entities that this draft changed. */
  touchedElements(): string[] {
    return [...this.before.elements.keys()];
  }

  // --- helpers -------------------------------------------------------------

  private touch(id: string): void {
    if (!this.before.elements.has(id)) this.before.elements.set(id, this.base.elements[id]);
  }

  private touchSteps(): void {
    if (!this.stepsCopied) {
      this.before.steps = this.base.steps;
      this.steps = this.base.steps.map((s) => ({ ...s, actions: [...s.actions] }));
      this.stepsCopied = true;
    }
  }

  private requireElement(id: string, path: string): Element {
    const el = this.elements[id];
    if (!el) {
      const known = Object.keys(this.elements).slice(0, 20).join(", ") || "(none)";
      fail({ code: "unknown-element", message: `Element '${id}' does not exist.`, path, hint: `Use one of: ${known}.` });
    }
    return el!;
  }

  private stepIndex(id: string, path: string): number {
    const i = this.steps.findIndex((s) => s.id === id);
    if (i < 0) {
      const known = this.steps.map((s) => s.id).join(", ") || "(none)";
      fail({ code: "unknown-step", message: `Step '${id}' does not exist.`, path, hint: `Use one of: ${known}. Or add the step with step.add first.` });
    }
    return i;
  }

  private uniqueId(wanted: string, taken: (id: string) => boolean): string {
    if (!taken(wanted)) return wanted;
    for (let n = 2; ; n++) {
      const id = `${wanted.slice(0, 44)}-${n}`;
      if (!taken(id)) return id;
    }
  }

  private newElementId(requested: string | undefined, type: string, label: string | undefined, path: string): string {
    if (requested !== undefined) {
      const parsed = ElementId.safeParse(requested);
      if (!parsed.success) fail({ code: "invalid-element", message: `The ID '${requested}' is not valid. ${parsed.error.issues[0]?.message ?? ""}`, path: `${path}.id` });
      if (this.elements[requested]) fail({ code: "duplicate-id", message: `Element '${requested}' exists already.`, path: `${path}.id`, hint: "Use a different ID, or use element.update to change the element." });
      return requested;
    }
    const base = slugify(label ?? "") || type;
    return this.uniqueId(base, (id) => id in this.elements);
  }

  private topKey(): string {
    let max: string | null = null;
    for (const el of Object.values(this.elements)) if (max === null || el.z > max) max = el.z;
    return keyBetween(max, null);
  }

  private normalizeProps(props: Record<string, unknown>): Record<string, unknown> {
    const out = { ...props };
    if (typeof out["label"] === "string") out["label"] = { text: out["label"] };
    if (out["type"] === "text" && typeof out["content"] === "string") out["content"] = { text: out["content"] };
    return out;
  }

  private parseElement(value: Record<string, unknown>, path: string): Element {
    const parsed = Element.safeParse(value);
    if (!parsed.success) fail({ code: "invalid-element", message: `The element is not valid: ${zodMessage(parsed.error)}.`, path, hint: "Call anivo_schema, or run 'anivo schema --scene', to see the element fields." });
    const el = parsed.data!;
    if (el.type === "image") {
      const a = this.assets[el.assetId];
      if (!a) fail({ code: "invalid-element", message: `The image asset '${el.assetId}' does not exist.`, path: `${path}.assetId`, hint: "Add the asset with asset.add first, in the same transaction." });
      else if (!a.mime.startsWith("image/")) fail({ code: "invalid-element", message: `The asset '${el.assetId}' is not an image (${a.mime}).`, path: `${path}.assetId` });
    }
    return el;
  }

  private nextActionId(): string {
    const taken = new Set(this.steps.flatMap((s) => s.actions.map((a) => a.id)));
    let n = taken.size + 1;
    while (taken.has(`a${n}`)) n++;
    return `a${n}`;
  }

  // --- operations ----------------------------------------------------------

  apply(op: Operation, path: string): void {
    switch (op.op) {
      case "element.add": {
        const props = this.normalizeProps({ ...op.props, type: op.type });
        // A table gets its cells from "cells": rows of text.
        const cells = op.type === "table" ? props["cells"] : undefined;
        delete props["cells"];
        if (op.type === "table" && Array.isArray(cells)) {
          props["rows"] ??= cells.length;
          props["cols"] ??= Math.max(1, ...cells.map((r) => (Array.isArray(r) ? r.length : 1)));
        }
        const label = (props["label"] as { text?: string } | undefined)?.text ?? (props["content"] as { text?: string } | undefined)?.text;
        const id = this.newElementId(op.id, op.type, label, path);
        const el = this.parseElement({ seed: this.seedFor(id), ...props, id, z: props["z"] ?? this.topKey() }, path);
        this.touch(id);
        this.elements[id] = el;
        this.created.push(id);
        if (el.type === "table") this.addTableCells(el, Array.isArray(cells) ? (cells as unknown[][]) : [], path);
        return;
      }
      case "element.update": {
        const old = this.requireElement(op.id, `${path}.id`);
        const set = this.normalizeProps(op.set);
        if ("id" in set || "type" in set) fail({ code: "invalid-op", message: "element.update cannot change 'id' or 'type'.", path: `${path}.set`, hint: "Use element.rename to change an ID. Remove and add the element to change its type." });
        const merged: Record<string, unknown> = { ...old };
        for (const [k, v] of Object.entries(set)) {
          if (v === null) delete merged[k];
          else if (k === "style" && typeof v === "object") merged["style"] = { ...old.style, ...(v as object) };
          else merged[k] = v;
        }
        // Remove style keys that are set to null.
        if (merged["style"] && typeof merged["style"] === "object") {
          merged["style"] = Object.fromEntries(Object.entries(merged["style"] as object).filter(([, v]) => v !== null));
        }
        this.touch(op.id);
        const next = this.parseElement(merged, path);
        this.elements[op.id] = next;
        if (old.type === "table" && next.type === "table") this.syncTableCells(old, next, path);
        return;
      }
      case "element.remove": {
        op.ids.forEach((id, i) => this.requireElement(id, `${path}.ids.${i}`));
        for (const id of op.ids) this.removeElement(id);
        return;
      }
      case "element.rename":
        this.rename(op.id, op.to, path);
        return;
      case "element.reorder":
        this.reorder(op, path);
        return;
      case "element.connect": {
        this.requireElement(op.from, `${path}.from`);
        this.requireElement(op.to, `${path}.to`);
        const id = op.id ?? this.uniqueId(`c-${op.from}-${op.to}`.slice(0, 48), (x) => x in this.elements);
        this.apply(
          {
            op: "element.add",
            id,
            type: "connector",
            props: { start: { kind: "bound", elementId: op.from }, end: { kind: "bound", elementId: op.to }, ...op.props },
          },
          path,
        );
        return;
      }
      case "element.place":
        this.place(op, path);
        return;
      case "layout.apply": {
        const els = op.ids.map((id, i) => this.requireElement(id, `${path}.ids.${i}`)).filter((e) => e.type !== "connector" && e.type !== "group");
        if (els.length === 0) fail({ code: "invalid-op", message: "layout.apply needs elements that are not connectors or groups.", path: `${path}.ids` });
        const set = new Set(els.map((e) => e.id));
        const edges = Object.values(this.elements).flatMap((c) =>
          c.type === "connector" && c.start.kind === "bound" && c.end.kind === "bound" && set.has(c.start.elementId) && set.has(c.end.elementId) ? [{ from: c.start.elementId, to: c.end.elementId }] : [],
        );
        // The top-left corner of the selection stays in place.
        const origin = { x: Math.min(...els.map((e) => e.x)), y: Math.min(...els.map((e) => e.y)) };
        const result = autoLayout(
          els.map((e) => ({ id: e.id, width: e.width, height: e.height })),
          edges,
          { kind: op.kind, origin, ...(op.gap !== undefined ? { gap: op.gap } : {}), ...(op.cols !== undefined ? { cols: op.cols } : {}), ...(op.direction ? { direction: op.direction } : {}) },
        );
        for (const [id, p] of result) {
          this.touch(id);
          this.elements[id] = { ...this.elements[id]!, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
        }
        return;
      }
      case "step.add": {
        const props = { ...op.props };
        const title = typeof props["title"] === "string" ? props["title"] : "";
        const taken = new Set(this.steps.map((s) => s.id));
        let id = op.id;
        if (id !== undefined && taken.has(id)) fail({ code: "duplicate-id", message: `Step '${id}' exists already.`, path: `${path}.id` });
        id ??= this.uniqueId(slugify(title) ? `s-${slugify(title)}`.slice(0, 44) : `s${this.steps.length + 1}`, (x) => taken.has(x));
        const actions = Array.isArray(props["actions"]) ? (props["actions"] as Record<string, unknown>[]) : [];
        delete props["actions"];
        const parsed = Step.safeParse({ ...props, id, actions: [] });
        if (!parsed.success) fail({ code: "invalid-step", message: `The step is not valid: ${zodMessage(parsed.error)}.`, path });
        this.touchSteps();
        const index = Math.min(op.index ?? this.steps.length, this.steps.length);
        this.steps.splice(index, 0, parsed.data!);
        this.created.push(id);
        actions.forEach((a, i) => this.apply({ op: "action.add", step: id!, action: a }, `${path}.props.actions.${i}`));
        return;
      }
      case "step.update": {
        const i = this.stepIndex(op.id, `${path}.id`);
        if ("id" in op.set || "actions" in op.set) fail({ code: "invalid-op", message: "step.update cannot change 'id' or 'actions'.", path: `${path}.set`, hint: "Use action.add, action.update, and action.remove for actions." });
        const merged = { ...this.steps[i]!, ...op.set };
        for (const [k, v] of Object.entries(op.set)) if (v === null) delete (merged as Record<string, unknown>)[k];
        const parsed = Step.safeParse(merged);
        if (!parsed.success) fail({ code: "invalid-step", message: `The step is not valid: ${zodMessage(parsed.error)}.`, path });
        this.touchSteps();
        this.steps[i] = parsed.data!;
        return;
      }
      case "step.remove": {
        const i = this.stepIndex(op.id, `${path}.id`);
        this.touchSteps();
        this.steps.splice(i, 1);
        this.dropComments("step", op.id);
        return;
      }
      case "step.move": {
        const i = this.stepIndex(op.id, `${path}.id`);
        this.touchSteps();
        const [step] = this.steps.splice(i, 1);
        this.steps.splice(Math.min(op.index, this.steps.length), 0, step!);
        return;
      }
      case "action.add": {
        const si = this.stepIndex(op.step, `${path}.step`);
        const raw = { ...op.action };
        if (raw["id"] === undefined) raw["id"] = this.nextActionId();
        else if (this.steps.some((s) => s.actions.some((a) => a.id === raw["id"]))) fail({ code: "duplicate-id", message: `Action '${String(raw["id"])}' exists already.`, path: `${path}.action.id` });
        const parsed = Action.safeParse(raw);
        if (!parsed.success) fail({ code: "invalid-action", message: `The action is not valid: ${zodMessage(parsed.error)}.`, path: `${path}.action`, hint: "Example: { type: 'enter', effect: 'pop', targets: ['lb'] }." });
        parsed.data!.targets.forEach((t, ti) => this.requireElement(t, `${path}.action.targets.${ti}`));
        this.touchSteps();
        const actions = this.steps[si]!.actions;
        actions.splice(Math.min(op.index ?? actions.length, actions.length), 0, parsed.data!);
        this.created.push(parsed.data!.id);
        return;
      }
      case "action.update": {
        const si = this.stepIndex(op.step, `${path}.step`);
        const ai = this.steps[si]!.actions.findIndex((a) => a.id === op.id);
        if (ai < 0) fail({ code: "unknown-action", message: `Action '${op.id}' does not exist in step '${op.step}'.`, path: `${path}.id` });
        if ("id" in op.set) fail({ code: "invalid-op", message: "action.update cannot change 'id'.", path: `${path}.set` });
        const old = this.steps[si]!.actions[ai]!;
        const merged: Record<string, unknown> = { ...old, ...op.set };
        for (const [k, v] of Object.entries(op.set)) if (v === null) delete merged[k];
        const parsed = Action.safeParse(merged);
        if (!parsed.success) fail({ code: "invalid-action", message: `The action is not valid: ${zodMessage(parsed.error)}.`, path: `${path}.set` });
        parsed.data!.targets.forEach((t, ti) => this.requireElement(t, `${path}.set.targets.${ti}`));
        this.touchSteps();
        this.steps[si]!.actions[ai] = parsed.data!;
        return;
      }
      case "action.remove": {
        const si = this.stepIndex(op.step, `${path}.step`);
        const ai = this.steps[si]!.actions.findIndex((a) => a.id === op.id);
        if (ai < 0) fail({ code: "unknown-action", message: `Action '${op.id}' does not exist in step '${op.step}'.`, path: `${path}.id` });
        this.touchSteps();
        this.steps[si]!.actions.splice(ai, 1);
        return;
      }
      case "scene.settings": {
        const old = this.settings as Record<string, unknown>;
        const merged: Record<string, unknown> = { ...old };
        for (const [k, v] of Object.entries(op.set)) {
          const prev = old[k];
          merged[k] = v !== null && typeof v === "object" && !Array.isArray(v) && prev && typeof prev === "object" ? { ...prev, ...v } : v;
        }
        const parsed = SceneSettings.safeParse(merged);
        if (!parsed.success) fail({ code: "invalid-settings", message: `The settings are not valid: ${zodMessage(parsed.error)}.`, path: `${path}.set` });
        this.before.settings ??= this.settings;
        this.settings = parsed.data!;
        return;
      }
      case "asset.add": {
        const parsed = AssetRef.safeParse(op.asset);
        if (!parsed.success) fail({ code: "invalid-audio", message: `The asset is not valid: ${zodMessage(parsed.error)}.`, path: `${path}.asset` });
        this.before.assets ??= this.assets;
        this.assets = { ...this.assets, [parsed.data!.id]: parsed.data! };
        return;
      }
      case "audio.add": {
        const raw = { ...op.track };
        if (raw["id"] === undefined) {
          const base = raw["kind"] === "voiceover" ? "voiceover" : String(raw["kind"] ?? "track");
          raw["id"] = this.uniqueId(base, (x) => this.audio.some((t) => t.id === x));
        }
        const parsed = AudioTrack.safeParse(raw);
        if (!parsed.success) fail({ code: "invalid-audio", message: `The audio track is not valid: ${zodMessage(parsed.error)}.`, path: `${path}.track` });
        const t = parsed.data!;
        if (this.audio.some((x) => x.id === t.id)) fail({ code: "duplicate-id", message: `Audio track '${t.id}' exists already.`, path: `${path}.track.id` });
        if (!(t.assetId in this.assets)) fail({ code: "invalid-audio", message: `The asset '${t.assetId}' does not exist.`, path: `${path}.track.assetId`, hint: "Add the asset with asset.add first, in the same transaction." });
        if (t.kind === "voiceover" && this.audio.some((x) => x.kind === "voiceover")) fail({ code: "invalid-audio", message: "The scene has a voiceover track already.", path: `${path}.track.kind`, hint: "Remove the old voiceover, or add this track as music." });
        this.before.audio ??= this.audio;
        this.audio = [...this.audio, t];
        this.created.push(t.id);
        return;
      }
      case "audio.update": {
        const i = this.audio.findIndex((t) => t.id === op.id);
        if (i < 0) fail({ code: "unknown-audio", message: `Audio track '${op.id}' does not exist.`, path: `${path}.id` });
        // A null value removes an optional field (for example duckDb or trimEndMs).
        const merged: Record<string, unknown> = { ...this.audio[i]!, ...op.set, id: op.id };
        for (const [k, v] of Object.entries(op.set)) if (v === null) delete merged[k];
        const parsed = AudioTrack.safeParse(merged);
        if (!parsed.success) fail({ code: "invalid-audio", message: `The audio track is not valid: ${zodMessage(parsed.error)}.`, path: `${path}.set` });
        this.before.audio ??= this.audio;
        this.audio = this.audio.map((t, j) => (j === i ? parsed.data! : t));
        return;
      }
      case "audio.remove": {
        if (!this.audio.some((t) => t.id === op.id)) fail({ code: "unknown-audio", message: `Audio track '${op.id}' does not exist.`, path: `${path}.id` });
        this.before.audio ??= this.audio;
        this.audio = this.audio.filter((t) => t.id !== op.id);
        // Cue triggers on the removed track become automatic.
        if (this.steps.some((s) => s.trigger.kind === "cue" && s.trigger.audioId === op.id)) {
          this.touchSteps();
          this.steps = this.steps.map((s) => (s.trigger.kind === "cue" && s.trigger.audioId === op.id ? { ...s, trigger: { kind: "auto" } } : s));
        }
        return;
      }
      case "script.set": {
        const lines = op.lines.map((l, i) => {
          const parsed = ScriptLine.safeParse({ id: `line-${i + 1}`, ...l });
          if (!parsed.success) fail({ code: "invalid-op", message: `Script line ${i + 1} is not valid: ${zodMessage(parsed.error)}.`, path: `${path}.lines.${i}` });
          return parsed.data!;
        });
        this.before.script ??= this.script;
        this.script = lines;
        return;
      }
      case "script.align": {
        const vi = this.audio.findIndex((t) => t.kind === "voiceover");
        if (vi < 0) fail({ code: "invalid-audio", message: "The scene has no voiceover track.", path, hint: "Add a voiceover with audio.add first." });
        let vo = this.audio[vi]!;
        if (op.words) {
          this.before.audio ??= this.audio;
          vo = { ...vo, transcript: { words: op.words } };
          this.audio = this.audio.map((t, j) => (j === vi ? vo : t));
        }
        const words = vo.transcript?.words ?? [];
        if (words.length === 0) fail({ code: "invalid-audio", message: "The voiceover has no transcript.", path, hint: "Give the transcript words in 'words'." });
        if (this.script.length === 0) fail({ code: "invalid-op", message: "The scene has no script.", path, hint: "Set the script with script.set first." });
        const result = alignScript(this.script.map((l) => l.text), words, op.onsets ? { onsets: op.onsets } : {});
        this.before.script ??= this.script;
        this.script = this.script.map((l, k) => {
          const next: ScriptLine = { ...l };
          if (result[k]!.unmatched) next.unmatched = true;
          else delete next.unmatched;
          return next;
        });
        // Source time to video time.
        const offset = vo.startMs - vo.trimStartMs;
        const cue = new Map<string, number>();
        this.script.forEach((l, k) => {
          const a = result[k]!;
          if (l.stepId && a.startMs !== null) cue.set(l.stepId, Math.max(0, Math.round(a.startMs + offset)));
        });
        if (cue.size > 0) {
          this.touchSteps();
          this.steps = this.steps.map((st) => (cue.has(st.id) ? { ...st, trigger: { kind: "cue", audioId: vo.id, atMs: cue.get(st.id)! } } : st));
        }
        return;
      }
      case "comment.add": {
        const kindOk = op.target.kind === "element" ? !!this.elements[op.target.id] : this.steps.some((st) => st.id === op.target.id);
        if (!kindOk) fail({ code: "invalid-op", message: `The ${op.target.kind} '${op.target.id}' does not exist.`, path: `${path}.target` });
        if (op.replyTo && !this.comments.some((c) => c.id === op.replyTo)) fail({ code: "invalid-op", message: `The comment '${op.replyTo}' does not exist.`, path: `${path}.replyTo` });
        let n = this.comments.length + 1;
        while (this.comments.some((c) => c.id === `cm-${n}`)) n++;
        const id = op.id ?? `cm-${n}`;
        if (this.comments.some((c) => c.id === id)) fail({ code: "duplicate-id", message: `The comment '${id}' exists already.`, path: `${path}.id` });
        const parsed = Comment.safeParse({ id, target: op.target, author: op.author ?? "You", text: op.text, at: op.at ?? "", ...(op.replyTo ? { replyTo: op.replyTo } : {}) });
        if (!parsed.success) fail({ code: "invalid-op", message: `The comment is not valid: ${zodMessage(parsed.error)}.`, path });
        this.before.comments ??= this.comments;
        this.comments = [...this.comments, parsed.data!];
        this.created.push(id);
        return;
      }
      case "comment.update": {
        const i = this.comments.findIndex((c) => c.id === op.id);
        if (i < 0) fail({ code: "invalid-op", message: `The comment '${op.id}' does not exist.`, path: `${path}.id` });
        const parsed = Comment.safeParse({ ...this.comments[i]!, ...op.set, id: op.id });
        if (!parsed.success) fail({ code: "invalid-op", message: `The comment is not valid: ${zodMessage(parsed.error)}.`, path: `${path}.set` });
        this.before.comments ??= this.comments;
        this.comments = this.comments.map((c, j) => (j === i ? parsed.data! : c));
        return;
      }
      case "comment.remove": {
        if (!this.comments.some((c) => c.id === op.id)) fail({ code: "invalid-op", message: `The comment '${op.id}' does not exist.`, path: `${path}.id` });
        this.before.comments ??= this.comments;
        // Answers go with the comment.
        this.comments = this.comments.filter((c) => c.id !== op.id && c.replyTo !== op.id);
        return;
      }
      case "scene.meta": {
        this.before.meta ??= this.meta;
        this.meta = { ...this.meta, ...(op.set as Partial<Scene["meta"]>) };
        return;
      }
    }
  }

  /** Deterministic seed from the element ID, so the same ID gives the same sketch lines. */
  private seedFor(id: string): number {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    return (h >>> 0) % 2147483647 || 1;
  }

  /** Text cells of a new table, one for each row and column. */
  private addTableCells(t: Extract<Element, { type: "table" }>, cells: unknown[][], path: string, onlyMissing = false): void {
    const fontSize = Math.max(14, Math.min(28, Math.round((t.height / t.rows) * 0.45)));
    for (let r = 1; r <= t.rows; r++) {
      for (let c = 1; c <= t.cols; c++) {
        const id = tableCellId(t.id, r, c);
        if (onlyMissing && this.elements[id]?.parentId === t.id) continue;
        if (this.elements[id]) fail({ code: "duplicate-id", message: `The element ID '${id}' exists already. A table cell needs it.`, path, hint: "Use another table ID." });
        const text = cells[r - 1]?.[c - 1];
        const box = tableCellBox(t, r, c);
        const cell = this.parseElement(
          {
            id,
            type: "text",
            parentId: t.id,
            z: this.topKey(),
            seed: this.seedFor(id),
            ...box,
            autoSize: false,
            content: { text: text === undefined || text === null ? "" : String(text) },
            style: { fontSize, textAlign: "center", ...(t.header && r === 1 ? { fontWeight: 700 } : {}) },
          },
          path,
        );
        this.touch(id);
        this.elements[id] = cell;
        this.created.push(id);
      }
    }
  }

  /** After a table changes its box, rows, or columns: move the cells, add new cells, remove cells that are outside. */
  private syncTableCells(old: Extract<Element, { type: "table" }>, t: Extract<Element, { type: "table" }>, path: string): void {
    if (old.header !== t.header) {
      // Header cells are bold.
      for (let c = 1; c <= t.cols; c++) {
        const cell = this.elements[tableCellId(t.id, 1, c)];
        if (!cell || cell.parentId !== t.id) continue;
        this.touch(cell.id);
        const style = { ...cell.style };
        if (t.header) style.fontWeight = 700;
        else delete style.fontWeight;
        this.elements[cell.id] = { ...cell, style };
      }
    }
    const same = (["x", "y", "width", "height", "rows", "cols"] as const).every((k) => old[k] === t[k]);
    if (same) return;
    for (const c of Object.values(this.elements)) {
      if (c.parentId !== t.id) continue;
      const m = /-r(\d+)c(\d+)$/.exec(c.id);
      const r = m ? Number(m[1]) : 0;
      const col = m ? Number(m[2]) : 0;
      if (!m || r > t.rows || col > t.cols) {
        this.removeElement(c.id);
        continue;
      }
      this.touch(c.id);
      this.elements[c.id] = { ...c, ...tableCellBox(t, r, col) };
    }
    const missing: unknown[][] = [];
    let any = false;
    for (let r = 1; r <= t.rows; r++) for (let col = 1; col <= t.cols; col++) if (!this.elements[tableCellId(t.id, r, col)]) any = true;
    if (any) this.addTableCells(t, missing, path, true);
  }

  /** Comments on a removed element or step go with it. */
  private dropComments(kind: "element" | "step", id: string): void {
    if (!this.comments.some((c) => c.target.kind === kind && c.target.id === id)) return;
    this.before.comments ??= this.comments;
    const gone = new Set(this.comments.filter((c) => c.target.kind === kind && c.target.id === id).map((c) => c.id));
    this.comments = this.comments.filter((c) => !gone.has(c.id) && !(c.replyTo && gone.has(c.replyTo)));
  }

  private removeElement(id: string): void {
    const el = this.elements[id];
    if (!el) return;
    this.dropComments("element", id);
    // The cells of a table go with the table.
    if (el.type === "table") for (const c of Object.values(this.elements)) if (c.parentId === id) this.removeElement(c.id);
    this.touch(id);
    delete this.elements[id];
    for (const other of Object.values(this.elements)) {
      if (other.parentId === id) {
        this.touch(other.id);
        const rest = { ...other };
        delete rest.parentId;
        this.elements[other.id] = rest;
      }
      if (other.type === "connector") {
        const c = this.elements[other.id] as ConnectorElement;
        const fix = (end: ConnectorElement["start"]) =>
          end.kind === "bound" && end.elementId === id ? { kind: "free" as const, x: el.x + el.width / 2, y: el.y + el.height / 2 } : end;
        const start = fix(c.start);
        const end = fix(c.end);
        if (start !== c.start || end !== c.end) {
          this.touch(c.id);
          this.elements[c.id] = { ...c, start, end };
        }
      }
    }
    if (this.steps.some((s) => s.actions.some((a) => a.targets.includes(id) || (a.type === "flow" && (a.flow.chainFrom === id || a.flow.skip.includes(id)))))) {
      this.touchSteps();
      for (const step of this.steps) {
        step.actions = step.actions
          .map((a) => {
            let next = { ...a, targets: a.targets.filter((t) => t !== id) } as typeof a;
            if (next.type === "flow") {
              const flow = { ...next.flow, skip: next.flow.skip.filter((s) => s !== id) };
              if (flow.chainFrom === id) delete flow.chainFrom;
              next = { ...next, flow };
            }
            return next;
          })
          .filter((a) => a.targets.length > 0 || a.type === "wait");
      }
    }
  }

  private rename(from: string, to: string, path: string): void {
    const el = this.requireElement(from, `${path}.id`);
    if (from === to) return;
    const parsed = ElementId.safeParse(to);
    if (!parsed.success) fail({ code: "invalid-element", message: `The ID '${to}' is not valid. ${parsed.error.issues[0]?.message ?? ""}`, path: `${path}.to` });
    if (this.elements[to]) fail({ code: "duplicate-id", message: `Element '${to}' exists already.`, path: `${path}.to` });
    this.touch(from);
    this.touch(to);
    delete this.elements[from];
    this.elements[to] = { ...el, id: to };
    for (const other of Object.values(this.elements)) {
      let next: Element = other;
      if (other.parentId === from) next = { ...next, parentId: to };
      if (next.type === "connector") {
        const sw = (e: ConnectorElement["start"]) => (e.kind === "bound" && e.elementId === from ? { ...e, elementId: to } : e);
        const start = sw(next.start);
        const end = sw(next.end);
        if (start !== next.start || end !== next.end) next = { ...next, start, end };
      }
      if (next !== other) {
        this.touch(other.id);
        this.elements[other.id] = next;
      }
    }
    this.touchSteps();
    for (const step of this.steps) {
      step.actions = step.actions.map((a) => {
        let next = { ...a, targets: a.targets.map((t) => (t === from ? to : t)) } as typeof a;
        if (next.type === "flow") {
          const flow = { ...next.flow, skip: next.flow.skip.map((s) => (s === from ? to : s)) };
          if (flow.chainFrom === from) flow.chainFrom = to;
          next = { ...next, flow };
        }
        return next;
      });
    }
  }

  private reorder(op: Extract<Operation, { op: "element.reorder" }>, path: string): void {
    const el = this.requireElement(op.id, `${path}.id`);
    const sorted = Object.values(this.elements)
      .filter((e) => e.id !== op.id)
      .sort((a, b) => (a.z < b.z ? -1 : a.z > b.z ? 1 : 0));
    const idx = Object.values(this.elements)
      .sort((a, b) => (a.z < b.z ? -1 : a.z > b.z ? 1 : 0))
      .findIndex((e) => e.id === op.id);
    let z: string;
    const zAt = (i: number) => sorted[i]?.z ?? null;
    if (op.to === "front") z = keyBetween(zAt(sorted.length - 1), null);
    else if (op.to === "back") z = keyBetween(null, zAt(0));
    else if (op.to === "forward") z = idx >= sorted.length ? el.z : keyBetween(zAt(idx), zAt(idx + 1));
    else if (op.to === "backward") z = idx <= 0 ? el.z : keyBetween(zAt(idx - 2), zAt(idx - 1));
    else {
      const above = this.requireElement(op.to.above, `${path}.to.above`);
      const i = sorted.findIndex((e) => e.id === above.id);
      z = keyBetween(above.z, zAt(i + 1));
    }
    this.touch(op.id);
    this.elements[op.id] = { ...el, z };
  }

  private place(op: Extract<Operation, { op: "element.place" }>, path: string): void {
    const el = this.requireElement(op.id, `${path}.id`);
    const refs = (["rightOf", "leftOf", "above", "below"] as const).filter((k) => op[k] !== undefined);
    if (refs.length !== 1) fail({ code: "invalid-op", message: "element.place needs exactly one of: rightOf, leftOf, above, below.", path });
    const key = refs[0]!;
    const ref = this.requireElement(op[key]!, `${path}.${key}`);
    let x: number;
    let y: number;
    if (key === "rightOf" || key === "leftOf") {
      x = key === "rightOf" ? ref.x + ref.width + op.gap : ref.x - op.gap - el.width;
      y = op.align === "start" ? ref.y : op.align === "end" ? ref.y + ref.height - el.height : ref.y + (ref.height - el.height) / 2;
    } else {
      y = key === "below" ? ref.y + ref.height + op.gap : ref.y - op.gap - el.height;
      x = op.align === "start" ? ref.x : op.align === "end" ? ref.x + ref.width - el.width : ref.x + (ref.width - el.width) / 2;
    }
    this.touch(op.id);
    this.elements[op.id] = { ...el, x, y };
  }
}
