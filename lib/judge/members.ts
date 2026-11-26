import { round } from '@/lib/judge/score-input'
import { isMemberRowName, memberIndexFromLabel, splitMemberRowName as splitMemberCriterionName } from '@/lib/member-rows'
import type { EventContestant, EventCriterion } from '@/lib/types'

// D40: the shared member-row rule (lib/member-rows.ts).
export { memberIndexFromLabel, splitMemberCriterionName }

export function isIndividualCriterion(criterion: EventCriterion): boolean {
	return criterion.name.trim().toLowerCase() === 'individual presentation' || criterion.subCriteria.some((subCriterion) => isMemberRowName(subCriterion.name))
}

export function criterionScopeLabel(criterion: EventCriterion): string {
	return isIndividualCriterion(criterion) ? 'Per Contestant (Individual)' : 'Group Criteria Only'
}

export function normalizedParticipants(contestant?: EventContestant): string[] {
	if (!contestant?.participants) {
		return []
	}

	return contestant.participants.map((participant) => participant.trim()).filter((participant) => participant.length > 0)
}

export function defaultMemberCountFromSubCriteria(subCriteria: EventCriterion['subCriteria']): number {
	let maxMemberCount = 0

	for (const subCriterion of subCriteria) {
		const memberIndex = memberIndexFromLabel(splitMemberCriterionName(subCriterion.name).memberLabel)
		if (memberIndex && memberIndex > maxMemberCount) {
			maxMemberCount = memberIndex
		}
	}

	return maxMemberCount > 0 ? maxMemberCount : 1
}

export function allowedMemberCountForContestant(contestant: EventContestant | undefined, subCriteria: EventCriterion['subCriteria']): number {
	const defaultMemberCount = defaultMemberCountFromSubCriteria(subCriteria)

	if (!contestant) {
		return defaultMemberCount
	}

	if (contestant.entryType === 'individual') {
		return 1
	}

	const participants = normalizedParticipants(contestant)
	return participants.length > 0 ? participants.length : defaultMemberCount
}

export function resolvedMemberLabel(memberLabel: string, contestant?: EventContestant): string {
	const participants = normalizedParticipants(contestant)
	if (participants.length === 0) {
		const memberIndex = memberIndexFromLabel(memberLabel)
		if (contestant?.entryType === 'individual' && memberIndex === 1) {
			return contestant.name
		}

		return memberLabel
	}

	const memberIndex = memberIndexFromLabel(memberLabel)
	if (!memberIndex) {
		return memberLabel
	}

	const participantName = participants[memberIndex - 1]?.trim()
	return participantName && participantName.length > 0 ? participantName : memberLabel
}

export function groupSubCriteriaByMember(subCriteria: EventCriterion['subCriteria'], contestant?: EventContestant): Array<{ memberLabel: string; memberDisplayLabel: string; items: Array<{ subCriterion: EventCriterion['subCriteria'][number]; displayName: string }> }> {
	const allowedMemberCount = allowedMemberCountForContestant(contestant, subCriteria)
	const grouped = new Map<string, Array<{ subCriterion: EventCriterion['subCriteria'][number]; displayName: string }>>()

	for (const subCriterion of subCriteria) {
		const { memberLabel, displayName } = splitMemberCriterionName(subCriterion.name)
		const memberIndex = memberIndexFromLabel(memberLabel)
		if (memberIndex && memberIndex > allowedMemberCount) {
			continue
		}

		const existing = grouped.get(memberLabel)
		if (existing) {
			existing.push({ subCriterion, displayName })
		} else {
			grouped.set(memberLabel, [{ subCriterion, displayName }])
		}
	}

	return Array.from(grouped.entries()).map(([memberLabel, items]) => ({
		memberLabel,
		memberDisplayLabel: resolvedMemberLabel(memberLabel, contestant),
		items,
	}))
}

/**
 * The most one judge can give this entry: every sub-criterion that applies to it, so a team's own member rows, not
 * those of the largest team (the stored criteria hold Student 1..N for the largest team). The judge page's "this
 * entry's maximum" and the admin's "/ X raw" (B65) both use it.
 */
export function entryMaxScore(criteria: EventCriterion[], contestant?: EventContestant): number {
	return round(criteria.reduce((sum, criterion) => sum + applicableSubCriteriaForContestant(criterion, contestant).reduce((subTotal, subCriterion) => subTotal + Number(subCriterion.maxScore), 0), 0))
}

export function applicableSubCriteriaForContestant(criterion: EventCriterion, contestant?: EventContestant): EventCriterion['subCriteria'] {
	if (!isIndividualCriterion(criterion)) {
		return criterion.subCriteria
	}

	const allowedMemberCount = allowedMemberCountForContestant(contestant, criterion.subCriteria)
	return criterion.subCriteria.filter((subCriterion) => {
		const memberIndex = memberIndexFromLabel(splitMemberCriterionName(subCriterion.name).memberLabel)
		return !memberIndex || memberIndex <= allowedMemberCount
	})
}
