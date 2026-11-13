import { randomBytes } from 'crypto';
import { hasKV, kv } from './_kv.js';

// Login com Google / Facebook. Variáveis: GOOGLE_CLIENT_ID, FB_APP_ID, FB_APP_SECRET.
const GID = process.env.GOOGLE_CLIENT_ID || '';
const FBID = process.env.FB_APP_ID || '';
const FBSEC = process.env.FB_APP_SECRET || '';
const SESS_TTL = 60 * 60 * 24 * 120;
const tok = () => randomBytes(24).toString('hex');
const newPid = () => Array.from(randomBytes(12), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');

async function verifyGoogle(t) {
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(t));
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.aud !== GID || !/accounts\.google\.com$/.test(j.iss || '') || !j.sub) throw new Error('google');
  return { uid: 'g_' + j.sub, name: j.given_name || j.name || 'Piloto', pic: j.picture || '' };
}
async function verifyFacebook(t) {
  const d = await fetch(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(t)}&access_token=${encodeURIComponent(FBID + '|' + FBSEC)}`).then(r => r.json()).catch(() => ({}));
  const data = d && d.data;
  if (!data || !data.is_valid || String(data.app_id) !== String(FBID) || !data.user_id) throw new Error('facebook');
  const me = await fetch(`https://graph.facebook.com/me?fields=first_name,name&access_token=${encodeURIComponent(t)}`).then(r => r.json()).catch(() => ({}));
  return { uid: 'f_' + data.user_id, name: me.first_name || me.name || 'Piloto', pic: '' };
}
export async function sessionUid(req) {
  const h = String(req.headers.authorization || '');
  const t = h.startsWith('Bearer ') ? h.slice(7).replace(/[^a-f0-9]/g, '') : '';
  if (!t || !hasKV) return null;
  return await kv('GET', 'sess:' + t);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  if (req.method === 'GET' && q.config) return res.status(200).json({ google: GID || null, facebook: FBID && FBSEC ? FBID : null, on: !!hasKV && !!((GID) || (FBID && FBSEC)) });
  if (!hasKV) return res.status(503).json({ error: 'Servidor indisponível' });
  if (req.method === 'DELETE') {
    const h = String(req.headers.authorization || ''); const t = h.slice(7).replace(/[^a-f0-9]/g, '');
    if (t) await kv('DEL', 'sess:' + t);
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'método' });
  let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b) } catch { b = {} } }
  const prov = b && b.provider, t = String((b && b.token) || '');
  let who;
  try {
    if (prov === 'google' && GID) who = await verifyGoogle(t);
    else if (prov === 'facebook' && FBID && FBSEC) who = await verifyFacebook(t);
    else return res.status(400).json({ error: 'Login indisponível' });
  } catch (e) { return res.status(401).json({ error: 'Não deu pra confirmar o login' }); }
  let acct = null;
  try { acct = JSON.parse((await kv('GET', 'acct:' + who.uid)) || 'null'); } catch {}
  if (!acct) {
    // aproveita o pid do aparelho (indicação/ranking) se ainda não for de ninguém
    let pid = String((b && b.pid) || '').toLowerCase();
    if (!/^[a-z0-9]{12}$/.test(pid) || (await kv('SET', 'pidowner:' + pid, who.uid, 'NX')) !== 'OK') {
      pid = newPid(); await kv('SET', 'pidowner:' + pid, who.uid);
    }
    acct = { pid, name: who.name, created: Date.now() };
  }
  acct.name = who.name; acct.pic = who.pic; acct.last = Date.now();
  await kv('SET', 'acct:' + who.uid, JSON.stringify(acct));
  const s = tok();
  await kv('SET', 'sess:' + s, who.uid, 'EX', SESS_TTL);
  const save = await kv('GET', 'save:' + who.uid);
  return res.status(200).json({ session: s, uid: who.uid, name: acct.name, pid: acct.pid, save: save ? JSON.parse(save) : null });
}
