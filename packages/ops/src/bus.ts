import { syncAlongOps } from "./along.js";
import { type Element, type Scene, checkReferences } from "@anivo/schema";
import { Draft, type OpError, OpFailure, type Snapshot } from "./apply.js";
import { type Author, Operation, Transaction, type TransactionInput } from "./operations.js";

export interface HistoryEntry {
  /** Sequence number of the entry. */
  seq: number;
  author: Author;
  label: string;
  /** Scene version after the transaction. */
  version: number;
  before: Snapshot;
  after: Snapshot;
  /** Transactions in a row with the same key merge into this entry. */
  mergeKey?: string;
}

export type ApplyResult =
  | { ok: true; version: number; created: string[]; warnings: string[] }
  | { ok: false; error: OpError };

export type BusListener = (scene: Scene, entry: HistoryEntry) => void;

const MAX_HISTORY = 500;

function afterSnapshot(before: Snapshot, scene: Scene): Snapshot {
  const elements = new Map<string, Element | undefined>();
  for (const id of before.elements.keys()) elements.set(id, scene.elements[id]);
  const out: Snapshot = { elements };
  if (before.steps) out.steps = scene.steps;
  if (before.settings) out.settings = scene.settings;
  if (before.meta) out.meta = scene.meta;
  if (before.audio) out.audio = scene.audio;
  if (before.script) out.script = scene.script;
  if (before.assets) out.assets = scene.assets;
  if (before.comments) out.comments = scene.comments;
  return out;
}

function restore(scene: Scene, snap: Snapshot): Scene {
  const elements = { ...scene.elements };
  for (const [id, el] of snap.elements) {
    if (el) elements[id] = el;
    else delete elements[id];
  }
  return {
    ...scene,
    elements,
    steps: snap.steps ?? scene.steps,
    settings: snap.settings ?? scene.settings,
    meta: snap.meta ?? scene.meta,
    audio: snap.audio ?? scene.audio,
    script: snap.script ?? scene.script,
    assets: snap.assets ?? scene.assets,
    comments: snap.comments ?? scene.comments,
  };
}

/**
 * The single entry point for scene changes (docs/09 "Bus rules").
 *
 * 1. Validate all operations of a transaction before the scene changes.
 * 2. Apply operations in sequence on a draft. A later operation can use an ID from an earlier one.
 * 3. If one operation fails, apply none.
 * 4. Record the transaction with its author and label.
 */
export class OperationBus {
  private current: Scene;
  private ver = 0;
  private seq = 0;
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];
  private readonly listeners = new Set<BusListener>();
  /** Version of the last change of each element, for conflict checks. */
  private readonly changedAt = new Map<string, number>();

  constructor(scene: Scene) {
    this.current = scene;
  }

  get scene(): Scene {
    return this.current;
  }

  get version(): number {
    return this.ver;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** History entries, oldest first. */
  get history(): readonly HistoryEntry[] {
    return this.undoStack;
  }

  subscribe(listener: BusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Replace the scene, for example after a file open. Clears the history. */
  reset(scene: Scene): void {
    this.current = scene;
    this.ver++;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.changedAt.clear();
  }

  apply(input: TransactionInput | unknown): ApplyResult {
    const parsed = Transaction.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        ok: false,
        error: {
          code: "invalid-op",
          message: `The transaction is not valid: ${issue?.message ?? "unknown problem"}.`,
          path: issue?.path.join(".") ?? "",
          hint: "Each operation needs an 'op' field, for example 'element.add'. Call anivo_schema with kind 'ops' to see all operations.",
        },
      };
    }
    const tx = parsed.data;
    const draft = new Draft(this.current);
    try {
      tx.ops.forEach((op, i) => draft.apply(op, `ops.${i}`));
      // Motions along a connector follow the connector when it moves (docs/17 P2), in the same history entry.
      const mid = draft.finish();
      if (mid.steps.some((st) => st.actions.some((a) => a.type === "motion" && a.motion.along))) {
        syncAlongOps(mid).forEach((op, i) => draft.apply(Operation.parse(op), `sync.${i}`));
      }
    } catch (err) {
      if (err instanceof OpFailure) return { ok: false, error: err.error };
      throw err;
    }

    if (tx.baseVersion !== undefined) {
      const conflicted = draft.touchedElements().filter((id) => (this.changedAt.get(id) ?? 0) > tx.baseVersion!);
      if (conflicted.length > 0) {
        return {
          ok: false,
          error: {
            code: "conflict",
            message: `Elements ${conflicted.join(", ")} changed after version ${tx.baseVersion}.`,
            path: "baseVersion",
            hint: `Read the scene again (version ${this.ver}), then send the transaction again.`,
          },
        };
      }
    }

    const next = draft.finish();
    const issues = checkReferences(next);
    if (issues.length > 0) {
      return { ok: false, error: { code: "invalid-scene", message: issues[0]!.message, path: issues[0]!.path } };
    }

    this.commit(next, tx.author, tx.label, draft.before, true, tx.mergeKey);
    return { ok: true, version: this.ver, created: draft.created, warnings: [] };
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.redoStack.push(entry);
    this.swap(restore(this.current, entry.before), { kind: "undo" }, `Undo ${entry.label}`, entry.after, entry.before);
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.undoStack.push(entry);
    this.swap(restore(this.current, entry.after), { kind: "redo" }, `Redo ${entry.label}`, entry.before, entry.after);
    return true;
  }

  private commit(next: Scene, author: Author, label: string, before: Snapshot, record: boolean, mergeKey?: string): HistoryEntry {
    this.current = next;
    this.ver++;
    for (const id of before.elements.keys()) this.changedAt.set(id, this.ver);
    const last = this.undoStack[this.undoStack.length - 1];
    if (record && mergeKey !== undefined && last?.mergeKey === mergeKey && this.redoStack.length === 0) {
      // One gesture, one undo step: keep the state before the first transaction of the gesture.
      const merged: Snapshot = { ...before, ...last.before, elements: new Map([...before.elements, ...last.before.elements]) };
      const entry: HistoryEntry = { seq: ++this.seq, author, label, version: this.ver, before: merged, after: afterSnapshot(merged, next), mergeKey };
      this.undoStack[this.undoStack.length - 1] = entry;
      for (const l of this.listeners) l(next, entry);
      return entry;
    }
    const entry: HistoryEntry = { seq: ++this.seq, author, label, version: this.ver, before, after: afterSnapshot(before, next), ...(mergeKey !== undefined ? { mergeKey } : {}) };
    if (record) {
      this.undoStack.push(entry);
      if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    for (const l of this.listeners) l(next, entry);
    return entry;
  }

  /** Apply an undo or redo without a change to the undo and redo stacks. */
  private swap(next: Scene, author: Author, label: string, from: Snapshot, to: Snapshot): void {
    this.current = next;
    this.ver++;
    for (const id of to.elements.keys()) this.changedAt.set(id, this.ver);
    const entry: HistoryEntry = { seq: ++this.seq, author, label, version: this.ver, before: from, after: to };
    for (const l of this.listeners) l(next, entry);
  }
}
