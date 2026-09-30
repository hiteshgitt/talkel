/**
 * Gemini generateContent with structured JSON output, retries and model fallback.
 * Overload (429/503) and server errors move on to the next model; other errors fail fast.
 */
export interface StructuredResult {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface GeminiTextOptions {
  apiKey: string;
  baseUrl: string; // https://generativelanguage.googleapis.com/v1beta
  models: readonly string[];
  maxAttempts?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class EvaluationProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'EvaluationProviderError';
  }
}

export async function generateStructured(
  opts: GeminiTextOptions,
  prompt: { system: string; user: string },
  jsonSchema: unknown,
): Promise<StructuredResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const attempts = opts.maxAttempts ?? 5;
  let lastError = 'no attempt made';

  for (let attempt = 0; attempt < attempts; attempt++) {
    const model = opts.models[attempt % opts.models.length]!;
    const body = {
      systemInstruction: { parts: [{ text: prompt.system }] },
      contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: jsonSchema,
        temperature: 0.2,
        // Gemini 3.x uses thinking levels; older models use a token budget.
        ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'low' } } : { thinkingConfig: { thinkingBudget: 1024 } }),
      },
    };
    let res: Response;
    try {
      res = await fetchImpl(`${opts.baseUrl}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': opts.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
      });
    } catch (err) {
      lastError = `${model}: network ${(err as Error).message}`;
      await sleep(backoff(attempt));
      continue;
    }

    const json = (await res.json().catch(() => null)) as GeminiResponse | null;
    if (!res.ok) {
      lastError = `${model}: HTTP ${res.status} ${json?.error?.message ?? ''}`.trim();
      if (res.status === 429 || res.status >= 500) {
        await sleep(backoff(attempt));
        continue;
      }
      throw new EvaluationProviderError(lastError, false);
    }

    const candidate = json?.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('');
    if (!text) {
      lastError = `${model}: empty response (finishReason=${candidate?.finishReason ?? 'unknown'})`;
      await sleep(backoff(attempt));
      continue;
    }
    return {
      text,
      model,
      usage: { inputTokens: json?.usageMetadata?.promptTokenCount ?? 0, outputTokens: json?.usageMetadata?.candidatesTokenCount ?? 0 },
    };
  }
  throw new EvaluationProviderError(`evaluation failed after ${attempts} attempts; last: ${lastError}`, true);
}

function backoff(attempt: number): number {
  return Math.min(15_000, 1500 * 2 ** attempt);
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}
