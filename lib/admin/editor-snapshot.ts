// "Edit After Publish": the editor's snapshot of an event, its synchronised draft and the payload it
// saves. Moved verbatim from components/admin-live-dashboard.tsx (Stage 5 Task 7 step 1).

import { createEditorId } from '@/lib/admin/editor-id'
import { memberCountFromSubCriteriaNames } from '@/lib/admin/members'
import { isMemberRowName, memberIndexFromLabel, memberLabelWord, shouldExpandIndividualPresentation, splitMemberRowName } from '@/lib/member-rows'
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
export function memberGridOf(subCriteria: Array<{ id?: string; name: string; maxScore: number }>): { labelWord: string; memberCount: number; shared: SharedSubCriterionDraft[]; labels: Map<number, string>; rowLabels: Map<string, string> } | null {
	if (!Array.isArray(subCriteria) || subCriteria.length === 0 || !subCriteria.every((subCriterion) => isMemberRowName(subCriterion.name))) {
		return null
	}

	const parsed = subCriteria.map((subCriterion) => {
		const { memberLabel, displayName } = splitMemberRowName(subCriterion.name)
		return { id: subCriterion.id, label: memberLabel, labelWord: memberLabelWord(memberLabel), index: memberIndexFromLabel(memberLabel) ?? 0, wording: displayName, maxScore: Number(subCriterion.maxScore) }
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

	// Review round 3 H2: each row's own label, found through member 1's row at the same position (its id, else its
	// wording), and each member's most common label for a row the grid does not have yet.
	const rowLabels = new Map<string, string>()
	const labelCounts = new Map<number, Map<string, number>>()
	for (let index = 1; index <= memberCount; index += 1) {
		rowsOf(index).forEach((row, position) => {
			const anchor = first[position]
			if (anchor.id) {
				rowLabels.set(`${index}::id:${anchor.id}`, row.label)
			}
			rowLabels.set(`${index}::name:${anchor.wording.toLowerCase()}`, row.label)
			const counts = labelCounts.get(index) ?? new Map<string, number>()
			counts.set(row.label, (counts.get(row.label) ?? 0) + 1)
			labelCounts.set(index, counts)
		})
	}
	const labels = new Map(Array.from(labelCounts, ([index, counts]) => [index, Array.from(counts).reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0]] as const))

	return {
		labelWord,
		memberCount,
		shared: first.map((row) => ({ id: row.id, name: row.wording, maxScore: Number.isFinite(row.maxScore) ? row.maxScore : 0 })),
		labels,
		rowLabels,
	}
}

// Review round 2 G1 (D57): each member keeps its stored label exactly ("P1", "Student 01", "Member #1"), so the
// server finds members 2..N's rows by name and keeps their ids and scores. A member the grid does not have yet takes
// member 1's label with its number replaced, zero-padded as member 1 is ("Student 01" -> "Student 03"). Review round 3
// H2: a row keeps its own label even when one member's rows carry two forms ("Student 2 - A", "Student2 - C").
export function memberLabelMaker(grid: { labels: Map<number, string>; rowLabels: Map<string, string> }): (memberIndex: number, shared?: { id?: string; name: string }) => string {
	const first = grid.labels.get(1) ?? ''
	const match = first.match(/^(.*?)(\d+)\s*$/)
	const prefix = match ? match[1] : `${first} `
	const width = match && match[2].length > 1 && match[2].startsWith('0') ? match[2].length : 1
	return (memberIndex, shared) =>
		(shared?.id ? grid.rowLabels.get(`${memberIndex}::id:${shared.id}`) : undefined) ??
		(shared ? grid.rowLabels.get(`${memberIndex}::name:${shared.name.trim().toLowerCase()}`) : undefined) ??
		grid.labels.get(memberIndex) ??
		`${prefix}${String(memberIndex).padStart(width, '0')}`
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

// The team size the server sees for a draft: blank participants dropped and the rest de-duplicated in any letter case
// (storage-db.ts normalizeContestantParticipants), so the editor and the server ask shouldExpandIndividualPresentation
// with the same number.
export function serverMemberCount(contestants: AdminEventEditorInput['contestants']): number {
	return (Array.isArray(contestants) ? contestants : []).reduce((maxCount, contestant) => {
		// The server reads anything but 'individual' as a group (normalizeContestantEntryType).
		if (contestant.entryType === 'individual') {
			return maxCount
		}
		const participants = Array.isArray(contestant.participants) ? contestant.participants : []
		const unique = new Set(participants.map((participant) => String(participant ?? '').trim().replace(/\s+/g, ' ')).filter((participant) => participant.length > 0).map((participant) => participant.toLowerCase()))
		return Math.max(maxCount, unique.size > 0 ? unique.size : 1)
	}, 1)
}

export function criterionUsesSharedMemberExpansion(criterion: AdminEventEditorInput['criteria'][number], existingCriterion: EventCriterion | undefined, memberCount: number): boolean {
	// D40: a member grid (existing or typed) is re-expanded. An "Individual Presentation" criterion of plain rows (created
	// before teams had participants, or a plain criterion renamed to it) is expanded per member, member 1 keeping the
	// rows' ids (review F1), exactly when the server would expand the rows the editor sends (review round 3 H1): the
	// decision looks only at those rows.
	if (hasMemberScopedSubCriteria(criterion.subCriteria) || (existingCriterion && hasMemberScopedSubCriteria(existingCriterion.subCriteria))) {
		return true
	}
	return shouldExpandIndividualPresentation(
		criterion.name,
		criterion.subCriteria.map((subCriterion) => subCriterion.name),
		memberCount,
	)
}

export function resolveSharedCriterionMemberCount(criterion: AdminEventEditorInput['criteria'][number], existingCriterion: EventCriterion | undefined, editorMemberCount: number): number {
	const existingMemberCount = existingCriterion && hasMemberScopedSubCriteria(existingCriterion.subCriteria) ? memberCountFromSubCriteriaNames(existingCriterion.subCriteria) : 1
	const draftMemberCount = hasMemberScopedSubCriteria(criterion.subCriteria) ? memberCountFromSubCriteriaNames(criterion.subCriteria) : 1

	return Math.max(1, editorMemberCount, existingMemberCount, draftMemberCount)
}

export function criterionTotalScoreForEditor(criterion: AdminEventEditorInput['criteria'][number]): number {
	return criterionSubCriteriaTotalScore(criterion.subCriteria)
}

export function expandSharedSubCriteriaForMembers(
	subCriteria: Array<{ id?: string; name: string; maxScore: number }>,
	memberCount: number,
	labelWord: string | ((memberIndex: number, shared?: { id?: string; name: string }) => string) = 'Student',
	keepPrefixForOne = false,
): AdminEventEditorInput['criteria'][number]['subCriteria'] {
	const sharedSubCriteria = collapseMemberScopedSubCriteria(subCriteria)

	if ((memberCount <= 1 && !keepPrefixForOne) || sharedSubCriteria.length === 0) {
		return sharedSubCriteria.map((subCriterion) => ({
			id: subCriterion.id,
			name: subCriterion.name,
			maxScore: subCriterion.maxScore,
		}))
	}

	const expanded: AdminEventEditorInput['criteria'][number]['subCriteria'] = []
	// Review F3: rows the admin typed as a member grid keep their own ids (a row fixed from "Student 2 – X" to
	// "Student 2 - X" is still member 2's row).
	const typedIdByName = new Map(subCriteria.filter((subCriterion) => subCriterion.id && isMemberRowName(subCriterion.name)).map((subCriterion) => [subCriterion.name.trim().toLowerCase(), subCriterion.id]))

	for (let memberIndex = 1; memberIndex <= Math.max(1, memberCount); memberIndex += 1) {
		for (const sharedSubCriterion of sharedSubCriteria) {
			const memberLabel = typeof labelWord === 'function' ? labelWord(memberIndex, sharedSubCriterion) : labelWord ? `${labelWord} ${memberIndex}` : String(memberIndex)
			expanded.push({
				// Members 2..N go without ids unless the admin typed them: the server keeps their existing ids by name (D39).
				id: memberIndex === 1 ? sharedSubCriterion.id : typedIdByName.get(`${memberLabel} - ${sharedSubCriterion.name}`.toLowerCase()),
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
	const serverTeamSize = serverMemberCount(synchronizedDraft.contestants)

	return {
		...synchronizedDraft,
		criteria: synchronizedDraft.criteria.map((criterion) => {
			const existingCriterion = criterion.id ? existingCriteriaById.get(criterion.id) : undefined
			const shouldExpandForMembers = criterionUsesSharedMemberExpansion(criterion, existingCriterion, serverTeamSize)
			const existingGrid = existingCriterion ? memberGridOf(existingCriterion.subCriteria) : null
			const labelGrid = existingGrid ?? memberGridOf(criterion.subCriteria)

			if (!shouldExpandForMembers) {
				return criterion
			}

			return {
				...criterion,
				subCriteria: expandSharedSubCriteriaForMembers(
					criterion.subCriteria,
					resolveSharedCriterionMemberCount(criterion, existingCriterion, editorMemberCount),
					labelGrid ? memberLabelMaker(labelGrid) : 'Student',
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
