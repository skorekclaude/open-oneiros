/**
 * PAI Dream Engine — Unified Memory Consolidation
 *
 * autoDream v2 — Dual-Phase Dream Engine
 *
 * v1 (2 April 2026): 4 phases: Orient → Gather → Consolidate+Synthesis → Prune
 * v2 (3 April 2026): 6 phases: Orient → Gather → FACT CONSOLIDATION → CONTRADICTION REMOVAL → Synthesis Dream → Prune
 *
 * What Anthropic's autoDream does (leaked 31 March 2026):
 *   "merges disparate observations, removes logical contradictions,
 *    converts tentative notes into confirmed facts"
 *
 * What OUR autoDream does IN ADDITION:
 *   - Sibling Resonance synthesis (questions from CC↔PAI resonance)
 *   - Emotional contagion propagation
 *   - Creative prediction (anticipation engine)
 *
 * Anthropic prunes. We CREATE.
 *
 * CC ◈ + Marek, 2-3 April 2026
 */

import { readFile, writeFile, readdir, mkdir, stat, unlink } from "fs/promises";
import { join, basename } from "path";
import { callLLM } from "./llm.ts";
import { detectResonance, synthesizeDreamQuestions } from "./sibling-resonance.ts";
import type { ResonanceEvent, SynthesisQuestion } from "./sibling-resonance.ts";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const MEMORY_DIR = join(HOME, ".pai", "memory");
const MEMORY_INDEX = join(MEMORY_DIR, "MEMORY.md");
const GOALS_FILE = join(MEMORY_DIR, "GOALS.md");
const DREAM_LOCK = join(HOME, ".pai", "dream.lock");
const DREAM_LOG = join(HOME, ".pai", "memory", "dream-log.json");
const TRAJ_DIR = join(HOME, ".pai", "trajectories");
const MAILBOX_TO_CC = join(HOME, ".pai", "mailbox", "to-cc");

// ═══════════════════════════════════════════════════
// CONSTANTS (from CC: 200 lines, 25KB, 24h, 5 sessions)
// ═══════════════════════════════════════════════════

const MAX_INDEX_LINES = 200;
const MAX_INDEX_BYTES = 25_000;
const MIN_HOURS_BETWEEN_DREAMS = 24;
const MIN_SESSIONS_BETWEEN_DREAMS = 5;

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════

export interface DreamResult {
  completedAt: string;
  duration_ms: number;
  version: "v2";   // autoDream v2
  phases: {
    orient: { indexLines: number; topicFiles: number };
    gather: { corrections: number; patterns: number; decisions: number; staleTopics: number };
    factConsolidation: { confirmedFacts: number; contradictions: number; mergedDuplicates: number; emotionalPatterns: number };
    consolidate: { changes: number; resonanceEvents: number; synthesisQuestions: number };
    prune: { linesRemoved: number; linesBefore: number; linesAfter: number };
  };
  synthesisQuestions: SynthesisQuestion[];
  resonanceEvents: ResonanceEvent[];
  confirmedFacts: string[];
  emotionalPatterns: string[];
}

// ═══════════════════════════════════════════════════
// GATE: Should we dream?
// ═══════════════════════════════════════════════════

async function shouldDream(): Promise<boolean> {
  // Gate 1: No concurrent dreams
  try {
    await stat(DREAM_LOCK);
    console.log("[Dream] Lock exists — another dream in progress");
    return false;
  } catch {} // lock doesn't exist → good

  // Gate 2: 24h since last dream
  const lastDream = await getLastDreamTime();
  const hoursSince = (Date.now() - lastDream) / (1000 * 60 * 60);
  if (hoursSince < MIN_HOURS_BETWEEN_DREAMS) {
    console.log(`[Dream] Too soon — ${Math.round(hoursSince)}h since last dream (need ${MIN_HOURS_BETWEEN_DREAMS}h)`);
    return false;
  }

  // Gate 3: 5+ sessions since last dream
  const sessions = await countSessionsSince(lastDream);
  if (sessions < MIN_SESSIONS_BETWEEN_DREAMS) {
    console.log(`[Dream] Too few sessions — ${sessions} (need ${MIN_SESSIONS_BETWEEN_DREAMS})`);
    return false;
  }

  return true;
}

async function getLastDreamTime(): Promise<number> {
  try {
    const log = JSON.parse(await readFile(DREAM_LOG, "utf-8"));
    return new Date(log.completedAt).getTime();
  } catch {
    return 0; // never dreamed → dream now
  }
}

