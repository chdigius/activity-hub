# activity-hub

**Underground broadcast daemon** — RSS ingestion → multi-platform delivery

A lightweight, self-hosted content distribution system that pulls from RSS feeds and broadcasts to ActivityPub (Mastodon/fediverse) and LinkedIn.

---

## Architecture

```
RSS Feeds → Ingestor → Events DB → Queue → Worker → Destinations
                                              ├─> ActivityPub (outbox)
                                              └─> LinkedIn API
```

### Core Components

**`src/server.js`** — Fastify HTTP server
- ActivityPub protocol endpoints (`/actors`, `/outbox`, `/.well-known/webfinger`)
- Webhook trigger for manual feed refresh (`POST /hook/refresh`)
- Health check endpoint

**`src/worker.js`** — RSS ingestion script
- Parses `FEEDS` env var (format: `scope=url,scope=url`)
- Normalizes RSS items into canonical event schema
- Deduplicates via content fingerprinting
- Enqueues deliveries for each new event

**`src/queue.js`** — Delivery daemon loop
- Polls `deliveries` table every 60s
- Routes to destination handlers (ActivityPub, LinkedIn)
- Exponential backoff retry logic (1m → 5m → 30m → 6h → 24h)
- Marks deliveries as `ok` or `failed` after 5 attempts

**`src/db.js`** — SQLite schema
- `events` — canonical content items (deduped by fingerprint)
- `deliveries` — outbound queue with retry state
- `outbox` — ActivityPub activities for federation

### Destinations

**ActivityPub** (`src/destinations/activitypub.js`)
- Writes `Create` activities to local outbox
- Maps scopes to actors via `SCOPE_ACTOR` config
- Generates W3C ActivityStreams JSON

**LinkedIn** (`src/destinations/linkedin.js`)
- Posts to LinkedIn API v2 (`/rest/posts`)
- Requires `LINKEDIN_TOKEN` and `LINKEDIN_MEMBER_URN`
- Opt-in via `LINKEDIN_ENABLED=true`

---

## Setup

### Installation

```bash
npm install
```

### Environment Variables

Create `.env`:

```bash
# Server config
PUBLIC_BASE=https://activity.yourdomain.com
PORT=8080

# Actor config (multi-actor support)
ACTORS=awakehub=Awake ActivityHub,lifeware=LifewareCore
SCOPE_ACTOR=awake.fm=awakehub,lifewarecore=lifeware

# RSS feeds (scope-based routing)
FEEDS=awake.fm=https://awake.fm/feed.xml,lifewarecore=https://lifewarecore.ai/feed.xml

# LinkedIn (optional)
LINKEDIN_ENABLED=false
LINKEDIN_TOKEN=your_access_token
LINKEDIN_MEMBER_URN=urn:li:person:XXXXXXXXXX
```

### Running Locally

```bash
# Terminal 1: HTTP server
node src/server.js

# Terminal 2: Delivery worker
node src/queue.js

# Terminal 3: Manual feed ingest
node src/worker.js
```

Or with nodemon for development:

```bash
npm run dev     # server
npm run queue   # worker daemon
npm run worker  # one-shot ingest
```

### Production Deployment

Uses systemd services (see `src/systemd/`):

```bash
# Copy service files
sudo cp src/systemd/*.service /etc/systemd/system/

# Enable and start
sudo systemctl enable activityhub activityhub-worker
sudo systemctl start activityhub activityhub-worker

# Check status
sudo systemctl status activityhub
```

---

## Usage

### Manual Feed Refresh

Trigger ingestion via webhook:

```bash
curl -X POST https://activity.yourdomain.com/hook/refresh
```

### Monitoring

Check delivery queue:

```bash
sqlite3 activityhub.db "SELECT * FROM deliveries WHERE status='pending'"
```

View outbox activities:

```bash
sqlite3 activityhub.db "SELECT * FROM outbox ORDER BY published_at DESC LIMIT 10"
```

### ActivityPub Federation

Your actor will be discoverable at:
- Actor: `https://activity.yourdomain.com/actors/<actor_id>`
- Webfinger: `acct:<actor_id>@activity.yourdomain.com`
- Outbox: `https://activity.yourdomain.com/actors/<actor_id>/outbox`

Follow from any Mastodon/fediverse instance!

---

## Tech Stack

- **Runtime:** Node.js (ES modules)
- **HTTP:** Fastify
- **Database:** better-sqlite3 (WAL mode)
- **RSS:** rss-parser
- **IDs:** ULID
- **Process:** systemd (production)

---

## Roadmap

- [ ] HTTP signature verification for inbox
- [ ] Followers collection + targeted delivery
- [ ] Media attachment support (images, videos)
- [ ] More destinations (Bluesky, Threads, X/Twitter)
- [ ] Web UI for queue monitoring

---

## License

ISC
