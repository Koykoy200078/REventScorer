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

export interface DirectRatingStrandNode {
	label: string
	value: string
	children?: DirectRatingStrandNode[]
}

export interface DirectRatingTrackStrandTree {
	track: string
	nodes: DirectRatingStrandNode[]
}

export interface DirectRatingStrandOption {
	value: string
	label: string
	depth: number
	hasChildren: boolean
}

export interface DirectRatingTrackStrandOptionGroup {
	track: string
	options: DirectRatingStrandOption[]
}

export interface DirectRatingStrandSelectOption {
	value: string
	label: string
}

export interface DirectRatingStrandSelectGroup {
	label: string
	options: DirectRatingStrandSelectOption[]
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

function strandNode(label: string, children: DirectRatingStrandNode[] = []): DirectRatingStrandNode {
	return children.length > 0 ? { label, value: label, children } : { label, value: label }
}

export const DIRECT_RATING_TRACK_STRAND_TREE: DirectRatingTrackStrandTree[] = [
	{
		track: 'Academic Track',
		nodes: [strandNode('Accountancy, Business and Management (ABM)'), strandNode('Science, Technology, Engineering, and Mathematics (STEM)'), strandNode('Humanities and Social Sciences (HUMSS)'), strandNode('General Academic Strand (GAS)')],
	},
	{
		track: 'Technical-Vocational-Livelihood (TVL) Track',
		nodes: [
			strandNode('Agri-Fishery Arts (AFA)', [
				strandNode('Aquaculture - Fish Culture (AFA)'),
				strandNode('Horticulture - Horticulture (AFA)'),
				strandNode('Agricultural Crops Production (AFA)'),
				strandNode('Animal Health Care Management (AFA)'),
				strandNode('Animal Production (AFA)'),
				strandNode('Artificial Insemination (AFA)'),
				strandNode('Fish Capture (AFA)'),
				strandNode('Fishing Gear Repair and Maintenance (AFA)'),
				strandNode('Fish-Products Packaging (AFA)'),
				strandNode('Fish Wharf Operation (AFA)'),
				strandNode('Food Processing (AFA)'),
				strandNode('Landscape Installation and Maintenance (AFA)'),
				strandNode('Organic Agriculture (AFA)'),
				strandNode('Pest Management (AFA)'),
				strandNode('Rice Machinery Operations (AFA)'),
				strandNode('Rubber Processing (AFA)'),
				strandNode('Rubber Production (AFA)'),
				strandNode('Slaughtering Operations (AFA)'),
			]),
			strandNode('Home Economics (HE)', [
				strandNode('Cookery (HE)'),
				strandNode('Bread & Pastry Production (HE)'),
				strandNode('Caregiving (HE)'),
				strandNode('Attractions and Theme Parks Operations with Ecotourism (HE)'),
				strandNode('Barbering (HE)'),
				strandNode('Bartending (HE)'),
				strandNode('Beauty/Nail Care (HE)'),
				strandNode('Commercial Cooking (HE)'),
				strandNode('Dressmaking (HE)'),
				strandNode('Events Management Services (HE)'),
				strandNode('Fashion Design (Apparel) (HE)'),
				strandNode('Food and Beverage Services (HE)'),
				strandNode('Front Office Services (HE)'),
				strandNode('Hairdressing  (HE)'),
				strandNode('Handicraft (HE)'),
				strandNode('Housekeeping (HE)'),
				strandNode('Local Guiding Services (HE)'),
				strandNode('Tailoring  (HE)'),
				strandNode('Tourism Promotion Services (HE)'),
				strandNode('Travel Services (HE)'),
				strandNode('Wellness Massage (HE)'),
			]),
			strandNode('Industrial Arts (IA)', [
				strandNode('Automotive Servicing (IA)'),
				strandNode('Shielded Metal Arc Welding (IA)'),
				strandNode('Electrical Installation & Maintenance (IA)'),
				strandNode('Carpentry (IA)'),
				strandNode('Construction Painting (IA)'),
				strandNode('Domestic Refrigeration and Air-conditioning (DOMRAC) Servicing (IA)'),
				strandNode('Driving (IA)'),
				strandNode('Electric Power Distribution Line Construction (IA)'),
				strandNode('Electronic Products Assembly and Servicing (IA)'),
				strandNode('Furniture Making (IA)'),
				strandNode('Instrumentation and Control Servicing (IA)'),
				strandNode('Machining (IA)'),
				strandNode('Masonry (IA)'),
				strandNode('Mechatronics Servicing (IA)'),
				strandNode('Motorcycle/Small Engine Servicing (IA)'),
				strandNode('Plumbing (IA)'),
				strandNode('Refrigeration and Air-Conditioning (Packaged Air-Conditioning Unit [PACU] / Commercial Refrigeration Equipment [CRE]) Servicing (IA)'),
				strandNode('Tile Setting (IA)'),
				strandNode('Transmission Line Installation and Maintenance (IA)'),
			]),
			strandNode('Information and Communications Technology (ICT)', [
				strandNode('Computer Systems Servicing (ICT)'),
				strandNode('Computer Programming (ICT)'),
				strandNode('Illustration (ICT)'),
				strandNode('Technical Drafting (ICT)'),
				strandNode('Contact Center Services (ICT)'),
				strandNode('Animation (ICT)'),
				strandNode('Medical Transcription (ICT)'),
			]),
			strandNode('Maritime', [strandNode('Maritime Deck/Engine - Basic Safety / Ratings NCs (Maritime)')]),
		],
	},
	{
		track: 'Sports Track',
		nodes: [strandNode('Sports Track')],
	},
	{
		track: 'Arts and Design Track',
		nodes: [strandNode('Arts and Design Track')],
	},
]

function flattenStrandNodes(nodes: DirectRatingStrandNode[]): string[] {
	const result: string[] = []

	for (const node of nodes) {
		result.push(node.value)
		if (node.children && node.children.length > 0) {
			result.push(...flattenStrandNodes(node.children))
		}
	}

	return result
}

function flattenStrandNodesWithDepth(nodes: DirectRatingStrandNode[], depth = 0): DirectRatingStrandOption[] {
	const result: DirectRatingStrandOption[] = []

	for (const node of nodes) {
		const children = node.children ?? []
		const hasChildren = children.length > 0
		result.push({ value: node.value, label: node.label, depth, hasChildren })
		if (hasChildren) {
			result.push(...flattenStrandNodesWithDepth(children, depth + 1))
		}
	}

	return result
}

function flattenLeafNodes(nodes: DirectRatingStrandNode[]): DirectRatingStrandSelectOption[] {
	const result: DirectRatingStrandSelectOption[] = []

	for (const node of nodes) {
		if (node.children && node.children.length > 0) {
			result.push(...flattenLeafNodes(node.children))
		} else {
			result.push({ value: node.value, label: node.label })
		}
	}

	return result
}

function buildStrandSelectGroups(tree: DirectRatingTrackStrandTree[]): DirectRatingStrandSelectGroup[] {
	const groups: DirectRatingStrandSelectGroup[] = []

	for (const group of tree) {
		const leafOptions: DirectRatingStrandSelectOption[] = []
		const nestedGroups: DirectRatingStrandSelectGroup[] = []

		for (const node of group.nodes) {
			if (node.children && node.children.length > 0) {
				const childOptions = flattenLeafNodes(node.children)
				if (childOptions.length > 0) {
					nestedGroups.push({ label: `${group.track} - ${node.label}`, options: childOptions })
				}
			} else {
				leafOptions.push({ value: node.value, label: node.label })
			}
		}

		if (leafOptions.length > 0) {
			groups.push({ label: group.track, options: leafOptions })
		}
		groups.push(...nestedGroups)
	}

	return groups
}

export const DIRECT_RATING_TRACK_STRAND_OPTION_GROUPS: DirectRatingTrackStrandOptionGroup[] = DIRECT_RATING_TRACK_STRAND_TREE.map((group) => ({
	track: group.track,
	options: flattenStrandNodesWithDepth(group.nodes),
}))

export const DIRECT_RATING_STRAND_SELECT_GROUPS: DirectRatingStrandSelectGroup[] = buildStrandSelectGroups(DIRECT_RATING_TRACK_STRAND_TREE)

export const DIRECT_RATING_TRACK_STRAND_GROUPS: DirectRatingTrackStrandGroup[] = DIRECT_RATING_TRACK_STRAND_TREE.map((group) => ({
	track: group.track,
	strands: flattenStrandNodes(group.nodes),
}))

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

export function detectDirectRatingScoreFields(criteria: EventCriterion[] | CriterionLike[], configValue?: DirectRatingConfig): DirectRatingScoreField[] {
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
	const detectedFields = orderedFields.length === DIRECT_SCORE_FIELD_ORDER.length ? orderedFields : []
	return configValue ? applyDirectRatingConfigMaxScores(detectedFields, configValue) : detectedFields
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
