// src/destinations/linkedin.js
import axios from 'axios';

const client = axios.create();
client.interceptors.request.use((cfg) => {
  // Debug: show final headers that will be sent
  const h = cfg.headers || {};
  console.log('[linkedin] request headers debug', {
    linkedInVersion: h['LinkedIn-Version'] || h['linkedin-version'] || h['Linkedin-Version'],
    xRestli: h['X-Restli-Protocol-Version'],
    contentType: h['Content-Type'],
    accept: h['Accept']
  });
  return cfg;
});

export async function postToLinkedIn(event) {
  const enabled = process.env.LINKEDIN_ENABLED === 'true';
  if (!enabled) return;

  const token = process.env.LINKEDIN_TOKEN;
  const authorUrn = process.env.LINKEDIN_MEMBER_URN;
  if (!token || !authorUrn) throw new Error('LinkedIn env not configured');

  // Normalize version: accept 202511 or 20251101; coerce to YYYYMM
  const raw = (process.env.LINKEDIN_API_VERSION || '').trim();
  let apiVersion = raw;
  if (/^\d{8}$/.test(apiVersion)) apiVersion = apiVersion.slice(0, 6);
  if (!/^\d{6}$/.test(apiVersion)) {
    // fallback to current month
    apiVersion = new Date().toISOString().slice(0, 7).replace('-', ''); // YYYYMM
  }

  const summary = (event.summary || '').slice(0, 240);
  const caption = `🚀 ${event.title}\n\n${summary}\n\n${event.url}`.trim();

  const body = {
    author: authorUrn,
    commentary: caption,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED' },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
    content: { article: { source: event.url, title: event.title } }
  };

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
    'LinkedIn-Version': apiVersion, // MUST be YYYYMM
    Accept: 'application/json'
  };

  console.log('[linkedin] → posting', {
    event_id: event.id,
    author: authorUrn,
    apiVersion
  });

  const res = await client.post('https://api.linkedin.com/rest/posts', body, {
    headers,
    timeout: 15000,
    validateStatus: () => true
  });

  if (res.status >= 200 && res.status < 300) {
    console.log('[linkedin] ✓ OK', { status: res.status, id: res.data?.id || null });
    return res.data;
  }

  console.error('[linkedin] ✗ ERROR', { status: res.status, data: res.data });
  const err = new Error(`LinkedIn API error ${res.status}`);
  err.response = { status: res.status, data: res.data };
  throw err;
}
