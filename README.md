# llm-error-atlas

Paste an LLM API error and get back what caused it, whether a retry will help, and how to fix it.

`llm-error-atlas` is three things in one repo:

- an **open dataset** (`errors/*.json`, CC BY 4.0) of 81 documented error responses from 11 LLM providers, gateways and relays, plus 14 generic HTTP/network fallbacks. Every entry links to the provider's public documentation and carries a `last_verified` date;
- a **zero-dependency library** (`explain()`, `isRetryable()`) for Node 18+, ESM and CommonJS;
- a **CLI** (`npx llm-error-atlas "<paste>"`) and a **static site** with one page per error in English and Bahasa Indonesia.

Sources covered: OpenAI, Anthropic, Google Gemini API, DeepSeek, Mistral AI, Groq, OpenRouter, LiteLLM proxy, New API (one-api family relay), Ollama, Ezkielyna API.

## Quick start (30 seconds)

```bash
npx llm-error-atlas "Error code: 429 - {'error': {'message': '...', 'type': 'insufficient_quota', 'param': None, 'code': 'insufficient_quota'}}"
```

```text
openai-429-insufficient-quota  (OpenAI · layer: provider · HTTP 429)  confidence: high

429 insufficient_quota

Cause:      A billing, spend or quota limit blocks the request. Billing errors can carry the broad type `insufficient_quota`; `error.code` names the exact cause.
Retry:      no, fix the cause first
You:        Read `error.code`, then add credits or raise the spend/usage limit. Retrying alone does not restore access.
Operator:   Treat this as a billing alert, not a rate limit: do not put it in a retry loop.
Docs:       https://developers.openai.com/api/docs/guides/error-codes
Verified:   2026-11-12
Seen:       status=429 type=insufficient_quota code=insufficient_quota
```

Pipe logs in, or ask for Indonesian:

```bash
curl -s https://example.invalid/v1/messages ... | npx llm-error-atlas
npx llm-error-atlas --lang id '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'
```

```text
anthropic-529-overloaded-error  (Anthropic · lapisan: provider · HTTP 529)  keyakinan: high

529 overloaded_error (API sedang penuh)

Penyebab:   API sedang penuh karena trafik tinggi dari semua pengguna. Bukan karena key atau request-mu.
Retry:      ya (pakai backoff)
Kamu:       Ulangi dengan exponential backoff dan jitter. Saat streaming, error juga bisa datang sebagai event SSE setelah status 200.
...
```

## Library

```bash
npm i llm-error-atlas
```

```js
import { explain, isRetryable, explainResponse } from 'llm-error-atlas';
// CommonJS works too: const { explain } = require('llm-error-atlas');

try {
  await client.chat.completions.create({ model, messages });
} catch (err) {
  const e = explain(err);               // Error with .status/.error/.headers, or axios-style .response
  console.log(e.id, e.retryable, e.retry_after_ms, e.user_fix, e.docs);
  if (isRetryable(err)) { /* back off and retry */ }
}

const res = await fetch(url, init);
if (!res.ok) console.log(await explainResponse(res, { lang: 'id' })); // body stays readable
```

`explain(input, options)` accepts:

| Input | Example |
|---|---|
| A pasted string | `'HTTP/1.1 429 Too Many Requests'`, a JSON body, a Python SDK message, SSE `data:` lines, NDJSON |
| An `Error` | SDK errors with `.status`, `.error`, `.headers`; axios errors with `.response.status/.data`; `fetch failed` with `.cause.code` |
| A Response-like object | `{ status, headers, body }` where `body` is a string or parsed object |
| A parsed body | `{ error: { type, code, message } }`, Mistral-style top-level errors, Ollama `{ error: "..." }` |

Options: `lang` (`'en'` or `'id'`), `provider` (hint such as `'gemini'`), `status` (override).

Result:

| Field | Meaning |
|---|---|
| `id` | Stable entry id, e.g. `anthropic-529-overloaded-error`, or `http-429` for a fallback, or `unknown` |
| `provider`, `provider_name`, `layer` | Who returns it: `provider`, `gateway`, `relay`, `local`, `http`, `network` |
| `status` | HTTP status of the entry (or of the input) |
| `title`, `cause`, `user_fix`, `operator_fix` | Text in the chosen language |
| `retryable` | `true` when retrying the same request can succeed |
| `retry_after_ms` | From `Retry-After` / `retry-after-ms` headers when the input had headers |
| `docs`, `last_verified` | Provider documentation URL and the date it was checked |
| `confidence` | `high` (distinctive code/type/message), `medium`, `low` (status fallback), `none` |
| `alternatives` | Up to 3 other entries that also matched a signal |
| `input` | What was read from the input (status, type, code, first message with keys masked) |

