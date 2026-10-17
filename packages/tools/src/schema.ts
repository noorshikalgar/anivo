import { Transaction } from "@anivo/ops";
import { Scene } from "@anivo/schema";
import { z } from "zod";

/** JSON Schema of the scene or of an operation transaction (docs/05 "Published schema"). */
export function jsonSchema(kind: "scene" | "ops"): unknown {
  return z.toJSONSchema(kind === "scene" ? Scene : Transaction, { io: "input", unrepresentable: "any" });
}
