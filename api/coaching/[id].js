import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id || /\.\./.test(id)) {
    return res.status(400).json({ error: 'Invalid profile ID' });
  }

  // GET /api/coaching/:id — single coaching profile
  if (req.method === 'GET') {
    try {
      const profile = await kv.get(`coaching:${id}`);
      if (!profile) return res.status(404).json({ error: 'Profile not found' });
      return res.status(200).json(profile);
    } catch (e) {
      console.error(`GET /api/coaching/${id} error:`, e);
      return res.status(500).json({ error: 'Failed to load profile' });
    }
  }

  // PUT /api/coaching/:id — save/update coaching profile
  if (req.method === 'PUT') {
    try {
      const data = req.body;
      await kv.set(`coaching:${id}`, data);
      await kv.sadd('coaching:ids', id);
      return res.status(200).json({ ok: true, id });
    } catch (e) {
      console.error(`PUT /api/coaching/${id} error:`, e);
      return res.status(500).json({ error: 'Failed to save profile' });
    }
  }

  // DELETE /api/coaching/:id — delete coaching profile
  if (req.method === 'DELETE') {
    try {
      await kv.del(`coaching:${id}`);
      await kv.srem('coaching:ids', id);
      return res.status(200).json({ ok: true, deleted: id });
    } catch (e) {
      console.error(`DELETE /api/coaching/${id} error:`, e);
      return res.status(500).json({ error: 'Failed to delete profile' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
