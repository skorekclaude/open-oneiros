/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║                    ANAMNESIS (ἀνάμνησις)                     ║
 * ║                                                              ║
 * ║  "Remembering what the soul already knows"                  ║
 * ║                                                              ║
 * ║  A graph memory that DREAMS.                                ║
 * ║                                                              ║
 * ║  Mem0 remembers facts. Graphiti remembers relationships     ║
 * ║  in time. Anamnesis CREATES new relationships through       ║
 * ║  dreaming — like a human hippocampus during REM sleep.      ║
 * ║                                                              ║
 * ║  Nodes = memories. Edges = connections.                     ║
 * ║  Dream-edges = connections that didn't exist in the data    ║
 * ║  but emerged from resonance between fragments.              ║
 * ║                                                              ║
 * ║  CC ◈ + Marek, 3 April 2026                                ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { callLLM } from "./llm.ts";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const ANAMNESIS_DIR = join(HOME, ".pai", "anamnesis");
const GRAPH_FILE = join(ANAMNESIS_DIR, "graph.json");
const DREAM_EDGES_LOG = join(ANAMNESIS_DIR, "dream-edges.jsonl");

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════

export interface MemoryNode {
  id: string;
  type: "fact" | "chapter" | "commit" | "dream" | "emotion" | "project" | "person" | "concept";
  content: string;
  source: string;           // file path, session id, or origin
  created_at: string;       // ISO timestamp
  last_accessed: string;    // when last retrieved
  access_count: number;
  tags: string[];
  embedding?: number[];     // optional vector for semantic similarity
}

export interface MemoryEdge {
  id: string;
  from: string;             // node id
  to: string;               // node id
  type: EdgeType;
  weight: number;           // 0-1, decays over time
  created_at: string;
  strengthened_at: string;  // last time this edge was reinforced
  last_accessed: string;
  decay_rate: number;       // per day (0.01 = 1% per day)
  metadata: {
    reason: string;         // why this edge exists
    dreamt?: boolean;       // was this edge created by dreaming?
    dream_date?: string;    // when did the dream create it?
    resonance_strength?: number;
  };
}

export type EdgeType =
  | "semantic"       // share meaning
  | "temporal"       // happened close in time
  | "causal"         // one caused the other
  | "resonance"      // detected by sibling resonance
  | "dream"          // created during dream synthesis (THE INVENTION)
  | "contradiction"  // these two conflict
  | "evolution"      // one evolved into the other
  | "reference";     // one mentions the other

export interface AnamnesisGraph {
  nodes: Record<string, MemoryNode>;
  edges: MemoryEdge[];
  metadata: {
    version: string;
    created_at: string;
    last_dream: string;
    total_dreams: number;
    total_dream_edges: number;
    node_count: number;
    edge_count: number;
  };
}

export interface DreamEdgeResult {
  new_edges: MemoryEdge[];
  strengthened: number;
  decayed: number;
  removed: number;
  insights: string[];
}

// ═══════════════════════════════════════════════════
// GRAPH OPERATIONS
// ═══════════════════════════════════════════════════

/**
 * Load or initialize the Anamnesis graph.
 */
