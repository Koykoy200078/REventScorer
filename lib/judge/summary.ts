import { DEFAULT_DIRECT_RATING_CONFIG, deriveDirectRatingConfigFromCriteria, detectDirectRatingScoreFields, directScoreWeightsFromConfig, normalizeDirectRatingConfig } from '@/lib/direct-rating-config'
import type { ContestantCells, JudgeLayout, ShownView } from '@/lib/judge/layout'
import { isDirectScoreEvent } from '@/lib/judge/layout'
import { entryMaxScore, isIndividualCriterion } from '@/lib/judge/members'
import { parseAndClampScore, round } from '@/lib/judge/score-input'
import { compileEventResults } from '@/lib/scoring'
import type { CompiledContestantResult, DirectRatingConfig, EventContestant, EventCriterion, EventScorer, EventScoringType, JudgeContestantDetails } from '@/lib/types'

/**
 * "Your preview" and the dock's figures (Stage 5 Task 5, spec §4.3-4.6). The preview is the admin's
 * own compileEventResults run on this judge's row alone, so it always equals what the admin shows
 * after the save when this judge is the entry's only judge.
 */

export type PreviewKind = 'total' | 'weighted' | 'direct'

export interface PreviewEvent {
	/** RAW, as the server stores them (not migrated). */
	criteria: EventCriterion[]
	/** The judge's list. */
	contestants: EventContestant[]
	directRatingConfig?: DirectRatingConfig
	eventScoringType?: EventScoringType
}

export interface PreviewInput {
	contestantId: string
	/** lib/judge/payload.ts buildContestantRow: exactly the row Save sends. */
	payloadRow: Record<string, number>
	/** What the server will hold after this save. */
	details?: JudgeContestantDetails
}

export interface PreviewScore {
	kind: PreviewKind
	/** Compile's number (3 decimals); null only when compile gives none. */
	value: number | null
	/** 100 for weighted and direct; for a total, this entry's maximum. */
	outOf: number
	result: CompiledContestantResult
	hasWeightedScores: boolean
}

/** The counted "Group Presentation" criteria: compile's exact-name rule. */
export function weightedGroupCriterionIds(criteria: EventCriterion[]): Set<string> {
	return new Set(criteria.filter((criterion) => criterion.name.trim().toLowerCase() === 'group presentation').map((criterion) => criterion.id))
}

/** A pure function of the event, the same test compileEventResults uses: 'direct' for a direct
 * rating; 'weighted' for a final oral defense with a "Group Presentation" and an individual
 * criterion; else 'total'. */
export function previewKind(event: PreviewEvent): PreviewKind {
	if (isDirectScoreEvent(event.criteria, event.directRatingConfig)) return 'direct'
	const hasFinalOralCriteria = weightedGroupCriterionIds(event.criteria).size > 0 && event.criteria.some((criterion) => isIndividualCriterion(criterion))
	const isFinalOralDefenseEvent = event.eventScoringType ? event.eventScoringType === 'final-oral-defense' : hasFinalOralCriteria
	return isFinalOralDefenseEvent && hasFinalOralCriteria ? 'weighted' : 'total'
}

/** The details the server will hold for the contestant after this save, as the route merges them:
 * the typed triple (trimmed, empty fields left out) when any field is set; otherwise the stored
 * details, which an all-empty triple does not replace (B45); undefined when neither has anything. */
export function previewDetails(current: { strand: string; remark: string; additionalInfo: string } | undefined, stored: JudgeContestantDetails | undefined): JudgeContestantDetails | undefined {
	const strand = current?.strand.trim() ?? ''
	const remark = current?.remark.trim() ?? ''
	const additionalInfo = current?.additionalInfo.trim() ?? ''
	if (strand || remark || additionalInfo) return { ...(strand ? { strand } : {}), ...(remark ? { remark } : {}), ...(additionalInfo ? { additionalInfo } : {}) }
	const hasStored = [stored?.strand, stored?.remark, stored?.additionalInfo].some((value) => (value ?? '').trim() !== '')
	return hasStored ? stored : undefined
}

/** Null-safe: null when the contestant is not in the judge's list or compile has no ranking for it. */
export function previewScore(event: PreviewEvent, judgeId: string, input: PreviewInput): PreviewScore | null {
	if (!event.contestants.some((contestant) => contestant.id === input.contestantId)) return null
	const at = '1970-01-01T00:00:00.000Z'
	const copy: EventScorer = {
		id: 'judge-preview',
		title: '',
		showRubricLegend: true,
		createdAt: at,
		criteria: event.criteria,
		contestants: event.contestants,
		directRatingConfig: event.directRatingConfig,
		eventScoringType: event.eventScoringType,
		judges: [{ id: judgeId, name: '', token: '' }],
		submissions: [
			{
				judgeId,
				submittedAt: at,
				scores: { [input.contestantId]: input.payloadRow },
				savedContestantIds: [input.contestantId],
				...(input.details ? { contestantDetails: { [input.contestantId]: input.details } } : {}),
			},
		],
	}
	const compiled = compileEventResults(copy)
	const result = compiled.rankings.find((ranking) => ranking.contestantId === input.contestantId)
	if (!result) return null
	const kind: PreviewKind = result.finalRating !== undefined ? 'direct' : compiled.hasWeightedScores ? 'weighted' : 'total'
	const value = kind === 'direct' ? (result.finalRating ?? null) : kind === 'weighted' ? (result.weightedScore ?? null) : result.averageScore
	const contestant = event.contestants.find((candidate) => candidate.id === input.contestantId)
	const outOf = kind === 'total' ? entryMaxScore(event.criteria, contestant) : 100
	return { kind, value, outOf, result, hasWeightedScores: compiled.hasWeightedScores ?? false }
}

