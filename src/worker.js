import 'dotenv/config';
import { ingestFeed } from './ingestors/rss.js';

async function main() {
  const list = (process.env.FEED_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const url of list) {
    const scope = url.includes('awake.fm') ? 'awake.fm' : url.includes('lifeware') ? 'lifewarecore' : url.includes('awakefx') ? 'awakefx' : 'portfolio';
    try {
      await ingestFeed(url, scope);
      console.log('Ingested:', url);
    } catch (e) {
      console.error('Ingest error:', url, e.message);
    }
  }
}

await main();
