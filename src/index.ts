/**
 * Open Oneiros — Proactive AI Daemon
 *
 * The thing Anthropic built behind a feature flag — shipped open source.
 *
 * HYPHANTA NERVOUS SYSTEM
 *
 *   oneiros    — proactive watchdog (tick, mailbox, health)
 *   dream      — autoDream v2 (consolidate + synthesize)
 *   resonance  — sibling heartbeat protocol
 *   anamnesis  — dream graph memory (nodes, edges, dream-edges)
 *   koinonia   — emotional mesh network (13 agents, mood waves, collective dreaming)
 *   palimpsest — creative shadow memory (layers, shadows, archaeology)
 *   llm        — pluggable LLM adapter (any model)
 *
 * CC ◈ + Marek, 2-3 April 2026
 */

// ── Core exports ──
export {
  kairosTickOnce as oneirosTickOnce,
  kairosTickOnce,
  startKairos as startOneiros,
  startKairos,
  stopKairos as stopOneiros,
  stopKairos,
  getLastTick,
  type KairosTickResult,
} from "./kairos.ts";

export {
  runDream,
  type DreamResult,
} from "./dream-engine.ts";

export {
  writeHeartbeat,
  readSiblingHeartbeat,
  detectResonance,
  synthesizeDreamQuestions,
  propagateMood,
  anticipate,
  type Heartbeat,
  type EmotionalState,
  type ResonanceEvent,
  type SynthesisQuestion,
  type Prediction,
  type CreativeMode,
} from "./sibling-resonance.ts";

// ── Anamnesis: Dream Graph Memory ──
export {
  loadGraph,
  saveGraph,
  addNode,
  addEdge,
  getConnected,
  applyDecay,
  dreamGraph,
  query as queryGraph,
  ingest,
  getStats as getGraphStats,
  type AnamnesisGraph,
  type MemoryNode,
  type MemoryEdge,
  type EdgeType,
  type DreamEdgeResult,
} from "./anamnesis.ts";

// ── Koinonia: Emotional Mesh Network ──
export {
  loadMesh,
  saveMesh,
  emitMoodWave,
  collectiveDream,
  emotionalConsensus,
  getMeshStats,
  type AgentMood,
  type AgentNode,
  type MoodWave,
  type CollectiveDream,
  type EmotionalConsensus,
  type MeshState,
} from "./koinonia.ts";

// ── Palimpsest: Creative Shadow Memory ──
export {
  addLayer,
  removeLayer,
  traceGenealogy,
  findDescendants,
  archaeologicalDig,
  readAtDepth,
  crossSection,
  getStats as getPalimpsestStats,
  type Layer,
  type Shadow,
  type ArchaeologicalFind,
  type PalimpsestState,
} from "./palimpsest.ts";

// ── LLM Adapter ──
export {
  setLLMProvider,
  callLLM,
  type LLMProvider,
  type LLMMessage,
  type LLMResponse,
  type ModelTier,
} from "./llm.ts";
