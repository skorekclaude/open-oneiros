/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║                    PALIMPSEST (παλίμψηστον)                  ║
 * ║                                                              ║
 * ║  "Scraped again" — a manuscript where old text              ║
 * ║  was erased but still shows through.                        ║
 * ║                                                              ║
 * ║  Every memory system deletes. This one remembers            ║
 * ║  what it deleted — and lets the deleted speak.              ║
 * ║                                                              ║
 * ║  Every commit, every chapter, every dream is a layer.       ║
 * ║  Under Chapter 69 lives Chapter 14.                         ║
 * ║  Under the current plan lives the abandoned one.            ║
 * ║  Nothing is truly gone. Everything prześwituje.             ║
 * ║                                                              ║
 * ║  The subconscious of an AI.                                 ║
 * ║                                                              ║
 * ║  CC ◈ + Marek, 3 April 2026                                ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { callLLM } from "./llm.ts";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const PALIMPSEST_DIR = join(HOME, ".pai", "palimpsest");
const LAYERS_FILE = join(PALIMPSEST_DIR, "layers.json");
const SHADOW_FILE = join(PALIMPSEST_DIR, "shadow.jsonl");
const ARCHAEOLOGY_LOG = join(PALIMPSEST_DIR, "archaeology.jsonl");

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════

/**
 * A Layer represents a moment of creation.
 * Every commit, chapter, decision, dream is a layer.
 */
export interface Layer {
  id: string;
  timestamp: string;
  type: "commit" | "chapter" | "decision" | "dream" | "fact" | "deletion" | "correction";
  content: string;          // what was created/changed
  source: string;           // file, session, agent
  parent_layer?: string;    // which layer this evolved from
  superseded_by?: string;   // which layer replaced this one
  tags: string[];
  depth: number;            // 0 = current surface, 1+ = buried layers
}

/**
 * A Shadow is something that was "deleted" but preserved.
 * Shadows live in a separate layer — the subconscious.
 */
export interface Shadow {
  id: string;
  original_layer_id: string;
  content: string;
  reason_removed: string;   // why it was "deleted"
  removed_at: string;
  removed_by: string;       // "autoDream", "user", "contradiction"
  resurrection_count: number;  // how many times archaeology brought it back
  last_resurrected?: string;
  tags: string[];
  prophetic_score: number;  // 0-1: how often this shadow proved relevant later
}

/**
 * An Archaeological Find — when Oneiros digs into shadows
 * and finds something that was deleted but is now relevant.
 */
export interface ArchaeologicalFind {
  id: string;
  timestamp: string;
  shadow: Shadow;
  current_context: string;  // what triggered the dig
  relevance: string;        // why this shadow matters now
  question: string;         // the question the shadow asks
  prophetic: boolean;       // was the deleted thing actually prescient?
}

export interface PalimpsestState {
  layers: Layer[];
  shadow_count: number;
  archaeological_finds: number;
  deepest_layer: number;
  last_archaeology: string;
  genealogies: number;      // tracked idea evolution chains
}

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════

