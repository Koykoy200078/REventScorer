import type { CriterionInput, DirectRatingConfig, DirectScoreFieldKey, EventCriterion } from '@/lib/types'

type CriterionLike = {
	subCriteria: Array<{ id?: string; name: string; maxScore: number }>
}

export interface DirectRatingScoreField {
	key: DirectScoreFieldKey
	label: string
	subCriterionId: string
	maxScore: number
}

export const DIRECT_SCORE_FIELD_ORDER: DirectScoreFieldKey[] = ['aveGpa', 'noat', 'interview']

export const DIRECT_SCORE_FIELD_LABELS: Record<DirectScoreFieldKey, string> = {
	aveGpa: 'AVE/GPA',
	noat: 'NOAT',
	interview: 'Interview',
}

export const DIRECT_SCORE_FIELD_WEIGHTS: Record<DirectScoreFieldKey, number> = {
	aveGpa: 40,
	noat: 40,
	interview: 20,
}

export const DIRECT_SCORE_WEIGHT_TOTAL = DIRECT_SCORE_FIELD_ORDER.reduce((sum, key) => sum + DIRECT_SCORE_FIELD_WEIGHTS[key], 0)

export interface DirectRatingTrackStrandGroup {
	track: string
	strands: string[]
}

export interface DirectRatingSelectOption {
	value: string
	label: string
	track: string
}

export interface DirectRatingSelectGroup {
	label: string
	options: DirectRatingSelectOption[]
}

export const DIRECT_RATING_TRACK_STRAND_GROUPS: DirectRatingTrackStrandGroup[] = [
	{
		track: 'Academic Track',
		strands: ['Accountancy, Business and Management (ABM)', 'Science, Technology, Engineering, and Mathematics (STEM)', 'Humanities and Social Sciences (HUMSS)', 'General Academic Strand (GAS)'],
	},
	{
		track: 'Technical-Vocational-Livelihood (TVL) Track',
		strands: [
			'Agri-Fishery Arts (AFA)',
			'Aquaculture - Fish Culture (AFA)',
			'Horticulture - Horticulture (AFA)',
			'Home Economics (HE)',
			'Cookery - Cookery (HE)',
			'Bread & Pastry - Bread & Pastry Production (HE)',
			'Caregiving - Caregiving (HE)',
			'Industrial Arts (IA)',
			'Automotive Servicing - Automotive Servicing (IA)',
			'Welding - Shielded Metal Arc Welding (IA)',
			'Electrical Installation - Electrical Installation & Maintenance (IA)',
			'Information and Communications Technology (ICT)',
			'Computer Systems Servicing - Computer Systems Servicing (ICT)',
			'Programming / Web Dev - Various NCs / short courses (ICT)',
			'Maritime',
			'Maritime Deck/Engine - Basic Safety / Ratings NCs (Maritime)',
		],
	},
	{
		track: 'Sports Track',
		strands: ['Sports Track'],
	},
	{
		track: 'Arts and Design Track',
		strands: ['Arts and Design Track'],
	},
]

export const DIRECT_RATING_STRAND_OPTIONS = DIRECT_RATING_TRACK_STRAND_GROUPS.flatMap((group) => group.strands)

export const DIRECT_RATING_SELECT_GROUP_OPTIONS: DirectRatingSelectGroup[] = DIRECT_RATING_TRACK_STRAND_GROUPS.map((group) => ({
	label: group.track,
	options: group.strands.map((strand) => ({
		value: strand,
		label: strand,
		track: group.track,
	})),
}))

