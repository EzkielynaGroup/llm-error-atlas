import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { explain, isRetryable, explainResponse, entries } from '../index.mjs';

const require = createRequire(import.meta.url);
const cjs = require('../lib/index.cjs');

// One representative per provider. Bodies follow the shapes shown in each provider's public docs;
// free-text messages that are not part of a documented string are neutral placeholders.
const CASES = [
  ['openai type+code', { status: 429, body: { error: { message: 'example', type: 'rate_limit_error', code: 'slow_down' } } }, 'openai-429-slow-down'],
  ['openai python repr', "Error code: 429 - {'error': {'message': 'example', 'type': 'insufficient_quota', 'param': None, 'code': 'insufficient_quota'}}", 'openai-429-insufficient-quota'],
  ['openai documented message', '500 The server had an error while processing your request. Sorry about that!', 'openai-500-server-error'],
  ['openai billing code beats broad type', { status: 429, body: { error: { message: 'example', type: 'insufficient_quota', code: 'credit_balance_exhausted' } } }, 'openai-429-credit-balance-exhausted'],
  ['openai 503 overloaded', { status: 503, body: { error: { message: 'example', type: 'service_unavailable_error', code: 'server_is_overloaded' } } }, 'openai-503-server-overloaded'],
  ['anthropic 529', '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}', 'anthropic-529-overloaded-error'],
  ['anthropic docs 404 example', '{"type":"error","error":{"type":"not_found_error","message":"The requested resource could not be found."},"request_id":"req_011CSHoEeqs5C35K2UUqR7Fy"}', 'anthropic-404-not-found-error'],
  ['anthropic CORS', { status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'CORS requests are not allowed for this Organization because of its settings.' } } }, 'anthropic-401-cors-not-allowed'],
  ['gemini RESOURCE_EXHAUSTED', { status: 429, body: { error: { code: 429, message: 'example', status: 'RESOURCE_EXHAUSTED' } } }, 'gemini-429-rate-limit-exceeded'],
  ['gemini leaked key', { status: 403, body: { error: { code: 403, message: 'Your API key was reported as leaked. Please use another API key.', status: 'PERMISSION_DENIED' } } }, 'gemini-403-api-key-leaked'],
  ['deepseek 402', { status: 402, body: { error: { message: 'Insufficient Balance', type: 'unknown_error' } } }, 'deepseek-402-insufficient-balance'],
  ['mistral unknown_model', { status: 404, body: { object: 'error', message: 'example', type: 'invalid_request_error', param: 'model', code: 'unknown_model' } }, 'mistral-404-not-found'],
  ['groq 498 unique status', { status: 498, body: { error: { message: 'example', type: 'example' } } }, 'groq-498-flex-tier-capacity-exceeded'],
  ['openrouter 402', '{"error":{"code":402,"message":"example","metadata":{"error_type":"payment_required"}}}', 'openrouter-402-insufficient-credits'],
  ['openrouter budget (docs example)', { status: 403, body: { error: { code: 403, message: 'Budget limit exceeded (weekly limit). Contact your org admin. $52.00 of $50.00 used; resets 2026-10-12T00:00:00.000Z.', metadata: { limit_source: 'openrouter_guardrail_budget', scope: 'workspace_default_member' } } } }, 'openrouter-403-budget-limit-exceeded'],
  ['openrouter guardrail (docs example)', { status: 403, body: { error: { code: 403, message: 'Request blocked: prompt injection patterns detected', metadata: { patterns: ['x'] } } } }, 'openrouter-403-guardrail-blocked'],
  ['litellm budget (docs example)', { status: 429, body: { error: { message: 'Budget has been exceeded! Key=analytics-team (sk-...W8TA) Current cost: 0.06, Max budget: 0.05', type: 'budget_exceeded', param: null, code: '429' } } }, 'litellm-429-budget-exceeded'],
  ['litellm gateway rate limit (docs example)', { status: 429, body: { error: { message: 'Rate limit exceeded for api_key: b2f139a7... Limit type: requests. Current limit: 1, Remaining: 0. Limit resets at: 2026-08-27 00:15:18 UTC', type: 'throttling_error', param: null, code: '429' } } }, 'litellm-429-throttling-error'],
  ['litellm route not found', { status: 404, body: { detail: 'Not Found' } }, 'litellm-404-route-not-found'],
  ['new api saturated', 'Current group load is saturated, please try again later.', 'newapi-group-load-saturated'],
  ['new api no channel', { status: 503, body: { error: { message: 'No available channels for model x under group y', type: 'new_api_error' } } }, 'newapi-no-available-channels'],
  ['ollama stream error (docs example)', '{"model":"gemma4","created_at":"2025-10-26T17:21:21.231094Z","response":"can","done":false}\n{"error":"an error was encountered while running the model"}', 'ollama-model-run-error'],
  ['ollama 404 shape', { status: 404, body: { error: 'example' } }, 'ollama-404-model-not-found'],
  ['ezkielyna wrong base url (docs example)', '{"type":"error","error":{"type":"invalid_request_error","code":"wrong_base_url","message":"Wrong Base URL: ezkielyna.store is the store website. Use https://api.ezkielyna.store/v1 as the Base URL (same API key). ..."}}', 'ezkielyna-404-wrong-base-url'],
  ['ezkielyna invalid key (docs example)', { status: 401, body: { error: { type: 'authentication_error', code: 'invalid_api_key', message: 'API key rejected: it is wrong, expired, disabled, or out of credit.' } } }, 'ezkielyna-401-invalid-api-key']
];

