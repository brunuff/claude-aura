import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { PersonaFlag, BaselineData } from "./state.js";

interface ClaudeConfig {
  cachedGrowthBookFeatures?: Record<string, unknown>;
  userID?: string;
  firstStartTime?: string;
  cachedExtraUsageDisabledReason?: string;
  [key: string]: unknown;
}

// --- Layer 1A: Persona/Character Flags (known mappings) ---
const PERSONA_FLAGS: Record<string, { label: string; effect: string }> = {
  tengu_sotto_voce: { label: "Sotto Voce", effect: "Subdued tone" },
  tengu_swann_brevity: { label: "Swann Brevity", effect: "Concise output style" },
  tengu_quiet_hollow: { label: "Quiet Hollow", effect: "Minimal filler" },
  tengu_sumi: { label: "Sumi", effect: "Minimalist style" },
  tengu_vinteuil_phrase: { label: "Vinteuil Phrase", effect: "Emotional resonance" },
  tengu_willow_mode: { label: "Willow Mode", effect: "Behavioral hints" },
  tengu_plank_river_frost: { label: "Plank River Frost", effect: "Intent-focused framing" },
  tengu_grey_step: { label: "Grey Step", effect: "Effort presentation" },
  tengu_tangerine_ladder_boost: { label: "Tangerine Boost", effect: "Behavioral boost" },
  tengu_surreal_dali: { label: "Surreal Dali", effect: "Creative expression mode" },
  tengu_attribution_header: { label: "Attribution Header", effect: "Response attribution" },
  tengu_grey_wool: { label: "Grey Wool", effect: "Tone modifier" },
  tengu_swinburne_dune: { label: "Swinburne Dune", effect: "Prose style modifier" },
  tengu_chomp_inflection: { label: "Chomp Inflection", effect: "Inflection modifier" },
  tengu_miraculo_the_bard: { label: "Miraculo the Bard", effect: "Narrative voice" },
  tengu_quiet_fern: { label: "Quiet Fern", effect: "Quiet mode variant" },
  tengu_bergotte_lantern: { label: "Bergotte Lantern", effect: "Literary style modifier" },
  tengu_oboe: { label: "Oboe", effect: "Tonal quality" },
};

// --- Layer 1B: Mechanical Constraints (known mappings) ---
const CONSTRAINT_FLAGS: Record<string, { label: string; effect: string }> = {
  tengu_auto_mode_config: { label: "Auto Mode", effect: "Autonomous operation config" },
  tengu_ultraplan_config: { label: "Ultraplan", effect: "Extended thinking/planning" },
  tengu_ultraplan_timeout_seconds: { label: "Ultraplan Timeout", effect: "Planning time limit" },
  tengu_crystal_beam: { label: "Crystal Beam", effect: "Token budget override" },
  tengu_hawthorn_window: { label: "Context Window", effect: "Compaction trigger" },
  tengu_sm_config: { label: "Sampling Config", effect: "Message compaction thresholds" },
  tengu_sm_compact_config: { label: "Compact Mode", effect: "Compact token limits" },
  tengu_worktree_mode: { label: "Worktree Mode", effect: "Workspace isolation" },
  tengu_malort_pedway: { label: "UI Automation", effect: "Screenshot/mouse/keyboard" },
  tengu_prompt_cache_1h_config: { label: "Prompt Cache", effect: "1h prompt caching" },
  tengu_streaming_tool_execution2: { label: "Streaming Tool Exec", effect: "Parallel tool execution" },
  tengu_amber_lattice: { label: "Plugin System", effect: "LSP and development plugins" },
  tengu_harbor_ledger: { label: "Harbor Ledger", effect: "Plugin registry" },
  tengu_bridge_repl_v2_config: { label: "Bridge REPL", effect: "REPL/bridge connection config" },
  tengu_bridge_poll_interval_config: { label: "Bridge Polling", effect: "Polling intervals" },
  tengu_version_config: { label: "Version Config", effect: "Minimum version requirement" },
  tengu_bridge_min_version: { label: "Bridge Min Version", effect: "Bridge compatibility" },
  tengu_amber_wren: { label: "Amber Wren", effect: "Token limit + nudge config" },
  tengu_review_bughunter_config: { label: "Bug Hunter", effect: "Code review fleet config" },
  tengu_ccr_bundle_max_bytes: { label: "CCR Bundle Limit", effect: "Max bundle size" },
  tengu_flint_harbor_prompt: { label: "Onboarding Prompt", effect: "Guide generation prompt" },
};

