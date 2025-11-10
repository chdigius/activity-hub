import 'dotenv/config'
import { ingestFeed } from './ingestors/rss.js'

function parseFeeds(val) {
  const map = {}
  for (const part of (val || '').split(',').map(s=>s.trim()).filter(Boolean)) {
    const [scope, ...rest] = part.split('=')
    map[scope.trim()] = rest.join('=').trim()
  }
  return map
}

async function main() {
  const feeds = parseFeeds(process.env.FEEDS || '')
  const entries = Object.entries(feeds) // [[scope, url], ...]
  if (!entries.length) {
    // fallback to old FEED_URLS behavior (single scope heuristic)
    const list = (process.env.FEED_URLS || '').split(',').map(s=>s.trim()).filter(Boolean)
    for (const url of list) {
      const scope = url.includes('awake.fm') ? 'awake.fm'
        : url.includes('lifeware') ? 'lifewarecore'
        : url.includes('awakefx') ? 'awakefx'
        : 'portfolio'
      await ingestFeed(url, scope)
    }
    return
  }

  for (const [scope, url] of entries) {
    await ingestFeed(url, scope)
  }
}

await main()
