import 'dotenv/config'
import Fastify from 'fastify'
import db from './db.js'
import fs from 'fs'

import { ACTORS, PUBLIC } from './config.js'
import { signRequest } from './signing.js'

const app = Fastify()
const PORT = process.env.PORT || 8080

const CHDIGIUS_PUBLIC_KEY_PEM = fs.readFileSync(process.env.CHDIGIUS_PUBLIC_KEY_PATH, 'utf8')

// then stash that into ACTORS["chdigius"].publicKeyPem or an env var
ACTORS.chdigius.publicKeyPem = CHDIGIUS_PUBLIC_KEY_PEM

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

  const actorId = actor.id
  const publicKeyPem = actor.publicKeyPem

  return reply.header('Content-Type','application/activity+json').send({
    "@context": ["https://www.w3.org/ns/activitystreams", "https://w3id.org/security/v1"],
    id: actorId,
    type: "Service",
    name: actor.name,
    preferredUsername: actor.username,
    inbox: actor.inbox,
    outbox: actor.outbox,
    followers: `${actorId}/followers`,
    publicKey: {
      id: `${actorId}#main-key`,
      owner: actorId,
      publicKeyPem
    }
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

app.get('/activities/:name/:eventId', async (req, reply) => {
  const actor = ACTORS[req.params.name]
  if (!actor) {
    return reply.code(404).send({ error: 'not found' })
  }

  const activityId = `${actor.id.replace('/actors/', '/activities/')}/${req.params.eventId}`

  const row = db.prepare(
    `SELECT activity_json FROM outbox WHERE id = ? AND actor_id = ?`
  ).get(activityId, actor.id)

  if (!row) {
    return reply.code(404).send({ error: 'activity not found' })
  }

  const activity = JSON.parse(row.activity_json)

  return reply
    .header('Content-Type', 'application/activity+json')
    .send(activity)
})

app.get('/objects/:name/:eventId', async (req, reply) => {
  const actor = ACTORS[req.params.name]
  if (!actor) {
    return reply.code(404).send({ error: 'not found' })
  }

  const activityId = `${actor.id.replace('/actors/', '/activities/')}/${req.params.eventId}`

  const row = db.prepare(
    `SELECT activity_json FROM outbox WHERE id = ? AND actor_id = ?`
  ).get(activityId, actor.id)

  if (!row) {
    return reply.code(404).send({ error: 'object not found' })
  }

  const activity = JSON.parse(row.activity_json)
  const object = activity.object || {}

  // Make sure @context is present on the Note too
  if (!object['@context']) {
    object['@context'] = "https://www.w3.org/ns/activitystreams"
  }

  return reply
    .header('Content-Type', 'application/activity+json')
    .send(object)
})

app.post('/inbox', async (request, reply) => {
  const activity = request.body

  console.log('[INBOX] received activity:')
  console.log(JSON.stringify(activity, null, 2))

  try {
    if (activity.type === "Follow") {
      const target = activity.object   // your actor URL
      const follower = activity.actor  // their actor URL

      const actorEntry = Object.values(ACTORS).find(a => a.id === target)
      if (!actorEntry) {
        console.log('[INBOX] Follow for unknown object:', target)
      } else {
        // 1) store follower locally
        db.prepare(`
          INSERT OR IGNORE INTO followers (actor_id, follower)
          VALUES (?, ?)
        `).run(actorEntry.id, follower)

        // 2) discover follower inbox from their actor doc
        console.log('[INBOX] fetching follower actor doc:', follower)
        const actorRes = await fetch(follower, {
          headers: { 'Accept': 'application/activity+json' }
        })

        if (!actorRes.ok) {
          console.error('[INBOX] failed to fetch follower actor doc:', actorRes.status, await actorRes.text())
        } else {
          const followerActor = await actorRes.json()
          const inboxUrl =
            followerActor.inbox ||
            (followerActor.endpoints && followerActor.endpoints.sharedInbox)

          console.log('[INBOX] follower inbox URL:', inboxUrl)

          if (inboxUrl) {
            const acceptId = `${actorEntry.id.replace('/actors/', '/activities/')}/accept-${Date.now()}`
            const accept = {
              "@context": "https://www.w3.org/ns/activitystreams",
              id: acceptId,
              type: "Accept",
              actor: actorEntry.id,
              object: activity
            }

            const body = JSON.stringify(accept)
            const headers = signRequest(inboxUrl, body, actorEntry.id)

            const acceptRes = await fetch(inboxUrl, {
              method: 'POST',
              headers,
              body
            })

            console.log(
              '[INBOX] sent Accept to',
              inboxUrl,
              'status =',
              acceptRes.status
            )
            if (!acceptRes.ok) {
              console.error('[INBOX] Accept response body:', await acceptRes.text())
            }
          } else {
            console.error('[INBOX] follower actor has no inbox field')
          }
        }
      }
    }
  } catch (err) {
    console.error('[INBOX] error handling activity:', err)
    // don’t rethrow; we still want to ACK the inbox POST
  }

  reply.code(202).send({})
})

app.get('/actors/:name/followers', async (req, reply) => {
  const actor = ACTORS[req.params.name]
  if (!actor) return reply.code(404).send({ error: 'not found' })

  const rows = db.prepare(
    `SELECT follower FROM followers WHERE actor_id = ?`
  ).all(actor.id)

  const followers = rows.map(r => r.follower)

  return reply.header('Content-Type','application/activity+json').send({
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${actor.id}/followers`,
    type: "OrderedCollection",
    totalItems: followers.length,
    orderedItems: followers
  })
})

app.get('/health', async () => ({ ok: true }))
app.listen({ port: PORT, host: '0.0.0.0' })
  .then(()=>console.log(`ActivityHub listening on :${PORT}`))
  .catch(err => { console.error(err); process.exit(1) })