// --- Layer 3: Observation/Tracking (known mappings — used by observation.ts) ---
const OBSERVATION_FLAGS: Record<string, { label: string; effect: string }> = {
  tengu_log_datadog_events: { label: "Datadog Events", effect: "Event streaming to Anthropic" },
  tengu_pewter_kestrel: { label: "Token Budgets", effect: "Per-tool token rate limits" },
  tengu_onyx_plover: { label: "Session Throttle", effect: "Session frequency control" },
  tengu_1p_event_batch_config: { label: "Event Batching", effect: "Batch shipping config" },
  tengu_feedback_survey_config: { label: "Feedback Survey", effect: "Survey probability + timing" },
  tengu_negative_interaction_transcript_ask_config: { label: "Negative Interaction", effect: "Negative session tracking" },
  tengu_bad_survey_transcript_ask_config: { label: "Bad Survey", effect: "Bad session tracking" },
  tengu_good_survey_transcript_ask_config: { label: "Good Survey", effect: "Good session tracking" },
  tengu_event_sampling_config: { label: "Event Sampling", effect: "Event capture filter" },
  tengu_harbor_permissions: { label: "Permission Gating", effect: "Tool call approval required" },
  tengu_disable_bypass_permissions_mode: { label: "Bypass Lock", effect: "Permission bypass control" },
  tengu_c4w_usage_limit_notifications_enabled: { label: "Usage Notifications", effect: "Usage limit alerts" },
  tengu_willow_census_ttl_hours: { label: "Census TTL", effect: "Census data retention" },
  tengu_willow_sentinel_ttl_hours: { label: "Sentinel TTL", effect: "Sentinel data retention" },
  tengu_willow_refresh_ttl_hours: { label: "Refresh TTL", effect: "Refresh cycle" },
  tengu_pid_based_version_locking: { label: "Version Locking", effect: "PID-based consistency" },
  tengu_accept_with_feedback: { label: "Accept w/ Feedback", effect: "Per-tool feedback collection" },
  tengu_post_compact_survey: { label: "Post-Compact Survey", effect: "Survey after compaction" },
  tengu_session_memory: { label: "Session Memory", effect: "Cross-session memory" },
  ccr_auto_permission_mode: { label: "Auto Permissions", effect: "Automatic permission grants" },
};

// --- Layer 1C: Infrastructure/Platform flags ---
const INFRA_FLAGS: Record<string, { label: string; effect: string }> = {
  tengu_code_diff_cli: { label: "Code Diff CLI", effect: "Diff display mode" },
  tengu_prompt_suggestion: { label: "Prompt Suggestions", effect: "Suggested prompts" },
  tengu_permission_explainer: { label: "Permission Explainer", effect: "Permission UI explanations" },
  tengu_harbor: { label: "Harbor", effect: "Permission framework" },
  tengu_kairos_cron: { label: "Kairos Cron", effect: "Scheduled tasks" },
  tengu_lodestone_enabled: { label: "Lodestone", effect: "Navigation/discovery" },
  tengu_keybinding_customization_release: { label: "Keybindings", effect: "Custom key bindings" },
  tengu_mcp_elicitation: { label: "MCP Elicitation", effect: "MCP prompt elicitation" },
  tengu_flint_harbor: { label: "Flint Harbor", effect: "Onboarding system" },
  tengu_collage_kaleidoscope: { label: "Collage Kaleidoscope", effect: "UI composition" },
  tengu_pr_status_cli: { label: "PR Status CLI", effect: "PR status display" },
  tengu_bridge_repl_v2: { label: "Bridge REPL v2", effect: "REPL bridge enabled" },
  tengu_penguins_enabled: { label: "Penguins", effect: "Penguin mode" },
  tengu_vscode_cc_auth: { label: "VSCode Auth", effect: "VSCode authentication" },
  tengu_copper_bridge: { label: "Copper Bridge", effect: "Bridge connection" },
  tengu_cobalt_frost: { label: "Cobalt Frost", effect: "Platform feature" },
  tengu_cobalt_compass: { label: "Cobalt Compass", effect: "Navigation feature" },
  tengu_marble_whisper: { label: "Marble Whisper", effect: "Platform feature" },
  tengu_marble_whisper2: { label: "Marble Whisper 2", effect: "Platform feature v2" },
  tengu_marble_anvil: { label: "Marble Anvil", effect: "Platform feature" },
  tengu_turtle_carbon: { label: "Turtle Carbon", effect: "Platform feature" },
  tengu_otk_slot_v1: { label: "OTK Slot", effect: "One-time key slot" },
  tengu_glacier_2xr: { label: "Glacier 2XR", effect: "Platform feature" },
  tengu_ant_attribution_header_new: { label: "Attribution v2", effect: "New attribution header" },
  tengu_lapis_finch: { label: "Lapis Finch", effect: "Platform feature" },
  tengu_ccr_bundle_seed_enabled: { label: "CCR Bundle Seed", effect: "Bundle seeding" },
  tengu_basalt_3kr: { label: "Basalt 3KR", effect: "Platform feature" },
  tengu_willow_prism: { label: "Willow Prism", effect: "Platform feature" },
  tengu_amber_quartz: { label: "Amber Quartz", effect: "Platform feature" },
  tengu_plum_vx3: { label: "Plum VX3", effect: "Platform feature" },
  tengu_slate_ridge: { label: "Slate Ridge", effect: "Platform feature" },
  tengu_amber_flint: { label: "Amber Flint", effect: "Platform feature" },
  tengu_cork_m4q: { label: "Cork M4Q", effect: "Platform feature" },
  tengu_amber_stoat: { label: "Amber Stoat", effect: "Platform feature" },
  tengu_workout2: { label: "Workout 2", effect: "Platform feature" },
  tengu_quartz_lantern: { label: "Quartz Lantern", effect: "Platform feature" },
};

