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
  // const apiVersion = process.env.LINKEDIN_API_VERSION || '202401'; // optional but nice

  if (!token || !authorUrn) {
    const msg = '[linkedin] Missing env: require LINKEDIN_TOKEN and LINKEDIN_MEMBER_URN';
    console.error(msg);
    throw new Error(msg);
  }

  // Compose post body (kept from your original)
  const summary = (event.summary || '').slice(0, 240);
  const caption = `🚀 ${event.title}\n\n${summary}\n\n${event.url}`.trim();

  const body = {
    author: authorUrn,                                // e.g., urn:li:person:xxxx
    commentary: caption,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED' },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
    content: {
      article: { source: event.url, title: event.title }
    }
  };

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
    // LinkedIn sometimes wants a version header for /rest/* endpoints:
    // 'LinkedIn-Version': apiVersion,
    Accept: 'application/json'
  };

  // Pre-flight log (no secrets)
  console.log('[linkedin] → posting', {
    event_id: event.id,
    title: event.title,
    author: authorUrn,
    url: event.url
  });

  try {
    const res = await axios.post('https://api.linkedin.com/rest/posts', body, {
      headers,
      timeout: 15000,
      // If you want to see the exact request on failures:
      validateStatus: () => true // we’ll handle non-2xx below for richer logs
    });

    if (res.status >= 200 && res.status < 300) {
      console.log('[linkedin] ✓ OK', {
        status: res.status,
        postId: res.data?.id || null
      });
      return res.data;
    }

    // Non-2xx: surface rich info and throw
    console.error('[linkedin] ✗ ERROR (non-2xx)', {
      status: res.status,
      data: res.data,
      headers: res.headers
    });

    // Throw a structured error so the queue stores JSON, not "[object Object]"
    const err = new Error(`LinkedIn API error ${res.status}`);
    err.response = { status: res.status, data: res.data };
    throw err;

  } catch (e) {
    // Axios/network/timeout or the structured throw above
    const status = e?.response?.status;
    const data = e?.response?.data;

    console.error('[linkedin] ✗ EXCEPTION', {
      status: status ?? 'no-status',
      message: e.message,
      data: data ?? null
    });

    // Re-throw with a JSON-serializable payload for your queue’s last_error column
    const wrapped = new Error(e.message);
    wrapped.response = { status: status ?? null, data: data ?? { message: e.message } };
    throw wrapped;
  }
}
