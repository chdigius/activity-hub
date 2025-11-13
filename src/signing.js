// signing.js
import crypto from 'crypto'
import fs from 'fs'

const CHDIGIUS_PRIVATE_KEY_PEM = fs.readFileSync(process.env.CHDIGIUS_PRIVATE_KEY_PATH, 'utf8')

export function signRequest(url, body, actorId) {
  const parsed = new URL(url)
  const date = new Date().toUTCString()

  const digest = crypto
    .createHash('sha256')
    .update(body)
    .digest('base64')

  const digestHeader = `SHA-256=${digest}`

  const signingString =
    `(request-target): post ${parsed.pathname}\n` +
    `host: ${parsed.host}\n` +
    `date: ${date}\n` +
    `digest: ${digestHeader}`

  const signature = crypto.sign(
    'sha256',
    Buffer.from(signingString),
    CHDIGIUS_PRIVATE_KEY_PEM
  ).toString('base64')

  const keyId = `${actorId}#main-key`

  const signatureHeader =
    `keyId="${keyId}",` +
    `algorithm="rsa-sha256",` +
    `headers="(request-target) host date digest",` +
    `signature="${signature}"`

  return {
    'Host': parsed.host,
    'Date': date,
    'Digest': digestHeader,
    'Signature': signatureHeader,
    'Content-Type': 'application/activity+json'
  }
}
