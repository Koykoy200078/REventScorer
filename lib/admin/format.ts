// Number and date formats of the admin console. Moved verbatim from components/admin-live-dashboard.tsx
// (Stage 5 Task 7 step 1).

export function formatDate(iso: string): string {
	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(iso))
}

export function formatScore(value: number): string {
	return value.toFixed(2)
}

export function formatPercent(value: number): string {
	return `${value.toFixed(2)}%`
}

/** The first letters of a name's first and last words, upper case ("Test Judge One" -> "TO"); "?" for a blank name. */
export function judgeInitials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean)
	if (words.length === 0) return '?'
	const first = words[0][0]
	const last = words.length > 1 ? words[words.length - 1][0] : ''
	return (first + last).toUpperCase()
}

export function roundAnalytics(value: number): number {
	return Math.round(value * 1000) / 1000
}
