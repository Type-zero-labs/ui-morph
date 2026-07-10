import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guard, manifestHash, isChainValid } from '../src/schema.ts'
import { quantize } from '../src/quantize.ts'
import { personaKey, type PageManifest, type Signals } from '../src/types.ts'

const manifest: PageManifest = {
  route: '/products',
  entries: [
    { id: 'hero', role: 'page hero', variants: ['visual', 'technical'] },
    { id: 'cta-buy', role: 'primary purchase CTA' },
    { id: 'specs-table', role: 'technical specifications' },
    { id: 'reviews', role: 'customer reviews' },
    { id: 'nav', role: 'site navigation', protected: true },
    { id: 'checkout-form', role: 'checkout fields', protected: true },
  ],
}

test('accepts valid ops within budget', () => {
  const { accepted, rejected } = guard(
    [
      { op: 'emphasize', target: 'specs-table', level: 'strong' },
      { op: 'swap-variant', target: 'hero', variant: 'technical' },
      { op: 'reorder', target: 'reviews', before: 'specs-table' },
    ],
    manifest,
  )
  assert.equal(accepted.length, 3)
  assert.equal(rejected.length, 0)
})

test('rejects protected targets — nav and checkout are untouchable', () => {
  const { accepted, rejected } = guard(
    [
      { op: 'hide', target: 'nav' },
      { op: 'hide', target: 'checkout-form' },
      { op: 'reorder', target: 'reviews', before: 'nav' },
    ],
    manifest,
  )
  assert.equal(accepted.length, 0)
  assert.equal(rejected.length, 3)
  assert.match(rejected[0]!.reason, /protected/)
})

test('rejects unknown targets and unknown variants', () => {
  const { accepted, rejected } = guard(
    [
      { op: 'hide', target: 'does-not-exist' },
      { op: 'swap-variant', target: 'hero', variant: 'nonexistent' },
    ],
    manifest,
  )
  assert.equal(accepted.length, 0)
  assert.match(rejected[0]!.reason, /unknown target/)
  assert.match(rejected[1]!.reason, /no variant/)
})

test('rejects malformed ops at the schema layer', () => {
  const { accepted, rejected } = guard([{ op: 'delete-everything' }], manifest)
  assert.equal(accepted.length, 0)
  assert.equal(rejected.length, 1)
  assert.match(rejected[0]!.reason, /schema/)
})

test('enforces mutation budget', () => {
  const ops = Array.from({ length: 8 }, () => ({ op: 'emphasize', target: 'reviews', level: 'subtle' }))
  const { accepted, rejected } = guard(ops, manifest, 5)
  assert.equal(accepted.length, 5)
  assert.equal(rejected.length, 3)
  assert.match(rejected[0]!.reason, /budget/)
})

test('chains die when the manifest changes', () => {
  const hash = manifestHash(manifest)
  const changed: PageManifest = {
    ...manifest,
    entries: [...manifest.entries, { id: 'new-section', role: 'new' }],
  }
  assert.notEqual(hash, manifestHash(changed))
  const chain = { personaKey: 'x', route: '/products', manifestHash: hash, ops: [], source: 'llm' as const, createdAt: 0 }
  assert.equal(isChainValid(chain, manifest), true)
  assert.equal(isChainValid(chain, changed), false)
})

const sig = (over: Partial<Signals>): Signals => ({
  route: '/',
  referrer: '',
  device: 'desktop',
  language: 'en',
  scrollDepth: 0.5,
  dwellMs: 20_000,
  clicked: [],
  ignored: [],
  revisits: 0,
  ...over,
})

test('quantizer is deterministic and quantized — same behavior, same key', () => {
  const history = [
    sig({ referrer: 'https://google.com/search' }),
    sig({ dwellMs: 60_000, scrollDepth: 0.9 }),
    sig({ dwellMs: 50_000, scrollDepth: 0.8, ignored: ['cta-buy', 'cta-trial'] }),
    sig({ ignored: ['cta-buy'], revisits: 2 }),
  ]
  const a = quantize(history)
  const b = quantize(history)
  assert.equal(personaKey(a), personaKey(b))
  assert.equal(a.tier, 'defined')
  assert.deepEqual(a.painPoints, ['ignored-cta', 'search-loop'])
})

test('one page of nothing = generic persona, no assumptions', () => {
  const p = quantize([sig({})])
  assert.equal(p.tier, 'generic')
  assert.deepEqual(p.traits, [])
  assert.deepEqual(p.painPoints, [])
})
