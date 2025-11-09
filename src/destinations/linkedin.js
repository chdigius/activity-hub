import axios from 'axios';

export async function postToLinkedIn(event) {
  const enabled = process.env.LINKEDIN_ENABLED === 'true';
  if (!enabled) return;

  const token = process.env.LINKEDIN_TOKEN;
  const authorUrn = process.env.LINKEDIN_MEMBER_URN;
  if (!token || !authorUrn) throw new Error('LinkedIn env not configured');

  const summary = (event.summary || '').slice(0, 240);
  const caption = `🚀 ${event.title}\n\n${summary}\n\n${event.url}`;

  const body = {
    author: authorUrn,
    commentary: caption,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED' },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
    content: {
      article: { source: event.url, title: event.title }
    }
  };

  await axios.post('https://api.linkedin.com/rest/posts', body, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0'
    }
  });
}
