import 'dotenv/config'

const PUBLIC_BASE = process.env.PUBLIC_BASE

function parsePairs(envVal) {
  const out = {}
  for (const part of (envVal || '').split(',').map(s=>s.trim()).filter(Boolean)) {
    const [k, ...rest] = part.split('=')
    out[k.trim()] = rest.join('=').trim()
  }
  return out
}

export const ACTORS = (() => {
  const map = parsePairs(process.env.ACTORS) // username => Display Name
  // Build full actor objects
  const out = {}
  for (const [username, name] of Object.entries(map)) {
    out[username] = {
      username,
      name: name || username,
      id: `${PUBLIC_BASE}/actors/${username}`,
      inbox: `${PUBLIC_BASE}/inbox`,
      outbox: `${PUBLIC_BASE}/actors/${username}/outbox`
    }
  }
  return out
})()

export const SCOPE_ACTOR = parsePairs(process.env.SCOPE_ACTOR) // scope => username
export const PUBLIC = { BASE: PUBLIC_BASE }
