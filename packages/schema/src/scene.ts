import * as z from "zod";
import { AssetRef, AudioTrack, ScriptLine } from "./audio.js";
import { Element } from "./elements.js";
import { Color, Rect } from "./primitives.js";
import { EasingName, EnterEffect, Step } from "./steps.js";

/** The current scene file format version. See docs/05-scene-model.md. */
export const SCHEMA_VERSION = 1;

export const SceneStyle = z.enum(["sketch", "clean"]);
export type SceneStyle = z.infer<typeof SceneStyle>;

export const VideoSettings = z.object({
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).default(60),
});

/** A comment on an element or a step (FR-SHARE-03). People and agents read and answer them. */
export const Comment = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,48}$/),
  target: z.object({ kind: z.enum(["element", "step"]), id: z.string() }),
  author: z.string().default("You"),
  text: z.string().min(1).max(4000),
  /** ISO time. */
  at: z.string().default(""),
  resolved: z.boolean().default(false),
  /** The comment that this one answers. */
  replyTo: z.string().optional(),
});
export type Comment = z.infer<typeof Comment>;

/** A custom theme (FR-STYLE-03): a built-in theme with changed colors. Also the theme file format. */
export const CustomTheme = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/).describe("Theme name. Set settings.theme to this name to use the theme."),
  base: z.string().default("slate-dark").describe("Built-in theme that gives the values that the custom theme does not change."),
  dark: z.boolean().optional(),
  tokens: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/)).default({}).describe("Color tokens, for example { accent: '#FF5A1F' }."),
  strokeWidth: z.number().positive().optional(),
  cornerRadius: z.number().nonnegative().optional(),
});
export type CustomTheme = z.infer<typeof CustomTheme>;

export const SceneSettings = z.object({
  style: SceneStyle.default("clean"),
  theme: z.string().default("slate-dark"),
  customTheme: CustomTheme.optional(),
  background: z
    .object({ kind: z.enum(["solid", "grid", "dots", "transparent"]).default("solid"), color: Color.optional() })
    .default({ kind: "solid" }),
  video: VideoSettings.default(VideoSettings.parse({})),
  camera: Rect.optional().describe("Base camera. Omit to use 0,0 and the video size."),
  defaults: z
    .object({
      enterEffect: EnterEffect.default("fade"),
      easing: EasingName.default("ease-out"),
      defaultIconPack: z.string().default("lucide"),
    })
    .default({ enterEffect: "fade", easing: "ease-out", defaultIconPack: "lucide" }),
  motionBlur: z.boolean().optional().describe("Video export: fast moves get a soft trail (docs/19 R13). The editor does not show it."),
});
export type SceneSettings = z.infer<typeof SceneSettings>;

export const SceneMeta = z.object({
  title: z.string().default("Untitled"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  authors: z.array(z.string()).default([]),
});

/** An element on disk. The `id` is optional because the map key is the ID. */
const ElementOnDisk = z.record(z.string(), z.record(z.string(), z.unknown()));

/** Raw scene shape before the loader fills IDs and applies rules. */
export const SceneFile = z.object({
  schemaVersion: z.number().int().positive(),
  id: z.string().default(""),
  meta: SceneMeta.default(SceneMeta.parse({})),
  settings: SceneSettings.default(SceneSettings.parse({})),
  elements: ElementOnDisk.default({}),
  steps: z.array(Step).default([]),
  audio: z.array(AudioTrack).default([]),
  script: z.array(ScriptLine).default([]),
  assets: z.record(z.string(), AssetRef).default({}),
  comments: z.array(Comment).default([]),
});

export const Scene = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string(),
  meta: SceneMeta,
  settings: SceneSettings,
  elements: z.record(z.string(), Element),
  steps: z.array(Step),
  audio: z.array(AudioTrack),
  script: z.array(ScriptLine),
  comments: z.array(Comment),
  assets: z.record(z.string(), AssetRef),
});
export type Scene = z.infer<typeof Scene>;
