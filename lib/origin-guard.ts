// S2 for EventScorer's own routes: a write is accepted only from EventScorer's own
// pages, or with no Origin at all (server-to-server; the ShareME backend's proxy
// forwards no Origin and enforces the same rules itself). Same rules as the
// backend's lib/origin-guard.js; tests/fixtures/origin-cases.json pins both.
//
// This is a per-route check on purpose: a Next proxy.ts would buffer request bodies
// and silently cut them at 10 MB (database imports). Imports only node:os, so tests
// can load this file directly.
import os from 'node:os'

export const ORIGIN_REFUSAL = "Request refused: it did not come from this app's own pages."

type OsLike = { hostname(): string; networkInterfaces(): Record<string, Array<{ family: string | number; address: string }> | undefined> }
type RequestLike = { method: string; headers: { get(name: string): string | null } }
type EnvLike = Record<string, string | undefined>

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]']
const CACHE_MS = 10000

let cachedHosts: Set<string> | null = null
let cachedAt = 0

function machineHosts(osImpl: OsLike): Set<string> {
	// The real os module is cached for 10 s (a new DHCP address is picked up); an
	// injected one (tests) is read every time.
	const useCache = osImpl === (os as unknown as OsLike)
	if (useCache && cachedHosts && Date.now() - cachedAt < CACHE_MS) return cachedHosts
	const hosts = new Set<string>()
	try {
		const name = String(osImpl.hostname() || '').trim().toLowerCase()
		if (name) hosts.add(name)
		for (const list of Object.values(osImpl.networkInterfaces() || {})) {
			for (const iface of list || []) {
				if (iface && (iface.family === 'IPv4' || iface.family === 4) && iface.address) hosts.add(String(iface.address).toLowerCase())
			}
		}
	} catch {
		/* keep whatever was found */
	}
	if (useCache) {
		cachedHosts = hosts
		cachedAt = Date.now()
	}
	return hosts
}

function parsePort(value: string | undefined): number | null {
	const n = Number.parseInt(String(value ?? ''), 10)
	return Number.isFinite(n) && n > 0 ? n : null
}

export function isAllowedOrigin(origin: string, env: EnvLike = process.env, osImpl: OsLike = os as unknown as OsLike): boolean {
	if (!origin || origin === 'null') return false
	let url: URL
	try {
		url = new URL(origin)
	} catch {
		return false
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
	if (origin.toLowerCase() !== url.origin.toLowerCase()) return false

	const exactOrigins = new Set<string>()
	const hosts = new Set<string>(LOOPBACK_HOSTS)
	const serverIp = String(env.SERVER_IP ?? '').trim().toLowerCase()
	if (serverIp) hosts.add(serverIp)
	for (const raw of String(env.ALLOWED_ORIGINS ?? '').split(',')) {
		const entry = raw.trim()
		if (!entry) continue
		if (entry.includes('://')) {
			try {
				exactOrigins.add(new URL(entry).origin.toLowerCase())
			} catch {
				/* ignore an entry that is not a URL */
			}
		} else {
			hosts.add(entry.toLowerCase())
		}
	}
	if (exactOrigins.has(url.origin.toLowerCase())) return true

	const ownPort = parsePort(env.PORT) ?? parsePort(env.EVENTSCORER_PORT) ?? 3001
	const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80))
	if (port !== ownPort) return false
	const host = url.hostname.toLowerCase()
	return hosts.has(host) || machineHosts(osImpl).has(host)
}

export function checkRequestOrigin(request: RequestLike, env: EnvLike = process.env, osImpl: OsLike = os as unknown as OsLike): { ok: true } | { ok: false; reason: string } {
	if (READ_METHODS.has(String(request.method || '').toUpperCase())) return { ok: true }
	if (request.headers.get('sec-fetch-site') === 'cross-site') return { ok: false, reason: 'cross-site request' }
	const origin = request.headers.get('origin')
	if (origin === null) return { ok: true } // server to server
	if (origin === 'null') return { ok: false, reason: 'opaque origin' }
	if (isAllowedOrigin(origin, env, osImpl)) return { ok: true }
	return { ok: false, reason: 'origin not allowed' }
}

// For route handlers: the 403 Response to return, or null when the request may proceed.
export function refuseUnlessOwnOrigin(request: RequestLike): Response | null {
	const verdict = checkRequestOrigin(request)
	if (verdict.ok) return null
	return Response.json({ error: ORIGIN_REFUSAL }, { status: 403 })
}
