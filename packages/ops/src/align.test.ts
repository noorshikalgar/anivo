import { readFileSync } from "node:fs";
import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { alignScript, normalizeWords, numberWords } from "./align.js";
import { OperationBus } from "./bus.js";

/** Transcript words, 300 ms each with 100 ms gaps, from `startMs`. */
function speak(text: string, startMs = 0) {
  return text.split(/\s+/).map((w, i) => ({ text: w, startMs: startMs + i * 400, endMs: startMs + i * 400 + 300 }));
}

describe("normalizeWords", () => {
  it("removes punctuation and case, and writes numbers as words", () => {
    expect(normalizeWords("HTTP/2: 3 pods, don't panic!")).toEqual(["http", "two", "three", "pods", "dont", "panic"]);
    expect(numberWords(1024)).toEqual(["one", "thousand", "twenty", "four"]);
    expect(numberWords(80)).toEqual(["eighty"]);
  });
});

describe("alignScript", () => {
  it("finds the start of each line, with speech errors and extra words", () => {
    const transcript = [
      ...speak("um so a user sends a request", 0),
      ...speak("the load balancer picks one of three pods", 3000),
      ...speak("and the pod sends the answer back", 7000),
    ];
    const r = alignScript(["A user sends a request.", "The load balancer picks one of 3 pods.", "The pod sends the answer back."], transcript);
    expect(r.map((x) => x.startMs)).toEqual([800, 3000, 7400]);
    expect(r.every((x) => !x.unmatched)).toBe(true);
    expect(r[1]!.matched).toBe(1);
  });

  it("accepts small spelling differences (fuzzy match)", () => {
    const r = alignScript(["Kubernetes schedules the pods"], speak("kubernetis schedules the pods", 500));
    expect(r[0]!.startMs).toBe(500);
  });

  it("marks a line with less than half of its words matched", () => {
    const r = alignScript(["Hello there.", "This line was never spoken at all.", "Goodbye now."], [...speak("hello there", 0), ...speak("goodbye now", 2000)]);
    expect(r[1]!.unmatched).toBe(true);
    expect(r[1]!.startMs).toBeNull();
    expect(r[2]!.startMs).toBe(2000);
  });
});

describe("script.align operation", () => {
  const base = JSON.parse(readFileSync(new URL("../../schema/fixtures/v1-load-balancer.json", import.meta.url), "utf8")) as { steps: { id: string }[] };
  const ids = base.steps.map((s) => s.id);
  const r = loadScene({
    ...base,
    assets: { "0123456789abcdef": { id: "0123456789abcdef", mime: "audio/wav", bytes: 10 } },
    audio: [{ id: "voiceover", kind: "voiceover", assetId: "0123456789abcdef", durationMs: 60000, startMs: 1000, trimStartMs: 200 }],
    script: [
      { id: "l1", text: "A user opens the site.", stepId: ids[0] },
      { id: "l2", text: "The load balancer takes the request.", stepId: ids[1] },
      { id: "l3", text: "Something nobody said.", stepId: ids[2] },
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));

  it("sets cue triggers in video time and marks unmatched lines", () => {
    const bus = new OperationBus(r.scene);
    const words = [...speak("a user opens the site", 1000), ...speak("then the load balancer takes the request", 4000)];
    const res = bus.apply({ label: "Align", ops: [{ op: "script.align", words }] });
    expect(res.ok).toBe(true);
    const s = bus.scene;
    // Video time = transcript time + track start - trim start.
    expect(s.steps[0]!.trigger).toEqual({ kind: "cue", audioId: "voiceover", atMs: 1000 + 800 });
    expect(s.steps[1]!.trigger).toEqual({ kind: "cue", audioId: "voiceover", atMs: 4400 + 800 });
    expect(s.steps[2]!.trigger.kind).not.toBe("cue");
    expect(s.script[2]!.unmatched).toBe(true);
    expect(s.audio[0]!.transcript?.words).toHaveLength(words.length);
    bus.undo();
    expect(bus.scene.steps[0]!.trigger.kind).not.toBe("cue");
    expect(bus.scene.audio[0]!.transcript).toBeUndefined();
  });

  it("fails with a hint when there is no transcript", () => {
    const res = new OperationBus(r.scene).apply({ label: "Align", ops: [{ op: "script.align" }] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.hint).toMatch(/words/);
  });
});
