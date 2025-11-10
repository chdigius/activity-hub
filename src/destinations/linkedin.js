// src/destinations/linkedin.js
import axios from 'axios';

export async function postToLinkedIn(event) {
  const enabled = process.env.LINKEDIN_ENABLED === 'true';
  if (!enabled) {
    console.log('[linkedin] Skipped: LINKEDIN_ENABLED is not "true"');
    return;
  }

  const token = process.env.LINKEDIN_TOKEN;
  const authorUrn = process.env.LINKEDIN_MEMBER_URN;
  if (!token || !authorUrn) {
    const msg = '[linkedin] Missing env: require LINKEDIN_TOKEN and LINKEDIN_MEMBER_URN';
    console.error(msg);
    throw new Error(msg);
  }

  // Determine LinkedIn REST API version (YYYYMM). Use env if valid, else current month.
  const envVersion = process.env.LINKEDIN_API_VERSION || '';
  const isYyyyMm = /^\d{6}$/.test(envVersion);
  const fallbackVersion = new Date().toISOString().slice(0, 7).replace('-', ''); // e.g. 202511
  const apiVersion = isYyyyMm ? envVersion : fallbackVersion;

  console.log('[linkedin] API version debug:', {
    raw_env: process.env.LINKEDIN_API_VERSION,
    envVersion,
    isYyyyMm,
    fallbackVersion,
    final_apiVersion: apiVersion
  });

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
    'LinkedIn-Version': apiVersion,      // <-- REQUIRED for /rest/*
    Accept: 'application/json'
  };

  console.log('[linkedin] → posting', {
    event_id: event.id,
    author: authorUrn,
    version: apiVersion,
    title: event.title,
    url: event.url
  });

  try {
    const res = await axios.post('https://api.linkedin.com/rest/posts', body, {
      headers,
      timeout: 15000,
      validateStatus: () => true
    });

    if (res.status >= 200 && res.status < 300) {
      console.log('[linkedin] ✓ OK', { status: res.status, postId: res.data?.id || null });
      return res.data;
    }

    console.error('[linkedin] ✗ ERROR (non-2xx)', {
      status: res.status,
      data: res.data
    });
    const err = new Error(`LinkedIn API error ${res.status}`);
    err.response = { status: res.status, data: res.data };
    throw err;

  } catch (e) {
    console.error('[linkedin] ✗ EXCEPTION', {
      status: e?.response?.status ?? 'no-status',
      message: e.message,
      data: e?.response?.data ?? null
    });
    const wrapped = new Error(e.message);
    wrapped.response = {
      status: e?.response?.status ?? null,
      data: e?.response?.data ?? { message: e.message }
    };
    throw wrapped;
  }
}
