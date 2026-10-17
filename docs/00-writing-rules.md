# 00 — Writing rules

All Anivo documents, prompts, UI text, and error messages obey these rules.
The rules come from **ASD-STE100 Simplified Technical English** (STE).
STE is a writing standard from the aerospace industry. Aircraft maintenance manuals use it.
It makes text clear for readers who do not speak English as a first language.
It also makes prompts clear for AI models.

> **Note:** This file is a project summary of STE. It is not the official specification.
> The official specification has an approved dictionary of words. We do not copy that dictionary.
> We use the [glossary](01-glossary.md) as our list of technical names.

## Why STE is good for prompts

- An AI model follows one instruction per sentence more reliably than a long sentence with many clauses.
- A word with one meaning removes guesswork. For example, "frame" means only a video frame in Anivo.
- Imperative sentences ("Do X") are clear commands. Sentences with "should" or "could" are not clear.
- Warnings before the step stop the model before it does the dangerous action.

## Rules for words

1. **Use one word for one meaning.** Use the term from the [glossary](01-glossary.md). Do not use a synonym.
2. **Use one meaning for one word.** Do not use "frame" for a group of elements. Do not use "slide" for a step.
3. **Use the simple form of a verb.** Write "use", not "make use of". Write "start", not "initiate".
4. **Do not use phrasal verbs when a single verb is available.** Write "remove", not "take out". Write "examine", not "look into".
5. **Use technical names exactly.** Write `evaluate()`, `scene.json`, `anivo render`. Put code names in code format.
6. **Do not use "-ing" words as nouns or adjectives** when a different form is clear. Write "the export starts", not "the exporting".
7. **Do not use slang, idioms, or jokes** in documents and prompts.

## Rules for sentences

1. **Write procedural sentences with a maximum of 20 words.**
2. **Write descriptive sentences with a maximum of 25 words.**
3. **Write one instruction in one sentence.** Two actions at the same time are the only exception.
4. **Use the active voice.** Write "The renderer draws the element", not "The element is drawn by the renderer".
5. **Use the imperative for instructions.** Write "Validate the input." Do not write "You should validate the input."
6. **Use "must" for a requirement. Use "can" for a permission.** Do not use "should", "might", or "could" in requirements.
7. **Use the simple tenses**: simple present, simple past, simple future.
8. **Keep the articles** ("a", "an", "the"). Do not remove words to make a sentence shorter.

## Rules for paragraphs and structure

1. **Write one topic in one paragraph.** A paragraph has a maximum of six sentences.
2. **Use a numbered list for a procedure.** Use a bullet list for items that have no sequence.
3. **Use a table to compare items.**
4. **Put the condition before the instruction.** Write "If the file is not valid, show an error."
5. **Write a warning or a caution before the step it applies to.** Do not write it after the step.

## Rules for warnings, cautions, and notes

| Label | Use |
|---|---|
| **WARNING** | Risk of data loss, a security problem, or damage to the user's system |
| **CAUTION** | Risk of a defect, a broken build, or a wrong result |
| **NOTE** | Information that helps. No risk |

Start a warning with a command. Then give the reason.

> **WARNING:** Do not write API keys to the scene file. Other people can read the scene file.

## Rules for requirements and acceptance criteria

1. Give each requirement an identifier, for example `FR-STEP-03`.
2. Write each acceptance criterion as a test that passes or fails.
3. Use numbers. Write "in less than 200 ms", not "fast".

## Rules for UI text and error messages

1. Use sentence case. Write "Export video", not "Export Video".
2. Start a button label with a verb.
3. Write an error message in two parts: what happened, then what to do.
   Example: "The audio file is not valid. Use an MP3, WAV, or M4A file."
4. Do not show a raw exception to the user.

## Example: before and after

**Before:**
> When the user is exporting, it's probably a good idea for the app to make sure that frames aren't dropped, and maybe show some kind of progress.

**After:**
> 1. Render each frame offline. Do not render in real time.
> 2. Do not drop a frame.
> 3. Show the export progress as a percentage.