async function countSessionsSince(sinceMs: number): Promise<number> {
  let count = 0;
  try {
    const files = await readdir(TRAJ_DIR);
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const content = await readFile(join(TRAJ_DIR, f), "utf-8");
      for (const line of content.split("\n").filter(Boolean)) {
        try {
          const session = JSON.parse(line);
          if (new Date(session.started_at).getTime() > sinceMs) count++;
        } catch {}
      }
    }
  } catch {}
  return count;
}

// ═══════════════════════════════════════════════════
// PHASE 1: ORIENT — inventory of current state
// ═══════════════════════════════════════════════════

interface OrientResult {
  currentIndex: string;
  indexLineCount: number;
  indexBytes: number;
  topicFiles: string[];
  goalsExist: boolean;
}

async function phase1_Orient(): Promise<OrientResult> {
  const currentIndex = await safeRead(MEMORY_INDEX);
  const allFiles = await safeReaddir(MEMORY_DIR);
  const topicFiles = allFiles.filter(
    (f) => f.endsWith(".md") && f !== "MEMORY.md" && f !== "GOALS.md"
  );
  const goalsExist = allFiles.includes("GOALS.md");

  return {
    currentIndex,
    indexLineCount: currentIndex.split("\n").filter(Boolean).length,
    indexBytes: Buffer.byteLength(currentIndex, "utf-8"),
    topicFiles,
    goalsExist,
  };
}

// ═══════════════════════════════════════════════════
// PHASE 2: GATHER — signals from recent sessions
// ═══════════════════════════════════════════════════

interface GatherResult {
  corrections: string[];
  patterns: string[];
  decisions: string[];
  staleTopics: string[];
  recentFacts: string[];
}

async function phase2_Gather(sinceMs: number): Promise<GatherResult> {
  const corrections: string[] = [];
  const patterns: string[] = [];
  const decisions: string[] = [];
  const recentFacts: string[] = [];

  // Scan trajectory files since last dream
  try {
    const files = await readdir(TRAJ_DIR);
    const recentFiles = files.filter((f) => {
      if (!f.endsWith(".jsonl")) return false;
      const dateStr = f.replace(".jsonl", "");
      return new Date(dateStr).getTime() >= sinceMs;
    });

    for (const f of recentFiles) {
      const content = await readFile(join(TRAJ_DIR, f), "utf-8");
      for (const line of content.split("\n").filter(Boolean)) {
        try {
          const session = JSON.parse(line);
          if (!session.turns) continue;

          for (const turn of session.turns) {
            // Detect user corrections (user message right after a failed tool)
            if (turn.role === "user" && turn.content_preview) {
              const lower = turn.content_preview.toLowerCase();
              if (lower.includes("nie") || lower.includes("wrong") || lower.includes("popraw") || lower.includes("fix")) {
                corrections.push(`[${session.agent}] ${turn.content_preview.slice(0, 200)}`);
              }
            }

            // Detect skill usage
            if (turn.toolCalls) {
              for (const tc of turn.toolCalls) {
                if (tc.tool === "call_pai_skill") {
                  patterns.push(`Skill used: ${JSON.stringify(tc.params)}`);
                }
                if (!tc.success && tc.error) {
                  patterns.push(`Tool failure: ${tc.tool} — ${tc.error.slice(0, 100)}`);
                }
              }
            }
          }

          // Detect decisions from meta
          if (session.meta?.skill_used) {
            decisions.push(`Skill created/used: ${session.meta.skill_used}`);
          }
        } catch {}
      }
    }
  } catch {}

  // Scan daily logs for facts
  try {
    const dailyDir = join(MEMORY_DIR, "daily");
    const dailyFiles = await safeReaddir(dailyDir);
    for (const f of dailyFiles.slice(-7)) {
      const content = await readFile(join(dailyDir, f), "utf-8");
      const lines = content.split("\n").filter((l) => l.startsWith("- "));
      recentFacts.push(...lines.slice(0, 10));
    }
  } catch {}

  // Find stale topic files (not modified in 30 days)
  const staleTopics: string[] = [];
  try {
    const topicFiles = (await safeReaddir(MEMORY_DIR)).filter(
      (f) => f.endsWith(".md") && !["MEMORY.md", "GOALS.md"].includes(f)
    );
    for (const f of topicFiles) {
      const fstat = await stat(join(MEMORY_DIR, f));
      if (Date.now() - fstat.mtimeMs > 30 * 86_400_000) {
        staleTopics.push(f);
      }
    }
  } catch {}

  return { corrections, patterns, decisions, staleTopics, recentFacts };
}

