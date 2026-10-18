import { describe, expect, it } from "vitest";
import { parseTranscript } from "./transcribe.js";

describe("parseTranscript", () => {
  it("reads a word list and an object with words", () => {
    const words = [{ text: "hello", startMs: 0, endMs: 300 }];
    expect(parseTranscript(words)).toEqual(words);
    expect(parseTranscript({ words })).toEqual(words);
  });
  it("reads whisper.cpp JSON and skips special tokens and punctuation", () => {
    const json = {
      transcription: [
        { offsets: { from: 0, to: 0 }, text: "" },
        { offsets: { from: 0, to: 320 }, text: " Hello" },
        { offsets: { from: 320, to: 330 }, text: "," },
        { offsets: { from: 400, to: 700 }, text: " world" },
        { offsets: { from: 700, to: 2000 }, text: " [BLANK_AUDIO]" },
      ],
    };
    expect(parseTranscript(json)).toEqual([
      { text: "Hello", startMs: 0, endMs: 320 },
      { text: "world", startMs: 400, endMs: 700 },
    ]);
  });
  it("fails with a hint for an unknown format", () => {
    expect(() => parseTranscript({ foo: 1 })).toThrow(/unknown format/);
    expect(() => parseTranscript([{ text: "a" }])).toThrow(/not valid/);
  });
});
