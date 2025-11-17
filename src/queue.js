import 'dotenv/config'
import db from './db.js'
import { postToLinkedIn } from './destinations/linkedin.js'
import { writeOutboxActivity } from './destinations/activitypub.js'
import { ACTORS, SCOPE_ACTOR, PUBLIC } from './config.js'

function actorForScope(scope) {
  const username = SCOPE_ACTOR[scope] || Object.keys(ACTORS)[0]
  return ACTORS[username]?.id || `${PUBLIC.BASE}/actors/${username}`
}

function backoff(attempts) {
  const mins = [1, 5, 30, 360, 1440]
  return mins[Math.min(attempts, mins.length - 1)]
}

async function deliver(row) {
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(row.event_id)
  if (!event) throw new Error('Event not found')

  if (row.dest === 'activitypub') {
    const actorId = actorForScope(event.scope)
    await writeOutboxActivity(event, actorId)
    return
  } else if (row.dest === 'linkedin') {
    console.log(`[queue] LinkedIn → event ${row.event_id} as ${process.env.LINKEDIN_MEMBER_URN}`);
    await postToLinkedIn(event)
    console.log(`[queue] LinkedIn OK → event ${row.event_id}`);
    return
  }

  throw new Error(`Unknown dest ${row.dest}`)
}

// 🌀 original daemon loop — back in action
async function loop() {
  const next = db.prepare(`
    SELECT * FROM deliveries
    WHERE status='pending' AND datetime(next_retry_at) <= datetime('now')
    ORDER BY next_retry_at ASC
    LIMIT 10
  `).all()

  for (const d of next) {
    try {
      await deliver(d)
      db.prepare(`UPDATE deliveries SET status='ok' WHERE id=?`).run(d.id)
    } catch (err) {
      const attempts = (d.attempts || 0) + 1
      const mins = backoff(attempts)
      db.prepare(`
        UPDATE deliveries
        SET attempts=?, next_retry_at=datetime('now', ? || ' minutes'), last_error=?
        WHERE id=?
      `).run(attempts, mins, JSON.stringify(err.response?.data ?? { message: err.message, stack: err.stack }), d.id)
      if (attempts >= 5) {
        db.prepare(`UPDATE deliveries SET status='failed' WHERE id=?`).run(d.id)
      }
    }
  }
}

// run fast on start, then every 60s
;(async function main() {
  await loop()
  setInterval(loop, 60000)
})()