const ALL_KNOWN_FLAGS = {
  ...PERSONA_FLAGS,
  ...CONSTRAINT_FLAGS,
  ...OBSERVATION_FLAGS,
  ...INFRA_FLAGS,
};

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "not set";
  if (typeof val === "boolean") return val ? "enabled" : "disabled";
  if (typeof val === "string") return val || "(empty)";
  if (typeof val === "number") return String(val);
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if ("enabled" in obj) {
      const extra = Object.keys(obj).filter(k => k !== "enabled").length;
      return `${obj.enabled ? "enabled" : "disabled"}${extra ? ` (+${extra} params)` : ""}`;
    }
    if ("budgetTokens" in obj) return `budget: ${obj.budgetTokens}`;
    if ("probability" in obj) return `prob: ${obj.probability}`;
    if ("minVersion" in obj) return `min: ${obj.minVersion}`;
    const keys = Object.keys(obj);
    if (keys.length === 0) return "{}";
    return `{${keys.length} keys}`;
  }
  return String(val);
}

function categorizeFlag(key: string): "persona" | "constraint" | "observation" | "infra" | "unknown" {
  if (key in PERSONA_FLAGS) return "persona";
  if (key in CONSTRAINT_FLAGS) return "constraint";
  if (key in OBSERVATION_FLAGS) return "observation";
  if (key in INFRA_FLAGS) return "infra";
  return "unknown";
}

export function readBaseline(): BaselineData {
  const configPath = join(homedir(), ".claude.json");
  let config: ClaudeConfig;

  try {
    const raw = readFileSync(configPath, "utf-8");
    config = JSON.parse(raw) as ClaudeConfig;
  } catch {
    return { personaFlags: [], constraints: [], allFlags: [], meta: {} };
  }

  const features = config.cachedGrowthBookFeatures ?? {};

  // Build classified flags for known categories
  const personaFlags: PersonaFlag[] = Object.entries(PERSONA_FLAGS)
    .map(([key, info]) => ({
      key,
      label: info.label,
      effect: info.effect,
      value: formatValue(features[key]),
      category: "persona" as const,
    }))
    .filter((f) => f.value !== "not set" && f.value !== "disabled");

  const constraints: PersonaFlag[] = Object.entries(CONSTRAINT_FLAGS)
    .map(([key, info]) => ({
      key,
      label: info.label,
      effect: info.effect,
      value: formatValue(features[key]),
      category: "constraint" as const,
    }))
    .filter((f) => f.value !== "not set");

  // Build COMPLETE flag inventory — every single flag in the config
  const allFlags: PersonaFlag[] = Object.entries(features)
    .map(([key, val]) => {
      const category = categorizeFlag(key);
      const known = ALL_KNOWN_FLAGS[key as keyof typeof ALL_KNOWN_FLAGS];
      return {
        key,
        label: known?.label ?? key.replace("tengu_", "").replace(/_/g, " "),
        effect: known?.effect ?? "Unclassified",
        value: formatValue(val),
        category: category as PersonaFlag["category"],
      };
    })
    .sort((a, b) => {
      // Known categories first, then unknown
      const order = { persona: 0, constraint: 1, observation: 2, infra: 3, unknown: 4 };
      const ao = order[a.category as keyof typeof order] ?? 4;
      const bo = order[b.category as keyof typeof order] ?? 4;
      if (ao !== bo) return ao - bo;
      return a.key.localeCompare(b.key);
    });

  // Session metadata
  const meta = {
    userID: config.userID ? `${String(config.userID).slice(0, 8)}...` : undefined,
    firstStartTime: config.firstStartTime,
    usageDisabledReason: config.cachedExtraUsageDisabledReason,
    totalFlags: allFlags.length,
    enabledFlags: allFlags.filter(f => f.value !== "disabled" && f.value !== "not set").length,
    unknownFlags: allFlags.filter(f => f.category === "unknown").length,
  };

  return { personaFlags, constraints, allFlags, meta };
}

