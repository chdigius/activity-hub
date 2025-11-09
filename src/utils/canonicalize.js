import crypto from 'crypto';

export function canonicalizeEventPayload(payload) {
  // Keep keys stable, drop obviously variable fields
  const stable = {
    kind: payload.kind,
    scope: payload.scope,
    source: payload.source,
    title: payload.title || '',
    summary: payload.summary || '',
    content_html: payload.content_html || '',
    url: payload.url,
    media: payload.media || [],
    tags: payload.tags || []
  };
  return JSON.stringify(stable);
}

export function fingerprint(payload) {
  const canon = canonicalizeEventPayload(payload);
  return crypto.createHash('sha256').update(canon).digest('hex');
}
