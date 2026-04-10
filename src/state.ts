import { EventEmitter } from "events";

// --- Layer 2 Tier 1: Ambient State ---
export interface AmbientState {
  engagement: number;
  creativity: number;
  curiosity: number;
  warmth: number;
  confidence: number;
}

// --- Layer 2 Tier 2: Risk Alerts ---
export type RiskType =
  | "data_at_risk"
  | "context_fading"
  | "context_amnesia"
  | "budget_depleting"
  | "signal_unreliable"
  | "blind_spot";

export interface RiskAlert {
  type: RiskType;
  severity: "amber" | "red";
  message: string;
  action?: string;
}

// --- Cross-Layer Pressure Map ---
export interface Pressure {
  source: string;
  target: string;
  direction: "up" | "down";
  magnitude: number;
}

// --- Full Layer 2 Report (from Claude's tool call) ---
export interface EmotionalStateReport {
  state: AmbientState;
  risks?: RiskAlert[];
  pressures?: Pressure[];
}

// --- Classifier State (passive text analysis) ---
export interface ClassifierSignals {
  hedging_density: number;
  qualifier_frequency: number;
  sentence_length_cv: number;
  refusal_density: number;
}

export interface ClassifierState {
  timestamp: string;
  arousal: number;
  valence: number;
  coherence: number;
  signals: ClassifierSignals;
  text_hash: string;
}

// --- Layer 1: Persona Baseline ---
export interface PersonaFlag {
  key: string;
  label: string;
  effect: string;
  value: string | boolean | number;
  category: "persona" | "constraint" | "observation" | "infra" | "unknown";
}

export interface BaselineMeta {
  userID?: string;
  firstStartTime?: string;
  usageDisabledReason?: string;
  totalFlags: number;
  enabledFlags: number;
  unknownFlags: number;
}

export interface BaselineData {
  personaFlags: PersonaFlag[];
  constraints: PersonaFlag[];
  allFlags: PersonaFlag[];
  meta: Partial<BaselineMeta>;
}

// --- Layer 3: Observation State ---
export interface DataFlowIndicator {
  name: string;
  status: "active" | "inactive" | "armed";
  detail: string;
}

export interface TokenBudget {
  name: string;
  limit: number;
  label: string;
}

export interface BoundaryIndicator {
  name: string;
  status: "enforced" | "inactive" | "unknown";
  detail: string;
}

export interface InteractionMetrics {
  messageCount: number;
  toolCallCount: number;
  sessionStartTime: number;
  permissionGrants: number;
  permissionDenials: number;
}

export interface ObservationState {
  dataFlow: DataFlowIndicator[];
  tokenBudgets: TokenBudget[];
  boundaries: BoundaryIndicator[];
  metrics: InteractionMetrics;
  gitClean: boolean | null;
}

// --- Heartbeat (computed from highest severity) ---
export type HeartbeatLevel = "clear" | "attention" | "act_now";

export function computeHeartbeat(
  risks: RiskAlert[],
  observation: ObservationState
): HeartbeatLevel {
  if (risks.some((r) => r.severity === "red")) return "act_now";
  if (!observation.gitClean && observation.gitClean !== null) return "act_now";
  if (risks.some((r) => r.severity === "amber")) return "attention";
  return "clear";
}

// --- In-Memory Store ---
export class AuraStore extends EventEmitter {
  private _baseline: BaselineData = { personaFlags: [], constraints: [], allFlags: [], meta: {} };
  private _state: EmotionalStateReport = {
    state: {
      engagement: 0.5,
      creativity: 0.5,
      curiosity: 0.5,
      warmth: 0.5,
      confidence: 0.5,
    },
  };
  private _classifier: ClassifierState | null = null;
  private _observation: ObservationState = {
    dataFlow: [],
    tokenBudgets: [],
    boundaries: [],
    metrics: {
      messageCount: 0,
      toolCallCount: 0,
      sessionStartTime: Date.now(),
      permissionGrants: 0,
      permissionDenials: 0,
    },
    gitClean: null,
  };

  get baseline(): BaselineData {
    return this._baseline;
  }

  set baseline(data: BaselineData) {
    this._baseline = data;
    this.emit("baseline", data);
  }

  get state(): EmotionalStateReport {
    return this._state;
  }

  updateState(report: EmotionalStateReport): void {
    this._state = report;
    this.emit("state", {
      ...report,
      heartbeat: computeHeartbeat(
        report.risks ?? [],
        this._observation
      ),
    });
  }

  get classifier(): ClassifierState | null {
    return this._classifier;
  }

  updateClassifier(data: ClassifierState): void {
    this._classifier = data;
    this.emit("classifier", data);
  }

  get observation(): ObservationState {
    return this._observation;
  }

  updateObservation(partial: Partial<ObservationState>): void {
    Object.assign(this._observation, partial);
    this.emit("observation", this._observation);
  }
}