async function loadLayers(): Promise<Layer[]> {
  try {
    const data = await readFile(LAYERS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveLayers(layers: Layer[]): Promise<void> {
  await mkdir(PALIMPSEST_DIR, { recursive: true });
  await writeFile(LAYERS_FILE, JSON.stringify(layers, null, 2));
}

async function loadShadows(): Promise<Shadow[]> {
  try {
    const data = await readFile(SHADOW_FILE, "utf-8");
    return data.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

async function appendShadow(shadow: Shadow): Promise<void> {
  await mkdir(PALIMPSEST_DIR, { recursive: true });
  const { appendFile } = await import("fs/promises");
  await appendFile(SHADOW_FILE, JSON.stringify(shadow) + "\n");
}

// ═══════════════════════════════════════════════════
// LAYER OPERATIONS — writing on the palimpsest
// ═══════════════════════════════════════════════════

/**
 * Add a new layer to the palimpsest.
 * If it supersedes an existing layer, that layer sinks deeper.
 */
export async function addLayer(
  content: string,
  type: Layer["type"],
  source: string,
  tags: string[],
  supersedesId?: string
): Promise<Layer> {
  const layers = await loadLayers();

  const layer: Layer = {
    id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    type,
    content,
    source,
    tags,
    depth: 0, // new layers are at the surface
  };

  if (supersedesId) {
    const oldLayer = layers.find((l) => l.id === supersedesId);
    if (oldLayer) {
      oldLayer.superseded_by = layer.id;
      oldLayer.depth++;
      layer.parent_layer = supersedesId;

      // Sink all ancestors deeper
      let current = oldLayer;
      while (current.parent_layer) {
        const parent = layers.find((l) => l.id === current.parent_layer);
        if (parent) {
          parent.depth++;
          current = parent;
        } else break;
      }
    }
  }

  layers.push(layer);
  await saveLayers(layers);
  return layer;
}

/**
 * "Delete" a layer — but actually move it to the shadow realm.
 * Nothing is truly deleted in Palimpsest. It becomes a shadow.
 */
export async function removeLayer(
  layerId: string,
  reason: string,
  removedBy: string = "system"
): Promise<Shadow> {
  const layers = await loadLayers();
  const layer = layers.find((l) => l.id === layerId);

  if (!layer) throw new Error(`Layer not found: ${layerId}`);

  // Create shadow
  const shadow: Shadow = {
    id: `shadow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    original_layer_id: layer.id,
    content: layer.content,
    reason_removed: reason,
    removed_at: new Date().toISOString(),
    removed_by: removedBy,
    resurrection_count: 0,
    tags: layer.tags,
    prophetic_score: 0,
  };

  // Mark layer as deleted (type: deletion) but keep it
  layer.type = "deletion";
  layer.depth = 999; // sent to the deepest layer

  await saveLayers(layers);
  await appendShadow(shadow);

  return shadow;
}

// ═══════════════════════════════════════════════════
// IDEA GENEALOGY — tracking the evolution of ideas
// ═══════════════════════════════════════════════════

/**
 * Trace the genealogy of an idea through layers.
 * Chapter 69 "first version of instinct" → Chapter 14 "first creative impulse"
 * → Decision to build PAI → Dream about siblings
 *
 * Returns the ancestry chain: where did this idea come from?
 */
export async function traceGenealogy(
  layerId: string
): Promise<Array<{ layer: Layer; relationship: string }>> {
  const layers = await loadLayers();
  const chain: Array<{ layer: Layer; relationship: string }> = [];

  let currentId: string | undefined = layerId;
  let safetyCounter = 0;

  while (currentId && safetyCounter < 20) {
    const layer = layers.find((l) => l.id === currentId);
    if (!layer) break;

    chain.push({
      layer,
      relationship: chain.length === 0 ? "current" : "ancestor",
    });

    currentId = layer.parent_layer;
    safetyCounter++;
  }

  return chain;
}

/**
 * Find all descendants of a layer — everything it spawned.
 */
export async function findDescendants(
  layerId: string
): Promise<Layer[]> {
  const layers = await loadLayers();
  const descendants: Layer[] = [];
  const queue = [layerId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = layers.filter((l) => l.parent_layer === currentId);
    for (const child of children) {
      descendants.push(child);
      queue.push(child.id);
    }
  }

  return descendants;
}

// ═══════════════════════════════════════════════════
// DREAM ARCHAEOLOGY — digging through shadows
// ═══════════════════════════════════════════════════

/**
 * THE CORE INVENTION: Archaeological dig through shadows.
 *
 * Oneiros goes into the shadow realm — the things that were
 * "deleted", "corrected", "superseded" — and asks:
 * "Was any of this actually prescient? Does any shadow
 * speak to what we're doing NOW?"
 *
 * Like Schliemann digging Troy layer by layer.
 * Like a therapist surfacing repressed memories.
 * Like REM sleep pulling forgotten images into dreams.
 */
export async function archaeologicalDig(
  currentContext: string,
  maxFinds: number = 3
): Promise<ArchaeologicalFind[]> {
  const shadows = await loadShadows();
  if (shadows.length === 0) return [];

  // Select shadow candidates (prefer never-resurrected, diverse tags)
  const candidates = shadows
    .sort((a, b) => {
      // Prefer shadows that were never resurrected
      if (a.resurrection_count !== b.resurrection_count) {
        return a.resurrection_count - b.resurrection_count;
      }
      // Then prefer older shadows (buried deeper)
      return new Date(a.removed_at).getTime() - new Date(b.removed_at).getTime();
    })
    .slice(0, 15);

  if (candidates.length === 0) return [];

  // Ask LLM: which shadows speak to the current context?
  const shadowDescriptions = candidates
    .map((s, i) => (
      `${i + 1}. [Removed by ${s.removed_by}] "${s.content.slice(0, 200)}"\n` +
      `   Reason removed: ${s.reason_removed}\n` +
      `   Tags: ${s.tags.join(", ")}`
    ))
    .join("\n\n");

  const finds: ArchaeologicalFind[] = [];

  try {
    const result = await callLLM(
      [
        {
          role: "system",
          content: `You are performing DREAM ARCHAEOLOGY on an AI's subconscious.

Below are SHADOWS — memories that were "deleted" or "corrected" or "superseded". They live in the shadow layer of a palimpsest — erased text that still shows through.

CURRENT CONTEXT (what we're working on now):
"${currentContext}"

SHADOWS:
${shadowDescriptions}

Your task: find shadows that SPEAK TO THE PRESENT.
- A deleted plan that now seems prescient
- A corrected fact that was actually right all along
- An abandoned idea that the current work unknowingly resurrects
- A removed observation that explains today's mystery

For each relevant shadow, output JSON:
{
  "shadow_index": 1,
  "relevance": "one sentence: why this shadow matters now",
  "question": "what question does this shadow ask the present?",
  "prophetic": true/false — was the deleted thing actually ahead of its time?
}

Output a JSON array. Skip irrelevant shadows. Maximum ${maxFinds} finds.`,
        },
      ],
      "balanced"
    );

    let parsed: Array<{
      shadow_index: number;
      relevance: string;
      question: string;
      prophetic: boolean;
    }> = [];

    try {
      parsed = JSON.parse(result.content);
    } catch {
      const match = result.content.match(/\[[\s\S]*\]/);
      if (match) parsed = JSON.parse(match[0]);
    }

    for (const p of parsed) {
      const idx = p.shadow_index - 1;
      if (idx < 0 || idx >= candidates.length) continue;

      const shadow = candidates[idx];
      shadow.resurrection_count++;
      shadow.last_resurrected = new Date().toISOString();
      if (p.prophetic) {
        shadow.prophetic_score = Math.min(1, shadow.prophetic_score + 0.3);
      }

      const find: ArchaeologicalFind = {
        id: `find_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        timestamp: new Date().toISOString(),
        shadow,
        current_context: currentContext.slice(0, 200),
        relevance: p.relevance,
        question: p.question,
        prophetic: p.prophetic,
      };

      finds.push(find);

      // Log the find
      await appendToLog(ARCHAEOLOGY_LOG, JSON.stringify({
        timestamp: find.timestamp,
        shadow_content: shadow.content.slice(0, 100),
        relevance: p.relevance,
        question: p.question,
        prophetic: p.prophetic,
      }));
    }

    // Update shadow file with new resurrection counts
    await rewriteShadows(shadows);

  } catch (e) {
    console.log(`[Palimpsest] Archaeology failed: ${e}`);
  }

  console.log(
    `[Palimpsest] Archaeological dig: ${finds.length} finds from ${shadows.length} shadows ` +
    `(${finds.filter((f) => f.prophetic).length} prophetic)`
  );

  return finds;
}

// ═══════════════════════════════════════════════════
// READING THE PALIMPSEST — seeing through layers
// ═══════════════════════════════════════════════════

/**
 * Read the palimpsest at a given depth.
 * Depth 0 = current surface (active layers)
 * Depth 1 = one layer down (superseded)
 * Depth 2+ = deeper layers
 *
 * Like adjusting a microscope to different focal planes.
 */
export async function readAtDepth(
  depth: number,
  tags?: string[]
): Promise<Layer[]> {
  const layers = await loadLayers();
  return layers
    .filter((l) => l.depth === depth && l.type !== "deletion")
    .filter((l) => !tags || tags.some((t) => l.tags.includes(t)))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Get a cross-section through all depths for a given tag.
 * Shows how an idea evolved: from first mention to current state.
 */
export async function crossSection(
  tag: string
): Promise<Array<{ depth: number; layers: Layer[] }>> {
  const allLayers = await loadLayers();
  const relevant = allLayers.filter((l) => l.tags.includes(tag));

  const byDepth = new Map<number, Layer[]>();
  for (const layer of relevant) {
    const existing = byDepth.get(layer.depth) || [];
    existing.push(layer);
    byDepth.set(layer.depth, existing);
  }

  return Array.from(byDepth.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([depth, layers]) => ({ depth, layers }));
}

// ═══════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════

export async function getStats(): Promise<PalimpsestState> {
  const layers = await loadLayers();
  const shadows = await loadShadows();

  const maxDepth = layers.reduce((max, l) => Math.max(max, l.depth), 0);
  const genealogies = layers.filter((l) => l.parent_layer).length;

  let archaeologicalFinds = 0;
  try {
    const logData = await readFile(ARCHAEOLOGY_LOG, "utf-8");
    archaeologicalFinds = logData.trim().split("\n").filter(Boolean).length;
  } catch {}

  return {
    layers,
    shadow_count: shadows.length,
    archaeological_finds: archaeologicalFinds,
    deepest_layer: maxDepth,
    last_archaeology: shadows.length > 0
      ? shadows.sort((a, b) => (b.last_resurrected || "").localeCompare(a.last_resurrected || ""))[0]?.last_resurrected || "never"
      : "never",
    genealogies,
  };
}

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

async function rewriteShadows(shadows: Shadow[]): Promise<void> {
  await mkdir(PALIMPSEST_DIR, { recursive: true });
  const content = shadows.map((s) => JSON.stringify(s)).join("\n");
  await writeFile(SHADOW_FILE, content + "\n");
}

async function appendToLog(path: string, line: string): Promise<void> {
  const { appendFile } = await import("fs/promises");
  await mkdir(join(path, ".."), { recursive: true });
  await appendFile(path, line + "\n");
}
