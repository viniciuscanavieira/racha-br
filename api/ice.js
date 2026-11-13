// Servidores TURN para a conexão entre jogadores em redes diferentes.
// Vercel: METERED_APP (ex: rachabr) e METERED_API_KEY (API Key do TURN ou Secret Key sk_...)
// ou ICE_SERVERS = JSON com a lista de servidores.
let cache = null, cacheAt = 0;
const relay = (u, p) => [
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'turn:global.relay.metered.ca:80', username: u, credential: p },
  { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: u, credential: p },
  { urls: 'turn:global.relay.metered.ca:443', username: u, credential: p },
  { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: u, credential: p },
];
async function fromMetered(app, key, log) {
  const base = `https://${app}.metered.live/api/v1/turn`;
  // 1) API Key do TURN: devolve a lista pronta
  let r = await fetch(`${base}/credentials?apiKey=${encodeURIComponent(key)}`);
  log.push('apiKey ' + r.status);
  if (r.ok) { const j = await r.json().catch(() => null); if (Array.isArray(j) && j.length) return j }
  // 2) Secret Key: lista credenciais e cria uma se não houver
  r = await fetch(`${base}/credentials?secretKey=${encodeURIComponent(key)}`);
  log.push('secretList ' + r.status);
  if (r.ok) {
    const j = await r.json().catch(() => null);
    const arr = (j && (j.data || j.credentials)) || (Array.isArray(j) ? j : []);
    const c = arr.find(x => x && x.username && x.password);
    if (c) return relay(c.username, c.password);
  }
  r = await fetch(`${base}/credential?secretKey=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: 'racha-br' }) });
  log.push('secretCreate ' + r.status);
  if (r.ok) { const c = await r.json().catch(() => null); if (c && c.username && c.password) return relay(c.username, c.password) }
  return [];
}
export default async function handler(req, res) {
  const debug = req.query && req.query.debug;
  res.setHeader('Cache-Control', debug ? 'no-store' : 'public, max-age=600');
  const log = [];
  try {
    if (!debug && cache && cache.length && Date.now() - cacheAt < 30 * 60 * 1000) return res.status(200).json(cache);
    let list = [];
    if (process.env.ICE_SERVERS) {
      try { list = JSON.parse(process.env.ICE_SERVERS) } catch (e) { list = [] }
    } else if (process.env.METERED_API_KEY && process.env.METERED_APP) {
      const app = String(process.env.METERED_APP).replace(/\.metered\.live.*$/, '').replace(/^https?:\/\//, '');
      list = await fromMetered(app, String(process.env.METERED_API_KEY).trim(), log);
    } else log.push('sem config');
    if (!Array.isArray(list)) list = [];
    if (list.length) { cache = list; cacheAt = Date.now() }
    if (debug) return res.status(200).json({ ok: list.length > 0, servers: list.length, turn: list.some(x => String(x.urls).includes('turn')), log });
    return res.status(200).json(list);
  } catch (e) {
    if (debug) return res.status(200).json({ ok: false, error: String(e && e.message || e), log });
    return res.status(200).json([]);
  }
}
