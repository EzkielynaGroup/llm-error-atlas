export type Lang = 'en' | 'id';
export type Layer = 'provider' | 'gateway' | 'relay' | 'local' | 'http' | 'network' | 'unknown';

export interface ExplainOptions {
  /** Output language for title, cause and fixes. Default 'en'. */
  lang?: Lang;
  /** Provider hint, e.g. 'openai', 'anthropic', 'gemini', 'openrouter', 'litellm'. */
  provider?: string;
  /** Override the HTTP status when the input does not contain it. */
  status?: number;
}

export interface Alternative { id: string; provider: string; title: string; score: number; }

export interface Explanation {
  id: string;
  provider: string;
  provider_name: string;
  layer: Layer;
  status: number | null;
  title: string;
  cause: string;
  retryable: boolean;
  /** Milliseconds from a Retry-After / retry-after-ms header, when the input had headers. */
  retry_after_ms: number | null;
  user_fix: string;
  operator_fix: string;
  docs: string | null;
  last_verified: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  matched_on: string[];
  alternatives: Alternative[];
  input: { status: number | null; type: string | null; code: string | null; message: string | null; in_band: boolean };
}

/** Accepts a pasted string, an Error with .status/.response, a Response-like `{status, headers, body}`, or a parsed body. */
export type ErrorInput = string | number | Error | { status?: number; headers?: unknown; body?: unknown; data?: unknown; [k: string]: unknown };

export function explain(input: ErrorInput, opts?: ExplainOptions): Explanation;
export function isRetryable(input: ErrorInput, opts?: ExplainOptions): boolean;
export function explainResponse(res: { status: number; headers?: unknown; text?: () => Promise<string>; clone?: () => unknown }, opts?: ExplainOptions): Promise<Explanation>;
export function redact(s: string): string;
/** Low-level: the signals (status, types, codes, messages, provider hints) read from an input. */
export function normalize(input: ErrorInput): { status: number | null; types: string[]; codes: string[]; messages: string[]; hints: string[]; retryAfterMs: number | null; inBand: boolean };
export const entries: ReadonlyArray<Record<string, unknown>>;
export const providers: Record<string, { id: string; name: string; source: string; fallback: boolean }>;
export function get(id: string): Record<string, unknown> | null;
export const version: string;
/** Build a matcher from parsed data files (same shape as errors/*.json). */
export function createAtlas(files: unknown[]): { explain: typeof explain; isRetryable: typeof isRetryable; entries: ReadonlyArray<Record<string, unknown>> };
/** Read and parse every errors/*.json file (or the files in `dir`). */
export function loadFiles(dir?: string): unknown[];
declare const atlas: {
  explain: typeof explain; isRetryable: typeof isRetryable; explainResponse: typeof explainResponse;
  entries: typeof entries; providers: typeof providers; get: typeof get; version: string;
};
export default atlas;
