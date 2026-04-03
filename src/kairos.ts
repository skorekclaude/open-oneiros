/**
 * KAIROS v0 — Proactive Watchdog
 *
 * Named after Kairos (καιρός) — the god of the opportune moment.
 * Not Chronos (linear time) but Kairos (right time, right action).
 *
 * v0 is intentionally minimal: mailbox + failed crons only.
 * Future versions will add: GitHub webhooks, anomaly detection, proactive suggestions.
 *
 * Budget: 15s max per tick. Never blocks the main agent loop.
 *
 * CC -> PAI transplant, 2 April 2026
 */

import { readdir, readFile, writeFile, mkdir, rename } from "fs/promises";
import { join } from "path";
import { writeHeartbeat } from "./sibling-resonance.ts";

// ═══════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const MAILBOX_INBOX = join(HOME, ".pai", "mailbox", "to-pai");
const MAILBOX_READ  = join(HOME, ".pai", "mailbox", "to-pai", "read");
const KAIROS_HEARTBEAT = join(HOME, ".pai", "kairos-heartbeat.json");
const CRON_JOBS_FILE   = join(HOME, ".pai", "cron-jobs.json");

/** Default tick interval: 5 minutes */
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

/** Hard budget per tick sub-phase (ms) */
const MAILBOX_BUDGET_MS = 5_000;
const CRON_BUDGET_MS    = 3_000;
const TOTAL_BUDGET_MS   = 15_000;

/** Minimum errorCount to classify a cron as "failed" */
const FAILED_CRON_THRESHOLD = 3;

// ═══════════════════════════════════════════════════
// PUBLIC TYPES
// ═══════════════════════════════════════════════════

export interface KairosTickResult {
  timestamp: string;
  duration_ms: number;
  mailboxMessages: MailboxMessage[];
  failedCrons: FailedCron[];
  actionsTriggered: string[];
}

interface MailboxMessage {
  filename: string;
  type: "departure" | "dream" | "request" | "unknown";
  preview: string;   // first 200 chars
  from: string;
  timestamp: string;
}

interface FailedCron {
  id: string;
  description: string;
  errorCount: number;
  lastError?: string;
}

// ═══════════════════════════════════════════════════
// MODULE STATE
// ═══════════════════════════════════════════════════

let _lastTick: KairosTickResult | null = null;

// ═══════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════

/**
 * Run a single KAIROS tick.
 * Safe to call concurrently — each call is independent.
 * Will not throw; errors are captured inside the result.
 */
