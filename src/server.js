import 'dotenv/config'
import Fastify from 'fastify'
import db from './db.js'
import { ACTORS, PUBLIC } from './config.js'

const app = Fastify()
const PORT = process.env.PORT || 8080

// accept application/activity+json (or any other +json)
app.addContentTypeParser(
  /^application\/(.+\+)?json$/,
  { parseAs: 'string' },
  function (request, body, done) {
    try {
      const json = JSON.parse(body)
      done(null, json)
    } catch (err) {
      err.statusCode = 400
      done(err)
    }
  }
)

// WebFinger: resolve any acct:user@host that exists in ACTORS
app.get('/.well-known/webfinger', async (req, reply) => {
  const resource = String(req.query.resource || '')
  // expected: acct:<username>@<host>
  const m = resource.match(/^acct:([^@]+)@/i)
  const username = m?.[1]
  const actor = username && ACTORS[username]
  if (!actor) {
    return reply
      .code(404)
      .type('application/jrd+json; charset=utf-8')
      .send({ error: 'not found' })
  }

  const host = new URL(PUBLIC.BASE).hostname

  const jrd = {
    subject: `acct:${actor.username}@${host}`,
    aliases: [
      actor.id
    ],
    links: [
      {
        rel: 'self',
        type: 'application/activity+json',
        href: actor.id
      }
    ]
  }

  return reply
    .type('application/jrd+json; charset=utf-8')
    .send(jrd)
})


app.get('/actors/:name', async (req, reply) => {
  const actor = ACTORS[req.params.name]
  if (!actor) return reply.code(404).send({ error: 'not found' })
  return reply.header('Content-Type','application/activity+json').send({
    "@context": ["https://www.w3.org/ns/activitystreams"],
    id: actor.id,
    type: "Service",
    name: actor.name,
    preferredUsername: actor.username,
    inbox: actor.inbox,
    outbox: actor.outbox
  })
})

// Per-actor outbox
app.get('/actors/:name/outbox', async (req, reply) => {
  const actor = ACTORS[req.params.name]
  if (!actor) return reply.code(404).send({ error: 'not found' })
  const rows = db.prepare(
    `SELECT activity_json FROM outbox WHERE actor_id=? ORDER BY published_at DESC LIMIT 50`
  ).all(actor.id)
  const items = rows.map(r => JSON.parse(r.activity_json))
  return reply.header('Content-Type','application/activity+json').send({
    "@context": "https://www.w3.org/ns/activitystreams",
    id: actor.outbox,
    type: "OrderedCollection",
    totalItems: items.length,
    orderedItems: items
  })
})

// Keep the aggregated outbox (optional)
app.get('/outbox', async (req, reply) => {
  const rows = db.prepare(`SELECT activity_json FROM outbox ORDER BY published_at DESC LIMIT 50`).all()
  const items = rows.map(r => JSON.parse(r.activity_json))
  return reply.header('Content-Type','application/activity+json').send({
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${PUBLIC.BASE}/outbox`,
    type: "OrderedCollection",
    totalItems: items.length,
    orderedItems: items
  })
})

app.post('/inbox', async (request, reply) => {
  const activity = request.body

  // Super basic sanity log – so we can see if Mastodon ever hits this
  console.log('[INBOX] received activity:')
  console.log(JSON.stringify(activity, null, 2))

  // Later, we can:
  // - verify HTTP signatures
  // - validate the activity
  // - enqueue it for worker processing
  // But for now, just acknowledge receipt
  reply.code(202).send({})
})

app.get('/health', async () => ({ ok: true }))
app.listen({ port: PORT, host: '0.0.0.0' })
  .then(()=>console.log(`ActivityHub listening on :${PORT}`))
  .catch(err => { console.error(err); process.exit(1) })
