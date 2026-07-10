# ui-morph

**Persona-driven UI adaptation for existing websites — consent-first, page-boundary only, constrained to your design system.**

An engine that watches *how* a visitor browses (after they opt in), quantizes that behavior into a small persona, and lets an LLM propose UI mutations for the *next* page view — every one validated against a schema your page declares. The LLM compiles itself out of the runtime: once a persona↔page chain exists, it replays from cache with **zero model calls**.

> **Status: proof of concept.** The core engine works end-to-end (see the demo), the API will move. Built as the reference implementation for the essay [*Generative UI Needs a Seatbelt Too*](https://mauriciojuba.com/articles/generative-ui-needs-boundaries).

## Why this exists

Personalization engines (Optimizely, Dynamic Yield, Adobe Target) pick among variants humans authored. Generative UI (Gemini, Vercel json-render, Thesys C1) builds interfaces for agent chats. Nobody does the middle: **let a model adapt an existing site per visitor, safely**. The reason is that three hard problems sit in the way:

1. **Unstable layouts hurt people.** Decades of HCI research (Findlater & McGrenere, Gajos; Office 2000's adaptive menus) show layout churn destroys spatial memory and trust.
2. **Tracking-based personas are radioactive.** Fingerprinting for personalization requires consent in the EU, full stop.
3. **Per-visitor LLM inference doesn't scale.** A model call per page view is a cost and latency wall.

ui-morph is an existence proof that all three die at the same boundary:

| Problem | Boundary |
|---|---|
| Layout churn | Mutations apply **only at page boundaries**, never mid-session; identical personas replay **identical, deterministic chains** |
| Privacy | **Inert until explicit opt-in** — no listeners, no storage. First-party behavioral signals only. Opt-out erases everything |
| Cost | Personas are **quantized into cache keys**; chains compile once (cold path) and replay forever (warm path). LLM calls decay toward zero |

## How it works

```
signals (consented) ──► quantize ──► persona 4D (tier·intent·traits·pain)
                                          │
                              chain cache hit? ──── yes ──► replay ops. 0 LLM calls.
                                          │ no
                                          ▼
                          LLM proposes ops from the page MANIFEST
                          (never sees the DOM, never sees the visitor)
                                          │
                                          ▼
                          guard(): schema + protected zones + budget
                                          │
                                          ▼
                          chain cached ──► applies on the NEXT page view
```

The page declares what may change (`data-morph` ids + a manifest with roles, variants and `protected` flags). The model can only answer in five ops — `hide`, `show`, `reorder`, `emphasize`, `swap-variant` — and only against declared targets. Anything else is rejected with a reason, and the rejection is written to the audit log.

```ts
import { Morph } from 'ui-morph'

const morph = new Morph({
  intents: ['browse', 'evaluate', 'compare'],
  budget: 5,
  llm: { endpoint: 'http://localhost:11434/v1/chat/completions', model: 'llama3.1' }, // any OpenAI-compatible endpoint
  onAudit: (e) => console.log(`[${e.kind}]`, e.detail),
})

// consent UI is yours; the engine is inert until this:
morph.setConsent(true)

await morph.start({
  route: location.pathname,
  entries: [
    { id: 'nav', role: 'site navigation', protected: true },
    { id: 'hero', role: 'landing hero', variants: ['visual', 'technical'] },
    { id: 'specs', role: 'technical specs table' },
  ],
})
```

## The demo

```bash
git clone https://github.com/Type-zero-labs/ui-morph && cd ui-morph
npm install
npm run demo   # http://localhost:5173
```

A two-page laptop store with a live HUD showing the persona forming, chains compiling and the guard working. The mock cold path deliberately emits one forbidden op (`hide nav`) every time — watch the audit log reject it. Point it at a real local model with:

```js
localStorage.setItem('ui-morph:demo:llm', JSON.stringify({
  endpoint: 'http://localhost:11434/v1/chat/completions', model: 'llama3.1',
}))
```

## Design decisions

- **Consent is structural, not a banner.** Before `setConsent(true)` there are no listeners and no storage; opt-out wipes every byte (history, chains, consent itself).
- **The model never sees the DOM or the visitor.** Cold-path input is the quantized persona plus the page's own manifest. Raw events stay in the browser.
- **Deterministic where determinism does the job.** Signals→persona is threshold rules, not a model (a regex is cheaper than a model call, and reproducible). The LLM only maps persona→ops — the one genuinely fuzzy step.
- **Quantization is the economics.** Persona axes have tiny closed vocabularies *so that* cache keys collide. Colliding keys are what make the warm path exist.
- **Chains die with the page.** Cache keys include a manifest hash; ship a redesign and every stale chain invalidates itself.
- **Server store optional.** Default is localStorage (chains never leave the browser). A `remoteStore` adapter turns chains into collective knowledge — a new visitor who quantizes like a known persona gets the warm path on first visit.

## Non-goals

- Mid-session mutation. Layouts that move under the cursor are the failure mode this exists to prevent.
- Fingerprinting, cross-site identity, third-party enrichment. Out of scope in core, permanently.
- Conversion-hacking. The system prompt optimizes for *reducing friction for this persona*, and the ops vocabulary can't express dark patterns like fake urgency.

## Status & roadmap

- [x] Core engine: signals → quantize → guard → chain cache → DOM apply (tested)
- [x] Demo with live HUD + audit log
- [ ] React/Vue store adapters (today: vanilla DOM via `data-morph`)
- [ ] Similarity matching between persona keys (today: exact match)
- [ ] Outcome feedback loop (chains that don't help get evicted)

MIT © [Type Zero Labs](https://github.com/Type-zero-labs)