const DIRECT_RATING_STRAND_ALIASES: Record<string, string> = {
	'arts and design strand (performing, visual, and media arts)': 'arts and design track',
	'sports strand (athlete development, coaching, sports science electives)': 'sports track',
	'cookery - cookery (he)': 'home economics (he)',
	'bread and pastry - bread and pastry production (he)': 'home economics (he)',
	'bread & pastry - bread & pastry production (he)': 'home economics (he)',
	'caregiving - caregiving (he)': 'home economics (he)',
	'automotive servicing - automotive servicing (ia)': 'industrial arts (ia)',
	'welding - shielded metal arc welding (ia)': 'industrial arts (ia)',
	'electrical installation - electrical installation and maintenance (ia)': 'industrial arts (ia)',
	'electrical installation - electrical installation & maintenance (ia)': 'industrial arts (ia)',
	'computer systems servicing - computer systems servicing (ict)': 'information and communications technology (ict)',
	'programming and web development - various ncs / short courses (ict)': 'information and communications technology (ict)',
	'programming / web dev - various ncs / short courses (ict)': 'information and communications technology (ict)',
	'aquaculture - fish culture (afa)': 'agri-fishery arts (afa)',
	'horticulture - horticulture (afa)': 'agri-fishery arts (afa)',
	'maritime deck/engine - basic safety / ratings ncs (maritime)': 'maritime',
	'maritime (where offered)': 'maritime',
}

function normalizeStrandKey(value: string): string {
	const normalized = value.trim().toLowerCase()
	return DIRECT_RATING_STRAND_ALIASES[normalized] ?? normalized
}

export const DEFAULT_DIRECT_RATING_CONFIG: DirectRatingConfig = {
	maxScores: {
		aveGpa: 100,
		noat: 100,
		interview: 100,
	},
	scoreWeights: {
		aveGpa: DIRECT_SCORE_FIELD_WEIGHTS.aveGpa,
		noat: DIRECT_SCORE_FIELD_WEIGHTS.noat,
		interview: DIRECT_SCORE_FIELD_WEIGHTS.interview,
	},
	strandBonus: {
		singleAlignedBonusPoints: 0,
		multiAlignedBonusPoints: 0,
		singleAlignedStrands: [],
		multiAlignedStrands: [],
	},
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object'
}

function round(value: number): number {
	return Math.round(value * 1000) / 1000
}

function toPositiveNumber(value: unknown, fallback: number): number {
	const numericValue = typeof value === 'number' ? value : Number(value)
	if (!Number.isFinite(numericValue) || numericValue <= 0) {
		return fallback
	}

	return round(numericValue)
}

function toNonNegativeNumber(value: unknown, fallback: number): number {
	const numericValue = typeof value === 'number' ? value : Number(value)
	if (!Number.isFinite(numericValue) || numericValue < 0) {
		return fallback
	}

	return round(numericValue)
}

function uniqueCaseInsensitive(values: string[]): string[] {
	const result: string[] = []
	const seen = new Set<string>()

	for (const value of values) {
		const trimmed = value.trim()
		if (!trimmed) {
			continue
		}

		const key = trimmed.toLowerCase()
		if (seen.has(key)) {
			continue
		}

		seen.add(key)
		result.push(trimmed)
	}

	return result
}

function normalizeStrandArray(value: unknown, fallback: string[]): string[] {
	if (!Array.isArray(value)) {
		return [...fallback]
	}

	const normalized = value.map((item) => String(item ?? '').trim()).filter((item) => item.length > 0)
	return uniqueCaseInsensitive(normalized)
}

function normalizeScoreWeights(value: unknown, fallback: Record<DirectScoreFieldKey, number>): Record<DirectScoreFieldKey, number> {
	if (!isRecord(value)) {
		return { ...fallback }
	}

	const nextWeights: Record<DirectScoreFieldKey, number> = {
		aveGpa: toNonNegativeNumber(value.aveGpa, fallback.aveGpa),
		noat: toNonNegativeNumber(value.noat, fallback.noat),
		interview: toNonNegativeNumber(value.interview, fallback.interview),
	}

	const total = DIRECT_SCORE_FIELD_ORDER.reduce((sum, fieldKey) => sum + nextWeights[fieldKey], 0)
	if (total <= 0) {
		return { ...fallback }
	}

	return nextWeights
}

