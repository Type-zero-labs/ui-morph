import type { Chain, ChainStore } from './types.ts'

// The chain cache is where the economics live: every hit is a page the LLM
// never sees. Keyed by (persona tuple, route, manifest hash) — change the
// page or the design system and the chain dies with it.

export function chainKey(personaKey: string, route: string, manifestHash: string): string {
  return `ui-morph:chain:${personaKey}:${route}:${manifestHash}`
}

/** Default store: localStorage. Client-only — chains never leave the browser. */
export function localStore(): ChainStore {
  return {
    async get(key) {
      const raw = localStorage.getItem(key)
      if (!raw) return null
      try {
        return JSON.parse(raw) as Chain
      } catch {
        localStorage.removeItem(key)
        return null
      }
    },
    async put(key, chain) {
      localStorage.setItem(key, JSON.stringify(chain))
    },
  }
}

/**
 * Optional server-backed store. Chains become collective knowledge: a visitor
 * similar to one already mapped gets the warm path on first visit. Endpoint
 * contract: GET /chains/:key → Chain|404, PUT /chains/:key ← Chain.
 */
export function remoteStore(baseUrl: string): ChainStore {
  return {
    async get(key) {
      const res = await fetch(`${baseUrl}/chains/${encodeURIComponent(key)}`)
      return res.ok ? ((await res.json()) as Chain) : null
    },
    async put(key, chain) {
      await fetch(`${baseUrl}/chains/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(chain),
      })
    },
  }
}
