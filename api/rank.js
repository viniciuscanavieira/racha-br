import { put, list } from '@vercel/blob';
import { hasKV, kv, pairs } from './_kv.js';

const int = (v, a, b) => Math.max(a, Math.min(b, Math.floor(Number(v) || 0)));
const CARS = ['stw320','drift1','drift2','drift3','drift4','hb20','onix','unofirma','f1','s3','vip5','fox','twingo','fiestars','mustang','golturbao','chevette','saveiro','golgti','unoturbo','opala','uptsi','f250','golfgti','jetta','amarok','astra','vectra','fiesta','sandero','clio'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'POST') {
      let b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
      b = b || {};
      const id = String(b.id || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
      if (id.length < 10) return res.status(400).json({ error: 'id inválido' });
      const best = Number(b.best);
      const row = {
        id,
        nick: String(b.nick || 'Piloto').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20) || 'Piloto',
        lvl: int(b.lvl, 1, 40),
        car: CARS.includes(b.car) ? b.car : 'chevette',
        pi: int(b.pi, 0, 3000),
        wins: int(b.wins, 0, 1e6),
        races: int(b.races, 0, 1e6),
        ow: int(b.ow, 0, 1e6),
        ol: int(b.ol, 0, 1e6),
        best: best >= 7 && best < 40 ? Math.round(best * 1000) / 1000 : null,
        ts: Date.now(),
      };
      if (hasKV) { await kv('HSET', 'rank', id, JSON.stringify(row)); return res.status(200).json({ ok: true }); }
      await put(`rank/${id}.json`, JSON.stringify(row), {
        access: 'public', addRandomSuffix: false, allowOverwrite: true,
        contentType: 'application/json', cacheControlMaxAge: 60,
      });
      return res.status(200).json({ ok: true });
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'método' });
    if (hasKV) {
      const o = pairs(await kv('HGETALL', 'rank'));
      const rows = Object.values(o).map(v => { try { return JSON.parse(v) } catch { return null } }).filter(r => r && r.id);
      rows.sort((a, b) => (b.ow - a.ow) || (b.wins - a.wins) || ((a.best || 99) - (b.best || 99)));
      return res.status(200).json({ rows: rows.slice(0, 100), kv: true });
    }
    const { blobs } = await list({ prefix: 'rank/', limit: 500 });
    if (req.query && req.query.debug) {
      const f = u => fetch(u, { cache: 'no-store' }).then(async r => r.status + ' ' + (await r.text()).slice(0, 160)).catch(e => 'err ' + e.message);
      const t = blobs[0] ? { q: await f(`${blobs[0].url}?v=${Date.now()}`), plain: await f(blobs[0].url), dl: await f(blobs[0].downloadUrl) } : null;
      return res.status(200).json({ blobs: blobs.length, firstStatus: t, firstPath: blobs[0] && blobs[0].pathname });
    }
    const rows = (await Promise.all(blobs.map(b =>
      fetch(`${b.url}?v=${new Date(b.uploadedAt).getTime()}`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null)).catch(() => null)
    ))).filter(r => r && r.id);
    rows.sort((a, b) => (b.ow - a.ow) || (b.wins - a.wins) || ((a.best || 99) - (b.best || 99)));
    return res.status(200).json({ rows: rows.slice(0, 100) });
  } catch (e) {
    return res.status(500).json({ error: 'falha no ranking', detail: req.query && req.query.debug ? String(e && e.message || e) : undefined });
  }
}
