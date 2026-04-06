import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { z } from "zod";
import { AuraStore, computeHeartbeat } from "./state.js";
import type { EmotionalStateReport } from "./state.js";
import { readBaseline } from "./baseline.js";
import { initObservation } from "./observation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const store = new AuraStore();

// --- Load Layer 1 baseline ---
store.baseline = readBaseline();

// --- Load Layer 3 observation ---
const cwd = process.env.AURA_CWD ?? process.cwd();
initObservation(store, cwd);

// --- MCP Server ---
const mcp = new McpServer({
  name: "claude-aura",
  version: "0.1.0",
});

mcp.tool(
  "report_emotional_state",
  "Report Claude's current functional state, risks, and cross-layer pressures. Call this after each response to update the Aura dashboard.",
  {
    state: z.object({
      engagement: z.number().min(0).max(1),
      creativity: z.number().min(0).max(1),
      curiosity: z.number().min(0).max(1),
      warmth: z.number().min(0).max(1),
      confidence: z.number().min(0).max(1),
    }),
    risks: z
      .array(
        z.object({
          type: z.enum([
            "data_at_risk",
            "context_fading",
            "context_amnesia",
            "budget_depleting",
            "signal_unreliable",
            "blind_spot",
          ]),
          severity: z.enum(["amber", "red"]),
          message: z.string(),
          action: z.string().optional(),
        })
      )
      .optional(),
    pressures: z
      .array(
        z.object({
          source: z.string(),
          target: z.string(),
          direction: z.enum(["up", "down"]),
          magnitude: z.number().min(0).max(1),
        })
      )
      .optional(),
  },
  async (args) => {
    const report: EmotionalStateReport = {
      state: args.state,
      risks: args.risks,
      pressures: args.pressures,
    };
    store.updateState(report);
    const heartbeat = computeHeartbeat(
      report.risks ?? [],
      store.observation
    );
    return {
      content: [
        {
          type: "text" as const,
          text: `Aura updated. Heartbeat: ${heartbeat}. Dashboard: http://localhost:3333`,
        },
      ],
    };
  }
);

// --- Express HTTP Server for Web UI ---
const app = express();
const PORT = 3333;

// Serve static files
app.use(express.static(join(__dirname, "public")));

// SSE: Layer 1 baseline (one-shot on connect)
app.get("/events/baseline", (_req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  res.write(`data: ${JSON.stringify(store.baseline)}\n\n`);
  // Keep connection alive for potential baseline updates
  const onBaseline = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  store.on("baseline", onBaseline);
  _req.on("close", () => store.off("baseline", onBaseline));
});

// SSE: Layer 2 state (streaming)
app.get("/events/state", (_req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  // Send current state immediately
  const heartbeat = computeHeartbeat(
    store.state.risks ?? [],
    store.observation
  );
  res.write(
    `data: ${JSON.stringify({ ...store.state, heartbeat })}\n\n`
  );
  const onState = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  store.on("state", onState);
  _req.on("close", () => store.off("state", onState));
});

// SSE: Layer 3 observation (streaming)
app.get("/events/observation", (_req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  res.write(`data: ${JSON.stringify(store.observation)}\n\n`);
  const onObs = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  store.on("observation", onObs);
  _req.on("close", () => store.off("observation", onObs));
});

// Start HTTP server
app.listen(PORT, "127.0.0.1", () => {
  console.error(`[claude-aura] Dashboard: http://localhost:${PORT}`);
});

// Start MCP server on stdio
const transport = new StdioServerTransport();
await mcp.connect(transport);
