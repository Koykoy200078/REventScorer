// "Edit After Publish": the editor's snapshot of an event, its synchronised draft and the payload it
// saves. Moved verbatim from components/admin-live-dashboard.tsx (Stage 5 Task 7 step 1).

import { createEditorId } from '@/lib/admin/editor-id'
import { memberCountFromSubCriteriaNames, memberIndexFromLabel, splitMemberCriterionName } from '@/lib/admin/members'
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

export function hasMemberScopedSubCriteria(subCriteria: Array<{ name: string }>): boolean {
	return subCriteria.some((subCriterion) => {
		const { memberLabel } = splitMemberCriterionName(subCriterion.name)
		return memberIndexFromLabel(memberLabel) !== null
	})
}

export function collapseMemberScopedSubCriteria(subCriteria: Array<{ id?: string; name: string; maxScore: number }>): SharedSubCriterionDraft[] {
	const collapsed: SharedSubCriterionDraft[] = []
	const seenDisplayNames = new Set<string>()

	for (const subCriterion of subCriteria) {
		const { memberLabel, displayName } = splitMemberCriterionName(subCriterion.name)
		const memberIndex = memberIndexFromLabel(memberLabel)
		const normalizedName = (memberIndex ? displayName : subCriterion.name).trim()
		const key = normalizedName.toLowerCase()

		if (!normalizedName || seenDisplayNames.has(key)) {
			continue
		}

		seenDisplayNames.add(key)
		collapsed.push({
			id: subCriterion.id,
			name: normalizedName,
			maxScore: Number.isFinite(Number(subCriterion.maxScore)) ? Number(subCriterion.maxScore) : 0,
		})
	}

	return collapsed
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
	if (criterion.name.trim().toLowerCase() === 'individual presentation') {
		return true
	}

	if (existingCriterion && hasMemberScopedSubCriteria(existingCriterion.subCriteria)) {
		return true
	}

	return hasMemberScopedSubCriteria(criterion.subCriteria)
}

export function resolveSharedCriterionMemberCount(criterion: AdminEventEditorInput['criteria'][number], existingCriterion: EventCriterion | undefined, editorMemberCount: number): number {
	const existingMemberCount = existingCriterion && hasMemberScopedSubCriteria(existingCriterion.subCriteria) ? memberCountFromSubCriteriaNames(existingCriterion.subCriteria) : 1
	const draftMemberCount = hasMemberScopedSubCriteria(criterion.subCriteria) ? memberCountFromSubCriteriaNames(criterion.subCriteria) : 1

	return Math.max(1, editorMemberCount, existingMemberCount, draftMemberCount)
}

export function criterionTotalScoreForEditor(criterion: AdminEventEditorInput['criteria'][number]): number {
	return criterionSubCriteriaTotalScore(criterion.subCriteria)
}

export function expandSharedSubCriteriaForMembers(subCriteria: Array<{ id?: string; name: string; maxScore: number }>, memberCount: number): AdminEventEditorInput['criteria'][number]['subCriteria'] {
	const sharedSubCriteria = collapseMemberScopedSubCriteria(subCriteria)

	if (memberCount <= 1 || sharedSubCriteria.length === 0) {
		return sharedSubCriteria.map((subCriterion) => ({
			id: subCriterion.id,
			name: subCriterion.name,
			maxScore: subCriterion.maxScore,
		}))
	}

	const expanded: AdminEventEditorInput['criteria'][number]['subCriteria'] = []

	for (let memberIndex = 1; memberIndex <= memberCount; memberIndex += 1) {
		const memberLabel = `Student ${memberIndex}`

		for (const sharedSubCriterion of sharedSubCriteria) {
			expanded.push({
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

			if (!shouldExpandForMembers) {
				return criterion
			}

			return {
				...criterion,
				subCriteria: expandSharedSubCriteriaForMembers(criterion.subCriteria, resolveSharedCriterionMemberCount(criterion, existingCriterion, editorMemberCount)),
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
