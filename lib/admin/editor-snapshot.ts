// "Edit After Publish": the editor's snapshot of an event, its synchronised draft and the payload it
// saves. Moved verbatim from components/admin-live-dashboard.tsx (Stage 5 Task 7 step 1).

import { createEditorId } from '@/lib/admin/editor-id'
import { memberCountFromSubCriteriaNames } from '@/lib/admin/members'
import { isMemberRowName, memberIndexFromLabel, memberLabelWord, splitMemberRowName } from '@/lib/member-rows'
import { normalizeRubricLegend } from '@/lib/rubric-legend'
import type { AdminEventEditorInput, EventCriterion, EventScorer } from '@/lib/types'

export function uniqueTrimmedNames(value: string): string[] {
	const unique = new Set<string>()

	for (const entry of value.split(/[\n,]/)) {
		const trimmed = entry.trim()
		if (trimmed.length === 0) {
			continue
		}

		unique.add(trimmed)
	}

	return Array.from(unique)
}

export interface SharedSubCriterionDraft {
	id?: string
	name: string
	maxScore: number
}

// D40 (owner 2026-11-26): a criterion's rows are a member grid when every row is a member row by the shared rule
// (lib/member-rows.ts), with one label word, members 1..N, and the same wordings and maximums, in the same order, for
// every member. Only a grid is shown once in the editor and re-expanded on save, keeping its label word ("Day 2 -
// Talk" stays "Day"); any other layout passes through unchanged, with its ids.
export function memberGridOf(subCriteria: Array<{ id?: string; name: string; maxScore: number }>): { labelWord: string; memberCount: number; shared: SharedSubCriterionDraft[] } | null {
	if (!Array.isArray(subCriteria) || subCriteria.length === 0 || !subCriteria.every((subCriterion) => isMemberRowName(subCriterion.name))) {
		return null
	}

	const parsed = subCriteria.map((subCriterion) => {
		const { memberLabel, displayName } = splitMemberRowName(subCriterion.name)
		return { id: subCriterion.id, labelWord: memberLabelWord(memberLabel), index: memberIndexFromLabel(memberLabel) ?? 0, wording: displayName, maxScore: Number(subCriterion.maxScore) }
	})
	const labelWord = parsed[0].labelWord
	if (parsed.some((row) => row.labelWord !== labelWord)) {
		return null
	}

	const memberCount = Math.max(...parsed.map((row) => row.index))
	const rowsOf = (index: number) => parsed.filter((row) => row.index === index)
	const first = rowsOf(1)
	if (first.length === 0) {
		return null
	}
	for (let index = 2; index <= memberCount; index += 1) {
		const rows = rowsOf(index)
		if (rows.length !== first.length || rows.some((row, position) => row.wording.toLowerCase() !== first[position].wording.toLowerCase() || row.maxScore !== first[position].maxScore)) {
			return null
		}
	}

	return {
		labelWord,
		memberCount,
		shared: first.map((row) => ({ id: row.id, name: row.wording, maxScore: Number.isFinite(row.maxScore) ? row.maxScore : 0 })),
	}
}

export function hasMemberScopedSubCriteria(subCriteria: Array<{ name: string; maxScore?: number; id?: string }>): boolean {
	return memberGridOf(subCriteria.map((subCriterion) => ({ id: subCriterion.id, name: subCriterion.name, maxScore: Number(subCriterion.maxScore ?? 0) }))) !== null
}

export function collapseMemberScopedSubCriteria(subCriteria: Array<{ id?: string; name: string; maxScore: number }>): SharedSubCriterionDraft[] {
	const grid = memberGridOf(subCriteria)
	if (grid) {
		return grid.shared
	}

	return subCriteria.map((subCriterion) => ({
		id: subCriterion.id,
		name: subCriterion.name.trim(),
		maxScore: Number.isFinite(Number(subCriterion.maxScore)) ? Number(subCriterion.maxScore) : 0,
	}))
}

