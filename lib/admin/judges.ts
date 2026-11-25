// Which judges score which entry (presentation slots), and Edit Judge drafts. Moved verbatim from
// components/admin-live-dashboard.tsx (Stage 5 Task 7 step 1).

import type { AdminEventEditorInput, EventScorer, JudgeBreakdown } from '@/lib/types'

export function assignedJudgeIdsForContestant(event: EventScorer, contestantId: string): string[] {
	if (!Array.isArray(event.presentationSlots) || event.presentationSlots.length === 0) {
		return event.judges.map((judge) => judge.id)
	}

	const hasAnyJudgeAssigned = event.presentationSlots.some((slot) => slot.judgeIds.length > 0)
	if (!hasAnyJudgeAssigned) {
		return event.judges.map((judge) => judge.id)
	}

	const slot = event.presentationSlots.find((candidate) => candidate.contestantId === contestantId)
	if (!slot) {
		return event.judges.map((judge) => judge.id)
	}

	return slot.judgeIds
}

export function buildJudgeAssignmentDrafts(event: EventScorer): Record<string, string[]> {
	const drafts: Record<string, string[]> = {}

	for (const contestant of event.contestants) {
		drafts[contestant.id] = assignedJudgeIdsForContestant(event, contestant.id)
	}

	return drafts
}

export function sameJudgeAssignments(left: string[], right: string[]): boolean {
	if (left.length !== right.length) {
		return false
	}

	const leftSet = new Set(left)
	return right.every((judgeId) => leftSet.has(judgeId))
}

/**
 * B56 (owner 2026-11-26): the scores an editor save drops. A judge the save takes off an entry (by its presentation
 * slots, read as assignedJudgeIdsForContestant reads them, before and after) no longer counts there, as Edit Judge
 * does; this lists each such judge who has a counted score for that entry, with the names the editor shows. Judges
 * and entries the save removes are not listed.
 */
export function scoresDroppedByEditorSave(event: EventScorer, judgeBreakdown: JudgeBreakdown[], editor: AdminEventEditorInput): Array<{ judgeName: string; contestantName: string }> {
	const after = {
		...event,
		judges: editor.judges.filter((judge) => judge.id).map((judge) => ({ ...judge, id: String(judge.id) })),
		presentationSlots: (editor.presentationSlots ?? []).map((slot, index) => ({ id: String(slot.id ?? index), label: slot.label, contestantId: String(slot.contestantId ?? ''), judgeIds: slot.judgeIds ?? [] })),
	} as EventScorer
	const judgeNames = new Map(editor.judges.map((judge) => [String(judge.id ?? ''), judge.name]))
	const totalsByJudge = new Map(judgeBreakdown.map((judge) => [judge.judgeId, judge.totalsByContestant]))
	const dropped: Array<{ judgeName: string; contestantName: string }> = []
	for (const contestant of editor.contestants) {
		const contestantId = String(contestant.id ?? '')
		if (!event.contestants.some((existing) => existing.id === contestantId)) continue
		const stays = new Set(assignedJudgeIdsForContestant(after, contestantId))
		for (const judgeId of assignedJudgeIdsForContestant(event, contestantId)) {
			const judgeName = judgeNames.get(judgeId)
			if (judgeName === undefined || stays.has(judgeId) || totalsByJudge.get(judgeId)?.[contestantId] === undefined) continue
			dropped.push({ judgeName, contestantName: contestant.name })
		}
	}
	return dropped
}
