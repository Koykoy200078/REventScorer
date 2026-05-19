import type { RubricLegendItem } from '@/lib/types'

export const DEFAULT_RUBRIC_LEGEND: RubricLegendItem[] = [
	{ score: 4, label: 'Excellent' },
	{ score: 3, label: 'Exceeds Expectations' },
	{ score: 2, label: 'Meets Expectations' },
	{ score: 1, label: 'Meets Expectations Sometimes' },
	{ score: 0, label: 'Does Not Meet Expectations' },
]

function compactWhitespace(value: string): string {
	return value.trim().replace(/\s+/g, ' ')
}

function roundLegendScore(value: number): number {
	return Math.round(value * 1000) / 1000
}

export function formatLegendScore(value: number): string {
	if (Number.isInteger(value)) {
		return String(value)
	}

	return value
		.toFixed(3)
		.replace(/\.0+$/, '')
		.replace(/(\.\d*?)0+$/, '$1')
}

export function normalizeRubricLegend(value: unknown): RubricLegendItem[] {
	if (!Array.isArray(value)) {
		return [...DEFAULT_RUBRIC_LEGEND]
	}

	const normalized = value
		.map((entry) => {
			if (!entry || typeof entry !== 'object') {
				return null
			}

			const source = entry as Partial<RubricLegendItem>
			const score = typeof source.score === 'number' ? source.score : Number(source.score)
			const label = compactWhitespace(String(source.label ?? ''))

			if (!Number.isFinite(score) || score < 0 || label.length === 0) {
				return null
			}

			return {
				score: roundLegendScore(score),
				label,
			}
		})
		.filter((entry): entry is RubricLegendItem => entry !== null)

	if (normalized.length === 0) {
		return [...DEFAULT_RUBRIC_LEGEND]
	}

	return normalized.sort((left, right) => {
		if (right.score !== left.score) {
			return right.score - left.score
		}

		return left.label.localeCompare(right.label)
	})
}

export function formatRubricLegend(legend: RubricLegendItem[]): string {
	return legend.map((item) => `${formatLegendScore(item.score)} - ${item.label}`).join(', ')
}
