import type { MutationOp } from './types.ts'

// DOM applier — runs once, at page load, before first paint if installed in
// <head>. Never mid-session: a layout that moves under the visitor's cursor
// is the failure mode the whole engine is designed against.

export function applyOps(ops: MutationOp[], doc: Document = document): MutationOp[] {
  const applied: MutationOp[] = []
  const find = (id: string) => doc.querySelector<HTMLElement>(`[data-morph="${CSS.escape(id)}"]`)

  for (const op of ops) {
    const el = find(op.target)
    if (!el) continue

    switch (op.op) {
      case 'hide':
        el.hidden = true
        break
      case 'show':
        el.hidden = false
        break
      case 'reorder': {
        const anchor = find(op.before)
        if (!anchor?.parentElement || anchor.parentElement !== el.parentElement) continue
        anchor.parentElement.insertBefore(el, anchor)
        break
      }
      case 'emphasize':
        el.setAttribute('data-morph-emphasis', op.level)
        break
      case 'swap-variant': {
        const variant = el.querySelector<HTMLElement>(`[data-morph-variant="${CSS.escape(op.variant)}"]`)
        if (!variant) continue
        for (const v of el.querySelectorAll<HTMLElement>('[data-morph-variant]')) v.hidden = true
        variant.hidden = false
        break
      }
    }
    applied.push(op)
  }
  return applied
}
