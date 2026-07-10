import { chainKey, localStore } from './cache.ts'
import { applyOps } from './apply.ts'
import { collectSignals, type SignalCollector } from './signals.ts'
import { guard, isChainValid, manifestHash } from './schema.ts'
import { proposeChainOps } from './llm.ts'
import { quantize } from './quantize.ts'
import { personaKey, type AuditEvent, type Chain, type ChainStore, type MorphConfig, type PageManifest, type Persona, type Signals } from './types.ts'

export * from './types.ts'
export { guard, manifestHash } from './schema.ts'
export { quantize } from './quantize.ts'
export { applyOps } from './apply.ts'
export { localStore, remoteStore } from './cache.ts'

const CONSENT_KEY = 'ui-morph:consent'
const HISTORY_KEY = 'ui-morph:signals'

// Orchestrator. Lifecycle per page:
//   start(manifest)  — if consented: apply cached chain for the current persona
//                      (warm path), begin collecting signals, and — while the
//                      page lives — compile a missing chain (cold path). The
//                      cold path runs mid-life, never on pagehide: an async LLM
//                      call does not survive navigation.
//   flush()          — on pagehide: fold signals into history. Synchronous
//                      storage only; nothing else is safe there.
export class Morph {
  private collector: SignalCollector | null = null
  private manifest: PageManifest | null = null

  constructor(private cfg: MorphConfig) {}

  get consented(): boolean {
    return localStorage.getItem(CONSENT_KEY) === 'yes'
  }

  /** Explicit opt-in. Without it the engine is inert: no listeners, no storage. */
  setConsent(value: boolean): void {
    if (value) localStorage.setItem(CONSENT_KEY, 'yes')
    else {
      // withdraw = erase: consent, history, every stored chain
      const dead = Object.keys(localStorage).filter((k) => k.startsWith('ui-morph:'))
      dead.forEach((k) => localStorage.removeItem(k))
    }
    this.audit('consent', value ? 'granted' : 'withdrawn — all ui-morph data erased')
  }

  persona(): Persona {
    return quantize(this.history())
  }

  async start(manifest: PageManifest): Promise<void> {
    this.manifest = manifest
    if (!this.consented) return

    const p = this.persona()
    this.audit('persona', personaKey(p))

    const store = this.cfg.store ?? localStore()
    const key = chainKey(personaKey(p), manifest.route, manifestHash(manifest))
    const chain = await store.get(key)

    if (chain && isChainValid(chain, manifest)) {
      const applied = applyOps(chain.ops)
      this.audit('chain-hit', `${applied.length} ops replayed, 0 LLM calls`)
      applied.forEach((op) => this.audit('op-applied', JSON.stringify(op)))
    }

    this.collector = collectSignals()
    window.addEventListener('pagehide', () => this.flush(), { once: true })

    // cold path — compile a chain for THIS route + current persona if missing,
    // while the page is alive. It applies on the next visit, never this one.
    if (!chain) void this.compile(p, manifest, store, key)
  }

  /** Fold this page's signals into session history. Sync-safe for pagehide. */
  flush(): void {
    if (!this.collector) return
    const signals = this.collector.snapshot()
    this.collector.stop()
    this.collector = null
    const history = [...this.history(), signals].slice(-20)
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  }

  private async compile(p: Persona, manifest: PageManifest, store: ChainStore, key: string): Promise<void> {
    const propose = this.cfg.propose ?? (this.cfg.llm ? (pp: Persona, m: PageManifest) => proposeChainOps(pp, m, this.cfg.llm!) : null)
    if (!propose) return
    try {
      const raw = await propose(p, manifest)
      const { accepted, rejected } = guard(raw, manifest, this.cfg.budget ?? 5)
      rejected.forEach((r) => this.audit('op-rejected', `${r.reason}: ${JSON.stringify(r.op)}`))
      const chain: Chain = {
        personaKey: personaKey(p),
        route: manifest.route,
        manifestHash: manifestHash(manifest),
        ops: accepted,
        source: 'llm',
        createdAt: Date.now(),
      }
      await store.put(key, chain)
      this.audit('chain-compiled', `${accepted.length} ops accepted, ${rejected.length} rejected — applies next visit`)
    } catch (e) {
      this.audit('op-rejected', `cold path failed: ${String(e)}`)
    }
  }

  private history(): Signals[] {
    try {
      return JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]') as Signals[]
    } catch {
      return []
    }
  }

  private audit(kind: AuditEvent['kind'], detail: string): void {
    this.cfg.onAudit?.({ at: Date.now(), kind, detail })
  }
}