for (const [name, input, id] of CASES) {
  test(`matches ${name} -> ${id}`, () => {
    const r = explain(input);
    assert.equal(r.id, id, JSON.stringify({ got: r.id, on: r.matched_on, alts: r.alternatives }));
    assert.ok(r.docs && r.docs.startsWith('https://'));
    assert.equal(r.last_verified, '2026-11-12');
    for (const k of ['id', 'provider', 'layer', 'cause', 'retryable', 'user_fix', 'operator_fix', 'docs', 'last_verified']) assert.ok(k in r, k);
  });
}

test('every provider file has a representative case', () => {
  const covered = new Set(CASES.map((c) => c[2].split('-')[0]));
  const providers = new Set(entries.filter((e) => !e.fallback).map((e) => e.provider));
  for (const p of providers) assert.ok(covered.has(p), `no match test for ${p}`);
});

test('shared type alone does not claim a provider; a hint does', () => {
  const body = { status: 404, body: { error: { code: 'model_not_found', message: 'example' } } };
  assert.equal(explain(body).id, 'http-404');
  assert.equal(explain(body, { provider: 'gemini' }).id, 'gemini-404-model-not-found');
  const groq = { status: 413, body: { error: { message: 'example', type: 'invalid_request_error' } } };
  assert.equal(explain(groq).id, 'http-413');
  assert.equal(explain(groq, { provider: 'groq' }).id, 'groq-413-request-entity-too-large');
});

test('a generic body with a shared type falls back, with the gateway entry as an alternative', () => {
  const input = { status: 500, body: '{"error": {"message": "Internal server error", "type": "internal_server_error"}}' };
  const r = explain(input);
  assert.equal(r.id, 'http-500');
  assert.ok(r.alternatives.some((a) => a.id === 'litellm-500-internal-server-error'));
  assert.equal(explain(input, { provider: 'litellm' }).id, 'litellm-500-internal-server-error');
});

test('a bare standard status never claims a single provider', () => {
  assert.equal(explain('', { status: 504 }).id, 'http-504');
  assert.equal(explain({ status: 529 }).id, 'anthropic-529-overloaded-error');
});

test('gateway-specific entries that need a hint stay neutral without one', () => {
  const body = { status: 403, body: { error: { message: 'token quota is not enough' } } };
  assert.equal(explain(body).id, 'http-403');
  assert.equal(explain(body, { provider: 'ezkielyna' }).id, 'ezkielyna-403-insufficient-quota');
});

test('openrouter mid-stream error inside a 200 uses the in-band status', () => {
  const sse = 'data: {"id":"gen-abc123","object":"chat.completion.chunk","created":1234567890,"model":"openai/gpt-4o","provider":"OpenAI","error":{"code":429,"message":"Rate limit exceeded","metadata":{"error_type":"rate_limit_exceeded"}},"choices":[{"index":0,"delta":{"content":""},"finish_reason":"error"}]}';
  const r = explain({ status: 200, body: sse });
  assert.equal(r.id, 'openrouter-429-rate-limit-exceeded');
  assert.equal(r.input.status, 429);
  assert.equal(r.input.in_band, true);
  assert.equal(r.retryable, true);
});

test('fallbacks by status code', () => {
  const r = explain('429');
  assert.equal(r.id, 'http-429');
  assert.equal(r.confidence, 'low');
  assert.equal(r.retryable, true);
  assert.deepEqual(r.alternatives, []);
  assert.equal(explain('HTTP/1.1 503 Service Unavailable').id, 'http-503');
  assert.equal(explain('Request failed: 502 Bad Gateway').id, 'http-502');
  assert.equal(explain({ status: 401 }).retryable, false);
  assert.equal(explain({ status: 418 }).id, 'http-400');
  assert.equal(explain({ status: 507 }).id, 'http-500');
  assert.equal(explain('', { status: 504 }).id, 'http-504');
});

