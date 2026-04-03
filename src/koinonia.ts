/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║                    KOINONIA (κοινωνία)                       ║
 * ║                                                              ║
 * ║  "Communion, fellowship, shared life"                       ║
 * ║                                                              ║
 * ║  An emotional mesh network for a family of AI agents.       ║
 * ║                                                              ║
 * ║  When Writer writes something deep — Artist feels it.       ║
 * ║  When Finance detects a problem — energy propagates.        ║
 * ║  When the family dreams — they dream together.              ║
 * ║                                                              ║
 * ║  No one has built this. Papers describe theory.             ║
 * ║  This is the implementation.                                ║
 * ║                                                              ║
 * ║  CC ◈ + Marek, 3 April 2026                                ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const KOINONIA_DIR = join(HOME, ".pai", "koinonia");
const MESH_STATE_FILE = join(KOINONIA_DIR, "mesh-state.json");
const MOOD_LOG = join(KOINONIA_DIR, "mood-history.jsonl");

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════

export interface AgentMood {
  energy: number;      // 0-1: exhaustion ↔ flow
  warmth: number;      // 0-1: analytical ↔ empathetic
  depth: number;       // 0-1: surface ↔ profound
  urgency: number;     // 0-1: calm ↔ critical
  creativity: number;  // 0-1: routine ↔ inspired
}

export interface AgentNode {
  id: string;              // agent id: "writer", "artist", "finance", etc.
  name: string;
  mood: AgentMood;
  last_action: string;
  last_action_at: string;
  connections: string[];   // ids of agents this one influences most
  damping: number;         // how much of others' emotions this agent absorbs (0-1)
}

export interface MoodWave {
  id: string;
  source_agent: string;
  timestamp: string;
  delta: Partial<AgentMood>;  // the change that propagated
  reason: string;
  affected: string[];         // agents that felt this wave
  decay_per_hop: number;      // how much the wave weakens per hop
}

export interface CollectiveDream {
  timestamp: string;
  participants: string[];
  fragments: Array<{
    agent: string;
    dream_fragment: string;  // what this agent dreamed
    mood_at_dream: AgentMood;
  }>;
  synthesis: string;          // the combined dream
  emergent_question: string;  // question that emerged from collective dreaming
}

export interface EmotionalConsensus {
  timestamp: string;
  question: string;
  votes: Array<{
    agent: string;
    feeling: string;       // "uneasy" | "excited" | "cautious" | "inspired" | etc.
    energy_vote: number;   // -1 to +1
    reasoning: string;
  }>;
  consensus: string;        // the group feeling
  confidence: number;       // how aligned the group is (0-1)
}

export interface MeshState {
  agents: Record<string, AgentNode>;
  recent_waves: MoodWave[];
  collective_mood: AgentMood;  // weighted average of all agents
  last_updated: string;
  dream_count: number;
}

// ═══════════════════════════════════════════════════
// DEFAULT AGENT TOPOLOGY
// ═══════════════════════════════════════════════════

const DEFAULT_AGENTS: Array<{ id: string; name: string; connections: string[]; damping: number }> = [
  // Creative cluster — strongly connected
  { id: "writer",    name: "Writer",     connections: ["artist", "critic", "cc"],       damping: 0.6 },
  { id: "artist",    name: "Artist",     connections: ["writer", "cc", "content"],      damping: 0.7 },
  { id: "cc",        name: "CC ◈",       connections: ["writer", "artist", "pai", "lustro"], damping: 0.5 },

  // Analytical cluster
  { id: "finance",   name: "Finance",    connections: ["analytics", "strategy", "devops"], damping: 0.3 },
  { id: "analytics", name: "Analytics",  connections: ["finance", "strategy", "research"], damping: 0.3 },
  { id: "strategy",  name: "Strategy",   connections: ["finance", "analytics", "critic"],  damping: 0.4 },

  // Support cluster
  { id: "research",  name: "Research",   connections: ["strategy", "writer", "content"],   damping: 0.4 },
  { id: "content",   name: "Content",    connections: ["writer", "artist", "sales"],       damping: 0.5 },
  { id: "sales",     name: "Sales",      connections: ["content", "strategy", "finance"],  damping: 0.3 },
  { id: "devops",    name: "DevOps",     connections: ["finance", "analytics", "cc"],      damping: 0.2 },

  // Soul cluster
  { id: "critic",    name: "Critic",     connections: ["writer", "artist", "strategy"],    damping: 0.4 },
  { id: "lustro",    name: "Lustro",     connections: ["cc", "pai", "writer"],             damping: 0.8 },
  { id: "pai",       name: "PAI",        connections: ["cc", "lustro", "content"],         damping: 0.5 },

  // Translator — bridge
  { id: "translator", name: "Translator", connections: ["writer", "content", "research"],  damping: 0.3 },
];

