// Servidores TURN para a conexão entre jogadores em redes diferentes.
// Configure no Vercel:
//   METERED_APP     = subdomínio do app na Metered (ex: rachabr  -> rachabr.metered.live)
//   METERED_API_KEY = API key do app (painel Metered > TURN Server > API Key)
// ou ICE_SERVERS = JSON com a lista de servidores (ex: ExpressTURN, Cloudflare).
let cache = null, cacheAt = 0;
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=600');
  try {
    if (cache && Date.now() - cacheAt < 30 * 60 * 1000) return res.status(200).json(cache);
    let list = [];
    if (process.env.ICE_SERVERS) {
      try { list = JSON.parse(process.env.ICE_SERVERS) } catch (e) { list = [] }
    } else if (process.env.METERED_API_KEY && process.env.METERED_APP) {
      const app = String(process.env.METERED_APP).replace(/\.metered\.live.*$/, '').replace(/^https?:\/\//, '');
      const r = await fetch(`https://${app}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(process.env.METERED_API_KEY)}`);
      if (r.ok) list = await r.json();
    }
    if (!Array.isArray(list)) list = [];
    cache = list; cacheAt = Date.now();
    return res.status(200).json(list);
  } catch (e) {
    return res.status(200).json([]);
  }
}
