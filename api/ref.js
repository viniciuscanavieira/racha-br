import { put, list } from '@vercel/blob';
import { hasKV, kv, pairs } from './_kv.js';

const clean = (v, n = 24) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, n);

// Indicações: POST {ref, pid, lvl, nick} registra/atualiza o indicado; GET ?pid= lista os indicados de quem indicou
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'POST') {
      let b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
      b = b || {};
      const ref = clean(b.ref), pid = clean(b.pid);
      if (ref.length < 10 || pid.length < 10 || ref === pid) return res.status(400).json({ error: 'dados' });
      const lvl = Math.max(1, Math.min(40, Math.floor(Number(b.lvl) || 1)));
      const nick = String(b.nick || 'Piloto').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20) || 'Piloto';
      if (hasKV) {
        const oldS = await kv('HGET', 'ref:' + ref, pid);let old = null;try { old = oldS ? JSON.parse(oldS) : null } catch {}
        let row = { pid, nick, lvl, joined: Date.now(), ok: lvl >= 5 ? Date.now() : null };
        if (old) row = { ...old, nick, lvl: Math.max(old.lvl || 1, lvl), ok: old.ok || (lvl >= 5 ? Date.now() : null) };
        await kv('HSET', 'ref:' + ref, pid, JSON.stringify(row));
        return res.status(200).json({ ok: true });
      }
      const path = `ref/${ref}/${pid}.json`;
      const { blobs } = await list({ prefix: path, limit: 1 });
      let row = { pid, nick, lvl, joined: Date.now(), ok: lvl >= 5 ? Date.now() : null };
      if (blobs.length) {
        const old = await fetch(`${blobs[0].url}?v=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
        if (old) row = { ...old, nick, lvl: Math.max(old.lvl || 1, lvl), ok: old.ok || (lvl >= 5 ? Date.now() : null) };
      }
      await put(path, JSON.stringify(row), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 });
      return res.status(200).json({ ok: true });
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'método' });
    const pid = clean(req.query && req.query.pid);
    if (pid.length < 10) return res.status(400).json({ error: 'pid' });
    if (hasKV) {
      const o = pairs(await kv('HGETALL', 'ref:' + pid));
      return res.status(200).json({ rows: Object.values(o).map(v => { try { return JSON.parse(v) } catch { return null } }).filter(Boolean) });
    }
    const { blobs } = await list({ prefix: `ref/${pid}/`, limit: 500 });
    const rows = (await Promise.all(blobs.map(b => fetch(`${b.url}?v=${new Date(b.uploadedAt).getTime()}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).catch(() => null)))).filter(Boolean);
    return res.status(200).json({ rows });
  } catch (e) {
    return res.status(500).json({ error: 'falha' });
  }
}
