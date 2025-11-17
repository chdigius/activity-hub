import Parser from 'rss-parser';
import { ulid } from 'ulid';
import db from '../db.js';
import { fingerprint } from '../utils/canonicalize.js';

const parser = new Parser();

export async function ingestFeed(feedUrl, scope = 'portfolio') {
  const feed = await parser.parseURL(feedUrl);

  for (const item of feed.items || []) {
    const payload = normalizeRssItem(item, scope);
    if (!payload?.url) continue;

    // 🔹 First line of defense: dedupe by (scope, url)
    const existingByUrl = db
      .prepare('SELECT id FROM events WHERE scope = ? AND url = ?')
      .get(scope, payload.url);

    if (existingByUrl) {
      // We've already created an event for this devlog entry.
      // We *could* update content here in the future, but for now: no new deliveries.
      continue;
    }

    // 🔹 Fingerprint still useful for internal identity, but not the primary dedupe key
    const fp = fingerprint(payload);

    const id = ulid();
    db.prepare(`
      INSERT OR IGNORE INTO events (
        id,
        kind,
        scope,
        source,
        title,
        summary,
        content_html,
        url,
        media_json,
        tags_json,
        published_at,
        fingerprint
      )
      VALUES (
        @id,
        @kind,
        @scope,
        @source,
        @title,
        @summary,
        @content_html,
        @url,
        @media_json,
        @tags_json,
        @published_at,
        @fingerprint
      )
    `).run({
      id,
      kind: payload.kind,
      scope: payload.scope,
      source: payload.source,
      title: payload.title,
      summary: payload.summary,
      content_html: payload.content_html,
      url: payload.url,
      media_json: JSON.stringify(payload.media || []),
      tags_json: JSON.stringify(payload.tags || []),
      published_at: payload.published_at,
      fingerprint: fp
    });

    // If the insert was ignored (because of UNIQUE(scope,url)), don't enqueue deliveries
    const inserted = db
      .prepare('SELECT id FROM events WHERE scope = ? AND url = ?')
      .get(scope, payload.url);

    if (!inserted || inserted.id !== id) {
      // Row already existed, or this insert was ignored → no new deliveries
      continue;
    }

    // 🔹 Enqueue deliveries only for truly new events
    enqueueDelivery(id, 'activitypub');
    if (process.env.LINKEDIN_ENABLED === 'true') {
      enqueueDelivery(id, 'linkedin');
    }
  }
}

function enqueueDelivery(eventId, dest) {
  try {
    db.prepare(`
      INSERT OR IGNORE INTO deliveries (event_id, dest, status, attempts, next_retry_at)
      VALUES (?,?,?,?,datetime('now'))
    `).run(eventId, dest, 'pending', 0);
  } catch {
    // swallow errors for now; can add logging later
  }
}

function normalizeRssItem(item, scope) {
  // Map RSS fields into canonical event
  // Adjust kind by feed/contents later; for now call them 'post'
  return {
    kind: 'post',
    scope,
    source: new URL(item.link || '#').hostname,
    title: item.title || 'Update',
    summary: item.contentSnippet || '',
    content_html: item['content:encoded'] || item.content || '',
    url: item.link,
    media: [],      // can parse <enclosure> if present
    tags: [],       // parse if feed has categories
    published_at: item.isoDate || new Date().toISOString()
  };
}