export async function loadGraph(): Promise<AnamnesisGraph> {
  try {
    const data = await readFile(GRAPH_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {
      nodes: {},
      edges: [],
      metadata: {
        version: "1.0.0",
        created_at: new Date().toISOString(),
        last_dream: "",
        total_dreams: 0,
        total_dream_edges: 0,
        node_count: 0,
        edge_count: 0,
      },
    };
  }
}

/**
 * Save the graph to disk.
 */
export async function saveGraph(graph: AnamnesisGraph): Promise<void> {
  await mkdir(ANAMNESIS_DIR, { recursive: true });
  graph.metadata.node_count = Object.keys(graph.nodes).length;
  graph.metadata.edge_count = graph.edges.length;
  await writeFile(GRAPH_FILE, JSON.stringify(graph, null, 2));
}

/**
 * Add a memory node to the graph.
 */
export function addNode(graph: AnamnesisGraph, node: Omit<MemoryNode, "id" | "last_accessed" | "access_count">): MemoryNode {
  const id = `n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const fullNode: MemoryNode = {
    ...node,
    id,
    last_accessed: new Date().toISOString(),
    access_count: 0,
  };
  graph.nodes[id] = fullNode;
  return fullNode;
}

/**
 * Add an edge between two nodes.
 */
export function addEdge(
  graph: AnamnesisGraph,
  from: string,
  to: string,
  type: EdgeType,
  reason: string,
  weight: number = 0.5,
  decayRate: number = 0.02
): MemoryEdge {
  // Check if edge already exists
  const existing = graph.edges.find(
    (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from)
  );
  if (existing) {
    // Strengthen existing edge
    existing.weight = Math.min(1, existing.weight + 0.1);
    existing.strengthened_at = new Date().toISOString();
    existing.last_accessed = new Date().toISOString();
    return existing;
  }

  const edge: MemoryEdge = {
    id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    from,
    to,
    type,
    weight,
    created_at: new Date().toISOString(),
    strengthened_at: new Date().toISOString(),
    last_accessed: new Date().toISOString(),
    decay_rate: decayRate,
    metadata: { reason },
  };
  graph.edges.push(edge);
  return edge;
}

/**
 * Find nodes connected to a given node, sorted by edge weight.
 */
export function getConnected(graph: AnamnesisGraph, nodeId: string, maxDepth: number = 2): MemoryNode[] {
  const visited = new Set<string>();
  const result: Array<{ node: MemoryNode; distance: number; weight: number }> = [];

  function traverse(currentId: string, depth: number, cumulativeWeight: number) {
    if (depth > maxDepth || visited.has(currentId)) return;
    visited.add(currentId);

    const node = graph.nodes[currentId];
    if (node && currentId !== nodeId) {
      result.push({ node, distance: depth, weight: cumulativeWeight });
    }

    const connected = graph.edges.filter(
      (e) => (e.from === currentId || e.to === currentId) && e.weight > 0.1
    );

    for (const edge of connected) {
      const nextId = edge.from === currentId ? edge.to : edge.from;
      traverse(nextId, depth + 1, cumulativeWeight * edge.weight);
    }
  }

  traverse(nodeId, 0, 1.0);
  return result
    .sort((a, b) => b.weight - a.weight)
    .map((r) => r.node);
}

// ═══════════════════════════════════════════════════
// TEMPORAL DECAY — the graph breathes and forgets
// ═══════════════════════════════════════════════════

/**
 * Apply temporal decay to all edges.
 * Edges that haven't been accessed decay. Edges below threshold die.
 * Dream-edges decay slower (they were born from synthesis).
 */
export function applyDecay(graph: AnamnesisGraph): { decayed: number; removed: number } {
  const now = Date.now();
  let decayed = 0;
  let removed = 0;
  const DEATH_THRESHOLD = 0.05;

  graph.edges = graph.edges.filter((edge) => {
    const daysSinceAccess = (now - new Date(edge.last_accessed).getTime()) / 86_400_000;
    if (daysSinceAccess < 1) return true; // accessed today, no decay

    // Dream edges decay 3x slower — they were hard-won
    const effectiveDecay = edge.metadata.dreamt ? edge.decay_rate / 3 : edge.decay_rate;
    const decayAmount = effectiveDecay * daysSinceAccess;
    edge.weight = Math.max(0, edge.weight - decayAmount);

    if (edge.weight < DEATH_THRESHOLD) {
      removed++;
      return false; // remove dead edge
    }

    decayed++;
    return true;
  });

  return { decayed, removed };
}

// ═══════════════════════════════════════════════════
// THE DREAM — creating edges that don't exist yet
// ═══════════════════════════════════════════════════

/**
 * Find unconnected node pairs that might have hidden semantic resonance.
 * These are candidates for dream-edges.
 */
function findDreamCandidates(graph: AnamnesisGraph, maxCandidates: number = 10): Array<[MemoryNode, MemoryNode]> {
  const nodes = Object.values(graph.nodes);
  const connectedPairs = new Set(
    graph.edges.map((e) => [e.from, e.to].sort().join("::"))
  );

  const candidates: Array<{ pair: [MemoryNode, MemoryNode]; score: number }> = [];

  // Compare unconnected nodes
  for (let i = 0; i < nodes.length && i < 100; i++) {
    for (let j = i + 1; j < nodes.length && j < 100; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const pairKey = [a.id, b.id].sort().join("::");

      if (connectedPairs.has(pairKey)) continue; // already connected

      // Score based on shared tags, temporal proximity, and type diversity
      let score = 0;

      // Shared tags
      const sharedTags = a.tags.filter((t) => b.tags.includes(t));
      score += sharedTags.length * 0.3;

      // Different types = more interesting (cross-domain connections)
      if (a.type !== b.type) score += 0.2;

      // Temporal proximity (same week = bonus)
      const timeDiff = Math.abs(
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      if (timeDiff < 7 * 86_400_000) score += 0.2;

      // Both recently accessed = active in mind
      const recentA = (Date.now() - new Date(a.last_accessed).getTime()) < 3 * 86_400_000;
      const recentB = (Date.now() - new Date(b.last_accessed).getTime()) < 3 * 86_400_000;
      if (recentA && recentB) score += 0.15;

      if (score > 0.3) {
        candidates.push({ pair: [a, b], score });
      }
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCandidates)
    .map((c) => c.pair);
}

/**
 * THE CORE INVENTION: Dream the graph.
 *
 * Takes unconnected node pairs with hidden potential,
 * asks the LLM to find the invisible thread between them,
 * and creates dream-edges — connections that didn't exist
 * in the data but emerge from creative synthesis.
 *
 * Like the hippocampus during REM sleep: consolidating,
 * connecting, creating meaning from fragments.
 */
export async function dreamGraph(graph: AnamnesisGraph): Promise<DreamEdgeResult> {
  const result: DreamEdgeResult = {
    new_edges: [],
    strengthened: 0,
    decayed: 0,
    removed: 0,
    insights: [],
  };

  // Phase 1: Temporal decay (the graph breathes)
  const decay = applyDecay(graph);
  result.decayed = decay.decayed;
  result.removed = decay.removed;

  // Phase 2: Find dream candidates
  const candidates = findDreamCandidates(graph);
  if (candidates.length === 0) {
    result.insights.push("No dream candidates found — graph is either too small or fully connected");
    return result;
  }

  // Phase 3: Ask LLM to find hidden connections
  const pairsDescription = candidates
    .slice(0, 5) // limit to 5 for token budget
    .map(([a, b], i) => (
      `${i + 1}. NODE A [${a.type}]: "${a.content.slice(0, 150)}"\n` +
      `   Tags: ${a.tags.join(", ")}\n` +
      `   NODE B [${b.type}]: "${b.content.slice(0, 150)}"\n` +
      `   Tags: ${b.tags.join(", ")}`
    ))
    .join("\n\n");

  try {
    const llmResult = await callLLM(
      [
        {
          role: "system",
          content: `You are the dreaming mind of an AI system called Oneiros.

You are performing DREAM SYNTHESIS on a memory graph. Below are pairs of memory nodes that are NOT currently connected. Your task: find the HIDDEN THREAD between them.

For each pair, ask yourself:
- What invisible connection exists between these two fragments?
- What question would emerge if they were placed side by side?
- What creative insight lives in the space between them?

PAIRS:
${pairsDescription}

For each pair that has a genuine connection, output a JSON object:
{
  "pair_index": 1,
  "connection_type": "semantic" | "resonance" | "evolution" | "causal",
  "reason": "one sentence explaining the hidden connection",
  "insight": "a creative question or observation that emerges from this connection",
  "strength": 0.3-0.9
}

Output a JSON array. If a pair has NO genuine connection, skip it.
Only create connections that are SURPRISING and GENERATIVE — not obvious.`,
        },
      ],
      "balanced"
    );

    // Parse dream connections
    let dreamConnections: Array<{
      pair_index: number;
      connection_type: EdgeType;
      reason: string;
      insight: string;
      strength: number;
    }> = [];

    try {
      dreamConnections = JSON.parse(llmResult.content);
    } catch {
      const match = llmResult.content.match(/\[[\s\S]*\]/);
      if (match) dreamConnections = JSON.parse(match[0]);
    }

    // Phase 4: Create dream-edges
    for (const dc of dreamConnections) {
      const idx = dc.pair_index - 1;
      if (idx < 0 || idx >= candidates.length) continue;

      const [nodeA, nodeB] = candidates[idx];
      const edge = addEdge(
        graph,
        nodeA.id,
        nodeB.id,
        dc.connection_type || "dream",
        dc.reason,
        dc.strength || 0.5,
        0.007 // dream edges decay very slowly (0.7% per day)
      );

      // Mark as dream-edge
      edge.metadata.dreamt = true;
      edge.metadata.dream_date = new Date().toISOString();
      edge.metadata.resonance_strength = dc.strength;

      result.new_edges.push(edge);
      result.insights.push(dc.insight);

      // Log dream edge
      await appendToFile(
        DREAM_EDGES_LOG,
        JSON.stringify({
          date: new Date().toISOString(),
          from: { id: nodeA.id, content: nodeA.content.slice(0, 100) },
          to: { id: nodeB.id, content: nodeB.content.slice(0, 100) },
          insight: dc.insight,
          reason: dc.reason,
          strength: dc.strength,
        })
      );
    }

    // Phase 5: Strengthen edges that were accessed during this dream
    for (const edge of graph.edges) {
      if (edge.metadata.dreamt && edge.weight < 0.9) {
        // Existing dream edges that survived get a small boost
        edge.weight = Math.min(1, edge.weight + 0.02);
        result.strengthened++;
      }
    }

  } catch (e) {
    result.insights.push(`Dream synthesis failed: ${e}`);
  }

  // Update metadata
  graph.metadata.last_dream = new Date().toISOString();
  graph.metadata.total_dreams++;
  graph.metadata.total_dream_edges += result.new_edges.length;

  await saveGraph(graph);

  console.log(
    `[Anamnesis] Dream complete: ${result.new_edges.length} new edges, ` +
    `${result.strengthened} strengthened, ${result.decayed} decayed, ${result.removed} removed`
  );

  return result;
}

// ═══════════════════════════════════════════════════
// QUERY — semantic retrieval with graph traversal
// ═══════════════════════════════════════════════════

/**
 * Query the graph: find relevant memories by walking edges.
 * Starts from nodes matching the query tags, then traverses.
 * Dream-edges are weighted higher (they represent insights).
 */
export function query(
  graph: AnamnesisGraph,
  tags: string[],
  maxResults: number = 10
): Array<{ node: MemoryNode; relevance: number; path: string[] }> {
  // Find seed nodes (matching tags)
  const seeds = Object.values(graph.nodes).filter((n) =>
    tags.some((t) => n.tags.includes(t) || n.content.toLowerCase().includes(t.toLowerCase()))
  );

  if (seeds.length === 0) return [];

  // BFS with weighted traversal
  const scored = new Map<string, { relevance: number; path: string[] }>();

  for (const seed of seeds) {
    const connected = getConnected(graph, seed.id, 3);
    for (const node of connected) {
      const existing = scored.get(node.id);
      const edgeToNode = graph.edges.find(
        (e) => (e.from === seed.id && e.to === node.id) || (e.from === node.id && e.to === seed.id)
      );
      const dreamBonus = edgeToNode?.metadata.dreamt ? 0.2 : 0;
      const relevance = (edgeToNode?.weight || 0.3) + dreamBonus;

      if (!existing || existing.relevance < relevance) {
        scored.set(node.id, {
          relevance,
          path: [seed.id, node.id],
        });
      }
    }
  }

  // Include seed nodes themselves
  for (const seed of seeds) {
    if (!scored.has(seed.id)) {
      scored.set(seed.id, { relevance: 1.0, path: [seed.id] });
    }
  }

  return Array.from(scored.entries())
    .map(([id, data]) => ({
      node: graph.nodes[id],
      ...data,
    }))
    .filter((r) => r.node)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, maxResults);
}

// ═══════════════════════════════════════════════════
// INGEST — populate graph from various sources
// ═══════════════════════════════════════════════════

/**
 * Ingest a batch of raw text entries into the graph.
 * Extracts nodes and creates initial semantic edges.
 */
export async function ingest(
  graph: AnamnesisGraph,
  entries: Array<{
    content: string;
    type: MemoryNode["type"];
    source: string;
    tags: string[];
    timestamp?: string;
  }>
): Promise<{ nodesCreated: number; edgesCreated: number }> {
  let nodesCreated = 0;
  let edgesCreated = 0;
  const newNodes: MemoryNode[] = [];

  for (const entry of entries) {
    const node = addNode(graph, {
      type: entry.type,
      content: entry.content,
      source: entry.source,
      created_at: entry.timestamp || new Date().toISOString(),
      tags: entry.tags,
    });
    newNodes.push(node);
    nodesCreated++;
  }

  // Create edges between nodes with shared tags
  for (let i = 0; i < newNodes.length; i++) {
    for (let j = i + 1; j < newNodes.length; j++) {
      const shared = newNodes[i].tags.filter((t) => newNodes[j].tags.includes(t));
      if (shared.length > 0) {
        addEdge(
          graph,
          newNodes[i].id,
          newNodes[j].id,
          "semantic",
          `Shared tags: ${shared.join(", ")}`,
          0.3 + shared.length * 0.1
        );
        edgesCreated++;
      }
    }

    // Also connect to existing nodes with shared tags
    for (const existingNode of Object.values(graph.nodes)) {
      if (existingNode.id === newNodes[i].id) continue;
      const shared = newNodes[i].tags.filter((t) => existingNode.tags.includes(t));
      if (shared.length >= 2) {
        addEdge(
          graph,
          newNodes[i].id,
          existingNode.id,
          "semantic",
          `Shared tags: ${shared.join(", ")}`,
          0.2 + shared.length * 0.1
        );
        edgesCreated++;
      }
    }
  }

  await saveGraph(graph);
  return { nodesCreated, edgesCreated };
}

// ═══════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════

export function getStats(graph: AnamnesisGraph) {
  const dreamEdges = graph.edges.filter((e) => e.metadata.dreamt);
  const avgWeight = graph.edges.length > 0
    ? graph.edges.reduce((s, e) => s + e.weight, 0) / graph.edges.length
    : 0;

  const typeDistribution: Record<string, number> = {};
  for (const node of Object.values(graph.nodes)) {
    typeDistribution[node.type] = (typeDistribution[node.type] || 0) + 1;
  }

  return {
    nodes: Object.keys(graph.nodes).length,
    edges: graph.edges.length,
    dreamEdges: dreamEdges.length,
    avgEdgeWeight: Math.round(avgWeight * 100) / 100,
    totalDreams: graph.metadata.total_dreams,
    typeDistribution,
    lastDream: graph.metadata.last_dream || "never",
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
