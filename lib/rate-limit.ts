// S7: counts wrong passwords per key and overall within a time window.
//
// The key is the first X-Forwarded-For value. On direct requests to EventScorer the
// client can set that header (Next only fills it when it is missing, and Next 16
// route handlers have no socket address), so the per-key limit only separates
// honest clients; the global cap is the real bound on guessing. An admin who has
// already unlocked is never checked against it (see update-auth.ts).
//
// No imports, so tests can load this file directly.

export type LimitVerdict = { allowed: boolean; retryAfterMs: number }

export type FailureLimiter = {
	check(key: string, now: number): LimitVerdict
	recordFailure(key: string, now: number): void
	reset(key: string): void
}

export function createFailureLimiter({ maxPerKey, maxGlobal, windowMs }: { maxPerKey: number; maxGlobal: number; windowMs: number }): FailureLimiter {
	const perKey = new Map<string, number[]>()
	let global: number[] = []

	const recent = (times: number[], now: number) => times.filter((t) => now - t < windowMs)

	function check(key: string, now: number): LimitVerdict {
		global = recent(global, now)
		const mine = recent(perKey.get(key) ?? [], now)
		if (mine.length) perKey.set(key, mine)
		else perKey.delete(key)
		let retryAfterMs = 0
		if (mine.length >= maxPerKey) retryAfterMs = Math.max(retryAfterMs, mine[mine.length - maxPerKey] + windowMs - now)
		if (global.length >= maxGlobal) retryAfterMs = Math.max(retryAfterMs, global[global.length - maxGlobal] + windowMs - now)
		return retryAfterMs > 0 ? { allowed: false, retryAfterMs } : { allowed: true, retryAfterMs: 0 }
	}

	function recordFailure(key: string, now: number): void {
		const mine = recent(perKey.get(key) ?? [], now)
		mine.push(now)
		perKey.set(key, mine)
		global = recent(global, now)
		global.push(now)
	}

	function reset(key: string): void {
		perKey.delete(key)
	}

	return { check, recordFailure, reset }
}
