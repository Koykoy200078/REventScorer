// S7: the admin cookie is a signed, expiring token instead of a fixed
// HMAC(password). Format: v1.<issuedAtMs>.<hex HMAC>. The HMAC key is a random
// per-process key (a restart logs admins out), and the signed message includes a
// hash of the password, so changing the password revokes every cookie. Nothing in
// the value lets anyone test password guesses offline.
//
// No imports beyond node:crypto, so tests can load this file directly.
import crypto from 'node:crypto'

export const UPDATE_AUTH_TTL_MS = 8 * 60 * 60 * 1000
const CLOCK_SKEW_MS = 60 * 1000

function sign(password: string, key: Buffer, issuedAt: number): string {
	const passwordHash = crypto.createHash('sha256').update(password).digest('hex')
	return crypto.createHmac('sha256', key).update(`v1|${issuedAt}|${passwordHash}`).digest('hex')
}

export function signUpdateAuthToken(password: string, key: Buffer, now: number): string {
	const issuedAt = Math.floor(now)
	return `v1.${issuedAt}.${sign(password, key, issuedAt)}`
}

export function verifyUpdateAuthToken(token: unknown, password: string, key: Buffer, now: number): boolean {
	if (typeof token !== 'string' || !password) return false
	const match = /^v1\.(\d{1,16})\.([0-9a-f]{64})$/.exec(token)
	if (!match) return false
	const issuedAt = Number(match[1])
	if (!Number.isSafeInteger(issuedAt)) return false
	if (issuedAt > now + CLOCK_SKEW_MS) return false
	if (now - issuedAt > UPDATE_AUTH_TTL_MS) return false
	const expected = Buffer.from(sign(password, key, issuedAt), 'hex')
	const given = Buffer.from(match[2], 'hex')
	return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}
