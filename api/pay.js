import { randomBytes } from 'crypto';
import { hasKV, kv } from './_kv.js';

// Loja paga via Pix (Mercado Pago). Precisa da variável MP_ACCESS_TOKEN na Vercel.
// O preço vem SEMPRE daqui (servidor), nunca do jogo. Pode trocar via variável PAY_CATALOG (mesmo formato).
const DEFAULT_CATALOG = {
  vip:      { n: 'VIP', d: 'Carros VIP, Stage 4, pneu drag radial, nitro especial, swap de motor e +25% de XP', price: 9.90, g: { vip: true } },
  passe:    { n: 'PASSE', d: 'Trilha PASSE da temporada (dinheiro, nitro e carros especiais) + Uno "Da Firma" e F1', price: 14.90, g: { pass: true } },
  vippasse: { n: 'VIP + PASSE', d: 'Os dois juntos, com desconto', price: 19.90, g: { vip: true, pass: true } },
  din2:     { n: 'R$ 2 milhões', d: 'Dinheiro do jogo', price: 4.90, g: { money: 2000000 } },
  din6:     { n: 'R$ 6 milhões', d: 'Dinheiro do jogo', price: 9.90, g: { money: 6000000 } },
  din15:    { n: 'R$ 15 milhões', d: 'Dinheiro do jogo', price: 19.90, g: { money: 15000000 } },
  car_vip5:    { n: 'VIP Jato', d: 'Carro avulso', price: 5.90, g: { cars: ['vip5'] } },
  car_drift1:  { n: 'Drift GT-R1', d: 'Carro avulso', price: 5.90, g: { cars: ['drift1'] } },
  car_drift2:  { n: 'Drift Sedan S2', d: 'Carro avulso', price: 5.90, g: { cars: ['drift2'] } },
  car_drift3:  { n: 'Drift Coupé C3', d: 'Carro avulso', price: 5.90, g: { cars: ['drift3'] } },
  car_drift4:  { n: 'Drift Hatch H4', d: 'Carro avulso', price: 5.90, g: { cars: ['drift4'] } },
  car_stw320:  { n: '320i STW 1996', d: 'Carro avulso', price: 5.90, g: { cars: ['stw320'] } },
  car_unofirma:{ n: 'Uno "Da Firma" 6000', d: 'Carro avulso', price: 7.90, g: { cars: ['unofirma'] } },
  car_f1:      { n: 'Monoposto F1 2019', d: 'Carro avulso', price: 7.90, g: { cars: ['f1'] } },
};
function catalog() {
  try { const c = JSON.parse(process.env.PAY_CATALOG || 'null'); if (c && typeof c === 'object') return c; } catch {}
  return DEFAULT_CATALOG;
}
const TOKEN = process.env.MP_ACCESS_TOKEN || '';
const MP = 'https://api.mercadopago.com/v1/payments';
const rid = n => Array.from(randomBytes(n), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');

async function mpGet(id) {
  const r = await fetch(`${MP}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error('mp ' + r.status);
  return r.json();
}
// Pagamento aprovado vira um código de resgate de uso único (paycode:<CODE>), resgatado pelo /api/redeem
async function finalize(oid, ord) {
  if (ord.code) return ord.code;
  const lock = await kv('SET', 'ordpaid:' + oid, '1', 'NX');
  if (lock !== 'OK') { const o2 = JSON.parse((await kv('GET', 'ord:' + oid)) || '{}'); return o2.code || null; }
  const item = catalog()[ord.item]; if (!item) return null;
  const code = 'RB' + rid(8);
  await kv('SET', 'paycode:' + code, JSON.stringify({ ...item.g, src: oid }));
  ord.code = code; ord.status = 'paid'; ord.paidAt = Date.now();
  await kv('SET', 'ord:' + oid, JSON.stringify(ord));
  await kv('HSET', 'sales', oid, JSON.stringify({ item: ord.item, price: ord.price, pid: ord.pid, ts: ord.paidAt }));
  return code;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  const cat = catalog();
  if (req.method === 'GET' && q.catalog) {
    return res.status(200).json({ on: !!(TOKEN && hasKV), items: Object.entries(cat).map(([id, x]) => ({ id, n: x.n, d: x.d, price: x.price, g: x.g })) });
  }
  if (!TOKEN || !hasKV) return res.status(503).json({ error: 'Loja ainda não configurada' });

  // Aviso do Mercado Pago (webhook): conferimos direto na API do MP, não confiamos no corpo
  if (q.hook) {
    try {
      let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b) } catch { b = {} } }
      const id = (b && b.data && b.data.id) || q['data.id'] || q.id;
      if (id) {
        const p = await mpGet(id);
        const oid = p.external_reference;
        if (p.status === 'approved' && oid) {
          const raw = await kv('GET', 'ord:' + oid);
          if (raw) { const ord = JSON.parse(raw); if (Math.abs(p.transaction_amount - ord.price) < .01) await finalize(oid, ord); }
        }
      }
    } catch (e) { /* MP reenvia se falhar */ }
    return res.status(200).json({ ok: true });
  }

  // Consulta de pedido (o jogo pergunta a cada poucos segundos)
  if (req.method === 'GET' && q.order) {
    const oid = String(q.order).replace(/[^A-Z0-9]/g, '').slice(0, 20);
    const raw = await kv('GET', 'ord:' + oid);
    if (!raw) return res.status(404).json({ error: 'Pedido não encontrado' });
    const ord = JSON.parse(raw);
    if (ord.code) return res.status(200).json({ status: 'paid', code: ord.code, item: ord.item });
    try {
      const p = await mpGet(ord.mp);
      if (p.status === 'approved' && Math.abs(p.transaction_amount - ord.price) < .01) {
        const code = await finalize(oid, ord);
        return res.status(200).json({ status: 'paid', code, item: ord.item });
      }
      return res.status(200).json({ status: p.status === 'cancelled' || p.status === 'rejected' ? 'failed' : 'pending' });
    } catch (e) { return res.status(200).json({ status: 'pending' }); }
  }

  // Criar cobrança Pix
  if (req.method !== 'POST') return res.status(405).json({ error: 'método' });
  let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b) } catch { b = {} } }
  const itemId = String((b && b.item) || '');
  const item = cat[itemId];
  const pid = String((b && b.pid) || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  const email = String((b && b.email) || '').trim().toLowerCase().slice(0, 120);
  if (!item) return res.status(400).json({ error: 'Item inválido' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'E-mail inválido' });
  // limite contra abuso: 10 cobranças por hora por jogador
  try { const k = 'payrl:' + (pid || 'x'); const n = await kv('INCR', k); if (n === 1) await kv('EXPIRE', k, 3600); if (n > 10) return res.status(429).json({ error: 'Muitas tentativas, espere um pouco' }); } catch {}
  const oid = 'O' + rid(11);
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const exp = new Date(Date.now() + 30 * 60e3).toISOString().replace('Z', '+00:00');
  const r = await fetch(MP, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', 'X-Idempotency-Key': oid },
    body: JSON.stringify({
      transaction_amount: item.price, description: 'Racha BR - ' + item.n, payment_method_id: 'pix',
      payer: { email }, external_reference: oid, notification_url: `https://${host}/api/pay?hook=1`, date_of_expiration: exp,
    }),
  });
  const p = await r.json().catch(() => ({}));
  const td = p && p.point_of_interaction && p.point_of_interaction.transaction_data;
  if (!r.ok || !td) return res.status(502).json({ error: 'Mercado Pago recusou a cobrança', detail: p && (p.message || p.error) });
  await kv('SET', 'ord:' + oid, JSON.stringify({ item: itemId, price: item.price, pid, mp: p.id, ts: Date.now(), status: 'pending' }), 'EX', 60 * 60 * 24 * 30);
  return res.status(200).json({ order: oid, qr: td.qr_code, qrImg: td.qr_code_base64, price: item.price, name: item.n });
}
