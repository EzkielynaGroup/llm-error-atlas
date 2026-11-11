# Publishing llm-error-atlas (owner checklist)

Nothing here has been published. Everything below is for the owner to run.

## GitHub metadata

- **Description** (≤ 120 chars): `Paste an LLM API error, get the cause, whether to retry, and the fix. Open dataset (CC BY 4.0), zero-dep library + CLI.`
- **Homepage**: `https://ezkielynagroup.github.io/llm-error-atlas/`
- **Topics** (14): `llm`, `llm-api`, `error-codes`, `error-handling`, `openai`, `anthropic`, `gemini`, `openrouter`, `litellm`, `ollama`, `retry`, `rate-limiting`, `dataset`, `cli`

## Steps

1. Run the organisation's leak check (`gh_public_check.sh`) on this folder one more time; it must print `CLEAN`.
2. Create the repository and push (from inside this folder):
   ```bash
   gh repo create EzkielynaGroup/llm-error-atlas --public \
     --description "Paste an LLM API error, get the cause, whether to retry, and the fix. Open dataset (CC BY 4.0), zero-dep library + CLI." \
     --homepage "https://ezkielynagroup.github.io/llm-error-atlas/" --source . --remote origin
   git push -u origin main
   gh repo edit EzkielynaGroup/llm-error-atlas --add-topic llm,llm-api,error-codes,error-handling,openai,anthropic,gemini,openrouter,litellm,ollama,retry,rate-limiting,dataset,cli
   ```
3. Turn on GitHub Pages with GitHub Actions as the source, then run the `pages` workflow once:
   ```bash
   gh api -X POST repos/EzkielynaGroup/llm-error-atlas/pages -f build_type=workflow
   gh workflow run pages.yml -R EzkielynaGroup/llm-error-atlas
   ```
   Check `https://ezkielynagroup.github.io/llm-error-atlas/` and `/id/`. If a custom domain is used later, set the
   `SITE_URL` value in `.github/workflows/pages.yml` to it (canonical, hreflang and sitemap use it).
4. Enable private vulnerability reporting (Settings → Security) so `SECURITY.md` works.
5. Publish to npm **with provenance**. Provenance needs a CI run, so use npm trusted publishing (no token stored):
   - On npmjs.com, after the first manual publish (or when creating the package), add a trusted publisher:
     GitHub, organisation `EzkielynaGroup`, repository `llm-error-atlas`, workflow `release.yml`.
   - Add this workflow as `.github/workflows/release.yml` and publish by creating a GitHub release `v0.1.0`:
     ```yaml
     name: release
     on:
       release:
         types: [published]
     permissions:
       contents: read
       id-token: write
     jobs:
       publish:
         runs-on: ubuntu-latest
         steps:
           - uses: actions/checkout@v4
           - uses: actions/setup-node@v4
             with:
               node-version: 22
               registry-url: https://registry.npmjs.org
           - run: npm install -g npm@latest
           - run: npm test
           - run: npm publish --provenance --access public
     ```
   - Fallback without CI (no provenance): `npm login` then `npm publish --access public`.
   - Before publishing: `npm pack --dry-run` must list only 23 files (CHANGELOG.md, DATA-LICENSE, LICENSE, README.md,
     bin/, errors/, index.d.ts, index.mjs, lib/, package.json, schema/).
6. Optional: link the site from `ezkielyna.store/error` ("open dataset of LLM API errors") so the store's error page and
   the atlas reference each other.

## Show HN draft

**Title** (75 chars): `Show HN: LLM Error Atlas – paste an LLM API error, get cause, retry and fix`

**First comment** (≈ 210 words):

> I kept answering the same question from developers: "what does this error mean, and should my code retry it?"
> The answer is usually in the provider's docs, but spread over a dozen pages that each use their own shapes:
> OpenAI puts billing problems under 429 with `insufficient_quota`, Anthropic has 529 `overloaded_error`,
> Gemini returns `RESOURCE_EXHAUSTED`, OpenRouter normalises upstream errors into `error_type` and can send
> errors inside a 200 stream, LiteLLM tells you whether the gateway or the provider throttled you.
>
> LLM Error Atlas is an open dataset (CC BY 4.0) of 81 documented errors from 11 providers, gateways and relays,
> each with the doc URL and a last-verified date, plus a small zero-dependency JS library and CLI:
> `explain(err)` returns cause, `retryable`, user fix, operator fix and the docs link. Shared type names like
> `invalid_request_error` do not pick a provider unless the body shape or a hint says so; otherwise you get an honest
> generic answer for the status code. There is also a static site with one page per error in English and Indonesian.
>
> Limits: it only knows what docs show, and wording drifts. A monthly link check runs on all doc URLs.
> Corrections with a doc link are very welcome.
>
> Disclosure: I work on Ezkielyna, an independent AI API gateway; its own documented errors are one file among eleven.

## dev.to article draft

**Title**: `Is this LLM API error retryable? I built an open dataset to answer that`
**Tags**: `llm`, `javascript`, `api`, `opensource`

---

Every app that calls a language model eventually has an error handler that looks like this:

```js
} catch (err) {
  if (err.status === 429 || err.status >= 500) return retry();
  throw err;
}
```

It works until it does not. Some 429s are billing problems that will never succeed on retry. Some providers return a
status your HTTP client has never heard of. Some gateways report an upstream failure inside a `200` response, after the
stream has started. And the same type name, `invalid_request_error`, appears in several providers' bodies with
different meanings around it.