export function cloneDirectRatingConfig(config: DirectRatingConfig): DirectRatingConfig {
	const sourceWeights = config.scoreWeights ?? DIRECT_SCORE_FIELD_WEIGHTS

	return {
		maxScores: {
			aveGpa: config.maxScores.aveGpa,
			noat: config.maxScores.noat,
			interview: config.maxScores.interview,
		},
		scoreWeights: {
			aveGpa: sourceWeights.aveGpa,
			noat: sourceWeights.noat,
			interview: sourceWeights.interview,
		},
		strandBonus: {
			singleAlignedBonusPoints: config.strandBonus.singleAlignedBonusPoints,
			multiAlignedBonusPoints: config.strandBonus.multiAlignedBonusPoints,
			singleAlignedStrands: [...config.strandBonus.singleAlignedStrands],
			multiAlignedStrands: [...config.strandBonus.multiAlignedStrands],
		},
	}
}

export function normalizeDirectRatingConfig(value: unknown, fallback?: DirectRatingConfig): DirectRatingConfig {
	const base = cloneDirectRatingConfig(fallback ?? DEFAULT_DIRECT_RATING_CONFIG)

	if (!isRecord(value)) {
		return base
	}

	const maxScoresSource = isRecord(value.maxScores) ? value.maxScores : {}
	const scoreWeightsSource = isRecord(value.scoreWeights) ? value.scoreWeights : {}
	const strandBonusSource = isRecord(value.strandBonus) ? value.strandBonus : {}
	const multiAlignedStrands = normalizeStrandArray(strandBonusSource.multiAlignedStrands, base.strandBonus.multiAlignedStrands)
	const multiAlignedSet = new Set(multiAlignedStrands.map((strand) => strand.toLowerCase()))
	const singleAlignedStrands = normalizeStrandArray(strandBonusSource.singleAlignedStrands, base.strandBonus.singleAlignedStrands).filter((strand) => !multiAlignedSet.has(strand.toLowerCase()))

	return {
		maxScores: {
			aveGpa: toPositiveNumber(maxScoresSource.aveGpa, base.maxScores.aveGpa),
			noat: toPositiveNumber(maxScoresSource.noat, base.maxScores.noat),
			interview: toPositiveNumber(maxScoresSource.interview, base.maxScores.interview),
		},
		scoreWeights: normalizeScoreWeights(scoreWeightsSource, base.scoreWeights ?? DIRECT_SCORE_FIELD_WEIGHTS),
		strandBonus: {
			singleAlignedBonusPoints: toNonNegativeNumber(strandBonusSource.singleAlignedBonusPoints, base.strandBonus.singleAlignedBonusPoints),
			multiAlignedBonusPoints: toNonNegativeNumber(strandBonusSource.multiAlignedBonusPoints, base.strandBonus.multiAlignedBonusPoints),
			singleAlignedStrands,
			multiAlignedStrands,
		},
	}
}

export function directScoreWeightsFromConfig(configValue: DirectRatingConfig): Record<DirectScoreFieldKey, number> {
	const config = normalizeDirectRatingConfig(configValue)
	const sourceWeights = config.scoreWeights ?? DIRECT_SCORE_FIELD_WEIGHTS

	return {
		aveGpa: sourceWeights.aveGpa,
		noat: sourceWeights.noat,
		interview: sourceWeights.interview,
	}
}

export function directScoreWeightTotal(weights: Record<DirectScoreFieldKey, number>): number {
	return round(
		DIRECT_SCORE_FIELD_ORDER.reduce((sum, fieldKey) => {
			const weight = weights[fieldKey]
			return sum + (Number.isFinite(weight) && weight >= 0 ? weight : 0)
		}, 0),
	)
}

export function directScoreFieldKeyFromName(name: string): DirectScoreFieldKey | null {
	const normalized = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '')

	if (normalized === 'noat') {
		return 'noat'
	}

	if (normalized === 'interview') {
		return 'interview'
	}

	if (normalized === 'avegpa' || normalized === 'ave' || normalized === 'gpa' || normalized === 'averagegpa' || normalized === 'averagegradepointaverage') {
		return 'aveGpa'
	}

	return null
}

