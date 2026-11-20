import { deriveDirectRatingConfigFromCriteria, detectDirectRatingScoreFields, normalizeDirectRatingConfig } from '@/lib/direct-rating-config'
import { applicableSubCriteriaForContestant, groupSubCriteriaByMember, isIndividualCriterion, memberIndexFromLabel } from '@/lib/judge/members'
import type { DirectRatingConfig, EventContestant, EventCriterion, EventSubCriterion } from '@/lib/types'

/**
 * Which layout and view the judge page draws for a contestant, and which score cells each view
 * shows (Stage 5 Task 5, spec §1). Pure. `criteria` are the MIGRATED criteria the form scores
 * (migrateLegacyDirectRating's output).
 */

export type JudgeLayout = 'unified' | 'group' | 'individual' | 'direct'
/** The only ?view= values. */
export type JudgeView = 'unified' | 'group' | 'individual'
export type ShownView = JudgeView | 'direct'

export interface Cell {
	subCriterion: EventSubCriterion
	criterion: EventCriterion
	displayName: string
}

export interface Examinee {
	memberLabel: string
	displayLabel: string
	memberIndex: number | null
	cells: Cell[]
}

export interface ContestantCells {
	groupBlocks: Array<{ criterion: EventCriterion; cells: Cell[] }>
	examinees: Examinee[]
}

/** The form's isDirectScoreMode rule (its resolvedDirectRatingConfig and directScoreFields memos). */
export function isDirectScoreEvent(criteria: EventCriterion[], directRatingConfig?: DirectRatingConfig): boolean {
	const config = normalizeDirectRatingConfig(directRatingConfig, deriveDirectRatingConfigFromCriteria(criteria) ?? undefined)
	return detectDirectRatingScoreFields(criteria, config).length > 0
}

/** A contestant's applicable cells: one block per plain criterion, and one examinee per member label
 * merged across the individual criteria (first-appearance order; cells in criterion, then
 * sub-criterion order). Empty with no contestant. */
export function contestantCells(criteria: EventCriterion[], contestant?: EventContestant): ContestantCells {
	if (!contestant) return { groupBlocks: [], examinees: [] }

	const groupBlocks: ContestantCells['groupBlocks'] = []
	const examinees = new Map<string, Examinee>()

	for (const criterion of criteria) {
		if (!isIndividualCriterion(criterion)) {
			const cells = applicableSubCriteriaForContestant(criterion, contestant).map((subCriterion) => ({ subCriterion, criterion, displayName: subCriterion.name }))
			if (cells.length > 0) groupBlocks.push({ criterion, cells })
			continue
		}

		for (const group of groupSubCriteriaByMember(criterion.subCriteria, contestant)) {
			let examinee = examinees.get(group.memberLabel)
			if (!examinee) {
				examinee = { memberLabel: group.memberLabel, displayLabel: group.memberDisplayLabel, memberIndex: memberIndexFromLabel(group.memberLabel), cells: [] }
				examinees.set(group.memberLabel, examinee)
			}
			for (const item of group.items) examinee.cells.push({ subCriterion: item.subCriterion, criterion, displayName: item.displayName })
		}
	}

	return { groupBlocks, examinees: Array.from(examinees.values()) }
}

/** Ruling R1: direct-rating events are direct; every individual entry is Individual only; a team with
 * group and member cells is Unified; a team with member cells only is Individual only; everything
 * else (no cells at all included) is Group only. */
export function resolveJudgeLayout(event: { criteria: EventCriterion[]; directRatingConfig?: DirectRatingConfig }, contestant?: EventContestant): JudgeLayout {
	if (isDirectScoreEvent(event.criteria, event.directRatingConfig)) return 'direct'
	if (contestant?.entryType === 'individual') return 'individual'
	const { groupBlocks, examinees } = contestantCells(event.criteria, contestant)
	const hasGroup = groupBlocks.some((block) => block.cells.length > 0)
	const hasMembers = examinees.some((examinee) => examinee.cells.length > 0)
	if (hasGroup && hasMembers) return 'unified'
	if (hasMembers) return 'individual'
	return 'group'
}

export function viewsFor(layout: JudgeLayout): JudgeView[] {
	if (layout === 'unified') return ['unified', 'group', 'individual']
	if (layout === 'group') return ['group']
	if (layout === 'individual') return ['individual']
	return []
}

/** Exactly 'unified' | 'group' | 'individual'; anything else (other case, '', 'direct', an array) is null. */
export function parseViewParam(raw: unknown): JudgeView | null {
	return raw === 'unified' || raw === 'group' || raw === 'individual' ? raw : null
}

/** The view a layout shows for the judge's preferred view: only a unified contestant has a choice. */
export function resolveView(layout: JudgeLayout, requested: JudgeView | null): ShownView {
	if (layout === 'direct') return 'direct'
	if (layout === 'unified') return requested ?? 'unified'
	return layout
}

/** `search` with ?view= set for `view`, or removed for 'unified'; every other key kept. Returns '' or '?…'. */
export function withViewParam(search: string, view: JudgeView): string {
	const params = new URLSearchParams(search)
	if (view === 'unified') params.delete('view')
	else params.set('view', view)
	const text = params.toString()
	return text ? `?${text}` : ''
}

/** The examinee with the wanted member label, else the first one. */
export function selectedExaminee(cells: ContestantCells, wanted?: string): Examinee | undefined {
	return cells.examinees.find((examinee) => examinee.memberLabel === wanted) ?? cells.examinees[0]
}

function groupIds(cells: ContestantCells): string[] {
	return cells.groupBlocks.flatMap((block) => block.cells.map((cell) => cell.subCriterion.id))
}

/** The score cells a view mounts, in display order (spec §1 "What each view shows"). */
export function visibleCells(cells: ContestantCells, layout: JudgeLayout, view: ShownView, examinee: string | undefined, directFieldIds: string[]): string[] {
	if (layout === 'direct' || view === 'direct') return [...directFieldIds]
	const selected = selectedExaminee(cells, examinee)
	const memberIds = selected ? selected.cells.map((cell) => cell.subCriterion.id) : []
	if (layout === 'unified') {
		if (view === 'group') return groupIds(cells)
		if (view === 'individual') return memberIds
		return [...memberIds, ...groupIds(cells)]
	}
	if (layout === 'individual') return [...memberIds, ...groupIds(cells)]
	return groupIds(cells)
}

/** How to bring a cell into view: the view to switch to (null: none) and the examinee to select. */
export function revealTarget(cells: ContestantCells, layout: JudgeLayout, view: ShownView, subCriterionId: string): { view: JudgeView | null; memberLabel?: string } {
	if (groupIds(cells).includes(subCriterionId)) {
		return { view: layout === 'unified' && view === 'individual' ? 'unified' : null }
	}
	const examinee = cells.examinees.find((candidate) => candidate.cells.some((cell) => cell.subCriterion.id === subCriterionId))
	if (!examinee) return { view: null }
	return { view: layout === 'unified' && view === 'group' ? 'unified' : null, memberLabel: examinee.memberLabel }
}