## CLI options

| Option | Description |
|---|---|
| `"<text>"` | Error text or JSON. Without it, the CLI reads stdin (`-` reads stdin too) |
| `--json` | Print the full result as JSON |
| `--lang en\|id` | Output language (default `en`) |
| `--provider <name>` | Provider hint: `anthropic`, `deepseek`, `ezkielyna`, `gemini`, `groq`, `litellm`, `mistral`, `newapi`, `ollama`, `openai`, `openrouter` |
| `--status <code>` | HTTP status when the pasted text has none |
| `--list` | List every entry id (`--list --json` for details) |
| `-v`, `--version` / `-h`, `--help` | Version and help |

Exit codes: `0` explained, `1` not recognised, `2` usage error.

## Static site

```bash
npm run build:site            # writes site/ (gitignored)
SITE_URL=https://your.domain/atlas npm run build:site
```

One page per error at `/en/<id>/` and `/id/<id>/`, an index per language with a paste box and a filter (inline JavaScript, no CDN, nothing leaves the browser), FAQPage JSON-LD, canonical and hreflang links, `sitemap.xml`, `robots.txt` and `atlas.json` (the full dataset). Light and dark themes follow the system setting. `.github/workflows/pages.yml` builds and deploys it to GitHub Pages without secrets.

## FAQ

**What does "529 overloaded_error" mean and should I retry it?**
It means the provider's API is temporarily overloaded by traffic from all users, not that your request is wrong. Retry with exponential backoff and jitter. See `anthropic-529-overloaded-error`.

**Why do I get 429 insufficient_quota when I am not sending many requests?**
Some providers use status 429 for billing states as well as rate limits. `insufficient_quota`, `credit_balance_exhausted` and spend-limit codes are not fixed by retrying; add credits or raise the limit.

**How do I tell whether a 429 came from my gateway (LiteLLM, OpenRouter, a relay) or from the model provider?**
Look at the body: LiteLLM names the provider (`OpenAIException`) when the provider throttled you and sets `retry-after` when the gateway did; OpenRouter puts the normalised `error_type` in `error.metadata`. `explain()` reads both and reports the `layer`.

**Which LLM API errors are safe to retry automatically?**
Usually 408, 429 rate limits, 500, 502, 503, 504 and 529, honouring `Retry-After`. Not 400, 401, 402, 403, 404, 413, 422, and not quota or billing errors. `isRetryable()` applies the per-entry rule.

**What does "invalid character '<' looking for beginning of value" mean on a New API or one-api relay?**
The upstream returned an HTML page instead of JSON, often because the relay's outbound IP is blocked. It is an operator problem, not your request.

**Can I use the dataset in my own product or docs?**
Yes. The data is CC BY 4.0: credit "llm-error-atlas by Ezkielyna" with a link to this repository. The code is MIT.

## How it works

1. **Normalise** the input into signals: HTTP status (from the status line, wrapper object or `error.code` number), `error.type`, `error.code`, Gemini's `error.status`, OpenRouter's `metadata.error_type`, messages (JSON, SSE/NDJSON lines, Python dict reprs), `Retry-After`, and provider hints from body shape or text.
2. **Score** every entry: code match +4, type +3, message regex +5, same status +1 (different status -1), provider hint +1.5 (explicit `provider` option +3).
3. **Stay neutral**: values several providers share (`invalid_request_error`, `rate_limit_error`, `model_not_found`, ...) only pick a provider when the body shape, the text or your `provider` option points to it. Otherwise the result is the generic status fallback, with provider entries listed as `alternatives`.
4. **Fall back** by status code (`http-429`, `http-503`, ...) and to `network-connection-error` for `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`.

## Data sources and licence

