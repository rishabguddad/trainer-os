// Cloud copy of the TrainerOS data, stored as one JSON document in Upstash Redis.
// Required Vercel env vars:
//   KV_REST_API_URL / KV_REST_API_TOKEN  (added automatically when you connect Upstash Redis
//                                         from Vercel → Storage; UPSTASH_REDIS_REST_* also work)
//   APP_PASSCODE                         (your own secret; the app asks for it once per device)
import { createHash, timingSafeEqual } from 'node:crypto';

const DATA_KEY = 'traineros:data';
const SNAPSHOT_DAYS = 45;
const MAX_FAILS = 10;

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const passcode = process.env.APP_PASSCODE;

async function redis(...commands) {
  const r = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`Redis responded ${r.status}`);
  return (await r.json()).map(x => { if (x.error) throw new Error(x.error); return x.result; });
}

const digest = s => createHash('sha256').update(String(s)).digest();
const passcodeOk = given => timingSafeEqual(digest(given), digest(passcode));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!url || !token || !passcode) {
    return res.status(503).json({ error: 'Cloud sync is not set up yet. In Vercel, connect Upstash Redis and add APP_PASSCODE, then redeploy.' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const failKey = `traineros:fail:${ip}`;

  try {
    const [fails] = await redis(['GET', failKey]);
    if (Number(fails) >= MAX_FAILS) return res.status(429).json({ error: 'Too many wrong passcodes. Try again in 15 minutes.' });
    if (!passcodeOk(req.headers['x-passcode'] || '')) {
      await redis(['INCR', failKey], ['EXPIRE', failKey, 900]);
      return res.status(401).json({ error: 'Wrong passcode' });
    }

    if (req.method === 'GET') {
      const [raw] = await redis(['GET', DATA_KEY]);
      const doc = raw ? JSON.parse(raw) : null;
      return res.status(200).json({ data: doc?.data ?? null, updatedAt: doc?.updatedAt ?? 0 });
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const data = body?.data, updatedAt = Number(body?.updatedAt) || 0;
      if (!data || !Array.isArray(data.clients)) return res.status(400).json({ error: 'Invalid data' });

      // Never let an older copy overwrite a newer one (e.g. a second phone that was offline).
      const [raw] = await redis(['GET', DATA_KEY]);
      const current = raw ? JSON.parse(raw) : null;
      if (current && current.updatedAt > updatedAt && !body.force) {
        return res.status(409).json({ error: 'The cloud has newer data', data: current.data, updatedAt: current.updatedAt });
      }

      const doc = JSON.stringify({ data, updatedAt, savedAt: Date.now() });
      const day = new Date().toISOString().slice(0, 10);
      // Keep the last copy of each day for 45 days as a safety net against accidental deletes.
      await redis(['SET', DATA_KEY, doc], ['SET', `traineros:snapshot:${day}`, doc, 'EX', SNAPSHOT_DAYS * 86400]);
      return res.status(200).json({ ok: true, updatedAt });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
}
