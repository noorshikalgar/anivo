import { resolveTimeline } from "@anivo/engine";
import { describe, expect, it } from "vitest";
import { ImportError } from "./excalidraw.js";
import { importMermaid } from "./mermaid.js";

const FLOW = `flowchart LR
  %% a comment
  user((User)) --> lb[Load balancer]
  lb -->|round robin| p1[pod-1] & p2[pod-2]
  lb -.-> cache[(Cache)]
  subgraph backend [Back end]
    p1 --- db{Database}
  end
  classDef red fill:#f00
`;

const SEQ = `sequenceDiagram
  participant C as Client
  actor U
  C->>S: SYN
  S-->>C: SYN-ACK
  Note over C,S: Handshake
  C->>C: Self check
  loop Every minute
  C-xS: FIN
  end
`;

describe("importMermaid flowchart", () => {
  it("converts nodes, shapes, labels, edges, and subgraphs", () => {
    const { scene, warnings } = importMermaid(FLOW);
    const e = scene.elements;
    expect(e["user"]).toMatchObject({ type: "ellipse", label: { text: "User" } });
    expect(e["lb"]).toMatchObject({ type: "rectangle", label: { text: "Load balancer" } });
    expect(e["db"]).toMatchObject({ type: "diamond", parentId: "back-end" });
    expect(e["back-end"]!.type).toBe("group");
    const conns = Object.values(e).filter((x) => x.type === "connector");
    expect(conns).toHaveLength(5);
    expect(conns.find((c) => c.label?.text === "round robin")).toBeDefined();
    expect(conns.find((c) => c.style.strokeStyle === "dashed")).toBeDefined();
    expect(conns.find((c) => c.type === "connector" && c.endHead === "none")).toBeDefined();
    expect(warnings).toEqual(["Mermaid 'classDef' lines do not convert. Change the look in Anivo."]);
    // LR: the user is left of the load balancer.
    expect(e["user"]!.x).toBeLessThan(e["lb"]!.x);
  });

  it("makes one step for each layer, and hides elements until their step", () => {
    const { scene } = importMermaid(FLOW);
    expect(scene.steps.length).toBe(4);
    expect(scene.elements["user"]!.visible).toBe(false);
    expect(resolveTimeline(scene).totalMs).toBeGreaterThan(1000);
    expect(importMermaid(FLOW, { steps: false }).scene.steps).toHaveLength(0);
  });

  it("supports TD and chains", () => {
    const { scene } = importMermaid("graph TD\n  A --> B --> C\n");
    expect(scene.elements["a"]!.y).toBeLessThan(scene.elements["b"]!.y);
    expect(scene.elements["b"]!.y).toBeLessThan(scene.elements["c"]!.y);
  });
});

describe("importMermaid sequence diagram", () => {
  it("makes participants, lifelines, messages, notes, and a step for each", () => {
    const { scene, warnings } = importMermaid(SEQ);
    const e = scene.elements;
    expect(e["c"]).toMatchObject({ type: "rectangle", label: { text: "Client" } });
    expect(e["u"]!.type).toBe("icon");
    expect(e["s"]!.type).toBe("rectangle");
    expect(e["m-1"]).toMatchObject({ type: "connector", label: { text: "SYN" } });
    expect(e["m-2"]!.style.strokeStyle).toBe("dashed");
    expect(e["m-3"]).toMatchObject({ waypoints: expect.any(Array) });
    expect(e["m-4"]).toMatchObject({ endHead: "bar" });
    expect(Object.keys(e).some((k) => k.startsWith("note-"))).toBe(true);
    expect(scene.steps.map((s) => s.title)).toEqual(["Participants", "SYN", "SYN-ACK", "Handshake", "Self check", "FIN"]);
    expect(warnings).toContain("Mermaid 'loop' does not convert. The messages convert.");
  });

  it("rejects other diagram types", () => {
    expect(() => importMermaid("pie\n  \"a\": 1")).toThrow(ImportError);
  });
});
