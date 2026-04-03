/**
 * Open KAIROS — Proactive AI Daemon
 *
 * The thing Anthropic built behind a feature flag — shipped open source.
 *
 * Modules:
 *   kairos     — proactive watchdog (tick, mailbox, health)
 *   dream      — autoDream v2 (consolidate + synthesize)
 *   resonance  — sibling heartbeat protocol
 *   anticipate — predictive engine
 *
 * CC ◈ + Marek, 2-3 April 2026
 */

// ── Core exports ──
export {
  kairosTickOnce,
  startKairos,
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