export function expectedMemberCountForEditorContestant(contestant: AdminEventEditorInput['contestants'][number]): number {
	if (contestant.entryType === 'individual') {
		return 1
	}

	const participants = Array.isArray(contestant.participants) ? contestant.participants.map((participant) => String(participant ?? '').trim()).filter((participant) => participant.length > 0) : []
	return participants.length > 0 ? participants.length : 1
}

export function maxEditorMemberCount(contestants: AdminEventEditorInput['contestants']): number {
	if (!Array.isArray(contestants) || contestants.length === 0) {
		return 1
	}

	return contestants.reduce((maxCount, contestant) => Math.max(maxCount, expectedMemberCountForEditorContestant(contestant)), 1)
}

export function criterionSubCriteriaTotalScore(subCriteria: Array<{ maxScore: number }>): number {
	return (
		Math.round(
			subCriteria.reduce((sum, subCriterion) => {
				const numericMaxScore = Number(subCriterion.maxScore)
				return sum + (Number.isFinite(numericMaxScore) ? numericMaxScore : 0)
			}, 0) * 1000,
		) / 1000
	)
}

export function criterionUsesSharedMemberExpansion(criterion: AdminEventEditorInput['criteria'][number], existingCriterion?: EventCriterion): boolean {
	// D40: an existing criterion is re-expanded only when it was a member grid; a new one also when it is named
	// "Individual Presentation" (today's create rule) or typed as a grid.
	if (existingCriterion) {
		return hasMemberScopedSubCriteria(existingCriterion.subCriteria) || hasMemberScopedSubCriteria(criterion.subCriteria)
	}

	return criterion.name.trim().toLowerCase() === 'individual presentation' || hasMemberScopedSubCriteria(criterion.subCriteria)
}

export function resolveSharedCriterionMemberCount(criterion: AdminEventEditorInput['criteria'][number], existingCriterion: EventCriterion | undefined, editorMemberCount: number): number {
	const existingMemberCount = existingCriterion && hasMemberScopedSubCriteria(existingCriterion.subCriteria) ? memberCountFromSubCriteriaNames(existingCriterion.subCriteria) : 1
	const draftMemberCount = hasMemberScopedSubCriteria(criterion.subCriteria) ? memberCountFromSubCriteriaNames(criterion.subCriteria) : 1

	return Math.max(1, editorMemberCount, existingMemberCount, draftMemberCount)
}

export function criterionTotalScoreForEditor(criterion: AdminEventEditorInput['criteria'][number]): number {
	return criterionSubCriteriaTotalScore(criterion.subCriteria)
}

export function expandSharedSubCriteriaForMembers(subCriteria: Array<{ id?: string; name: string; maxScore: number }>, memberCount: number, labelWord = 'Student', keepPrefixForOne = false): AdminEventEditorInput['criteria'][number]['subCriteria'] {
	const sharedSubCriteria = collapseMemberScopedSubCriteria(subCriteria)

	if ((memberCount <= 1 && !keepPrefixForOne) || sharedSubCriteria.length === 0) {
		return sharedSubCriteria.map((subCriterion) => ({
			id: subCriterion.id,
			name: subCriterion.name,
			maxScore: subCriterion.maxScore,
		}))
	}

	const expanded: AdminEventEditorInput['criteria'][number]['subCriteria'] = []

	for (let memberIndex = 1; memberIndex <= Math.max(1, memberCount); memberIndex += 1) {
		const memberLabel = labelWord ? `${labelWord} ${memberIndex}` : String(memberIndex)

		for (const sharedSubCriterion of sharedSubCriteria) {
			expanded.push({
				// Members 2..N go without ids: the server keeps their existing ids by name (D39).
				id: memberIndex === 1 ? sharedSubCriterion.id : undefined,
				name: `${memberLabel} - ${sharedSubCriterion.name}`,
				maxScore: sharedSubCriterion.maxScore,
			})
		}
	}

	return expanded
}

