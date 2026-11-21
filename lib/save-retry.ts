// Phase 3 Task 13 (S5, S6): which refused uploads a queue keeps for a later try. A network error, a
// server error (5xx), a missing or refused sign-in (401, 403), a timeout (408) and too many requests
// (429) can go through later, so the item stays; any other 4xx is a permanent refusal.
export function shouldKeepQueued(status: number | null, isNetworkError: boolean): boolean {
	if (isNetworkError) return true
	if (status === null) return false
	return status >= 500 || status === 401 || status === 403 || status === 408 || status === 429
}
