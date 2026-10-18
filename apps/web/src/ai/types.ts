/** Types and defaults of the AI panel. The provider code loads only when the user sends a message. */
import type Anthropic from "@anthropic-ai/sdk";

export type ProviderKind = "anthropic" | "openai" | "ollama";

export interface AiSettings {
  provider: ProviderKind;
  model: string;
  /** For OpenAI-compatible endpoints and Ollama. */
  baseUrl: string;
  apiKey: string;
}

export const DEFAULTS: Record<ProviderKind, { model: string; baseUrl: string }> = {
  anthropic: { model: "claude-sonnet-5-5", baseUrl: "https://api.anthropic.com" },
  openai: { model: "gpt-4.1", baseUrl: "https://api.openai.com/v1" },
  ollama: { model: "qwen3", baseUrl: "http://localhost:11434/v1" },
};

/** One item of the visible conversation. */
export type ChatItem = { kind: "user" | "assistant"; text: string } | { kind: "tool"; name: string; summary: string; error: boolean } | { kind: "error"; text: string };

/** The conversation state that the provider keeps between user messages. */
export type History = { anthropic: Anthropic.MessageParam[]; openai: Record<string, unknown>[] };
export const newHistory = (): History => ({ anthropic: [], openai: [] });