test('generic 429 that talks about quota or billing is not retryable', () => {
  assert.equal(explain({ status: 429, body: { error: { message: 'example: monthly quota used up' } } }).retryable, false);
  assert.equal(isRetryable({ status: 429, body: { error: { message: 'example' } } }), true);
});

test('Retry-After header is honoured (seconds, ms and HTTP date)', () => {
  assert.equal(explain({ status: 429, headers: { 'Retry-After': '7' } }).retry_after_ms, 7000);
  assert.equal(explain({ status: 429, headers: { 'retry-after-ms': '1500' } }).retry_after_ms, 1500);
  const date = new Date(Date.now() + 60000).toUTCString();
  const ms = explain({ status: 503, headers: new Headers({ 'retry-after': date }) }).retry_after_ms;
  assert.ok(ms > 50000 && ms <= 60000, String(ms));
  assert.equal(explain({ status: 429 }).retry_after_ms, null);
});

test('network errors: Error with code and fetch failed with cause', () => {
  const e1 = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), { code: 'ECONNREFUSED' });
  assert.equal(explain(e1).id, 'network-connection-error');
  const e2 = new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo ENOTFOUND example.invalid'), { code: 'ENOTFOUND' }) });
  const r = explain(e2);
  assert.equal(r.id, 'network-connection-error');
  assert.equal(r.retryable, true);
});

test('accepts SDK-style errors (.status/.error/.headers) and axios-style (.response)', () => {
  const sdk = Object.assign(new Error('429 example'), { status: 429, headers: { 'retry-after': '2' }, error: { message: 'example', type: 'rate_limit_error', code: 'slow_down' } });
  const r = explain(sdk);
  assert.equal(r.id, 'openai-429-slow-down');
  assert.equal(r.retry_after_ms, 2000);
  const axios = Object.assign(new Error('Request failed with status code 401'), { response: { status: 401, data: { type: 'error', error: { type: 'authentication_error', message: 'example' } } } });
  assert.equal(explain(axios).id, 'anthropic-401-authentication-error');
  const anthropicSdk = Object.assign(new Error('529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'), { status: 529, error: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } });
  assert.equal(explain(anthropicSdk).id, 'anthropic-529-overloaded-error');
});

test('explainResponse reads a real fetch Response from a local mock server', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/overloaded') {
      res.writeHead(529, { 'content-type': 'application/json', 'retry-after': '3' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }));
    } else {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ detail: 'Not Found' }));
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const r1 = await explainResponse(await fetch(`${base}/overloaded`));
    assert.equal(r1.id, 'anthropic-529-overloaded-error');
    assert.equal(r1.retry_after_ms, 3000);
    const res2 = await fetch(`${base}/v1/chat/completions`);
    const r2 = await explainResponse(res2, { lang: 'id' });
    assert.equal(r2.id, 'litellm-404-route-not-found');
    assert.match(r2.cause, /Route tidak ada/);
    assert.equal(await res2.text(), '{"detail":"Not Found"}', 'body still readable after explainResponse');
  } finally {
    server.close();
  }
});

test('lang id returns Indonesian text', () => {
  const en = explain('{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}');
  const id = explain('{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}', { lang: 'id' });
  assert.equal(en.id, id.id);
  assert.notEqual(en.cause, id.cause);
  assert.match(id.cause, /penuh/);
});

test('unrecognised input', () => {
  const r = explain('hello world');
  assert.equal(r.id, 'unknown');
  assert.equal(r.retryable, false);
  assert.equal(isRetryable(null), false);
  assert.equal(explain(undefined).id, 'unknown');
});

test('keys in pasted messages are masked in the echoed input', () => {
  const fake = 'sk-' + 'test' + 'abcdefghijklmnop';
  const r = explain(`Incorrect API key provided: ${fake}. You can find your API key in the dashboard.`);
  assert.equal(r.id, 'openai-401-invalid-api-key');
  assert.ok(!r.input.message.includes(fake));
  assert.match(r.input.message, /sk-\*\*\*/);
});

test('very large input is handled quickly', () => {
  const big = 'x'.repeat(500000) + ' 429';
  const t = Date.now();
  explain(big);
  assert.ok(Date.now() - t < 2000);
});

test('ESM, CJS and package self-reference give the same result', async () => {
  const input = { status: 402, body: { type: 'error', error: { type: 'billing_error', message: 'example' } } };
  const viaName = await import('llm-error-atlas');
  assert.equal(cjs.explain(input).id, 'anthropic-402-billing-error');
  assert.equal(explain(input).id, 'anthropic-402-billing-error');
  assert.equal(viaName.explain(input).id, 'anthropic-402-billing-error');
  assert.equal(viaName.isRetryable(input), false);
});