export function prepareEventEditorPayloadForSubmit(draft: AdminEventEditorInput, existingEvent: EventScorer): AdminEventEditorInput {
	const synchronizedDraft = synchronizeEventEditorDraft(draft)
	const existingCriteriaById = new Map(existingEvent.criteria.map((criterion) => [criterion.id, criterion]))
	const editorMemberCount = maxEditorMemberCount(synchronizedDraft.contestants)

	return {
		...synchronizedDraft,
		criteria: synchronizedDraft.criteria.map((criterion) => {
			const existingCriterion = criterion.id ? existingCriteriaById.get(criterion.id) : undefined
			const shouldExpandForMembers = criterionUsesSharedMemberExpansion(criterion, existingCriterion)
			const existingGrid = existingCriterion ? memberGridOf(existingCriterion.subCriteria) : null

			if (!shouldExpandForMembers) {
				return criterion
			}

			return {
				...criterion,
				subCriteria: expandSharedSubCriteriaForMembers(
					criterion.subCriteria,
					resolveSharedCriterionMemberCount(criterion, existingCriterion, editorMemberCount),
					existingGrid?.labelWord ?? memberGridOf(criterion.subCriteria)?.labelWord ?? 'Student',
					existingGrid !== null,
				),
			}
		}),
	}
}

export function buildSynchronizedPresentationSlots(contestants: AdminEventEditorInput['contestants'], judges: AdminEventEditorInput['judges'], existingSlots: AdminEventEditorInput['presentationSlots']): NonNullable<AdminEventEditorInput['presentationSlots']> {
	const validJudgeIds = new Set(judges.map((judge) => String(judge.id ?? '').trim()).filter((judgeId) => judgeId.length > 0))
	const slotByContestantId = new Map<string, NonNullable<AdminEventEditorInput['presentationSlots']>[number]>()

	if (Array.isArray(existingSlots)) {
		for (const slot of existingSlots) {
			if (!slot || typeof slot !== 'object') {
				continue
			}

			const contestantId = String(slot.contestantId ?? '').trim()
			if (!contestantId || slotByContestantId.has(contestantId)) {
				continue
			}

			slotByContestantId.set(contestantId, slot)
		}
	}

	const fallbackJudgeIds = Array.from(validJudgeIds)

	return contestants.map((contestant, index) => {
		const contestantId = String(contestant.id ?? '').trim()
		const currentSlot = slotByContestantId.get(contestantId)

		const nextJudgeIds = Array.from(new Set((Array.isArray(currentSlot?.judgeIds) ? currentSlot.judgeIds : fallbackJudgeIds).map((judgeId) => String(judgeId ?? '').trim()).filter((judgeId) => validJudgeIds.has(judgeId))))

		return {
			id: String(currentSlot?.id ?? '').trim() || createEditorId(),
			label: String(currentSlot?.label ?? '').trim() || `Slot ${index + 1}`,
			contestantId,
			judgeIds: nextJudgeIds,
		}
	})
}

