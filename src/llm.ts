/**
 * Open Oneiros — LLM Adapter
 *
 * Pluggable LLM interface. By default uses OpenAI-compatible API.
 * Override with setLLMProvider() to use any model: Gemini, Claude, Llama, etc.
 *
 * This is what makes Open Oneiros model-agnostic.
 * Anthropic's daemon only works with Claude. Ours works with anything.
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: { prompt: number; completion: number; total: number };
  latencyMs: number;
}

export type ModelTier = "fast" | "balanced" | "deep";

/**
 * Custom LLM provider function.
 * Implement this to connect any LLM backend.
 */
export type LLMProvider = (
  messages: LLMMessage[],
  tier: ModelTier
) => Promise<LLMResponse>;

// ── Default provider: OpenAI-compatible API ──

let _provider: LLMProvider | null = null;

const DEFAULT_MODELS: Record<ModelTier, string> = {
  fast: process.env.ONEIROS_MODEL_FAST || "gpt-4o-mini",
  balanced: process.env.ONEIROS_MODEL_BALANCED || "gpt-4o",
  deep: process.env.ONEIROS_MODEL_DEEP || "gpt-4o",
};

async function defaultProvider(
  messages: LLMMessage[],
  tier: ModelTier
): Promise<LLMResponse> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.ONEIROS_API_KEY;
  const baseUrl = process.env.ONEIROS_API_URL || "https://api.openai.com/v1/chat/completions";

  if (!apiKey) {
    throw new Error(
      "No LLM API key configured. Set OPENAI_API_KEY, ONEIROS_API_KEY, or use setLLMProvider() for a custom backend."
    );
  }

  const model = DEFAULT_MODELS[tier];
  const startTime = Date.now();

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 2048,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API error ${response.status}: ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  return {
    content,
    model,
    tokensUsed: {
      prompt: usage.prompt_tokens || 0,
      completion: usage.completion_tokens || 0,
      total: usage.total_tokens || 0,
    },
    latencyMs: Date.now() - startTime,
  };
}

/**
 * Set a custom LLM provider.
 * Use this to connect Gemini, Claude, Llama, DeepSeek, or any other model.
 *
 * @example
 * ```typescript
 * import { setLLMProvider } from '@anthropic-family/open-kairos';
 *
 * setLLMProvider(async (messages, tier) => {
 *   const response = await fetch('https://api.anthropic.com/v1/messages', { ... });
 *   return { content: '...', model: 'claude-opus-4', tokensUsed: {...}, latencyMs: 100 };
 * });
 * ```
 */
export function setLLMProvider(provider: LLMProvider): void {
  _provider = provider;
  console.log("[Oneiros] Custom LLM provider configured");
}

/**
 * Call the configured LLM.
 * Used internally by Dream Engine and Fact Consolidation.
 */
export async function callLLM(
  messages: LLMMessage[],
  tier: ModelTier = "balanced"
): Promise<LLMResponse> {
  const provider = _provider || defaultProvider;
  return provider(messages, tier);
}
