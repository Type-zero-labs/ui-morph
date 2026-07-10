import { z } from 'zod'
import type { Chain, MutationOp, PageManifest } from './types.ts'

// The seatbelt. Every chain — LLM-emitted or hand-authored — passes through
// here before it can touch a page. Validation is structural (zod) AND
// contextual (manifest): unknown targets, protected zones, unknown variants
// and blown budgets are all rejected with a reason, per op.

const opSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('hide'), target: z.string() }),
  z.object({ op: z.literal('show'), target: z.string() }),
  z.object({ op: z.literal('reorder'), target: z.string(), before: z.string() }),
  z.object({ op: z.literal('emphasize'), target: z.string(), level: z.enum(['subtle', 'strong']) }),
  z.object({ op: z.literal('swap-variant'), target: z.string(), variant: z.string() }),
])

export const chainOpsSchema = z.array(opSchema)

export interface GuardResult {
  accepted: MutationOp[]
  rejected: { op: unknown; reason: string }[]
}

/** Validate raw ops (e.g. straight from a model) against a page manifest. */
export function guard(rawOps: unknown, manifest: PageManifest, budget = 5): GuardResult {
  const accepted: MutationOp[] = []
  const rejected: GuardResult['rejected'] = []

  const parsed = chainOpsSchema.safeParse(rawOps)
  if (!parsed.success) {
    return { accepted, rejected: [{ op: rawOps, reason: `schema: ${parsed.error.issues[0]?.message}` }] }
  }

  const byId = new Map(manifest.entries.map((e) => [e.id, e]))

  for (const op of parsed.data) {
    const entry = byId.get(op.target)
    if (!entry) {
      rejected.push({ op, reason: `unknown target "${op.target}"` })
      continue
    }
    if (entry.protected) {
      rejected.push({ op, reason: `"${op.target}" is protected` })
      continue
    }
    if (op.op === 'reorder') {
      const anchor = byId.get(op.before)
      if (!anchor) {
        rejected.push({ op, reason: `unknown anchor "${op.before}"` })
        continue
      }
      if (anchor.protected) {
        rejected.push({ op, reason: `anchor "${op.before}" is protected` })
        continue
      }
    }
    if (op.op === 'swap-variant' && !entry.variants?.includes(op.variant)) {
      rejected.push({ op, reason: `"${op.target}" has no variant "${op.variant}"` })
      continue
    }
    if (accepted.length >= budget) {
      rejected.push({ op, reason: `budget of ${budget} ops exceeded` })
      continue
    }
    accepted.push(op)
  }

  return { accepted, rejected }
}

/** Stable hash of a manifest — chains die when the page changes under them. */
export function manifestHash(manifest: PageManifest): string {
  const s = JSON.stringify(
    manifest.entries.map((e) => [e.id, e.role, e.variants ?? [], e.protected ?? false]),
  )
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

export function isChainValid(chain: Chain, manifest: PageManifest): boolean {
  return chain.manifestHash === manifestHash(manifest)
}
