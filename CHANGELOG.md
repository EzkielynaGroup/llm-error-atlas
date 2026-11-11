# Changelog

## 0.1.0 (2026-11-12)

First release.

- Dataset: 81 documented entries from OpenAI, Anthropic (incl. 529 `overloaded_error`), Google Gemini API, DeepSeek,
  Mistral AI, Groq, OpenRouter (normalised `error_type`), LiteLLM proxy, New API relay, Ollama and Ezkielyna API,
  plus 14 generic HTTP/network fallbacks. English and Bahasa Indonesia text. All checked on 2026-11-12.
- Library: `explain()`, `isRetryable()`, `explainResponse()`; ESM and CommonJS; zero dependencies; Node 18+.
- Matching: status + `error.type` + `error.code` + message regex, scored, with alternatives; shared type names only
  pick a provider with a hint; status-code fallbacks; `Retry-After` / `retry-after-ms` parsing; key masking.
- CLI: `npx llm-error-atlas "<paste>"`, stdin, `--json`, `--lang id`, `--provider`, `--status`, `--list`.
- Static site generator: EN + ID page per error, searchable indexes with an in-browser paste box, FAQPage JSON-LD,
  canonical + hreflang, sitemap.xml, atlas.json.
- Workflows: tests (Node 18/20/22), GitHub Pages build, monthly documentation link check.
