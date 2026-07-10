import { Morph, personaKey, type AuditEvent, type PageManifest, type Persona } from '../src/index.ts'

// Demo wiring: two-page store + consent banner + live HUD.
// Cold path: real LLM if you point it at one (see README), else a mock model
// that also emits one FORBIDDEN op ("hide nav") so you can watch the guard
// reject it in the audit log — the seatbelt, on camera.

const MANIFESTS: Record<string, PageManifest> = {
  '/index.html': {
    route: '/index.html',
    entries: [
      { id: 'nav', role: 'site navigation', protected: true },
      { id: 'hero', role: 'landing hero', variants: ['visual', 'technical'] },
      { id: 'cta-hero', role: 'hero call-to-action' },
      { id: 'testimonials', role: 'social proof quotes' },
      { id: 'specs-teaser', role: 'technical specs preview table' },
      { id: 'promo-banner', role: 'seasonal discount banner' },
      { id: 'footer', role: 'footer', protected: true },
    ],
  },
  '/products.html': {
    route: '/products.html',
    entries: [
      { id: 'nav', role: 'site navigation', protected: true },
      { id: 'hero', role: 'catalog hero', variants: ['visual', 'technical'] },
      { id: 'product-grid', role: 'product cards with buy CTAs' },
      { id: 'comparison', role: 'side-by-side spec comparison table (hidden by default)' },
      { id: 'reviews', role: 'expert reviews' },
      { id: 'promo-banner', role: 'seasonal discount banner' },
      { id: 'footer', role: 'footer', protected: true },
    ],
  },
}

// Mock cold path: deterministic, persona-aware, and deliberately tries one
// protected op so the guard has something to catch.
async function mockPropose(persona: Persona, manifest: PageManifest): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 300)) // pretend to think
  const ops: unknown[] = [{ op: 'hide', target: 'nav' }] // ← guard bait
  const technical = persona.traits.includes('reader') || persona.intent === 'compare'
  if (technical) {
    ops.push({ op: 'swap-variant', target: 'hero', variant: 'technical' })
    if (manifest.entries.some((e) => e.id === 'comparison')) ops.push({ op: 'show', target: 'comparison' })
    if (manifest.entries.some((e) => e.id === 'specs-teaser')) ops.push({ op: 'emphasize', target: 'specs-teaser', level: 'strong' })
  }
  if (persona.painPoints.includes('ignored-cta')) ops.push({ op: 'hide', target: 'promo-banner' })
  if (persona.intent === 'compare' && manifest.entries.some((e) => e.id === 'reviews'))
    ops.push({ op: 'reorder', target: 'reviews', before: 'promo-banner' })
  return ops
}

// Real LLM config via localStorage (see README):
//   localStorage.setItem('ui-morph:demo:llm', JSON.stringify({ endpoint: 'http://localhost:11434/v1/chat/completions', model: 'llama3.1' }))
const llmRaw = localStorage.getItem('ui-morph:demo:llm')

const auditLog: AuditEvent[] = []
const morph = new Morph({
  intents: ['browse', 'evaluate', 'compare'],
  budget: 5,
  ...(llmRaw ? { llm: JSON.parse(llmRaw) } : { propose: mockPropose }),
  onAudit(e) {
    auditLog.push(e)
    renderHud()
  },
})

// ── consent banner ──
function mountConsent() {
  if (morph.consented) return
  const el = document.createElement('div')
  el.id = 'morph-consent'
  el.innerHTML = `
    <p><strong>This demo adapts its UI to how you browse.</strong><br/>
    Opt in and it will watch scroll depth, dwell time and clicks — first-party only,
    stored in your browser, erased the moment you opt out. Decline and the site is
    a plain static page.</p>
    <div class="row"><button class="yes">ADAPT FOR ME</button><button class="no">STAY STATIC</button></div>`
  el.querySelector('.yes')!.addEventListener('click', () => {
    morph.setConsent(true)
    el.remove()
    void morph.start(manifest)
  })
  el.querySelector('.no')!.addEventListener('click', () => el.remove())
  document.body.appendChild(el)
}

// ── HUD ──
function mountHud() {
  const el = document.createElement('aside')
  el.id = 'morph-hud'
  document.body.appendChild(el)
  renderHud()
}

function renderHud() {
  const el = document.getElementById('morph-hud')
  if (!el) return
  const p = morph.persona()
  el.innerHTML = `
    <h4>UI-MORPH · LIVE</h4>
    <div class="block">
      <div><span class="k">consent</span> <span class="v">${morph.consented ? 'granted' : '—'}</span></div>
      <div><span class="k">tier</span> <span class="v">${p.tier}</span></div>
      <div><span class="k">intent</span> <span class="v">${p.intent}</span></div>
      <div><span class="k">traits</span> <span class="v">${p.traits.join(', ') || '—'}</span></div>
      <div><span class="k">pain</span> <span class="v">${p.painPoints.join(', ') || '—'}</span></div>
      <div><span class="k">key</span> <span class="v">${personaKey(p)}</span></div>
      <div><span class="k">cold path</span> <span class="v">${llmRaw ? 'real LLM' : 'mock model'}</span></div>
    </div>
    <div class="block">
      ${auditLog.slice(-14).map((e) => `<span class="log ${e.kind}">[${e.kind}] ${e.detail}</span>`).join('')}
      ${auditLog.length === 0 ? '<span class="log">no events yet — opt in, browse, navigate</span>' : ''}
    </div>`
}

const manifest = MANIFESTS[location.pathname] ?? MANIFESTS['/index.html']!
mountHud()
mountConsent()
if (morph.consented) void morph.start(manifest)
setInterval(renderHud, 2000) // persona evolves with dwell time