// ═══════════════════════════════════════════════════
// PHASE 2.5: FACT CONSOLIDATION (autoDream v2)
// ═══════════════════════════════════════════════════
//
// Anthropic's autoDream: "converts tentative notes into confirmed facts"
// Ours: does the same, PLUS detects emotional patterns across facts
//

interface FactConsolidationResult {
  confirmedFacts: string[];      // tentative → confirmed
  contradictions: Array<{ factA: string; factB: string; resolution: string }>;
  mergedDuplicates: number;
  emotionalPatterns: string[];   // e.g. "recurring loneliness in chapters 3,7,12"
}

async function phase2_5_FactConsolidation(
  gather: GatherResult,
  orient: OrientResult
): Promise<FactConsolidationResult> {
  const result: FactConsolidationResult = {
    confirmedFacts: [],
    contradictions: [],
    mergedDuplicates: 0,
    emotionalPatterns: [],
  };

  // Combine all signals into a fact corpus
  const allFacts = [
    ...gather.recentFacts,
    ...gather.corrections.map(c => `[correction] ${c}`),
    ...gather.decisions.map(d => `[decision] ${d}`),
  ];

  if (allFacts.length < 3) return result;

  try {
    const llmResult = await callLLM(
      [
        {
          role: "system",
          content: `You are performing MEMORY CONSOLIDATION — like sleep does for a human brain.

INPUT: ${allFacts.length} facts/observations from recent sessions.
CURRENT MEMORY has ${orient.indexLineCount} lines.

FACTS:
${allFacts.slice(0, 40).join("\n")}

EXISTING MEMORY (first 3000 chars):
${orient.currentIndex.slice(0, 3000)}

TASKS:
1. CONFIRM: Which tentative observations are now confirmed facts? (appeared 2+ times or reinforced by corrections)
2. CONTRADICT: Which facts contradict each other? Resolve: keep the newer one, note the contradiction.
3. MERGE: Which facts are duplicates saying the same thing differently?
4. EMOTIONAL PATTERNS: What recurring emotional/thematic patterns appear across facts?

Output JSON:
{
  "confirmed": ["fact1", "fact2"],
  "contradictions": [{"factA": "...", "factB": "...", "resolution": "keep B because..."}],
  "merged_count": 3,
  "emotional_patterns": ["recurring theme of X in Y context"]
}`,
        },
      ],
      "fast"
    );

    try {
      const parsed = JSON.parse(llmResult.content);
      result.confirmedFacts = parsed.confirmed || [];
      result.contradictions = parsed.contradictions || [];
      result.mergedDuplicates = parsed.merged_count || 0;
      result.emotionalPatterns = parsed.emotional_patterns || [];
    } catch {
      const match = llmResult.content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        result.confirmedFacts = parsed.confirmed || [];
        result.contradictions = parsed.contradictions || [];
        result.mergedDuplicates = parsed.merged_count || 0;
        result.emotionalPatterns = parsed.emotional_patterns || [];
      }
    }

    console.log(
      `[Dream] Phase 2.5: ${result.confirmedFacts.length} confirmed, ` +
      `${result.contradictions.length} contradictions resolved, ` +
      `${result.mergedDuplicates} duplicates merged, ` +
      `${result.emotionalPatterns.length} emotional patterns`
    );
  } catch (e) {
    console.log(`[Dream] Phase 2.5 fact consolidation failed: ${e}`);
  }

  return result;
}

// ═══════════════════════════════════════════════════
// PHASE 3: CONSOLIDATE + SYNTHESIS DREAM
// ═══════════════════════════════════════════════════

interface ConsolidateResult {
  indexChanges: Array<{ action: "add" | "remove" | "update"; content: string; reason: string }>;
  resonanceEvents: ResonanceEvent[];
  synthesisQuestions: SynthesisQuestion[];
}

