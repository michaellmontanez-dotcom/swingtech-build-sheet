import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET /api/builds — list all builds
  if (req.method === 'GET') {
    try {
      const keys = await kv.smembers('build:ids') || [];
      const builds = [];
      for (const id of keys) {
        const build = await kv.get(`build:${id}`);
        if (build) builds.push(build);
      }
      // Sort by orderId descending (newest first)
      builds.sort((a, b) => {
        const aId = a.build?.orderId || '';
        const bId = b.build?.orderId || '';
        return bId.localeCompare(aId);
      });
      return res.status(200).json({ builds });
    } catch (e) {
      console.error('GET /api/builds error:', e);
      return res.status(500).json({ error: 'Failed to load builds' });
    }
  }

  // POST /api/builds — bulk import (merge, don't overwrite)
  if (req.method === 'POST') {
    try {
      const body = req.body;
      const incoming = Array.isArray(body.builds) ? body.builds : [];
      const existingIds = await kv.smembers('build:ids') || [];
      const existingSet = new Set(existingIds);
      let added = 0;
      for (const b of incoming) {
        const orderId = b.build?.orderId;
        if (orderId && !existingSet.has(orderId)) {
          await kv.set(`build:${orderId}`, b);
          await kv.sadd('build:ids', orderId);
          added++;
        }
      }
      const total = (await kv.smembers('build:ids') || []).length;
      return res.status(200).json({ ok: true, added, total });
    } catch (e) {
      console.error('POST /api/builds error:', e);
      return res.status(500).json({ error: 'Failed to import builds' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