I wanted a single place to look these up, and a function I could call from the error handler. That is
[llm-error-atlas](https://github.com/EzkielynaGroup/llm-error-atlas).

### What is in it

- **An open dataset** in `errors/*.json`: 81 documented error responses from OpenAI, Anthropic, Google Gemini API,
  DeepSeek, Mistral AI, Groq, OpenRouter, the LiteLLM proxy, New API (a relay many self-hosters run), Ollama and
  Ezkielyna, plus 14 generic HTTP and network fallbacks. Each entry has a status, the documented type, code or message
  pattern, a short cause, `retryable`, a fix for the caller, a fix for the operator, the documentation URL and
  `last_verified`. English and Bahasa Indonesia text. Licence: CC BY 4.0.
- **A library** with no dependencies: `explain()`, `isRetryable()` and `explainResponse()`, ESM and CommonJS, Node 18+.
- **A CLI**: `npx llm-error-atlas "<paste>"`, stdin, `--json`, `--lang id`.
- **A static site**: one page per error in two languages, with FAQ structured data and a paste box that runs in the
  browser.

### Five things I learned reading the docs side by side

1. **429 is two different problems.** OpenAI documents rate limits and billing states under 429:
   `credit_balance_exhausted`, spend limits, usage limits, and the broad type `insufficient_quota`. The docs say
   directly that retrying billing errors will not restore access.
2. **Overloaded has several spellings.** Anthropic uses 529 `overloaded_error`. OpenAI uses 503 with code
   `server_is_overloaded`. Gemini's troubleshooting guide names `503 UNAVAILABLE`. Groq has a custom 498 for flex tier
   capacity.
3. **Gateways add their own layer.** OpenRouter normalises every upstream failure into `error_type`
   (`provider_overloaded`, `context_length_exceeded`, ...) and documents that errors after the first byte arrive inside a
   `200`. LiteLLM's error reference explains how to tell a gateway 429 (it sets `retry-after`) from a provider 429
   (the message names `OpenAIException` or similar).
4. **Self-hosted relays have their own vocabulary.** New API's FAQ explains "No available channels" and
   `invalid character '<' looking for beginning of value` (the upstream answered with an HTML page).
5. **Local runtimes report mid-stream failures as data.** Ollama keeps the HTTP status and sends an NDJSON line with an
   `error` field.

### How matching works

`explain()` first turns whatever you give it into signals: HTTP status, `error.type`, `error.code`, Gemini's
`error.status`, OpenRouter's `metadata.error_type`, messages (from JSON, SSE `data:` lines, NDJSON, or Python dict
reprs such as `Error code: 429 - {'error': ...}`), the `Retry-After` header, and hints from the body shape. Then every
entry gets a score: code +4, type +3, documented message pattern +5, same status +1.

The part I care about most is neutrality. A bare `invalid_request_error` does not mean "Anthropic"; a bare
`model_not_found` does not mean "Gemini". Shared names only pick a provider when the body shape, the text or an explicit
`provider` option points to it. Otherwise you get the generic explanation for the status code, with the provider entries
listed as alternatives. A plain `429` gets `http-429`, retryable, honour `Retry-After`.

### A run against a local mock server

This is real output from a script that starts a `node:http` server on 127.0.0.1, returns four documented error shapes,
and passes each `fetch` Response to `explainResponse()`:

```text
/gateway-limit         429  litellm-429-throttling-error       retryable=true retry_after_ms=12000 confidence=high
/overloaded            529  anthropic-529-overloaded-error     retryable=true retry_after_ms=null confidence=high
/billing               429  openai-429-credit-balance-exhausted retryable=false retry_after_ms=null confidence=high
/v1/chat/completions   404  litellm-404-route-not-found        retryable=false retry_after_ms=null confidence=high
```

Two 429s, two different answers: the gateway limit is retryable after 12 seconds, the exhausted credit balance is not.
The last line is LiteLLM's `{"detail":"Not Found"}`, which its docs explain usually means a wrong path or base URL.

From the terminal:

```text
$ npx llm-error-atlas "Error code: 429 - {'error': {'message': '...', 'type': 'insufficient_quota', 'param': None, 'code': 'insufficient_quota'}}"
openai-429-insufficient-quota  (OpenAI · layer: provider · HTTP 429)  confidence: high

429 insufficient_quota

Cause:      A billing, spend or quota limit blocks the request. Billing errors can carry the broad type `insufficient_quota`; `error.code` names the exact cause.
Retry:      no, fix the cause first
You:        Read `error.code`, then add credits or raise the spend/usage limit. Retrying alone does not restore access.
Operator:   Treat this as a billing alert, not a rate limit: do not put it in a retry loop.
Docs:       https://developers.openai.com/api/docs/guides/error-codes
Verified:   2026-11-12
```

### Using it in a retry wrapper

```js
import { explain } from 'llm-error-atlas';

async function withRetry(fn, max = 4) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); } catch (err) {
      const e = explain(err);
      if (!e.retryable || attempt >= max) throw Object.assign(err, { atlas: e });
      const wait = e.retry_after_ms ?? Math.min(30000, 1000 * 2 ** attempt) * (0.5 + Math.random());
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
```

### Rules for the data

Every entry must come from public documentation, with the URL in the entry. Message patterns may only contain text the
docs show; nothing comes from private logs. Causes and fixes are short paraphrases, not copies. A test suite checks the
schema, compiles every regex, rejects patterns that match everything, and a monthly workflow checks that all doc URLs
still answer.

### Limits

It only knows what the docs show, and providers change wording. Bare status codes stay ambiguous on purpose. Many
providers are not covered yet (Azure OpenAI, Bedrock, Cohere, vLLM, ...). Pull requests with a documentation link are
the fastest way to fix that.

Repository: https://github.com/EzkielynaGroup/llm-error-atlas. Data CC BY 4.0, code MIT.

*Disclosure: I work on Ezkielyna, an independent AI API gateway. Its publicly documented errors are one of the eleven
source files; it is never a default and gets no special treatment in matching.*
