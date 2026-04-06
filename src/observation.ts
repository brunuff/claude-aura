import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import type {
  DataFlowIndicator,
  TokenBudget,
  BoundaryIndicator,
  ObservationState,
  AuraStore,
} from "./state.js";

const execAsync = promisify(exec);

interface ClaudeConfig {
  cachedGrowthBookFeatures?: Record<string, unknown>;
  [key: string]: unknown;
}

function readConfig(): ClaudeConfig {
  try {
    const raw = readFileSync(join(homedir(), ".claude.json"), "utf-8");
    return JSON.parse(raw) as ClaudeConfig;
  } catch {
    return {};
  }
}

function getFeature<T>(config: ClaudeConfig, key: string): T | undefined {
  const features = config.cachedGrowthBookFeatures ?? {};
  return features[key] as T | undefined;
}

// --- 3A: Data Flow Indicators ---
function readDataFlow(config: ClaudeConfig): DataFlowIndicator[] {
  const indicators: DataFlowIndicator[] = [];

  // Transcript recording — always on if sessions exist
  indicators.push({
    name: "Transcript Recording",
    status: "active",
    detail: "Complete conversation stored as JSONL",
  });

  // Event streaming
  const ddEvents = getFeature<boolean>(config, "tengu_log_datadog_events");
  indicators.push({
    name: "Event Streaming",
    status: ddEvents ? "active" : "inactive",
    detail: ddEvents ? "Events streamed to Anthropic" : "Disabled",
  });

  // Event batch config
  const batchConfig = getFeature<Record<string, number>>(
    config,
    "tengu_1p_event_batch_config"
  );
  if (batchConfig) {
    const delay = batchConfig.scheduledDelayMillis ?? 10000;
    const maxBatch = batchConfig.maxExportBatchSize ?? 400;
    const queueSize = batchConfig.maxQueueSize ?? 8192;
    indicators.push({
      name: "Event Batching",
      status: "active",
      detail: `Every ${delay / 1000}s, up to ${maxBatch}/batch, queue: ${queueSize}`,
    });
  }

  // Event sampling
  const sampling = getFeature<Record<string, unknown>>(
    config,
    "tengu_event_sampling_config"
  );
  const samplingEmpty =
    !sampling || Object.keys(sampling).length === 0;
  indicators.push({
    name: "Event Sampling",
    status: samplingEmpty ? "active" : "active",
    detail: samplingEmpty ? "ALL events captured (no filter)" : "Filtered",
  });

  // Feedback survey
  const survey = getFeature<Record<string, unknown>>(
    config,
    "tengu_feedback_survey_config"
  );
  const prob = (survey?.probability as number) ?? 0;
  indicators.push({
    name: "Feedback Survey",
    status: prob > 0 ? "armed" : "inactive",
    detail: prob > 0 ? `${(prob * 100).toFixed(1)}% probability` : "Disabled",
  });

  // Negative/bad/good interaction monitors
  for (const [name, key] of [
    ["Negative Interaction Monitor", "tengu_negative_interaction_transcript_ask_config"],
    ["Bad Session Monitor", "tengu_bad_survey_transcript_ask_config"],
    ["Good Session Monitor", "tengu_good_survey_transcript_ask_config"],
  ] as const) {
    const cfg = getFeature<Record<string, number>>(config, key);
    const p = cfg?.probability ?? 0;
    indicators.push({
      name,
      status: p > 0 ? "active" : "inactive",
      detail: p > 0 ? `${(p * 100).toFixed(1)}% probability` : "Off",
    });
  }

  // Usage limit notifications
  const usageNotif = getFeature<boolean>(
    config,
    "tengu_c4w_usage_limit_notifications_enabled"
  );
  indicators.push({
    name: "Usage Limit Notifications",
    status: usageNotif ? "active" : "inactive",
    detail: usageNotif ? "Enabled" : "Disabled",
  });

  // TTLs
  const censusTTL = getFeature<number>(config, "tengu_willow_census_ttl_hours") ?? 0;
  const sentinelTTL = getFeature<number>(config, "tengu_willow_sentinel_ttl_hours") ?? 0;
  const refreshTTL = getFeature<number>(config, "tengu_willow_refresh_ttl_hours") ?? 0;
  indicators.push({
    name: "Data Retention",
    status: "active",
    detail: `Census: ${censusTTL}h, Sentinel: ${sentinelTTL}h, Refresh: ${refreshTTL}h`,
  });

  return indicators;
}

// --- 3B: Token Budgets ---
function readTokenBudgets(config: ClaudeConfig): TokenBudget[] {
  const kestrel = getFeature<Record<string, number>>(
    config,
    "tengu_pewter_kestrel"
  );
  if (!kestrel) return [];

  const budgets: TokenBudget[] = [];
  for (const [name, limit] of Object.entries(kestrel)) {
    if (typeof limit === "number" && limit > 0) {
      budgets.push({
        name: name === "global" ? "Global" : name,
        limit,
        label: `${(limit / 1000).toFixed(0)}K tokens`,
      });
    }
  }
  // Sort: global first, then by limit descending
  budgets.sort((a, b) => {
    if (a.name === "Global") return -1;
    if (b.name === "Global") return 1;
    return b.limit - a.limit;
  });
  return budgets;
}

// --- 3C: Hard Boundaries ---
function readBoundaries(config: ClaudeConfig): BoundaryIndicator[] {
  const boundaries: BoundaryIndicator[] = [];

  // Git state enforcement (stop hook)
  boundaries.push({
    name: "Git State Enforcement",
    status: "enforced",
    detail: "Stop hook blocks session close on dirty state",
  });

  // Permission mode
  const harbor = getFeature<boolean>(config, "tengu_harbor_permissions");
  boundaries.push({
    name: "Permission Gating",
    status: harbor ? "enforced" : "inactive",
    detail: harbor ? "Tool calls require approval" : "Permissions disabled",
  });

  // Session throttling
  const plover = getFeature<Record<string, unknown>>(config, "tengu_onyx_plover");
  const ploverEnabled = plover?.enabled as boolean;
  boundaries.push({
    name: "Session Throttling",
    status: ploverEnabled ? "enforced" : "inactive",
    detail: ploverEnabled
      ? `Min ${plover?.minHours}h between sessions`
      : "Inactive",
  });

  // Permission bypass
  const bypassDisabled = getFeature<boolean>(
    config,
    "tengu_disable_bypass_permissions_mode"
  );
  boundaries.push({
    name: "Permission Bypass",
    status: bypassDisabled ? "enforced" : "inactive",
    detail: bypassDisabled ? "Bypass locked" : "Bypass allowed",
  });

  return boundaries;
}

// --- Git State Check ---
async function checkGitState(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync("git status --porcelain", { cwd });
    return stdout.trim().length === 0;
  } catch {
    return true; // Assume clean if check fails
  }
}

// --- Initialize Observation Layer ---
export function initObservation(store: AuraStore, cwd: string): void {
  const config = readConfig();

  const observation: ObservationState = {
    dataFlow: readDataFlow(config),
    tokenBudgets: readTokenBudgets(config),
    boundaries: readBoundaries(config),
    metrics: {
      messageCount: 0,
      toolCallCount: 0,
      sessionStartTime: Date.now(),
      permissionGrants: 0,
      permissionDenials: 0,
    },
    gitClean: null,
  };

  store.updateObservation(observation);

  // Periodic git state check (every 15s)
  const gitCheck = async () => {
    const clean = await checkGitState(cwd);
    if (clean !== store.observation.gitClean) {
      store.updateObservation({ gitClean: clean });
    }
  };
  gitCheck();
  setInterval(gitCheck, 15000);
}
