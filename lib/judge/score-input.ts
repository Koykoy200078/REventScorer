export function round(value: number): number {
	return Math.round(value * 1000) / 1000
}

export function parseAndClampScore(rawValue: string, maxScore: number): number {
	const parsedValue = Number.parseFloat(rawValue)
	const finiteValue = Number.isFinite(parsedValue) ? parsedValue : 0
	return Math.max(0, Math.min(finiteValue, maxScore))
}

export function normalizeScoreInput(rawValue: string, maxScore: number): string {
	if (rawValue.trim() === '') {
		return ''
	}

	const parsedValue = Number.parseFloat(rawValue)
	if (!Number.isFinite(parsedValue)) {
		return '0'
	}

	if (parsedValue < 0) {
		return '0'
	}

	if (parsedValue > maxScore) {
		return String(round(maxScore))
	}

	return rawValue
}
