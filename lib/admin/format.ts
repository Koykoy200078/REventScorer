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

export function roundAnalytics(value: number): number {
	return Math.round(value * 1000) / 1000
}
