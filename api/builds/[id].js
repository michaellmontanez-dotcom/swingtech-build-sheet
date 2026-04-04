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
    return res.status(400).json({ error: 'Invalid build ID' });
  }

  // GET /api/builds/:id — single build
  if (req.method === 'GET') {
    try {
      const build = await kv.get(`build:${id}`);
      if (!build) return res.status(404).json({ error: 'Build not found' });
      return res.status(200).json(build);
    } catch (e) {
      console.error(`GET /api/builds/${id} error:`, e);
      return res.status(500).json({ error: 'Failed to load build' });
    }
  }

  // PUT /api/builds/:id — save/update build
  if (req.method === 'PUT') {
    try {
      const data = req.body;
      await kv.set(`build:${id}`, data);
      await kv.sadd('build:ids', id);
      return res.status(200).json({ ok: true, orderId: id });
    } catch (e) {
      console.error(`PUT /api/builds/${id} error:`, e);
      return res.status(500).json({ error: 'Failed to save build' });
    }
  }

  // DELETE /api/builds/:id — delete build
  if (req.method === 'DELETE') {
    try {
      await kv.del(`build:${id}`);
      await kv.srem('build:ids', id);
      return res.status(200).json({ ok: true, deleted: id });
    } catch (e) {
      console.error(`DELETE /api/builds/${id} error:`, e);
      return res.status(500).json({ error: 'Failed to delete build' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
