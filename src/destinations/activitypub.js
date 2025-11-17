import db from '../db.js'
import { nowIso } from '../utils/time.js'
import { signRequest } from '../signing.js'

export function buildCreateActivity(event, actorId) {
  // actorId: https://broadcast.starfighter.systems/actors/chdigius
  const activityId = `${actorId.replace('/actors/', '/activities/')}/${event.id}`
  const objectId   = `${actorId.replace('/actors/', '/objects/')}/${event.id}`
  const followers  = `${actorId}/followers`

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: activityId,
    type: "Create",
    actor: actorId,
    published: nowIso(),
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: [followers],
    object: {
      id: objectId,
      type: "Note",
      attributedTo: actorId,
      published: event.published_at,
      content: event.content_html || `<p>${event.title}</p>`,
      // canonical ActivityPub URL for this Note
      url: objectId,
      to: ["https://www.w3.org/ns/activitystreams#Public"],
      cc: [followers],
      tag: JSON.parse(event.tags_json || '[]')
        .filter(Boolean)
        .map(t => ({ type: "Hashtag", name: `#${t}` })),
      // optional: keep original blog URL around for reference
      originalUrl: event.url
    }
  }
}

export function writeOutboxActivity(event, actorId) {
  const activity = buildCreateActivity(event, actorId)

  db.prepare(`
    INSERT OR IGNORE INTO outbox (id, event_id, activity_json, published_at, actor_id)
    VALUES (@id, @event_id, @activity_json, @published_at, @actor_id)
  `).run({
    id: activity.id,
    event_id: event.id,
    activity_json: JSON.stringify(activity),
    published_at: activity.published,
    actor_id: actorId
  })

  // hand the activity back so the queue can deliver it
  return activity
}

export async function deliverActivityToFollowers(activity, actorId) {
  const followers = db.prepare(`
    SELECT follower
    FROM followers
    WHERE actor_id = ?
  `).all(actorId)

  if (!followers.length) {
    console.log('[AP] no followers for', actorId, '— nothing to deliver')
    return
  }

  for (const row of followers) {
    const follower = row.follower
    try {
      // Fetch the follower's actor doc to discover inbox/sharedInbox
      const actorRes = await fetch(follower, {
        headers: { Accept: 'application/activity+json' }
      })

      if (!actorRes.ok) {
        console.error('[AP] failed to fetch follower actor', follower, actorRes.status)
        continue
      }

      const followerActor = await actorRes.json()
      const sharedInbox = followerActor.endpoints && followerActor.endpoints.sharedInbox
      const inboxUrl = sharedInbox || followerActor.inbox

      if (!inboxUrl) {
        console.error('[AP] follower actor has no inbox/sharedInbox', follower)
        continue
      }

      const body = JSON.stringify(activity)
      const headers = signRequest(inboxUrl, body, actorId)

      console.log('[AP] POST →', follower, 'inbox', inboxUrl)

      const res = await fetch(inboxUrl, {
        method: 'POST',
        headers,
        body
      })

      console.log('[AP] response for', follower, res.status)

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        console.error('[AP] delivery failed for', follower, res.status, text)
        // bubble up so the queue can retry later
        throw new Error(`ActivityPub delivery failed for ${follower}: ${res.status}`)
      }
    } catch (err) {
      console.error('[AP] error delivering to', follower, err)
      throw err
    }
  }
}