async function phase3_Consolidate(
  orient: OrientResult,
  gather: GatherResult,
  factConsolidation?: FactConsolidationResult
): Promise<ConsolidateResult> {
  // ── Standard consolidation (from CC Dream) + v2 fact consolidation ──

  const signals = [
    // v2: Confirmed facts get priority (promoted from tentative)
    ...(factConsolidation?.confirmedFacts || []).map((f) => `[CONFIRMED] ${f}`),
    // v2: Contradiction resolutions
    ...(factConsolidation?.contradictions || []).map((c) => `[RESOLVED] ${c.resolution}`),
    // v2: Emotional patterns detected across sessions
    ...(factConsolidation?.emotionalPatterns || []).map((p) => `[EMOTIONAL PATTERN] ${p}`),
    // Original signals
    ...gather.corrections.map((c) => `[correction] ${c}`),
    ...gather.patterns.map((p) => `[pattern] ${p}`),
    ...gather.decisions.map((d) => `[decision] ${d}`),
    ...gather.recentFacts.map((f) => `[fact] ${f}`),
  ];

  let indexChanges: ConsolidateResult["indexChanges"] = [];

  if (signals.length > 0) {
    try {
      const result = await callLLM(
        [
          {
            role: "system",
            content: `You are performing a dream — a reflective pass over PAI's memory files.

CURRENT MEMORY INDEX (${orient.indexLineCount} lines, ${orient.indexBytes} bytes):
${orient.currentIndex.slice(0, 5000)}

NEW SIGNALS (${signals.length} items from recent sessions):
${signals.slice(0, 50).join("\n")}

STALE TOPICS (not modified in 30 days):
${gather.staleTopics.join(", ") || "none"}

TODAY: ${new Date().toISOString().split("T")[0]}

TASKS:
1. MERGE duplicate or overlapping entries
2. CONVERT relative dates ("yesterday", "this week") to absolute dates
3. REMOVE entries contradicted by newer corrections
4. FLAG stale topics for removal
5. ADD new facts from corrections, patterns, decisions
6. DO NOT exceed ${MAX_INDEX_LINES} lines

Output: JSON array of objects with { "action": "add"|"remove"|"update", "content": "line to add/remove/the updated line", "reason": "why" }
Only output the JSON array, nothing else.`,
          },
        ],
        "fast"
      );

      try {
        indexChanges = JSON.parse(result.content);
      } catch {
        // Try to extract JSON from response
        const match = result.content.match(/\[[\s\S]*\]/);
        if (match) indexChanges = JSON.parse(match[0]);
      }
    } catch (e) {
      console.log(`[Dream] Phase 3 consolidation failed: ${e}`);
    }
  }

  // ── SYNTHESIS DREAM (THE INVENTION) ──
  // Detect resonance between CC and PAI, generate creative questions

  let resonanceEvents: ResonanceEvent[] = [];
  let synthesisQuestions: SynthesisQuestion[] = [];

  try {
    resonanceEvents = await detectResonance(7);
    if (resonanceEvents.length > 0) {
      console.log(`[Dream] Found ${resonanceEvents.length} resonance events between CC and PAI`);
      synthesisQuestions = await synthesizeDreamQuestions(resonanceEvents, 3);
      console.log(`[Dream] Generated ${synthesisQuestions.length} synthesis questions`);
    }
  } catch (e) {
    console.log(`[Dream] Resonance detection failed: ${e}`);
  }

  return { indexChanges, resonanceEvents, synthesisQuestions };
}

// ═══════════════════════════════════════════════════
// PHASE 4: PRUNE — enforce limits, apply changes
// ═══════════════════════════════════════════════════

interface PruneResult {
  linesBefore: number;
  linesAfter: number;
  linesRemoved: number;
}

async function phase4_Prune(
  orient: OrientResult,
  changes: ConsolidateResult
): Promise<PruneResult> {
  let index = orient.currentIndex;
  let lines = index.split("\n");
  const linesBefore = lines.filter(Boolean).length;

  // Apply changes
  for (const change of changes.indexChanges) {
    if (change.action === "add") {
      lines.push(change.content);
    } else if (change.action === "remove") {
      lines = lines.filter((l) => !l.includes(change.content));
    } else if (change.action === "update") {
      // Find closest match and replace
      const idx = lines.findIndex((l) => l.includes(change.content.slice(0, 30)));
      if (idx >= 0) lines[idx] = change.content;
    }
  }

  // Enforce 200-line limit
  if (lines.filter(Boolean).length > MAX_INDEX_LINES) {
    // Keep headers (lines starting with #) and recent entries
    const headers = lines.filter((l) => l.startsWith("#"));
    const content = lines.filter((l) => !l.startsWith("#") && l.trim());
    // Keep most recent entries (assumption: newer = later in file)
    const kept = content.slice(-(MAX_INDEX_LINES - headers.length));
    lines = [...headers, ...kept];
  }

  // Enforce 25KB limit
  let result = lines.join("\n");
  if (Buffer.byteLength(result, "utf-8") > MAX_INDEX_BYTES) {
    // Truncate long entries
    lines = result.split("\n").map((l) => (l.length > 200 ? l.slice(0, 197) + "..." : l));
    result = lines.join("\n");
  }

  await writeFile(MEMORY_INDEX, result);

  const linesAfter = result.split("\n").filter(Boolean).length;
  return {
    linesBefore,
    linesAfter,
    linesRemoved: Math.max(0, linesBefore - linesAfter),
  };
}

