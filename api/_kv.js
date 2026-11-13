// Redis (Upstash, via Vercel Marketplace) pela API REST. Sem pacote extra.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
export const hasKV = !!(URL_ && TOKEN);
export async function kv(...cmd) {
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || ('kv ' + r.status));
  return j.result;
}
// HGETALL devolve [campo, valor, campo, valor...]
export const pairs = a => { const o = {}; if (Array.isArray(a)) for (let i = 0; i < a.length; i += 2) o[a[i]] = a[i + 1]; return o };
