import 'dotenv/config'
import db from './db.js'
import { postToLinkedIn } from './destinations/linkedin.js'
import { writeOutboxActivity } from './destinations/activitypub.js'
import { ACTORS, SCOPE_ACTOR, PUBLIC } from './config.js'

function actorForScope(scope) {
  const username = SCOPE_ACTOR[scope] || Object.keys(ACTORS)[0] // fallback to first actor
  return ACTORS[username]?.id || `${PUBLIC.BASE}/actors/${username}`
}

function backoff(attempts) {
  const mins = [1,5,30,360,1440]
  return mins[Math.min(attempts, mins.length - 1)]
}

async function deliver(row) {
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(row.event_id)
  if (!event) throw new Error('Event not found')

  if (row.dest === 'activitypub') {
    const actorId = actorForScope(event.scope)
    writeOutboxActivity(event, actorId)
    return
  }
  if (row.dest === 'linkedin') {
    await postToLinkedIn(event)
    return
  }
  throw new Error(`Unknown dest ${row.dest}`)
}
