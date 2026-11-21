// Member criteria ("Student N - X" rows) of final oral defense events. Moved verbatim from
// components/admin-live-dashboard.tsx (Stage 5 Task 7 step 1).

import { extractDynamicTeamName } from '@/lib/admin/program'
import type { EventContestant, EventCriterion } from '@/lib/types'

export function isIndividualPresentationCriterion(criterion: EventCriterion): boolean {
	if (criterion.name.trim().toLowerCase() === 'individual presentation') {
		return true
	}

	return criterion.subCriteria.some((subCriterion) => {
		const normalizedName = subCriterion.name.trim()
		const splitMatch = normalizedName.match(/^(.+?)\s*[-\u2013\u2014]\s*(.+)$/)
		if (!splitMatch) {
			return false
		}

		return /(\d+)\s*$/.test(splitMatch[1].trim())
	})
}

export function splitMemberCriterionName(name: string): { memberLabel: string; displayName: string } {
	const normalizedName = name.trim()
	const splitMatch = normalizedName.match(/^(.+?)\s*[-\u2013\u2014]\s*(.+)$/)
	if (!splitMatch) {
		return { memberLabel: 'Individual', displayName: normalizedName || name }
	}

	const memberLabel = splitMatch[1].trim()
	const displayName = splitMatch[2].trim()
	const hasMemberSuffix = /(\d+)\s*$/.test(memberLabel)

	if (!hasMemberSuffix) {
		return {
			memberLabel: 'Individual',
			displayName: normalizedName || name,
		}
	}

	return {
		memberLabel: memberLabel || 'Individual',
		displayName: displayName || normalizedName || name,
	}
}

export function memberIndexFromLabel(memberLabel: string): number | null {
	const match = memberLabel.match(/(\d+)\s*$/)
	if (!match) {
		return null
	}

	const index = Number.parseInt(match[1], 10)
	return Number.isFinite(index) && index > 0 ? index : null
}

export function normalizedParticipants(contestant: EventContestant): string[] {
	if (!Array.isArray(contestant.participants)) {
		return []
	}

	return contestant.participants.map((participant) => participant.trim()).filter((participant) => participant.length > 0)
}

export function memberCountFromSubCriteriaNames(subCriteria: Array<{ name: string }>): number {
	let maxMemberCount = 0

	for (const subCriterion of subCriteria) {
		const memberIndex = memberIndexFromLabel(splitMemberCriterionName(subCriterion.name).memberLabel)
		if (memberIndex && memberIndex > maxMemberCount) {
			maxMemberCount = memberIndex
		}
	}

	return maxMemberCount > 0 ? maxMemberCount : 1
}

export function defaultMemberCountFromSubCriteria(subCriteria: EventCriterion['subCriteria']): number {
	return memberCountFromSubCriteriaNames(subCriteria)
}

export function allowedMemberCountForContestant(contestant: EventContestant, subCriteria: EventCriterion['subCriteria']): number {
	if (contestant.entryType === 'individual') {
		return 1
	}

	const participants = normalizedParticipants(contestant)
	return participants.length > 0 ? participants.length : defaultMemberCountFromSubCriteria(subCriteria)
}

export function isSubCriterionApplicableToContestant(subCriterionName: string, contestant: EventContestant, criterion: EventCriterion): boolean {
	const memberIndex = memberIndexFromLabel(splitMemberCriterionName(subCriterionName).memberLabel)
	if (!memberIndex) {
		return true
	}

	return memberIndex <= allowedMemberCountForContestant(contestant, criterion.subCriteria)
}

export function resolveMemberLabelForContestant(memberLabel: string, contestant: EventContestant): string {
	const participants = normalizedParticipants(contestant)
	const memberIndex = memberIndexFromLabel(memberLabel)

	if (!memberIndex) {
		if (contestant.entryType === 'individual') {
			const trimmedName = contestant.name.trim()
			return trimmedName.length > 0 ? trimmedName : 'Individual'
		}

		return extractDynamicTeamName(contestant.name)
	}

	if (participants.length === 0) {
		if (contestant.entryType === 'individual' && memberIndex === 1) {
			return contestant.name
		}

		return memberLabel
	}

	const participantName = participants[memberIndex - 1]?.trim()
	return participantName && participantName.length > 0 ? participantName : memberLabel
}

export function mergedIndividualSubCriteriaForContestant(criterion: EventCriterion, contestant: EventContestant): Array<{ id: string; name: string; maxScore: number }> {
	const merged: Array<{ id: string; name: string; maxScore: number }> = []
	const seenItemKeys = new Set<string>()

	for (const subCriterion of criterion.subCriteria) {
		if (!isSubCriterionApplicableToContestant(subCriterion.name, contestant, criterion)) {
			continue
		}

		const { displayName } = splitMemberCriterionName(subCriterion.name)
		const itemKey = `${displayName.toLowerCase()}::${subCriterion.maxScore}`

		if (seenItemKeys.has(itemKey)) {
			continue
		}

		seenItemKeys.add(itemKey)
		merged.push({
			id: subCriterion.id,
			name: displayName,
			maxScore: subCriterion.maxScore,
		})
	}

	return merged
}
