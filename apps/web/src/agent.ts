/**
 * The web editor side of the agent bridge (FR-AGENT-08, FR-AGENT-09, docs/09 "Bridge").
 * `anivo mcp --attach --web` listens on 127.0.0.1; the editor connects with the
 * pairing code. The agent reads the scene and sends transactions. In review mode
 * the transactions wait in a queue until the user accepts or rejects them.
 */
import { sceneToJson } from "@anivo/fileio";
import { OperationBus, type TransactionInput } from "@anivo/ops";
import type { Scene } from "@anivo/schema";
import { notify } from "./notify.js";
import { useEditor } from "./store.js";

export interface PendingTx {
  id: number;
  label: string;
  tx: TransactionInput;
  /** Elements that the transaction adds or changes, with their boxes after the change. */
  boxes: { id: string; x: number; y: number; width: number; height: number }[];
}

export interface AgentState {
  status: "connecting" | "connected";
  name: string;
  port: number;
  /** Review mode: agent transactions wait for the user. */
  review: boolean;
  pending: PendingTx[];
  /** Elements that the agent changed last, and when (for the 2 s outline and the cursor). */
  activity: { ids: string[]; at: number } | null;
}

let socket: WebSocket | null = null;
let nextPending = 1;

const set = (patch: Partial<AgentState> | null) =>
  useEditor.setState((s) => ({ agent: patch === null ? null : ({ ...(s.agent ?? { status: "connecting", name: "agent", port: 0, review: true, pending: [], activity: null }), ...patch } as AgentState) }));

const toBase64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

/** IDs of the elements that differ between two scenes (copy-on-write makes this a pointer compare). */
function changedIds(before: Scene, after: Scene): string[] {
  return Object.keys(after.elements).filter((id) => before.elements[id] !== after.elements[id]);
}

function applyNow(tx: TransactionInput, agent: string) {
  const st = useEditor.getState();
  const before = st.scene;
  const r = st.bus.apply({ ...tx, author: { kind: "agent", name: agent } });
  if (r.ok) set({ activity: { ids: changedIds(before, useEditor.getState().scene), at: performance.now() } });
  return r;
}

async function handle(method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
  const st = useEditor.getState();
  if (method === "scene") {
    const assets: Record<string, string> = {};
    if (params?.["assets"]) for (const id of Object.keys(st.scene.assets)) {
      const b = st.assets.get(id);
      if (b) assets[id] = toBase64(b);
    }
    return { scene: JSON.parse(sceneToJson(st.scene)), assets };
  }
  if (method === "apply") {
    const tx = params?.["tx"] as TransactionInput;
    const agent = String(params?.["agent"] ?? "agent");
    const a = st.agent;
    if (a?.review) {
      // Check the transaction on a copy. It applies to the real scene when the user accepts it.
      const copy = new OperationBus(st.scene);
      const r = copy.apply({ ...tx, author: { kind: "agent", name: agent } });
      if (!r.ok) return r;
      const ids = changedIds(st.scene, copy.scene);
      const boxes = ids.flatMap((id) => {
        const e = copy.scene.elements[id];
        return e && e.type !== "connector" && e.type !== "group" ? [{ id, x: e.x, y: e.y, width: e.width, height: e.height }] : [];
      });
      set({ pending: [...a.pending, { id: nextPending++, label: tx.label ?? "Agent change", tx: { ...tx, author: { kind: "agent", name: agent } }, boxes }] });
      return { ...r, pending: true };
    }
    return applyNow(tx, agent);
  }
  if (method === "undo") {
    st.undo();
    return { ok: true };
  }
  throw new Error(`Unknown request '${method}'.`);
}

/** Connect to the bridge. The promise ends when the bridge accepts or refuses the code. */
export function connectAgent(port: number, code: string): Promise<void> {
  disconnectAgent();
  set({ status: "connecting", port, pending: [], activity: null });
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}`);
    } catch {
      set(null);
      reject(new Error("The address is not valid."));
      return;
    }
    socket = ws;
    let welcomed = false;
    ws.onopen = () => ws.send(JSON.stringify({ type: "hello", code: code.trim() }));
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as { type: string; id?: number; method?: string; params?: Record<string, unknown> };
      if (msg.type === "welcome") {
        welcomed = true;
        set({ status: "connected" });
        resolve();
        return;
      }
      if (msg.type === "request" && msg.id !== undefined) {
        handle(msg.method ?? "", msg.params).then(
          (result) => ws.send(JSON.stringify({ type: "response", id: msg.id, result })),
          (err: unknown) => ws.send(JSON.stringify({ type: "response", id: msg.id, error: err instanceof Error ? err.message : String(err) })),
        );
      }
    };
    ws.onclose = (e) => {
      if (socket === ws) socket = null;
      if (!welcomed) {
        set(null);
        reject(new Error(e.reason || "The bridge did not answer. Check that 'anivo mcp --attach --web' runs, and the port."));
        return;
      }
      if (useEditor.getState().agent) notify("The agent disconnected.", "info");
      set(null);
    };
  });
}

export function disconnectAgent(): void {
  const ws = socket;
  socket = null;
  ws?.close();
  if (useEditor.getState().agent) set(null);
}

/** Accept a pending agent transaction: it applies to the scene now. */
export function acceptPending(id: number): void {
  const a = useEditor.getState().agent;
  const p = a?.pending.find((x) => x.id === id);
  if (!a || !p) return;
  const r = applyNow(p.tx, String(p.tx.author?.name ?? a.name));
  set({ pending: (useEditor.getState().agent?.pending ?? []).filter((x) => x.id !== id) });
  if (!r.ok) notify(`The agent change no longer applies: ${r.error.message}`, "error");
}

/** Reject a pending transaction. It does not go into the undo history. */
export function rejectPending(id: number): void {
  const a = useEditor.getState().agent;
  if (a) set({ pending: a.pending.filter((x) => x.id !== id) });
}

export function acceptAll(): void {
  for (const p of [...(useEditor.getState().agent?.pending ?? [])]) acceptPending(p.id);
}

export function setReview(review: boolean): void {
  set({ review });
  if (!review) acceptAll();
}
