import { put, list } from '@vercel/blob';
import { createHash } from 'crypto';
import { hasKV, kv } from './_kv.js';

// Códigos de uso único definidos na variável de ambiente REDEEM_CODES, ex: {"CODIGO":6000000}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'método' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  const code = String((b && b.code) || '').trim().toUpperCase().slice(0, 40);
  const pid = String((b && b.pid) || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  let codes = {};
  try { codes = JSON.parse(process.env.REDEEM_CODES || '{}'); } catch {}
  // códigos extras (mais fácil de adicionar sem mexer na lista principal)
  try { Object.assign(codes, JSON.parse(process.env.REDEEM_CODES_2 || '{}')); } catch {}
  let val = codes[code];
  // códigos gerados por compra Pix (api/pay.js)
  if (val === undefined && hasKV && /^RB[A-Z0-9]{8}$/.test(code)) { try { const v = await kv('GET', 'paycode:' + code); if (v) val = JSON.parse(v); } catch {} }
  const vip = val === 'vip' || !!(val && typeof val === 'object' && val.vip);
  const pass = !!(val && typeof val === 'object' && val.pass);
  const cars = val && typeof val === 'object' && Array.isArray(val.cars) ? val.cars.map(String).slice(0, 20) : [];
  const amount = val && typeof val === 'object' ? Number(val.money) || 0 : (val === 'vip' ? 0 : Number(val));
  if (!code || (!vip && !pass && !amount && !cars.length)) return res.status(404).json({ error: 'Código inválido' });
  const h = createHash('sha256').update('rbr:' + code).digest('hex').slice(0, 32);
  if (hasKV) {
    try {
      // códigos usados antes da troca pro Redis (gravados no Blob) continuam valendo como usados
      if (!(await kv('GET', 'redeem:migrated'))) {
        try { const { blobs } = await list({ prefix: 'redeem/', limit: 1000 }); for (const x of blobs) { const m = x.pathname.match(/redeem\/([a-f0-9]{32})/); if (m) await kv('SET', 'redeem:' + m[1], 'blob') } } catch {}
        await kv('SET', 'redeem:migrated', '1');
      }
      const ok = await kv('SET', 'redeem:' + h, JSON.stringify({ pid, ts: Date.now() }), 'NX');
      if (ok !== 'OK') return res.status(409).json({ error: 'Código já usado' });
    } catch (e) { return res.status(503).json({ error: 'Servidor ocupado, tente de novo' }); }
    return res.status(200).json({ ok: true, amount, vip, pass, cars });
  }
  try {
    const { blobs } = await list({ prefix: `redeem/${h}`, limit: 1 });
    if (blobs.length) return res.status(409).json({ error: 'Código já usado' });
    await put(`redeem/${h}.json`, JSON.stringify({ pid, ts: Date.now() }), {
      access: 'public', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json',
    });
  } catch (e) {
    return res.status(409).json({ error: 'Código já usado' });
  }
  return res.status(200).json({ ok: true, amount, vip, pass, cars });
}
