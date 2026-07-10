# ui-morph — Vision

> The concept sketches in [`docs/vision/`](./vision/) are the source material for
> everything below. Read them alongside this document.

## The story that explains everything

A family walks into an electronics store, toward the TV section. The salesman watches
from a distance. The older kid says "dad, we need one that works with the PS5." The mom
says "it can't be too big, the couch is close." The younger one points at a Samsung and
asks "can I watch YouTube on this?" The dad answers "yes, but I want an LG — my LG
monitor has been great."

When the salesman finally walks over, he already knows exactly what to show them: an LG
smart TV (YouTube), 4K@60 (PS5), 55" max (couch). No interrogation, no friction — he
*observed*, then removed every irrelevant option.

**On the web this doesn't happen.** Designers predict broad personas ahead of time and
design fixed experiences for them. But a persona is mutable — the same person has
different moments and different goals. Granularity is never enough; edge cases surface
months later through analytics and A/B tests, *maybe* get prioritized, *maybe* get
designed, *maybe* get shipped. The visitor who hit the friction — and everyone like
them who followed — was lost long before.

**ui-morph aims to be the web page's salesman-at-a-distance**: observe (with the
visitor's explicit consent), classify the visitor into groups via traits expressed
during navigation, estimate the objectives they might be pursuing, and manipulate the
DOM to remove the maximum friction between them and their goal.

## The conceptual model (from the sketches)

### 1. Data gathering follows user actions (`01-user-actions-x-data-gathering.png`)

Four stages, each unlocked by what the visitor *does* — never more:

| Stage | User action | Data unlocked | Output |
|---|---|---|---|
| NOT LOGGED | accesses site | browser APIs, headers, device, language, referrer, 1st-session? | generic persona assigned, intent estimation starts |
| EVENT TRACK | interacts, scrolls, clicks, navigates | page flow, scroll depth, stay time, clicks/hover, inputs, read time, time-to-action, UI ignore-vs-interact | persona tier identified, pain points assigned |
| PROVIDED | volunteers info | name/email, precise location, prefs, purchase/nav history, CRM tags | persistent traits, intent clusterization |
| ENRICHED | session ends / consented enrichment | CDPs, internal APIs, CRM GraphQL, enriched data (Clearbit-class) | complete behavior mirror feeds predictive model |

> **POC boundary**: core implements stages 1–2 (first-party only). Stages 3–4 exist as
> *pluggable, consent-gated adapters* — never in core. See "invariants" below.

### 2. The persona JSON enriches progressively (`02-json-enrichment-progression.png`)

STARTER (`persona_tier: undefined, intent: init exploration`) → EVENTS (tier
`tech-enthusiast`, traits `[curious, visual, slow decision]`, `engagement_score: 0.72`,
navigation, scroll_depth, clicks) → PROVIDED (tier `tech-gadgeteer`, intent `purchase
after analysis`, goals `[understand accessory compatibility, optimize benefit over
cost]`) → ENRICHED (`next_best_action`, `preferred_content_pattern: technical > social
proof`, `behavioral_predictions: { buying_chance: 82, blockers: [compatibility_worries,
price] }`).

### 3. UI responds per information tier (`03-user-information-progression.png`)

- **GENERIC / low estimation** → standard responsible layout, broad CTA, short
  non-technical texts, few menu options.
- **NARROW** → shifts page structure: content occlusion (accordions, hover
  suggestions), add components (product comparison, short product video), adjust
  button copy toward technical.
- **DEFINED, traits assigned** → accessory grid view, persona-focused features,
  build-your-setup, technical terms notes, technical FAQ, compatibility highlights.
- **DEFINED, pain points identified** → reorganize page structure: short accessory
  video, competitive comparison, technical data, specialized reviews, compatibility
  tooltip.

### 4. Predict the path, pre-adapt the next page (`04-predicting-the-path.png`)

From the persona, estimate **objectives with probabilities** (e.g.
`purchase_accessories 87% · compare_prices 40% · purchase_laptop 31% ·
contact_techsupport 12% · check_order_status 1.2%`), derive the **expected page
sequence** (`home → accessories → list → detail → cart → checkout`), and adapt the
*next* page before the visitor lands on it — choosing among the design system's
components and tokens, never inventing outside them.

### 5. Variations are design-system variants (`05-ui-variations.png`)

The same card renders as `default` / `tech-savvy` / `gamer` — different token themes and
variant choices of ONE component, not free-form generation. The design system is the
vocabulary; the engine only picks words that exist in it.

## Invariants (non-negotiable, already enforced in core)

These came out of the market/HCI/privacy research and are the project's identity.
Any demo, feature or adapter must preserve them:

1. **Consent is structural.** Engine inert before opt-in (no listeners, no storage);
   opt-out erases everything. First-party signals only in core; fingerprinting and
   third-party enrichment are permanent non-goals *in core* (stage 3–4 = opt-in
   adapters, off by default).
2. **Mutations only at page boundaries.** Never mid-session. HCI literature
   (Findlater & McGrenere; Gajos CHI'08; Office 2000 adaptive menus) punishes layout
   churn — identical personas must get identical, deterministic UIs.
3. **The model never sees the DOM or the visitor.** Cold path input = quantized
   persona + page manifest. Output = ops from a closed vocabulary, validated by
   `guard()` (schema, protected zones, mutation budget). Rejections are audited.
4. **The LLM compiles itself out of the runtime.** Personas are quantized into cache
   keys; chains compile once (cold), replay forever (warm), and die with the manifest
   hash. Per-pageview inference is a design failure, not a cost to optimize.

## Where the POC is today

`src/` implements: consented signal collection → deterministic quantizer (4D persona:
tier · intent · traits · pain) → chain cache (localStorage; remote adapter stub) →
LLM cold path (OpenAI-compatible; mock injectable) → guard → DOM applier
(`data-morph` attributes, five ops: hide/show/reorder/emphasize/swap-variant).
Demo: two-page store + consent banner + live HUD + audit log. 8 unit tests on
guard/quantizer; verified e2e (guard rejects `hide nav` bait; warm path replays
3 ops with 0 LLM calls).

## What the vision still asks for (candidate demo scope)

- Objective estimation with probabilities (persona → ranked objectives)
- Expected-path derivation + **next-page pre-adaptation** (adapt route B while the
  visitor is still on route A)
- Persona-tier UI variations as token themes (`default` / `tech-savvy` / `gamer`)
- Richer trait vocabulary approaching the sketches (engagement score, goals, blockers)
- A scripted, reproducible walkthrough that *demonstrates* the salesman story
  end-to-end — observable evidence, not narrative