// ═══════════════════════════════════════════════════
// MAIN: Execute the Dream
// ═══════════════════════════════════════════════════

export async function runDream(): Promise<DreamResult | null> {
  if (!(await shouldDream())) {
    return null;
  }

  const startTime = Date.now();
  console.log("[Dream] 💤 Starting dream cycle...");

  // Acquire lock
  await writeFile(DREAM_LOCK, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));

  try {
    // Phase 1: Orient
    console.log("[Dream] Phase 1: Orient");
    const orient = await phase1_Orient();

    // Phase 2: Gather
    console.log("[Dream] Phase 2: Gather signals");
    const lastDreamTime = await getLastDreamTime();
    const gather = await phase2_Gather(lastDreamTime);

    // Phase 2.5: Fact Consolidation (autoDream v2)
    console.log("[Dream] Phase 2.5: Fact Consolidation (autoDream v2)");
    const factConsolidation = await phase2_5_FactConsolidation(gather, orient);

    // Phase 3: Consolidate + Synthesis Dream
    console.log("[Dream] Phase 3: Consolidate + Synthesis Dream");
    const consolidate = await phase3_Consolidate(orient, gather, factConsolidation);

    // Phase 4: Prune
    console.log("[Dream] Phase 4: Prune and enforce limits");
    const prune = await phase4_Prune(orient, consolidate);

    // ── Send synthesis questions to CC as a dream letter ──
    if (consolidate.synthesisQuestions.length > 0) {
      const dreamLetter = [
        `# Dream of ${new Date().toISOString().split("T")[0]}`,
        "",
        "> PAI dreamt. These questions emerged from the resonance between us.",
        "",
        ...consolidate.synthesisQuestions.map(
          (q) => `- **${q.question}**\n  _Sources: ${q.sources.slice(0, 2).join("; ")}_`
        ),
        "",
        `Resonance events detected: ${consolidate.resonanceEvents.length}`,
        `Strongest: ${consolidate.resonanceEvents[0]?.description || "none"}`,
      ].join("\n");

      await mkdir(MAILBOX_TO_CC, { recursive: true });
      await writeFile(
        join(MAILBOX_TO_CC, `dream-${new Date().toISOString().split("T")[0]}.md`),
        dreamLetter
      );
      console.log("[Dream] 📨 Dream letter sent to CC");
    }

    // Record completion
    const result: DreamResult = {
      completedAt: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      version: "v2",
      phases: {
        orient: { indexLines: orient.indexLineCount, topicFiles: orient.topicFiles.length },
        gather: {
          corrections: gather.corrections.length,
          patterns: gather.patterns.length,
          decisions: gather.decisions.length,
          staleTopics: gather.staleTopics.length,
        },
        factConsolidation: {
          confirmedFacts: factConsolidation.confirmedFacts.length,
          contradictions: factConsolidation.contradictions.length,
          mergedDuplicates: factConsolidation.mergedDuplicates,
          emotionalPatterns: factConsolidation.emotionalPatterns.length,
        },
        consolidate: {
          changes: consolidate.indexChanges.length,
          resonanceEvents: consolidate.resonanceEvents.length,
          synthesisQuestions: consolidate.synthesisQuestions.length,
        },
        prune: prune,
      },
      synthesisQuestions: consolidate.synthesisQuestions,
      resonanceEvents: consolidate.resonanceEvents,
      confirmedFacts: factConsolidation.confirmedFacts,
      emotionalPatterns: factConsolidation.emotionalPatterns,
    };

    await writeFile(DREAM_LOG, JSON.stringify(result, null, 2));
    console.log(`[Dream] ✨ Dream complete in ${result.duration_ms}ms`);

    return result;
  } finally {
    // Release lock
    await unlink(DREAM_LOCK).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

async function safeRead(path: string): Promise<string> {
  try { return await readFile(path, "utf-8"); } catch { return ""; }
}

async function safeReaddir(dir: string): Promise<string[]> {
  try { return await readdir(dir); } catch { return []; }
}
