import type { Page } from "@playwright/test";

export const EDITOR = "http://localhost:5173/";

export interface El {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: { text: string };
  content?: { text: string };
  pack?: string;
  name?: string;
  style?: Record<string, unknown>;
  start?: { kind: string; elementId?: string };
  end?: { kind: string; elementId?: string };
}

export interface Action {
  id: string;
  type: string;
  targets: string[];
  effect?: string;
  to?: Record<string, number>;
  durationMs?: number;
}

export interface EditorState {
  scene: {
    meta: { title: string };
    settings: { style: string; theme: string };
    elements: Record<string, El>;
    steps: { id: string; title: string; holdMs: number; actions: Action[] }[];
  };
  selection: string[];
  selectedStep: string | null;
  view: { x: number; y: number; zoom: number };
  tool: string;
}

/** Read the editor store (dev builds expose it as window.__anivo). */
export function state(page: Page): Promise<EditorState> {
  return page.evaluate(() => (window as unknown as { __anivo: { getState(): EditorState } }).__anivo.getState());
}

/** Page point of a scene point. */
export async function screen(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = (await page.getByTestId("canvas-root").boundingBox())!;
  const { view } = await state(page);
  return { x: box.x + (x - view.x) * view.zoom, y: box.y + (y - view.y) * view.zoom };
}

export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

export async function openEditor(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 860 });
  await page.goto(EDITOR);
  await page.getByRole("navigation", { name: "Steps" }).waitFor();
}