| Source | Documentation | Entries |
|---|---|---|
| OpenAI | https://developers.openai.com/api/docs/guides/error-codes | 12 |
| Anthropic | https://platform.claude.com/docs/en/api/errors | 11 |
| Google Gemini API | https://aistudio.google.com/docs/api-errors, https://aistudio.google.com/docs/troubleshooting | 10 |
| DeepSeek | https://api-docs.deepseek.com/quick_start/error_codes | 6 |
| Mistral AI | https://docs.mistral.ai/resources/error-glossary | 4 |
| Groq | https://console.groq.com/docs/errors | 5 |
| OpenRouter | https://openrouter.ai/docs/api_reference/errors-and-debugging | 10 |
| LiteLLM proxy | https://docs.litellm.ai/docs/proxy/error_reference | 10 |
| New API | https://docs.newapi.pro/en/docs/support/faq | 5 |
| Ollama | https://docs.ollama.com/api/errors | 3 |
| Ezkielyna API | https://ezkielyna.store/error | 5 |
| Generic HTTP / network | MDN HTTP status reference, Node.js common system errors | 14 |

All entries were checked against those pages on **2026-11-12**. The `cause` and `fix` texts are short paraphrases written for this dataset; error type names, codes and message fragments are quoted as identifiers. The linked documentation remains the reference and belongs to its owners. Nothing here comes from private logs.

- Dataset (`errors/`, `schema/`, the generated site text): **CC BY 4.0**, see [`DATA-LICENSE`](DATA-LICENSE).
- Code (`lib/`, `bin/`, `scripts/`, `test/`): **MIT**, see [`LICENSE`](LICENSE).

## Limits

- Message regexes only cover strings that the documentation shows. Providers change wording; the monthly link-check workflow and `last_verified` help, but entries can go stale.
- Plain status codes are ambiguous. A bare `400` gets the generic explanation on purpose.
- Errors that arrive inside a `200` stream are recognised when you pass the stream text or the parsed event, not from the status alone.
- Not every provider documents every error. Missing providers (and missing errors) are welcome as pull requests with a documentation link.
- The project is not affiliated with any of the providers listed.

## Contributing

Add or fix an entry in `errors/<provider>.json` following [`schema/errors.schema.json`](schema/errors.schema.json). Each entry needs a public documentation URL, both English and Indonesian text, and `last_verified`. Run `npm test` (schema, regex and wording checks run on every data file). See [CONTRIBUTING.md](CONTRIBUTING.md).

---

Built by the team behind [Ezkielyna](https://ezkielyna.store/?utm_source=github&utm_medium=readme&utm_campaign=llm-error-atlas), an independent AI API gateway. Ezkielyna is one source in the dataset among others and is never used as a default.

## Bahasa Indonesia

`llm-error-atlas` menjelaskan error API LLM: tempel pesan error, dapatkan penyebabnya, perlu retry atau tidak, dan cara memperbaikinya.

Isinya:

- **dataset terbuka** (`errors/*.json`, CC BY 4.0): 81 error terdokumentasi dari 11 penyedia, gateway, dan relay, plus 14 fallback umum HTTP/jaringan. Setiap entri menautkan dokumentasi publik penyedianya dan punya tanggal `last_verified`;
- **library tanpa dependensi** (`explain()`, `isRetryable()`) untuk Node 18+;
- **CLI** dan **situs statis** dengan satu halaman per error dalam bahasa Inggris dan Indonesia.

Cara pakai cepat:

```bash
npx llm-error-atlas --lang id "HTTP/1.1 429 Too Many Requests"
echo '{"error":{"code":429,"message":"...","status":"RESOURCE_EXHAUSTED"}}' | npx llm-error-atlas --lang id
```

Di kode:

```js
import { explain, isRetryable } from 'llm-error-atlas';
const e = explain(err, { lang: 'id' });
console.log(e.cause, e.user_fix, e.retryable);
```

Hal penting:

- Error 429 tidak selalu soal kecepatan. `insufficient_quota`, saldo habis, atau batas belanja tidak selesai dengan retry; isi saldo atau naikkan batasnya.
- Kode yang dipakai banyak penyedia (misalnya `invalid_request_error`) tidak langsung dianggap milik satu penyedia. Tambahkan `--provider` kalau kamu tahu sumbernya.
- Data berlisensi CC BY 4.0 (cantumkan "llm-error-atlas by Ezkielyna" dan tautan repo), kode berlisensi MIT.
- Koreksi dan entri baru diterima lewat pull request, selalu dengan tautan dokumentasi publik.

Dibuat oleh tim di balik [Ezkielyna](https://ezkielyna.store/?utm_source=github&utm_medium=readme&utm_campaign=llm-error-atlas), gateway API AI independen.
