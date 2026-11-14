import { hasKV, kv } from './_kv.js';

// Arrancada ranqueada (tempo declarado): fantasmas por divisão e tabela de ranking.
const SEASON = 's1';
const num = (x, a, b) => { x = +x; return isFinite(x) ? Math.min(b, Math.max(a, x)) : null; };
const str = (x, n) => String(x || '').replace(/[<>]/g, '').slice(0, n);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!hasKV) return res.status(503).json({ error: 'Servidor indisponível' });
  const q = req.query || {};
  if (req.method === 'GET' && q.ghost) {
    const t = Math.round(num(q.tier, 0, 15) || 0), not = str(q.not, 24);
    for (const tt of [t, t - 1, t + 1, t - 2, t + 2]) {
      if (tt < 0 || tt > 15) continue;
      const list = (await kv('LRANGE', 'rkg:' + tt, 0, 39)) || [];
      const ok = list.map(s => { try { return JSON.parse(s) } catch { return null } }).filter(g => g && g.pid !== not);
      if (ok.length) return res.status(200).json({ ghost: ok[Math.floor(Math.random() * ok.length)] });
    }
    return res.status(200).json({ ghost: null });
  }
  if (req.method === 'GET' && q.top) {
    const raw = (await kv('HGETALL', 'rk:' + SEASON)) || [];
    const rows = [];
    for (let i = 0; i < raw.length; i += 2) { try { const r = JSON.parse(raw[i + 1]); r.id = raw[i]; rows.push(r) } catch {} }
    rows.sort((a, b) => (b.t * 100 + b.p) - (a.t * 100 + a.p) || (b.w - a.w));
    return res.status(200).json({ rows: rows.slice(0, 100).map(r => ({ id: r.id, n: r.n, t: r.t, p: r.p, w: r.w, l: r.l, c: r.c, b: r.b })) });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'método' });
  let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b) } catch { b = {} } }
  const pid = str(b.pid, 24).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!pid) return res.status(400).json({ error: 'pid' });
  if (b.act === 'run') {
    const tier = Math.round(num(b.tier, 0, 15)), dial = num(b.dial, 5, 30), et = num(b.et, 5, 40), rt = num(b.rt, 0, 2);
    const tr = Array.isArray(b.trace) ? b.trace.slice(0, 420).map(x => Math.round((+x || 0) * 100) / 100) : [];
    if (tier == null || !dial || !et || tr.length < 40 || !/^[a-z0-9]{1,16}$/.test(String(b.model || ''))) return res.status(400).json({ error: 'corrida inválida' });
    const g = { pid, n: str(b.name, 18) || 'Piloto', model: b.model, vis: (b.vis && typeof b.vis === 'object') ? b.vis : null, dial, et, rt, v: num(b.v, 0, 150) || 40, trace: tr, ts: Date.now() };
    const s = JSON.stringify(g); if (s.length > 12000) return res.status(413).json({ error: 'grande demais' });
    await kv('LPUSH', 'rkg:' + tier, s); await kv('LTRIM', 'rkg:' + tier, 0, 39);
    return res.status(200).json({ ok: true });
  }
  if (b.act === 'score') {
    const r = { n: str(b.name, 18) || 'Piloto', t: Math.round(num(b.t, 0, 15) || 0), p: Math.round(num(b.p, 0, 100) || 0), w: Math.round(num(b.w, 0, 1e6) || 0), l: Math.round(num(b.l, 0, 1e6) || 0), c: str(b.car, 30), b: num(b.best, 0, 9) };
    await kv('HSET', 'rk:' + SEASON, pid, JSON.stringify(r));
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ error: 'ação' });
}
