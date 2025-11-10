import db from '../db.js'
import { nowIso } from '../utils/time.js'

export function buildCreateActivity(event, actorId) {
  const objId = event.url
  const actId = `${actorId.replace('/actors/', '/activities/')}/${event.id}`
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: actId,
    type: "Create",
    actor: actorId,
    object: {
      id: objId,
      type: "Note",
      attributedTo: actorId,
      published: event.published_at,
      content: event.content_html || `<p>${event.title}</p>`,
      url: event.url,
      tag: JSON.parse(event.tags_json || '[]').filter(Boolean).map(t => ({ type: "Hashtag", name: `#${t}` }))
    },
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    published: nowIso()
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
