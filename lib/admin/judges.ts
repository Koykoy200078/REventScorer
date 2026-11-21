// Which judges score which entry (presentation slots), and Edit Judge drafts. Moved verbatim from
// components/admin-live-dashboard.tsx (Stage 5 Task 7 step 1).

import type { EventScorer } from '@/lib/types'

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
