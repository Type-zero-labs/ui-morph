// Core vocabulary of ui-morph.
//
// The 4D persona (tier / intent / traits / pain-points) is deliberately
// quantized: a small closed set of values per axis, so a persona tuple is a
// cache key, not a free-form profile. Warm path = tuple match → replay stored
// chain (no LLM). Cold path = LLM proposes a chain once, validated, cached.

/** How much the visitor has told us — never more than they consented to. */
export type PersonaTier = 'generic' | 'narrow' | 'defined'

/** Coarse intent buckets. Extend per site via config, keep the set small. */
export type Intent = string

export interface Persona {
  tier: PersonaTier
  intent: Intent
  /** behavioral traits, from a closed vocabulary (e.g. 'technical', 'visual', 'price-sensitive') */
  traits: string[]
  /** friction observed in-session (e.g. 'ignored-cta', 'search-loop') */
  painPoints: string[]
}

/** Stable string form of a persona — the cache key of the warm path. */
export function personaKey(p: Persona): string {
  return [p.tier, p.intent, [...p.traits].sort().join('+') || '-', [...p.painPoints].sort().join('+') || '-'].join('|')
}

// ── Signals ──────────────────────────────────────────────────────────────────
// First-party only. Collected ONLY after explicit consent. No fingerprinting,
// no third-party enrichment in core — that is a deliberate boundary, not a gap.

export interface Signals {
  /** route the signals were collected on */
  route: string
  referrer: string
  device: 'mobile' | 'tablet' | 'desktop'
  language: string
  /** max scroll depth reached, 0..1 */
  scrollDepth: number
  /** ms on page */
  dwellMs: number
  /** morph-ids the visitor clicked */
  clicked: string[]
  /** morph-ids visible ≥1s that were never interacted with */
  ignored: string[]
  /** times the visitor returned to a previously visited route this session */
  revisits: number
}

// ── Mutations ────────────────────────────────────────────────────────────────
// The entire expressive power of the engine. Anything not representable here
// cannot happen, no matter what the model emits. Ops target `data-morph`
// ids only; protected zones reject every op.

export type MutationOp =
  | { op: 'hide'; target: string }
  | { op: 'show'; target: string }
  | { op: 'reorder'; target: string; before: string }
  | { op: 'emphasize'; target: string; level: 'subtle' | 'strong' }
  | { op: 'swap-variant'; target: string; variant: string }

export interface Chain {
  /** persona tuple this chain was compiled for */
  personaKey: string
  route: string
  /** hash of the page manifest the chain was validated against */
  manifestHash: string
  ops: MutationOp[]
  /** where this chain came from */
  source: 'llm' | 'authored'
  createdAt: number
}

// ── Page manifest ────────────────────────────────────────────────────────────
// What the page declares about itself: which elements are morphable, which
// variants exist, what is off-limits. The LLM sees ONLY this — never the DOM.

export interface ManifestEntry {
  id: string
  /** short human description the model can reason about */
  role: string
  variants?: string[]
  /** protected: no op may ever touch this element */
  protected?: boolean
}

export interface PageManifest {
  route: string
  entries: ManifestEntry[]
}

// ── Config ───────────────────────────────────────────────────────────────────

export interface LlmConfig {
  /** OpenAI-compatible chat-completions endpoint (Ollama, OpenRouter, OpenAI…) */
  endpoint: string
  model: string
  apiKey?: string
}

export interface MorphConfig {
  /** closed vocabulary of intents for this site */
  intents: Intent[]
  /** max ops a single chain may carry (mutation budget) */
  budget?: number
  llm?: LlmConfig
  /** bring-your-own cold path (testing, mock demos, non-OpenAI providers). Wins over `llm`. */
  propose?: (persona: Persona, manifest: PageManifest) => Promise<unknown>
  /** storage adapter; defaults to localStorage */
  store?: ChainStore
  /** called on every applied / rejected op — the audit trail */
  onAudit?: (event: AuditEvent) => void
}

export interface ChainStore {
  get(key: string): Promise<Chain | null>
  put(key: string, chain: Chain): Promise<void>
}

export interface AuditEvent {
  at: number
  kind: 'consent' | 'persona' | 'chain-hit' | 'chain-compiled' | 'op-applied' | 'op-rejected'
  detail: string
}
