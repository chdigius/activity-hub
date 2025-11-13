import db from '../db.js'
import { nowIso } from '../utils/time.js'

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
}
