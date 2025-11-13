import 'dotenv/config'
import fs from 'fs'

const PUBLIC_BASE = process.env.PUBLIC_BASE

function parsePairs(envVal) {
  const out = {}
  for (const part of (envVal || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const [k, ...rest] = part.split('=')
    out[k.trim()] = rest.join('=').trim()
  }
  return out
}

export const ACTORS = (() => {
  const map = parsePairs(process.env.ACTORS) // username => Display Name

  const out = {}
  for (const [username, displayName] of Object.entries(map)) {
    const keyEnvVar = `${username.toUpperCase()}_PUBLIC_KEY_PATH`
    let publicKeyPem = null

    if (process.env[keyEnvVar]) {
      try {
        publicKeyPem = fs.readFileSync(process.env[keyEnvVar], 'utf8')
      } catch (err) {
        console.error(`Failed to read public key for ${username}:`, err)
      }
    }

    out[username] = {
      username,
      name: displayName || username,
      id: `${PUBLIC_BASE}/actors/${username}`,
      inbox: `${PUBLIC_BASE}/inbox`,
      outbox: `${PUBLIC_BASE}/actors/${username}/outbox`,
      publicKeyPem
    }
  }

  return out
})()

export const SCOPE_ACTOR = parsePairs(process.env.SCOPE_ACTOR)
export const PUBLIC = { BASE: PUBLIC_BASE }