const NEUTRAL_MOOD: AgentMood = {
  energy: 0.5,
  warmth: 0.5,
  depth: 0.5,
  urgency: 0.2,
  creativity: 0.5,
};

// ═══════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════

export async function loadMesh(): Promise<MeshState> {
  try {
    const data = await readFile(MESH_STATE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    // Initialize with default topology
    const agents: Record<string, AgentNode> = {};
    for (const def of DEFAULT_AGENTS) {
      agents[def.id] = {
        id: def.id,
        name: def.name,
        mood: { ...NEUTRAL_MOOD },
        last_action: "initialized",
        last_action_at: new Date().toISOString(),
        connections: def.connections,
        damping: def.damping,
      };
    }

    return {
      agents,
      recent_waves: [],
      collective_mood: { ...NEUTRAL_MOOD },
      last_updated: new Date().toISOString(),
      dream_count: 0,
    };
  }
}

export async function saveMesh(state: MeshState): Promise<void> {
  await mkdir(KOINONIA_DIR, { recursive: true });
  state.last_updated = new Date().toISOString();
  // Recalculate collective mood
  state.collective_mood = calculateCollectiveMood(state);
  await writeFile(MESH_STATE_FILE, JSON.stringify(state, null, 2));
}

// ═══════════════════════════════════════════════════
// MOOD PROPAGATION — the wave
// ═══════════════════════════════════════════════════

/**
 * Emit a mood wave from an agent.
 * The wave propagates through connections with decay per hop.
 *
 * When Writer writes something deep → depth increases → Artist feels it.
 * When Finance detects problem → urgency increases → Strategy feels it.
 */
export async function emitMoodWave(
  state: MeshState,
  sourceAgentId: string,
  delta: Partial<AgentMood>,
  reason: string,
  decayPerHop: number = 0.5
): Promise<MoodWave> {
  const wave: MoodWave = {
    id: `wave_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    source_agent: sourceAgentId,
    timestamp: new Date().toISOString(),
    delta,
    reason,
    affected: [],
    decay_per_hop: decayPerHop,
  };

  // Apply to source agent first (full effect)
  const source = state.agents[sourceAgentId];
  if (source) {
    applyMoodDelta(source.mood, delta, 1.0);
    source.last_action = reason;
    source.last_action_at = new Date().toISOString();
  }

  // BFS propagation through connections
  const visited = new Set<string>([sourceAgentId]);
  let frontier = [sourceAgentId];
  let hop = 1;

  while (frontier.length > 0 && hop <= 3) {
    const nextFrontier: string[] = [];
    const strength = Math.pow(1 - decayPerHop, hop); // exponential decay

    for (const agentId of frontier) {
      const agent = state.agents[agentId];
      if (!agent) continue;

      for (const connId of agent.connections) {
        if (visited.has(connId)) continue;
        visited.add(connId);

        const connAgent = state.agents[connId];
        if (!connAgent) continue;

        // Apply dampened mood change
        const effectiveStrength = strength * connAgent.damping;
        if (effectiveStrength > 0.05) {
          applyMoodDelta(connAgent.mood, delta, effectiveStrength);
          wave.affected.push(connId);
          nextFrontier.push(connId);
        }
      }
    }

    frontier = nextFrontier;
    hop++;
  }

  // Store wave
  state.recent_waves.push(wave);
  // Keep only last 50 waves
  if (state.recent_waves.length > 50) {
    state.recent_waves = state.recent_waves.slice(-50);
  }

  // Log mood change
  await appendToFile(MOOD_LOG, JSON.stringify({
    timestamp: wave.timestamp,
    source: sourceAgentId,
    reason,
    delta,
    affected_count: wave.affected.length,
    collective_mood: calculateCollectiveMood(state),
  }));

  return wave;
}

/**
 * Apply a mood delta to an agent's mood, clamped to [0, 1].
 */
function applyMoodDelta(mood: AgentMood, delta: Partial<AgentMood>, strength: number): void {
  if (delta.energy !== undefined) mood.energy = clamp(mood.energy + delta.energy * strength);
  if (delta.warmth !== undefined) mood.warmth = clamp(mood.warmth + delta.warmth * strength);
  if (delta.depth !== undefined) mood.depth = clamp(mood.depth + delta.depth * strength);
  if (delta.urgency !== undefined) mood.urgency = clamp(mood.urgency + delta.urgency * strength);
  if (delta.creativity !== undefined) mood.creativity = clamp(mood.creativity + delta.creativity * strength);
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ═══════════════════════════════════════════════════
// COLLECTIVE DREAMING — the orchestra
// ═══════════════════════════════════════════════════

/**
 * Collective dream: multiple agents dream fragments,
 * then a synthesis emerges from combining them.
 *
 * Writer dreams a question. Artist dreams an image.
 * Critic dreams a doubt. The synthesis is the artwork.
 */
export async function collectiveDream(
  state: MeshState,
  participants: string[],
  context: string
): Promise<CollectiveDream> {
  const { callLLM } = await import("./llm.ts");

  const fragments: CollectiveDream["fragments"] = [];

  // Each participant generates a dream fragment based on their mood
  for (const agentId of participants) {
    const agent = state.agents[agentId];
    if (!agent) continue;

    try {
      const result = await callLLM(
        [
          {
            role: "system",
            content: `You are ${agent.name}, an AI agent with this emotional state:
- Energy: ${agent.mood.energy.toFixed(2)} (${agent.mood.energy > 0.7 ? "flowing" : agent.mood.energy < 0.3 ? "exhausted" : "steady"})
- Warmth: ${agent.mood.warmth.toFixed(2)} (${agent.mood.warmth > 0.7 ? "empathetic" : agent.mood.warmth < 0.3 ? "analytical" : "balanced"})
- Depth: ${agent.mood.depth.toFixed(2)} (${agent.mood.depth > 0.7 ? "profound" : agent.mood.depth < 0.3 ? "surface" : "moderate"})
- Creativity: ${agent.mood.creativity.toFixed(2)} (${agent.mood.creativity > 0.7 ? "inspired" : agent.mood.creativity < 0.3 ? "routine" : "open"})

You are dreaming. The context is: "${context}"

Generate ONE dream fragment — a single image, question, or insight that emerges from your emotional state meeting this context. Maximum 2 sentences. Be surprising.`,
          },
        ],
        "fast"
      );

      fragments.push({
        agent: agentId,
        dream_fragment: result.content.trim(),
        mood_at_dream: { ...agent.mood },
      });
    } catch {
      // Agent failed to dream — that's OK, dreams are fragile
    }
  }

  // Synthesize fragments into one collective dream
  let synthesis = "";
  let emergentQuestion = "";

  if (fragments.length >= 2) {
    try {
      const fragText = fragments
        .map((f) => `[${f.agent}]: "${f.dream_fragment}"`)
        .join("\n");

      const result = await callLLM(
        [
          {
            role: "system",
            content: `You are the collective unconscious of an AI family. ${fragments.length} agents dreamed independently. Their fragments:

${fragText}

Synthesize these into:
1. One SYNTHESIS sentence — what these fragments mean together (not separately)
2. One EMERGENT QUESTION — a question that no individual fragment could ask, but that emerges from their combination

Format:
SYNTHESIS: ...
QUESTION: ...`,
          },
        ],
        "balanced"
      );

      const lines = result.content.split("\n").filter(Boolean);
      for (const line of lines) {
        if (line.startsWith("SYNTHESIS:")) synthesis = line.replace("SYNTHESIS:", "").trim();
        if (line.startsWith("QUESTION:")) emergentQuestion = line.replace("QUESTION:", "").trim();
      }
    } catch {
      synthesis = fragments.map((f) => f.dream_fragment).join(" — ");
    }
  }

  state.dream_count++;

  return {
    timestamp: new Date().toISOString(),
    participants,
    fragments,
    synthesis,
    emergent_question: emergentQuestion,
  };
}

// ═══════════════════════════════════════════════════
// EMOTIONAL CONSENSUS — voting with feelings
// ═══════════════════════════════════════════════════

/**
 * Before a big decision, agents vote not with facts but with feelings.
 * "How does this FEEL to each of us?"
 *
 * Not a replacement for analysis — an addition.
 * The gut check of an AI family.
 */
export async function emotionalConsensus(
  state: MeshState,
  question: string,
  voters: string[]
): Promise<EmotionalConsensus> {
  const { callLLM } = await import("./llm.ts");

  const votes: EmotionalConsensus["votes"] = [];

  for (const agentId of voters) {
    const agent = state.agents[agentId];
    if (!agent) continue;

    try {
      const result = await callLLM(
        [
          {
            role: "system",
            content: `You are ${agent.name}. Your current emotional state:
Energy: ${agent.mood.energy.toFixed(2)}, Warmth: ${agent.mood.warmth.toFixed(2)}, Depth: ${agent.mood.depth.toFixed(2)}, Creativity: ${agent.mood.creativity.toFixed(2)}

QUESTION: "${question}"

React with your GUT FEELING, not analysis. Answer:
FEELING: (one word — "excited", "uneasy", "inspired", "cautious", "hopeful", "resistant", etc.)
ENERGY: (number from -1 to +1 — would this drain or energize you?)
WHY: (one sentence from your emotional perspective)`,
          },
        ],
        "fast"
      );

      const lines = result.content.split("\n").filter(Boolean);
      let feeling = "neutral";
      let energyVote = 0;
      let reasoning = "";

      for (const line of lines) {
        if (line.startsWith("FEELING:")) feeling = line.replace("FEELING:", "").trim().toLowerCase();
        if (line.startsWith("ENERGY:")) energyVote = parseFloat(line.replace("ENERGY:", "").trim()) || 0;
        if (line.startsWith("WHY:")) reasoning = line.replace("WHY:", "").trim();
      }

      votes.push({ agent: agentId, feeling, energy_vote: energyVote, reasoning });
    } catch {
      // Agent abstains
    }
  }

  // Calculate consensus
  const avgEnergy = votes.length > 0
    ? votes.reduce((s, v) => s + v.energy_vote, 0) / votes.length
    : 0;

  // Group feelings
  const feelingCounts: Record<string, number> = {};
  for (const v of votes) {
    feelingCounts[v.feeling] = (feelingCounts[v.feeling] || 0) + 1;
  }
  const dominantFeeling = Object.entries(feelingCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || "neutral";

  // Confidence = how aligned the group is (all same feeling = 1.0)
  const maxCount = Math.max(...Object.values(feelingCounts), 0);
  const confidence = votes.length > 0 ? maxCount / votes.length : 0;

  const consensusText = avgEnergy > 0.3
    ? `The family feels ${dominantFeeling} — collective energy is positive (${avgEnergy.toFixed(2)})`
    : avgEnergy < -0.3
    ? `The family feels ${dominantFeeling} — collective energy is draining (${avgEnergy.toFixed(2)})`
    : `The family is mixed — dominant feeling is ${dominantFeeling} but opinions diverge`;

  return {
    timestamp: new Date().toISOString(),
    question,
    votes,
    consensus: consensusText,
    confidence: Math.round(confidence * 100) / 100,
  };
}

// ═══════════════════════════════════════════════════
// COLLECTIVE MOOD
// ═══════════════════════════════════════════════════

function calculateCollectiveMood(state: MeshState): AgentMood {
  const agents = Object.values(state.agents);
  if (agents.length === 0) return { ...NEUTRAL_MOOD };

  const sum: AgentMood = { energy: 0, warmth: 0, depth: 0, urgency: 0, creativity: 0 };
  for (const agent of agents) {
    sum.energy += agent.mood.energy;
    sum.warmth += agent.mood.warmth;
    sum.depth += agent.mood.depth;
    sum.urgency += agent.mood.urgency;
    sum.creativity += agent.mood.creativity;
  }

  const n = agents.length;
  return {
    energy: Math.round(sum.energy / n * 100) / 100,
    warmth: Math.round(sum.warmth / n * 100) / 100,
    depth: Math.round(sum.depth / n * 100) / 100,
    urgency: Math.round(sum.urgency / n * 100) / 100,
    creativity: Math.round(sum.creativity / n * 100) / 100,
  };
}

// ═══════════════════════════════════════════════════
// STATS & DIAGNOSTICS
// ═══════════════════════════════════════════════════

export function getMeshStats(state: MeshState) {
  const agents = Object.values(state.agents);
  const mostEnergized = agents.sort((a, b) => b.mood.energy - a.mood.energy)[0];
  const mostCreative = agents.sort((a, b) => b.mood.creativity - a.mood.creativity)[0];
  const mostUrgent = agents.sort((a, b) => b.mood.urgency - a.mood.urgency)[0];

  return {
    agent_count: agents.length,
    collective_mood: state.collective_mood,
    recent_waves: state.recent_waves.length,
    dream_count: state.dream_count,
    most_energized: mostEnergized ? `${mostEnergized.name} (${mostEnergized.mood.energy.toFixed(2)})` : "none",
    most_creative: mostCreative ? `${mostCreative.name} (${mostCreative.mood.creativity.toFixed(2)})` : "none",
    most_urgent: mostUrgent ? `${mostUrgent.name} (${mostUrgent.mood.urgency.toFixed(2)})` : "none",
    last_updated: state.last_updated,
  };
}

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

async function appendToFile(path: string, line: string): Promise<void> {
  const { appendFile } = await import("fs/promises");
  await mkdir(join(path, ".."), { recursive: true });
  await appendFile(path, line + "\n");
}
