import { hasKV, kv } from './_kv.js';
import { sessionUid } from './auth.js';

// Progresso na nuvem de quem fez login. GET devolve, POST grava.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!hasKV) return res.status(503).json({ error: 'Servidor indisponível' });
  const uid = await sessionUid(req).catch(() => null);
  if (!uid) return res.status(401).json({ error: 'Sessão expirada, entre de novo' });
  if (req.method === 'GET') {
    const s = await kv('GET', 'save:' + uid);
    const a = JSON.parse((await kv('GET', 'acct:' + uid)) || '{}');
    return res.status(200).json({ save: s ? JSON.parse(s) : null, name: a.name || '', pid: a.pid || '' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'método' });
  let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b) } catch { b = {} } }
  const s = b && b.save;
  if (!s || typeof s !== 'object' || !Array.isArray(s.cars)) return res.status(400).json({ error: 'save inválido' });
  const txt = JSON.stringify(s);
  if (txt.length > 400000) return res.status(413).json({ error: 'save grande demais' });
  const a = JSON.parse((await kv('GET', 'acct:' + uid)) || '{}');
  if (a.pid) s.pid = a.pid;
  delete s.guest;
  await kv('SET', 'save:' + uid, JSON.stringify(s));
  return res.status(200).json({ ok: true });
}
