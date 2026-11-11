import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'cli.mjs');
const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { input: input == null ? '' : input, encoding: 'utf8', timeout: 20000 });
const OVERLOADED = '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}';

test('argument, English text output', () => {
  const r = run([OVERLOADED]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^anthropic-529-overloaded-error/);
  assert.match(r.stdout, /Cause: +The API is temporarily overloaded/);
  assert.match(r.stdout, /Retry: +yes/);
  assert.match(r.stdout, /Docs: +https:\/\/platform\.claude\.com\/docs\/en\/api\/errors/);
  assert.match(r.stdout, /Verified: +2026-11-12/);
});

test('--lang id prints Indonesian labels and text', () => {
  const r = run(['--lang', 'id', OVERLOADED]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Penyebab: +API sedang penuh/);
  assert.match(r.stdout, /Retry: +ya/);
  assert.match(r.stdout, /Dicek: +2026-11-12/);
});

test('--json prints the full result', () => {
  const r = run(['--json', '--lang=id', OVERLOADED]);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.id, 'anthropic-529-overloaded-error');
  assert.equal(j.retryable, true);
  assert.equal(j.provider, 'anthropic');
  assert.match(j.cause, /penuh/);
});

test('reads the error from stdin', () => {
  const r = run(['--json'], 'HTTP/1.1 429 Too Many Requests\nretry later\n');
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.id, 'http-429');
  assert.equal(j.retryable, true);
});

test('"-" combines an argument hint with stdin, --provider and --status work', () => {
  const r = run(['--json', '--provider', 'groq', '--status', '413', '-'], '{"error":{"message":"example","type":"invalid_request_error"}}');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).id, 'groq-413-request-entity-too-large');
});

test('not recognised exits 1, bad usage exits 2', () => {
  assert.equal(run(['hello world']).status, 1);
  const bad = run(['--bogus']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown option/);
  assert.equal(run(['--lang', 'fr', 'x']).status, 2);
  assert.equal(run(['--status', 'abc', 'x']).status, 2);
  assert.equal(run([], '   ').status, 2);
});

test('--help, --version and --list', () => {
  const h = run(['--help']);
  assert.equal(h.status, 0);
  assert.match(h.stdout, /Usage:/);
  const v = run(['--version']);
  assert.equal(v.stdout.trim(), '0.1.0');
  const l = run(['--list']);
  assert.match(l.stdout, /openai-429-slow-down/);
  const lj = JSON.parse(run(['--list', '--json']).stdout);
  assert.ok(lj.length > 60);
});
