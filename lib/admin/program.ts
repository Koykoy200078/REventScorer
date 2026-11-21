// The BSINT / BSCS program of a contestant: stored tag, name detection and manual overrides. Moved
// verbatim from components/admin-live-dashboard.tsx (Stage 5 Task 7 step 1).

import type { EventContestant, EventProgramTag, EventScorer } from '@/lib/types'

export type ProgramLabel = EventProgramTag

export function detectProgramLabel(contestantName: string): ProgramLabel | null {
	const uppercaseName = contestantName.toUpperCase()

	if (/\bBSINT\b/.test(uppercaseName)) {
		return 'BSINT'
	}

	if (/\bBSCS\b/.test(uppercaseName)) {
		return 'BSCS'
	}

	return null
}

export function contestantProgramLabel(contestant: EventContestant | undefined): ProgramLabel | null {
	if (!contestant) {
		return null
	}

	return contestant.programTag === 'BSINT' || contestant.programTag === 'BSCS' ? contestant.programTag : null
}

export function resolveProgramLabel(contestantName: string, contestant: EventContestant | undefined, manualAssignment: ProgramLabel | null | undefined): ProgramLabel | null {
	if (manualAssignment !== undefined) {
		return manualAssignment
	}

	const persistedProgram = contestantProgramLabel(contestant)
	if (persistedProgram) {
		return persistedProgram
	}

	return detectProgramLabel(contestantName)
}

export function buildProgramAssignmentsFromEvent(event: EventScorer): Record<string, ProgramLabel | null> {
	const assignments: Record<string, ProgramLabel | null> = {}

	for (const contestant of event.contestants) {
		const persistedProgram = contestantProgramLabel(contestant)
		if (persistedProgram) {
			assignments[contestant.id] = persistedProgram
		}
	}

	return assignments
}

export function extractDynamicTeamName(contestantName: string): string {
	const cleanedName = contestantName
		.replace(/\bBSINT\b|\bBSCS\b/gi, ' ')
		.replace(/\(\s*\)/g, ' ')
		.replace(/\(\s+/g, '(')
		.replace(/\s+\)/g, ')')
		.replace(/[|_]+/g, ' ')
		.replace(/\s{2,}/g, ' ')
		.replace(/^[\s\-:|/\\()]+|[\s\-:|/\\()]+$/g, '')
		.trim()

	return cleanedName.length > 0 ? cleanedName : contestantName
}
