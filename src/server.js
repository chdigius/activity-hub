import 'dotenv/config';
import Fastify from 'fastify';
import db from './db.js';

import { ingestFeed } from './ingestors/rss.js'

const app = Fastify();
const PORT = process.env.PORT || 8080;
const PUBLIC_BASE = process.env.PUBLIC_BASE;
const username = process.env.ACTOR_USERNAME || 'awakehub';
const actorId = `${PUBLIC_BASE}/actors/${username}`;

app.get('/.well-known/webfinger', async (req, reply) => {
  const resource = req.query.resource;
  // resource = acct:awakehub@activity.awakefx.com
  return reply.send({
    subject: `acct:${username}@${new URL(PUBLIC_BASE).hostname}`,
    links: [{
      rel: 'self',
      type: 'application/activity+json',
      href: actorId
    }]
  });
});

app.get('/actors/:name', async (req, reply) => {
  if (req.params.name !== username) return reply.code(404).send({error:'not found'});
  return reply
    .header('Content-Type', 'application/activity+json')
    .send({
      "@context": ["https://www.w3.org/ns/activitystreams"],
      id: actorId,
      type: "Service",
      name: process.env.ACTOR_NAME || "Awake ActivityHub",
      preferredUsername: username,
      inbox: `${PUBLIC_BASE}/inbox`,
      outbox: `${PUBLIC_BASE}/outbox`,
      // v0: publicKey omitted; add when you implement signing
    });
});

app.get('/outbox', async (req, reply) => {
  // Return a minimal ordered collection of activities
  const rows = db.prepare(`SELECT activity_json FROM outbox ORDER BY published_at DESC LIMIT 50`).all();
  const items = rows.map(r => JSON.parse(r.activity_json));
  return reply
    .header('Content-Type', 'application/activity+json')
    .send({
      "@context": "https://www.w3.org/ns/activitystreams",
      id: `${PUBLIC_BASE}/outbox`,
      type: "OrderedCollection",
      totalItems: items.length,
      orderedItems: items
    });
});

// replace your existing /hook/refresh with this:
app.post('/hook/refresh', async (req, reply) => {
  const list = (process.env.FEED_URLS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  if (list.length === 0) {
    return reply.code(400).send({ ok: false, error: 'FEED_URLS is empty' })
  }

  const results = []
  for (const url of list) {
    try {
      const t0 = Date.now()
      await ingestFeed(url)
      results.push({ url, ok: true, ms: Date.now() - t0 })
    } catch (e) {
      // capture something useful even if e.message is empty
      results.push({
        url,
        ok: false,
        error: e?.response?.status
          ? `HTTP ${e.response.status} ${e.response.statusText}`
          : (e?.message || String(e))
      })
    }
  }

  const ok = results.every(r => r.ok)
  return reply.code(ok ? 200 : 207).send({ ok, results })
})


// Stub inbox (accept but do nothing yet)
app.post('/inbox', async (req, reply) => {
  // TODO: verify HTTP signatures, process activities, etc.
  reply.code(202).send({ok:true});
});

app.get('/health', async () => ({ ok: true }));

app.listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log(`ActivityHub listening on :${PORT}`))
  .catch(err => { console.error(err); process.exit(1); });