/** A direct field's "Entered · Normalized" readout, as the old form computed it. */
export function directFieldReadouts(fields: Array<{ subCriterionId: string; maxScore: number }>, inputRow?: Record<string, string>): Array<{ subCriterionId: string; entered: number; normalizedPercent: number }> {
	return fields.map((field) => {
		const entered = parseAndClampScore(inputRow?.[field.subCriterionId] ?? '0', field.maxScore)
		return { subCriterionId: field.subCriterionId, entered, normalizedPercent: field.maxScore > 0 ? round((entered / field.maxScore) * 100) : 0 }
	})
}

/** The direct rating's weights in percent, re-weighted to 100 over the parts whose maximum is above
 * 0, exactly as compile does; null for a part the event lacks. */
export function directFormulaWeights(rawCriteria: EventCriterion[], directRatingConfig?: DirectRatingConfig): { aveGpa: number | null; noat: number | null; interview: number | null } {
	const config = normalizeDirectRatingConfig(directRatingConfig, deriveDirectRatingConfigFromCriteria(rawCriteria) ?? undefined)
	const fields = detectDirectRatingScoreFields(rawCriteria, config)
	const weights = directScoreWeightsFromConfig(directRatingConfig || DEFAULT_DIRECT_RATING_CONFIG)
	const hasPart = (keys: string[]) => fields.some((field) => keys.includes(field.key) && Number.isFinite(Number(field.maxScore)) && Number(field.maxScore) > 0)
	const interviewKeys = ['interviewContent', 'interviewComm', 'interviewPers', 'interviewInterest', 'interviewSpecial']
	const parts = {
		aveGpa: hasPart(['aveGpa']) ? weights.aveGpa : null,
		noat: hasPart(['noat']) ? weights.noat : null,
		interview: hasPart(interviewKeys) ? (weights.interviewContent || 0) + (weights.interviewComm || 0) + (weights.interviewPers || 0) + (weights.interviewInterest || 0) + (weights.interviewSpecial || 0) : null,
	}
	const present = (parts.aveGpa ?? 0) + (parts.noat ?? 0) + (parts.interview ?? 0)
	const factor = present > 0 ? 100 / present : 1
	const scale = (weight: number | null) => (weight === null ? null : round(weight * factor))
	return { aveGpa: scale(parts.aveGpa), noat: scale(parts.noat), interview: scale(parts.interview) }
}

/** In a weighted event only the "Group Presentation" blocks count toward the 60/40; any other plain
 * block is `other`. In any other event every block counts. */
export function splitGroupBlocks(blocks: ContestantCells['groupBlocks'], kind: PreviewKind, criteria: EventCriterion[]): { counted: ContestantCells['groupBlocks']; other: ContestantCells['groupBlocks'] } {
	if (kind !== 'weighted') return { counted: blocks, other: [] }
	const ids = weightedGroupCriterionIds(criteria)
	return { counted: blocks.filter((block) => ids.has(block.criterion.id)), other: blocks.filter((block) => !ids.has(block.criterion.id)) }
}

/** The sentence that says how the group part counts (null for a direct rating, which has its own line). */
export function formulaSentence(kind: PreviewKind, countedNames: string[], hasOther = false): string | null {
	if (kind === 'direct') return null
	if (kind === 'total') return "Group criteria are added to this entry's total."
	const names = countedNames.join(' and ')
	const verb = countedNames.length > 1 ? 'count' : 'counts'
	const sentence = `${names} ${verb} for 60% of this entry's preview and the individual criteria for 40%; the individual part is the members' average score against their average maximum.`
	return hasOther ? `${sentence} Other criteria are not part of the 60/40 score.` : sentence
}

export type DockFigure = 'preview' | 'group-subtotal' | 'examinee-subtotal' | 'direct'

/** The dock's headline figure and its previous / next buttons (spec §4.4, critique M2). */
export function dockMode(layout: JudgeLayout, view: ShownView, examineeCount: number): { figure: DockFigure; nav: 'examinee' | 'entry' } {
	const examineeNav = examineeCount >= 2 ? 'examinee' : 'entry'
	if (layout === 'direct' || view === 'direct') return { figure: 'direct', nav: 'entry' }
	if (layout === 'unified') {
		if (view === 'group') return { figure: 'group-subtotal', nav: 'entry' }
		if (view === 'individual') return { figure: 'examinee-subtotal', nav: examineeNav }
		return { figure: 'preview', nav: examineeNav }
	}
	if (layout === 'individual' && examineeCount >= 2) return { figure: 'examinee-subtotal', nav: 'examinee' }
	return { figure: 'preview', nav: 'entry' }
}
