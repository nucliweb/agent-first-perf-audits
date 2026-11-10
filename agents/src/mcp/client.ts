// Starts the MCP servers of the workshop over stdio and connects a client to each one.
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport, type StdioServerParameters } from "@modelcontextprotocol/client/stdio";
import { chromium } from "playwright";
import { join } from "node:path";

const BIN = join(import.meta.dirname, "../../node_modules/.bin");

// The stdio client passes only a few environment variables to each server (HOME, PATH...),
// so both servers rely on the default browser path of Playwright, ~/.cache/ms-playwright.
const SERVERS = {
  webperf: (): StdioServerParameters => ({
    command: join(BIN, "webperf-snippets"),
    args: ["mcp"],
  }),
  devtools: (): StdioServerParameters => ({
    command: join(BIN, "chrome-devtools-mcp"),
    args: [
      "--headless",
      "--isolated",
      `--executablePath=${chromium.executablePath()}`,
      // The container has no usable Chromium sandbox without extra privileges
      "--chromeArg=--no-sandbox",
      // Each subagent starts its own server with a single page, so tools need no pageId
      "--no-page-id-routing",
      // The gate runs without network
      "--usageStatistics=false",
      "--performanceCrux=false",
    ],
  }),
};

export type ServerName = keyof typeof SERVERS;

export async function connect(name: ServerName): Promise<Client> {
  const client = new Client({ name: "agent-first-perf-audits", version: "0.0.0" });
  await client.connect(new StdioClientTransport(SERVERS[name]()));
  return client;
}

type ToolResult = Awaited<ReturnType<Client["callTool"]>>;

// Calls a tool and turns a tool error into an exception with the text the server returned.
export async function callTool(client: Client, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    const text = Array.isArray(result.content)
      ? result.content.map((part) => (part.type === "text" ? part.text : `[${part.type}]`)).join("\n")
      : JSON.stringify(result);
    throw new Error(`${name} failed: ${text}`);
  }
  return result;
}
