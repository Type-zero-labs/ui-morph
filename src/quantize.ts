import type { Intent, Persona, Signals } from './types.ts'

// Persona quantizer — deterministic rules, no LLM. Where a threshold does the
// job, a model call is waste (and non-reproducible). The output space is tiny
// on purpose: quantized personas are cache keys, and cache keys must collide
// for the warm path to exist at all.

export interface QuantizeRules {
  /** map route prefixes / referrer patterns to an intent bucket */
  intentOf(history: Signals[]): Intent
}

const defaultRules: QuantizeRules = {
  intentOf(history) {
    const last = history[history.length - 1]
    if (!last) return 'browse'
    if (last.revisits >= 2) return 'compare'
    if (history.length >= 3) return 'evaluate'
    return 'browse'
  },
}

export function quantize(history: Signals[], rules: QuantizeRules = defaultRules): Persona {
  const traits = new Set<string>()
  const painPoints = new Set<string>()

  const pages = history.length
  const avgDwell = history.reduce((s, x) => s + x.dwellMs, 0) / Math.max(1, pages)
  const avgScroll = history.reduce((s, x) => s + x.scrollDepth, 0) / Math.max(1, pages)
  const clicks = history.reduce((s, x) => s + x.clicked.length, 0)
  const ignored = history.flatMap((x) => x.ignored)

  // reading behavior
  if (avgDwell > 45_000 && avgScroll > 0.7) traits.add('reader')
  if (avgDwell < 10_000 && pages >= 3) traits.add('scanner')
  // interaction behavior
  if (clicks / Math.max(1, pages) >= 2) traits.add('explorer')
  if (history[0] && /google|bing|duckduckgo/.test(history[0].referrer)) traits.add('search-led')
  // friction
  const ctaIgnores = ignored.filter((id) => id.includes('cta'))
  if (ctaIgnores.length >= 2) painPoints.add('ignored-cta')
  const revisits = history[history.length - 1]?.revisits ?? 0
  if (revisits >= 2) painPoints.add('search-loop')

  // tier reflects how much evidence we hold, not who the person "is"
  const tier = pages >= 4 || painPoints.size > 0 ? 'defined' : pages >= 2 ? 'narrow' : 'generic'

  return {
    tier,
    intent: rules.intentOf(history),
    traits: [...traits].sort(),
    painPoints: [...painPoints].sort(),
  }
}