export function synchronizeEventEditorDraft(draft: AdminEventEditorInput): AdminEventEditorInput {
	const contestants: AdminEventEditorInput['contestants'] = (Array.isArray(draft.contestants) ? draft.contestants : []).map((contestant) => {
		const rawNoatScore = contestant?.noatScore
		const numericNoatScore = typeof rawNoatScore === 'number' ? (Number.isFinite(rawNoatScore) ? rawNoatScore : null) : typeof rawNoatScore === 'string' && rawNoatScore.trim() !== '' && Number.isFinite(Number(rawNoatScore)) ? Number(rawNoatScore) : null

		return {
			id: String(contestant?.id ?? '').trim() || createEditorId(),
			name: typeof contestant?.name === 'string' ? contestant.name : '',
			entryType: contestant?.entryType === 'individual' ? 'individual' : 'group',
			programTag: contestant?.programTag === 'BSINT' || contestant?.programTag === 'BSCS' ? contestant.programTag : null,
			participants: Array.isArray(contestant?.participants) ? contestant.participants.map((participant) => String(participant ?? '').trim()).filter((participant) => participant.length > 0) : [],
			section: typeof contestant?.section === 'string' ? contestant.section : undefined,
			noatScore: numericNoatScore,
			academicTrack: typeof contestant?.academicTrack === 'string' ? contestant.academicTrack : undefined,
			laptopAvailable: typeof contestant?.laptopAvailable === 'string' ? contestant.laptopAvailable : undefined,
		}
	})

	const judges: AdminEventEditorInput['judges'] = (Array.isArray(draft.judges) ? draft.judges : []).map((judge) => ({
		id: String(judge?.id ?? '').trim() || createEditorId(),
		name: typeof judge?.name === 'string' ? judge.name : '',
		email: typeof judge?.email === 'string' ? judge.email : '',
		token: typeof judge?.token === 'string' ? judge.token : '',
	}))

	const criteria: AdminEventEditorInput['criteria'] = (Array.isArray(draft.criteria) ? draft.criteria : []).map((criterion) => ({
		id: String(criterion?.id ?? '').trim() || createEditorId(),
		name: typeof criterion?.name === 'string' ? criterion.name : '',
		subCriteria: (Array.isArray(criterion?.subCriteria) ? criterion.subCriteria : []).map((subCriterion) => ({
			id: String(subCriterion?.id ?? '').trim() || createEditorId(),
			name: typeof subCriterion?.name === 'string' ? subCriterion.name : '',
			maxScore: Number.isFinite(Number(subCriterion?.maxScore)) ? Number(subCriterion?.maxScore) : 0,
		})),
	}))

	return {
		title: typeof draft.title === 'string' ? draft.title : '',
		description: typeof draft.description === 'string' ? draft.description : '',
		createdBy: typeof draft.createdBy === 'string' ? draft.createdBy : '',
		eventScoringType: draft.eventScoringType === 'final-oral-defense' ? 'final-oral-defense' : 'standard',
		rubricLegend: normalizeRubricLegend(draft.rubricLegend),
		contestants,
		judges,
		criteria,
		presentationSlots: buildSynchronizedPresentationSlots(contestants, judges, draft.presentationSlots),
	}
}

export function buildAdminEventEditorSnapshot(event: EventScorer): AdminEventEditorInput {
	const contestants: AdminEventEditorInput['contestants'] = event.contestants.map((contestant) => ({
		id: contestant.id,
		name: contestant.name,
		entryType: contestant.entryType === 'individual' ? 'individual' : 'group',
		programTag: contestant.programTag ?? null,
		section: contestant.section,
		participants: contestant.entryType === 'group' ? [...(contestant.participants ?? [])] : [],
		noatScore: typeof contestant.noatScore === 'number' && Number.isFinite(contestant.noatScore) ? contestant.noatScore : null,
		academicTrack: contestant.academicTrack,
		laptopAvailable: contestant.laptopAvailable,
	}))

	const judges: AdminEventEditorInput['judges'] = event.judges.map((judge) => ({
		id: judge.id,
		name: judge.name,
		email: judge.email ?? '',
		token: judge.token,
	}))

	const criteria: AdminEventEditorInput['criteria'] = event.criteria.map((criterion) => {
		const shouldCollapseMemberScope = hasMemberScopedSubCriteria(criterion.subCriteria)
		const normalizedSubCriteria = shouldCollapseMemberScope ? collapseMemberScopedSubCriteria(criterion.subCriteria) : criterion.subCriteria

		return {
			id: criterion.id,
			name: criterion.name,
			subCriteria: normalizedSubCriteria.map((subCriterion) => ({
				id: subCriterion.id,
				name: subCriterion.name,
				maxScore: subCriterion.maxScore,
			})),
		}
	})

	const defaultPresentationSlots = event.contestants.map((contestant, index) => ({
		id: '',
		label: `Slot ${index + 1}`,
		contestantId: contestant.id,
		judgeIds: event.judges.map((judge) => judge.id),
	}))

	const sourceSlots = Array.isArray(event.presentationSlots) && event.presentationSlots.length > 0 ? event.presentationSlots : defaultPresentationSlots

	return {
		title: event.title,
		description: event.description ?? '',
		createdBy: event.createdBy ?? '',
		eventScoringType: event.eventScoringType ?? 'standard',
		rubricLegend: normalizeRubricLegend(event.rubricLegend),
		contestants,
		judges,
		criteria,
		presentationSlots: sourceSlots.map((slot) => ({
			id: slot.id,
			label: slot.label,
			contestantId: slot.contestantId,
			judgeIds: [...slot.judgeIds],
		})),
	}
}
