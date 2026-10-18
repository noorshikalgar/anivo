import { expect, test } from "@playwright/test";
import { openEditor, state } from "./helpers.js";

/** A mono 16-bit WAV of a tone, `seconds` long. */
function wav(seconds: number, rate = 16000): Buffer {
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 4) * 9000), 44 + i * 2);
  return b;
}

test("make the voiceover from the script: each step gets a cue at its line", async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    const st = (window as unknown as { __anivo: { getState(): { scene: { steps: { id: string }[] }; apply(tx: unknown): unknown } } }).__anivo.getState();
    const ids = st.scene.steps.map((s) => s.id);
    st.apply({ ops: [{ op: "script.set", lines: [{ text: "One.", stepId: ids[0] }, { text: "Two two.", stepId: ids[1] }, { text: "Three three three.", stepId: ids[2] }] }] });
  });
  const inputs: string[] = [];
  await page.route("http://tts.local/v1/audio/speech", async (r) => {
    const body = r.request().postDataJSON() as { input: string; voice: string };
    inputs.push(body.input);
    expect(body.voice).toBe("alloy");
    await r.fulfill({ body: wav(inputs.length * 0.5), contentType: "audio/wav" });
  });
  await page.getByRole("button", { name: "Audio", exact: true }).click();
  await page.getByRole("menuitem", { name: "Make voiceover from script…" }).click();
  const dlg = page.getByRole("dialog", { name: "Voiceover from script" });
  await dlg.getByRole("textbox", { name: "Service URL (OpenAI-compatible)" }).fill("http://tts.local/v1");
  await dlg.getByRole("button", { name: "Make voiceover" }).click();
  await expect(dlg).toHaveCount(0);
  expect(inputs).toEqual(["One.", "Two two.", "Three three three."]);
  const s = (await state(page)) as unknown as { scene: { audio: { kind: string; durationMs: number }[]; steps: { trigger: { kind: string; atMs?: number } }[] } };
  expect(s.scene.audio[0]!.kind).toBe("voiceover");
  // Lead 400 ms, then each clip (0.5 s, 1 s, 1.5 s) and a 600 ms gap.
  expect(s.scene.steps.slice(0, 3).map((x) => x.trigger.atMs)).toEqual([400, 1500, 3100]);
  expect(s.scene.audio[0]!.durationMs).toBeGreaterThan(5000);
});
