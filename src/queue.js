import 'dotenv/config';
import db from './db.js';
import { postToLinkedIn } from './destinations/linkedin.js';
import { writeOutboxActivity } from './destinations/activitypub.js';

const PUBLIC_BASE = process.env.PUBLIC_BASE;
const actorId = `${PUBLIC_BASE}/actors/${process.env.ACTOR_USERNAME || 'awakehub'}`;

function backoff(attempts) {
  const mins = [1, 5, 30, 360, 1440]; // 1m,5m,30m,6h,24h
  return mins[Math.min(attempts, mins.length - 1)];
}

async function deliver(row) {
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(row.event_id);
  if (!event) throw new Error('Event not found');

  if (row.dest === 'activitypub') {
    // v0: write to local outbox (public feed). v1: sign & POST to followers' inboxes.
    writeOutboxActivity(event, actorId);
    return;
  }
  if (row.dest === 'linkedin') {
    await postToLinkedIn(event);
    return;
  }
  throw new Error(`Unknown dest ${row.dest}`);
}

async function loop() {
  const next = db.prepare(`
    SELECT * FROM deliveries
    WHERE status='pending' AND datetime(next_retry_at) <= datetime('now')
    ORDER BY next_retry_at ASC
    LIMIT 10
  `).all();

  for (const d of next) {
    try {
      await deliver(d);
      db.prepare(`UPDATE deliveries SET status='ok' WHERE id=?`).run(d.id);
    } catch (err) {
      const attempts = d.attempts + 1;
      const mins = backoff(attempts);
      db.prepare(`
        UPDATE deliveries
        SET attempts=?, next_retry_at=datetime('now', ? || ' minutes'), last_error=?
        WHERE id=?
      `).run(attempts, mins, String(err.response?.data || err.message), d.id);
      if (attempts >= 5) {
        db.prepare(`UPDATE deliveries SET status='failed' WHERE id=?`).run(d.id);
      }
    }
  }
}

// simple daemon loop
(async function main() {
  // run fast at start, then every 60s
  await loop();
  setInterval(loop, 60000);
})();