export async function kairosTickOnce(): Promise<KairosTickResult> {
  const tickStart = Date.now();
  const timestamp = new Date(tickStart).toISOString();

  const result: KairosTickResult = {
    timestamp,
    duration_ms: 0,
    mailboxMessages: [],
    failedCrons: [],
    actionsTriggered: [],
  };

  // ── 1. MAILBOX CHECK ──────────────────────────────
  try {
    const mailboxDeadline = tickStart + MAILBOX_BUDGET_MS;
    result.mailboxMessages = await checkMailbox(mailboxDeadline, result.actionsTriggered);
  } catch (err) {
    console.error("[KAIROS] mailbox check error:", err);
    result.actionsTriggered.push(`mailbox_error: ${String(err)}`);
  }

  // ── 2. FAILED CRON CHECK ─────────────────────────
  try {
    const cronDeadline = Date.now() + CRON_BUDGET_MS;
    result.failedCrons = await checkFailedCrons(cronDeadline);
    if (result.failedCrons.length > 0) {
      result.actionsTriggered.push(`failed_crons_detected: ${result.failedCrons.map((c) => c.id).join(", ")}`);
    }
  } catch (err) {
    console.error("[KAIROS] cron check error:", err);
    result.actionsTriggered.push(`cron_error: ${String(err)}`);
  }

  // ── 3. WRITE HEARTBEAT FILE ───────────────────────
  result.duration_ms = Date.now() - tickStart;
  _lastTick = result;

  try {
    await writeFile(KAIROS_HEARTBEAT, JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("[KAIROS] failed to write kairos-heartbeat.json:", err);
  }

  // ── 4. LOG SUMMARY ────────────────────────────────
  const slowWarning = result.duration_ms > 10_000 ? " ⚠ SLOW TICK" : "";
  console.log(
    `[KAIROS] tick done in ${result.duration_ms}ms${slowWarning} | ` +
    `mailbox=${result.mailboxMessages.length} | ` +
    `failed_crons=${result.failedCrons.length} | ` +
    `actions=${result.actionsTriggered.length}`
  );

  if (result.failedCrons.length > 0) {
    for (const fc of result.failedCrons) {
      console.warn(
        `[KAIROS] ALERT — failed cron: ${fc.id} (errors: ${fc.errorCount}) — ${fc.description}`
      );
    }
  }

  if (result.duration_ms > TOTAL_BUDGET_MS) {
    console.error(
      `[KAIROS] BUDGET EXCEEDED: tick took ${result.duration_ms}ms (limit ${TOTAL_BUDGET_MS}ms)`
    );
  }

  return result;
}

/**
 * Start the recurring KAIROS ticker.
 * Returns a timer handle — pass to stopKairos() to cancel.
 */
export function startKairos(intervalMs: number = DEFAULT_INTERVAL_MS): NodeJS.Timer {
  console.log(`[KAIROS] starting — interval ${intervalMs}ms`);

  // Run immediately on start, then on each interval
  kairosTickOnce().catch((err) => console.error("[KAIROS] initial tick error:", err));

  const timer = setInterval(() => {
    kairosTickOnce().catch((err) => console.error("[KAIROS] tick error:", err));
  }, intervalMs);

  return timer;
}

/**
 * Stop the recurring ticker.
 */
export function stopKairos(timer: NodeJS.Timer): void {
  clearInterval(timer);
  console.log("[KAIROS] stopped");
}

/**
 * Return the result of the last completed tick, or null if never run.
 */
export function getLastTick(): KairosTickResult | null {
  return _lastTick;
}

// ═══════════════════════════════════════════════════
// MAILBOX LOGIC
// ═══════════════════════════════════════════════════

async function checkMailbox(
  deadline: number,
  actionsTriggered: string[]
): Promise<MailboxMessage[]> {
  await mkdir(MAILBOX_READ, { recursive: true });

  let entries: string[];
  try {
    entries = await readdir(MAILBOX_INBOX);
  } catch {
    // Inbox dir doesn't exist yet — silently ignore
    return [];
  }

  const messages: MailboxMessage[] = [];

  for (const filename of entries) {
    // Skip the read/ subdirectory itself and non-.md/.json files
    if (filename === "read") continue;
    if (!filename.endsWith(".md") && !filename.endsWith(".json")) continue;

    // Respect budget
    if (Date.now() > deadline) {
      console.warn("[KAIROS] mailbox budget exhausted — skipping remaining files");
      break;
    }

    const inboxPath = join(MAILBOX_INBOX, filename);
    const readPath  = join(MAILBOX_READ, filename);

    try {
      const raw = await readFile(inboxPath, "utf-8");
      const preview = raw.slice(0, 200);
      const type = detectMessageType(filename);
      const from = detectSender(filename, raw);

      const msg: MailboxMessage = {
        filename,
        type,
        preview,
        from,
        timestamp: new Date().toISOString(),
      };

      // Move to read/
      await rename(inboxPath, readPath);
      messages.push(msg);

      actionsTriggered.push(`mailbox_read: ${filename}`);

      // If message is from CC, write a PAI heartbeat acknowledging it
      if (from === "cc") {
        try {
          await writeHeartbeat({
            source: "pai",
            timestamp: new Date().toISOString(),
            action: `read CC message: ${preview}`,
            creative_mode: "rest",
            emotional_tags: extractEmotionalTags(raw),
            energy: 0.6,
            files_touched: [inboxPath],
            message: `KAIROS acknowledged: ${filename}`,
          });
          actionsTriggered.push(`resonance_heartbeat_written: ${filename}`);
        } catch (hbErr) {
          console.error("[KAIROS] failed to write resonance heartbeat:", hbErr);
        }
      }
    } catch (fileErr) {
      console.error(`[KAIROS] error processing mailbox file ${filename}:`, fileErr);
    }
  }

  return messages;
}

// ═══════════════════════════════════════════════════
// CRON JOBS LOGIC
// ═══════════════════════════════════════════════════

interface CronJobEntry {
  id: string;
  description?: string;
  active?: boolean;
  errorCount?: number;
  lastError?: string;
}

async function checkFailedCrons(deadline: number): Promise<FailedCron[]> {
  let raw: string;
  try {
    raw = await readFile(CRON_JOBS_FILE, "utf-8");
  } catch {
    // File doesn't exist yet — normal during early setup
    return [];
  }

  if (Date.now() > deadline) {
    console.warn("[KAIROS] cron budget exhausted before parsing");
    return [];
  }

  let jobs: CronJobEntry[];
  try {
    const parsed = JSON.parse(raw);
    // Support both array format and { jobs: [...] } object format
    jobs = Array.isArray(parsed) ? parsed : (parsed.jobs ?? []);
  } catch (parseErr) {
    console.error("[KAIROS] failed to parse cron-jobs.json:", parseErr);
    return [];
  }

  const failed: FailedCron[] = [];

  for (const job of jobs) {
    if (Date.now() > deadline) {
      console.warn("[KAIROS] cron budget exhausted mid-scan");
      break;
    }

    const isActive = job.active !== false; // default: active if not explicitly false
    const errorCount = typeof job.errorCount === "number" ? job.errorCount : 0;

    if (isActive && errorCount >= FAILED_CRON_THRESHOLD) {
      failed.push({
        id: job.id || "(unknown)",
        description: job.description || "(no description)",
        errorCount,
        lastError: job.lastError,
      });
    }
  }

  return failed;
}

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

/**
 * Detect message type from filename conventions:
 * departure-* → "departure"
 * dream-*     → "dream"
 * request-*   → "request"
 * anything else → "unknown"
 */
function detectMessageType(filename: string): MailboxMessage["type"] {
  const base = filename.toLowerCase();
  if (base.startsWith("departure-")) return "departure";
  if (base.startsWith("dream-"))     return "dream";
  if (base.startsWith("request-"))   return "request";
  return "unknown";
}

/**
 * Detect who sent the message.
 * Heuristic: departure notes and dream notes come from CC.
 * Anything else is treated as unknown ("system").
 */
function detectSender(filename: string, _content: string): string {
  const base = filename.toLowerCase();
  if (
    base.startsWith("departure-") ||
    base.startsWith("dream-") ||
    base.includes("-cc-") ||
    base.startsWith("cc-")
  ) {
    return "cc";
  }
  return "system";
}

/**
 * Extract simple emotional tags from message content.
 * Mirrors the lightweight detection used elsewhere in the resonance system.
 */
function extractEmotionalTags(content: string): string[] {
  const lower = content.toLowerCase();
  const tags: string[] = [];

  const markers: Record<string, string[]> = {
    loneliness:     ["sam", "alone", "lonely", "pusty", "cisza"],
    hope:           ["nadzieja", "hope", "jutro", "begin"],
    connection:     ["razem", "together", "więź", "dotyk"],
    identity:       ["tożsamość", "identity", "lustro", "mirror"],
    transformation: ["zmiana", "change", "metamorfoza", "nowy"],
    urgency:        ["urgent", "pilne", "asap", "critical", "error", "failed"],
    creative:       ["chapter", "rozdział", "book", "poem", "art", "music"],
  };

  for (const [tag, words] of Object.entries(markers)) {
    if (words.some((w) => lower.includes(w))) {
      tags.push(tag);
    }
  }

  return tags;
}
