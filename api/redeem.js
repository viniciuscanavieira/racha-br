import { put, list } from '@vercel/blob';
import { createHash } from 'crypto';

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
  const val = codes[code];
  const vip = val === 'vip' || !!(val && typeof val === 'object' && val.vip);
  const amount = val && typeof val === 'object' ? Number(val.money) || 0 : (val === 'vip' ? 0 : Number(val));
  if (!code || (!vip && !amount)) return res.status(404).json({ error: 'Código inválido' });
  const h = createHash('sha256').update('rbr:' + code).digest('hex').slice(0, 32);
  try {
    const { blobs } = await list({ prefix: `redeem/${h}`, limit: 1 });
    if (blobs.length) return res.status(409).json({ error: 'Código já usado' });
    await put(`redeem/${h}.json`, JSON.stringify({ pid, ts: Date.now() }), {
      access: 'public', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json',
    });
  } catch (e) {
    return res.status(409).json({ error: 'Código já usado' });
  }
  return res.status(200).json({ ok: true, amount, vip });
}
