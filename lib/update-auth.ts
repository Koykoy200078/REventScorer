import 'server-only'

import crypto from 'node:crypto'

export const UPDATE_AUTH_COOKIE_NAME = 'eventscorer_update_auth'
const UPDATE_AUTH_COOKIE_SALT = 'eventscorer:update-auth:v1'
const UPDATE_AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8

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

function buildUpdateAuthToken(password: string): string {
	return crypto.createHmac('sha256', password).update(UPDATE_AUTH_COOKIE_SALT).digest('hex')
}

export function verifyUpdatePassword(candidate: string): boolean {
	const password = getUpdatePassword()
	if (!password) {
		return false
	}

	return timingSafeEqualStrings(candidate, password)
}

export function getUpdateAuthCookieValue(): string | null {
	const password = getUpdatePassword()
	if (!password) {
		return null
	}

	return buildUpdateAuthToken(password)
}

export function verifyUpdateAuthCookieValue(value: string | undefined | null): boolean {
	const expected = getUpdateAuthCookieValue()
	if (!expected || !value) {
		return false
	}

	return timingSafeEqualStrings(value, expected)
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
