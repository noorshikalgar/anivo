import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAnivoServer } from "./server.js";

/** Run the MCP server on standard input and output (docs/09 "Transport"). */
export async function runStdioServer(root: string): Promise<void> {
  const server = createAnivoServer({ root });
  await server.connect(new StdioServerTransport());
}