export function detectDirectRatingScoreFields(criteria: EventCriterion[] | CriterionLike[]): DirectRatingScoreField[] {
	const fieldsByKey = new Map<DirectScoreFieldKey, DirectRatingScoreField>()
	let totalSubCriteria = 0

	for (const criterion of criteria) {
		for (const subCriterion of criterion.subCriteria) {
			totalSubCriteria += 1
			const fieldKey = directScoreFieldKeyFromName(subCriterion.name)

			if (!fieldKey || fieldsByKey.has(fieldKey)) {
				return []
			}

			const fallbackMaxScore = DEFAULT_DIRECT_RATING_CONFIG.maxScores[fieldKey]
			const rawSubCriterionId = 'id' in subCriterion ? subCriterion.id : undefined
			const subCriterionId = typeof rawSubCriterionId === 'string' && rawSubCriterionId.trim().length > 0 ? rawSubCriterionId : `${fieldKey}-${totalSubCriteria}`

			fieldsByKey.set(fieldKey, {
				key: fieldKey,
				label: DIRECT_SCORE_FIELD_LABELS[fieldKey],
				subCriterionId,
				maxScore: toPositiveNumber(subCriterion.maxScore, fallbackMaxScore),
			})
		}
	}

	if (totalSubCriteria !== DIRECT_SCORE_FIELD_ORDER.length) {
		return []
	}

	const orderedFields = DIRECT_SCORE_FIELD_ORDER.map((fieldKey) => fieldsByKey.get(fieldKey)).filter((field): field is DirectRatingScoreField => Boolean(field))
	return orderedFields.length === DIRECT_SCORE_FIELD_ORDER.length ? orderedFields : []
}

export function applyDirectRatingConfigMaxScores(fields: DirectRatingScoreField[], configValue: DirectRatingConfig): DirectRatingScoreField[] {
	if (fields.length === 0) {
		return []
	}

	const config = normalizeDirectRatingConfig(configValue)
	return fields.map((field) => ({
		...field,
		maxScore: toPositiveNumber(config.maxScores[field.key], field.maxScore),
	}))
}

export function deriveDirectRatingConfigFromCriteria(criteria: EventCriterion[] | CriterionInput[]): DirectRatingConfig | null {
	const directFields = detectDirectRatingScoreFields(criteria)
	if (directFields.length !== DIRECT_SCORE_FIELD_ORDER.length) {
		return null
	}

	const config = cloneDirectRatingConfig(DEFAULT_DIRECT_RATING_CONFIG)
	for (const field of directFields) {
		config.maxScores[field.key] = toPositiveNumber(field.maxScore, config.maxScores[field.key])
	}

	return config
}

export function buildDirectRatingCriteriaFromConfig(configValue: DirectRatingConfig): CriterionInput[] {
	const config = normalizeDirectRatingConfig(configValue)

	return [
		{
			name: 'Direct Rating',
			subCriteria: DIRECT_SCORE_FIELD_ORDER.map((fieldKey) => ({
				name: DIRECT_SCORE_FIELD_LABELS[fieldKey],
				maxScore: config.maxScores[fieldKey],
			})),
		},
	]
}

export function resolveStrandAlignmentBonus(strandValue: string | undefined, configValue: DirectRatingConfig): { alignmentType: 'single' | 'multi' | null; bonusPoints: number } {
	const config = normalizeDirectRatingConfig(configValue)
	const strand = typeof strandValue === 'string' ? strandValue.trim() : ''
	if (!strand) {
		return { alignmentType: null, bonusPoints: 0 }
	}

	const normalizedStrand = normalizeStrandKey(strand)
	const multiAlignedSet = new Set(config.strandBonus.multiAlignedStrands.map((item) => normalizeStrandKey(item)))
	if (multiAlignedSet.has(normalizedStrand)) {
		return {
			alignmentType: 'multi',
			bonusPoints: config.strandBonus.multiAlignedBonusPoints,
		}
	}

	const singleAlignedSet = new Set(config.strandBonus.singleAlignedStrands.map((item) => normalizeStrandKey(item)))
	if (singleAlignedSet.has(normalizedStrand)) {
		return {
			alignmentType: 'single',
			bonusPoints: config.strandBonus.singleAlignedBonusPoints,
		}
	}

	return { alignmentType: null, bonusPoints: 0 }
}
