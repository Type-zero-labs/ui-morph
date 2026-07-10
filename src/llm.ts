import type { LlmConfig, PageManifest, Persona } from './types.ts'

// The cold path. The model never sees the DOM, the visitor, or raw events —
// only the quantized persona and the page's own manifest. It can only answer
// in ops the schema accepts; everything else is rejected by guard().

const SYSTEM = `You adapt an existing web page for a visitor persona by emitting mutation operations.

Rules:
- Respond with a JSON array of operations, nothing else.
- Allowed ops: {"op":"hide","target":ID} {"op":"show","target":ID} {"op":"reorder","target":ID,"before":ID} {"op":"emphasize","target":ID,"level":"subtle"|"strong"} {"op":"swap-variant","target":ID,"variant":NAME}
- Use ONLY element ids and variant names present in the manifest.
- Never touch entries marked protected.
- Fewer, higher-confidence ops beat many speculative ones. 0 ops is a valid answer.
- Goal: reduce friction for THIS persona. Do not chase engagement for its own sake.`

export async function proposeChainOps(
  persona: Persona,
  manifest: PageManifest,
  cfg: LlmConfig,
): Promise<unknown> {
  const res = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: JSON.stringify({
            persona,
            manifest: manifest.entries.map((e) => ({
              id: e.id,
              role: e.role,
              variants: e.variants,
              protected: e.protected ?? false,
            })),
          }),
        },
      ],
    }),
  })

  if (!res.ok) throw new Error(`llm: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { choices: { message: { content: string } }[] }
  const text = data.choices[0]?.message.content ?? '[]'
  // tolerate fenced or prefixed output; guard() re-validates structure anyway
  const match = text.match(/\[[\s\S]*\]/)
  return JSON.parse(match ? match[0] : text)
}
