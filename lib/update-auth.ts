import 'server-only'

import crypto from 'node:crypto'

import { createFailureLimiter, type FailureLimiter } from '@/lib/rate-limit'
import { signUpdateAuthToken, UPDATE_AUTH_TTL_MS, verifyUpdateAuthToken } from '@/lib/update-auth-token'

export const UPDATE_AUTH_COOKIE_NAME = 'eventscorer_update_auth'
const UPDATE_AUTH_COOKIE_MAX_AGE_SECONDS = Math.floor(UPDATE_AUTH_TTL_MS / 1000)

// S7: per-process signing key (kept on globalThis so dev hot reloads keep it) and
// the shared password-guess limiter.
type AuthGlobals = { __eventScorerUpdateAuthKey?: Buffer; __eventScorerAuthLimiter?: FailureLimiter }
const authGlobals = globalThis as typeof globalThis & AuthGlobals

function getSigningKey(): Buffer {
	if (!authGlobals.__eventScorerUpdateAuthKey) authGlobals.__eventScorerUpdateAuthKey = crypto.randomBytes(32)
	return authGlobals.__eventScorerUpdateAuthKey
}

export function getAuthLimiter(): FailureLimiter {
	if (!authGlobals.__eventScorerAuthLimiter) {
		authGlobals.__eventScorerAuthLimiter = createFailureLimiter({ maxPerKey: 5, maxGlobal: 50, windowMs: 15 * 60 * 1000 })
	}
	return authGlobals.__eventScorerAuthLimiter
}

function getUpdatePassword(): string {
	return (process.env.EVENTSCORER_UPDATE_PASSWORD ?? '').trim()
}

export function hasUpdatePasswordConfigured(): boolean {
	return getUpdatePassword().length > 0
}

function timingSafeEqualStrings(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left)
	const rightBuffer = Buffer.from(right)

	if (leftBuffer.length !== rightBuffer.length) {
		const maxLength = Math.max(leftBuffer.length, rightBuffer.length)
		const paddedLeft = Buffer.concat([leftBuffer, Buffer.alloc(maxLength - leftBuffer.length)])
		const paddedRight = Buffer.concat([rightBuffer, Buffer.alloc(maxLength - rightBuffer.length)])
		crypto.timingSafeEqual(paddedLeft, paddedRight)
		return false
	}

	return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

// A missing, null or non-string candidate (a File from a form, for example) is
// simply wrong: it never throws, so callers answer 401 instead of 500.
export function verifyUpdatePassword(candidate: unknown): boolean {
	const password = getUpdatePassword()
	if (!password || typeof candidate !== 'string') {
		return false
	}

	return timingSafeEqualStrings(candidate, password)
}

export function getUpdateAuthCookieValue(): string | null {
	const password = getUpdatePassword()
	if (!password) {
		return null
	}

	return signUpdateAuthToken(password, getSigningKey(), Date.now())
}

export function verifyUpdateAuthCookieValue(value: string | undefined | null): boolean {
	const password = getUpdatePassword()
	if (!password || !value) {
		return false
	}

	return verifyUpdateAuthToken(value, password, getSigningKey(), Date.now())
}

// True when the request carries a valid admin cookie (for route handlers that only
// have the Request; pages and others can use cookies() from next/headers).
export function isUnlockedRequest(request: Request): boolean {
	const header = request.headers.get('cookie') ?? ''
	for (const part of header.split(';')) {
		const [name, ...rest] = part.trim().split('=')
		if (name === UPDATE_AUTH_COOKIE_NAME) {
			let value = rest.join('=')
			try {
				value = decodeURIComponent(value)
			} catch {
				/* keep the raw value */
			}
			if (verifyUpdateAuthCookieValue(value)) return true
		}
	}
	return false
}

// The limiter key: the first X-Forwarded-For value (client-controlled on direct
// requests; see lib/rate-limit.ts), else 'unknown'.
export function limiterKeyFor(request: Request): string {
	const first = (request.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim()
	return first || 'unknown'
}

export function tooManyAttemptsResponse(retryAfterMs: number): Response {
	const minutes = Math.max(1, Math.ceil(retryAfterMs / 60000))
	return Response.json(
		{ error: `Too many attempts. Try again in ${minutes} minutes.` },
		{ status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } },
	)
}

// For routes that take the password in their own body (export, import): an
// unlocked admin passes; otherwise the limiter and the password decide. Returns
// the refusal Response, or null when the request may proceed.
export function authorizeAdminRequest(request: Request, candidate: unknown): Response | null {
	if (isUnlockedRequest(request)) return null
	const limiter = getAuthLimiter()
	const key = limiterKeyFor(request)
	const verdict = limiter.check(key, Date.now())
	if (!verdict.allowed) return tooManyAttemptsResponse(verdict.retryAfterMs)
	if (!verifyUpdatePassword(candidate)) {
		limiter.recordFailure(key, Date.now())
		return Response.json({ error: 'Unauthorized.' }, { status: 401 })
	}
	limiter.reset(key)
	return null
}

type UpdateAuthCookieOverrides = {
	secure?: boolean
}

export function getUpdateAuthCookieOptions(overrides: UpdateAuthCookieOverrides = {}) {
	return {
		name: UPDATE_AUTH_COOKIE_NAME,
		value: getUpdateAuthCookieValue() ?? '',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: overrides.secure ?? process.env.NODE_ENV === 'production',
		path: '/',
		maxAge: UPDATE_AUTH_COOKIE_MAX_AGE_SECONDS,
	}
}
