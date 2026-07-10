import type { Signals } from './types.ts'

// First-party behavioral signals. The collector does not exist until consent
// is given: no listeners attached, nothing buffered. Deterministic code — no
// model reads raw events, only the aggregate Signals shape.

export interface SignalCollector {
  snapshot(): Signals
  stop(): void
}

export function collectSignals(doc: Document = document): SignalCollector {
  const startedAt = Date.now()
  const clicked: string[] = []
  const seen = new Set<string>()
  let maxScroll = 0

  const morphId = (el: Element | null): string | null =>
    el?.closest('[data-morph]')?.getAttribute('data-morph') ?? null

  const onScroll = () => {
    const doc_ = doc.documentElement
    const depth = (doc_.scrollTop + doc_.clientHeight) / doc_.scrollHeight
    if (depth > maxScroll) maxScroll = Math.min(1, depth)
  }

  const onClick = (e: Event) => {
    const id = morphId(e.target as Element)
    if (id && !clicked.includes(id)) clicked.push(id)
  }

  // elements that entered the viewport for ≥1s count as "seen"
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const id = entry.target.getAttribute('data-morph')
        if (id) setTimeout(() => entry.isIntersecting && seen.add(id), 1000)
      }
    },
    { threshold: 0.5 },
  )
  doc.querySelectorAll('[data-morph]').forEach((el) => io.observe(el))

  doc.addEventListener('scroll', onScroll, { passive: true })
  doc.addEventListener('click', onClick)
  onScroll()

  return {
    snapshot(): Signals {
      const ua = navigator.userAgent
      return {
        route: location.pathname,
        referrer: doc.referrer,
        device: /Mobi/.test(ua) ? 'mobile' : /Tablet|iPad/.test(ua) ? 'tablet' : 'desktop',
        language: navigator.language,
        scrollDepth: maxScroll,
        dwellMs: Date.now() - startedAt,
        clicked: [...clicked],
        ignored: [...seen].filter((id) => !clicked.includes(id)),
        revisits: Number(sessionStorage.getItem(`ui-morph:visits:${location.pathname}`) ?? 0),
      }
    },
    stop() {
      doc.removeEventListener('scroll', onScroll)
      doc.removeEventListener('click', onClick)
      io.disconnect()
      const k = `ui-morph:visits:${location.pathname}`
      sessionStorage.setItem(k, String(Number(sessionStorage.getItem(k) ?? 0) + 1))
    },
  }
}
