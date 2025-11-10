// src/worker.js
import 'dotenv/config'
import { ingestFeed } from './ingestors/rss.js'

function parseFeeds(val) {
  const map = {}
  for (const part of (val || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const [scope, ...rest] = part.split('=')
    map[scope.trim()] = rest.join('=').trim()
  }
  return map
}

// ---- config ----
const INTERVAL_MS = Math.max(30_000, Number(process.env.INGEST_INTERVAL_MS || 300_000)) // min 30s, default 5m
const JITTER_MS   = Number(process.env.INGEST_JITTER_MS || 15_000)

let running = false
let stopping = false
let timer = null

async function runOnce() {
  if (running) {
    console.log('[ingest] skip: previous run still active')
    return
  }
  running = true
  const t0 = Date.now()

  try {
    const feeds = parseFeeds(process.env.FEEDS || '')
    const entries = Object.entries(feeds) // [[scope,url], ...]

    if (!entries.length) {
      // legacy FEED_URLS fallback (single-scope heuristic)
      const list = (process.env.FEED_URLS || '').split(',').map(s => s.trim()).filter(Boolean)
      for (const url of list) {
        const scope =
          url.includes('awake.fm')   ? 'awake.fm'    :
          url.includes('lifeware')   ? 'lifewarecore':
          url.includes('awakefx')    ? 'awakefx'     :
                                       'portfolio'
        console.log('[ingest] (legacy) scope=%s url=%s', scope, url)
        await ingestFeed(url, scope)
      }
    } else {
      for (const [scope, url] of entries) {
        console.log('[ingest] scope=%s url=%s', scope, url)
        await ingestFeed(url, scope)
      }
    }

    console.log('[ingest] ✓ done in %dms', Date.now() - t0)
  } catch (err) {
    console.error('[ingest] ✗ error:', err.response?.data || err.message || err)
  } finally {
    running = false
  }
}

function scheduleNext() {
  if (stopping) return
  const jitter = Math.floor(Math.random() * JITTER_MS)
  const nextIn = INTERVAL_MS + jitter
  console.log('[ingest] next run in ~%ds (+%dms jitter)', Math.floor(nextIn / 1000), jitter)
  timer = setTimeout(async () => {
    await runOnce()
    scheduleNext()
  }, nextIn)
}

async function main() {
  console.log('[ingest] starting loop (interval=%dms, jitter<=%dms)', INTERVAL_MS, JITTER_MS)
  await runOnce()     // run immediately
  scheduleNext()      // then loop
}

// graceful shutdown
function shutdown() {
  console.log('[ingest] shutting down…')
  stopping = true
  if (timer) clearTimeout(timer)
  if (running) {
    console.log('[ingest] waiting for current run to finish…')
    const iv = setInterval(() => {
      if (!running) {
        clearInterval(iv)
        process.exit(0)
      }
    }, 250)
  } else {
    process.exit(0)
  }
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await main()
