// D47 (owner 2026-11-26): which judges each applicant of a rating sheet has. The sheet used to keep only each judge's
// range text ("1-20") and map it back to rows by position on Update, so removing an applicant moved the applicants
// after it to another judge and dropped their counted ratings. The assignment is now kept per applicant id; range
// texts are how an admin types an assignment and are recomputed from it whenever rows change. A pure module.

/** Applicant (entry) id -> the ids of the judges assigned to it, in judge order. */
export type Assignment = Record<string, string[]>

/** A range text that means "no applicant" (an empty text means every applicant). */
export const NO_APPLICANT = 'none'

/** The event's slots as an assignment; an event without slots has every judge on every applicant. */
export function assignmentFromSlots(entryIds: string[], judgeIds: string[], slots: Array<{ contestantId: string; judgeIds: string[] }>): Assignment {
	const assignment: Assignment = {}
	const bySlot = new Map(slots.map((slot) => [slot.contestantId, slot.judgeIds]))
	for (const entryId of entryIds) {
		const assigned = slots.length === 0 ? judgeIds : (bySlot.get(entryId) ?? [])
		assignment[entryId] = judgeIds.filter((judgeId) => assigned.includes(judgeId))
	}
	return assignment
}

/** The 1-based positions a range text names, within `count` rows ("1-3,7", an open end "5-"); empty for "none". */
export function positionsOfRangeText(text: string, count: number): number[] {
	const trimmed = text.trim()
	if (trimmed.toLowerCase() === NO_APPLICANT) {
		return []
	}
	if (trimmed === '') {
		return Array.from({ length: count }, (_, index) => index + 1)
	}

	const positions = new Set<number>()
	for (const part of trimmed.split(',')) {
		const piece = part.trim()
		if (!piece) continue
		if (piece.includes('-')) {
			const [startText, endText] = piece.split('-')
			const start = Number.parseInt(startText.trim(), 10)
			const end = endText.trim() === '' ? count : Number.parseInt(endText.trim(), 10)
			if (Number.isNaN(start) || Number.isNaN(end)) continue
			for (let position = Math.max(1, start); position <= Math.min(count, end); position += 1) positions.add(position)
		} else {
			const exact = Number.parseInt(piece, 10)
			if (!Number.isNaN(exact) && exact >= 1 && exact <= count) positions.add(exact)
		}
	}
	return Array.from(positions).sort((left, right) => left - right)
}

/** A judge's range text: "" on every applicant, "none" on none, else 1-based ranges such as "1-3,7". */
export function rangeTextFor(judgeId: string, entryIds: string[], assignment: Assignment): string {
	const positions = entryIds.map((entryId, index) => ((assignment[entryId] ?? []).includes(judgeId) ? index + 1 : 0)).filter((position) => position > 0)
	if (entryIds.length > 0 && positions.length === entryIds.length) {
		return ''
	}
	if (positions.length === 0) {
		return NO_APPLICANT
	}

	const ranges: string[] = []
	let start = positions[0]
	let previous = positions[0]
	for (const position of positions.slice(1)) {
		if (position === previous + 1) {
			previous = position
			continue
		}
		ranges.push(start === previous ? String(start) : `${start}-${previous}`)
		start = position
		previous = position
	}
	ranges.push(start === previous ? String(start) : `${start}-${previous}`)
	return ranges.join(',')
}

/** The assignment with one judge's applicants replaced by those its range text names. */
export function applyRangeText(judgeId: string, text: string, entryIds: string[], assignment: Assignment): Assignment {
	const positions = new Set(positionsOfRangeText(text, entryIds.length))
	const next: Assignment = {}
	entryIds.forEach((entryId, index) => {
		const others = (assignment[entryId] ?? []).filter((id) => id !== judgeId)
		next[entryId] = positions.has(index + 1) ? [...others, judgeId] : others
	})
	return next
}

/**
 * The owner's rule for an applicant added or imported later: judges whose range text is empty (every applicant) get
 * it; when there is none, every judge except those set to "none".
 */
export function assignNewEntry(entryId: string, judgeIds: string[], rangeTexts: Record<string, string>, assignment: Assignment): Assignment {
	const everyApplicant = judgeIds.filter((judgeId) => (rangeTexts[judgeId] ?? '').trim() === '')
	const judges = everyApplicant.length > 0 ? everyApplicant : judgeIds.filter((judgeId) => (rangeTexts[judgeId] ?? '').trim().toLowerCase() !== NO_APPLICANT)
	return { ...assignment, [entryId]: judges }
}

/**
 * Applicants that two or more of the typed-range judges now share although they did not share them when the sheet
 * was loaded: typed ranges that overlap by mistake. Sharing made by Edit Judge (there at load) does not count, and
 * judges whose range is empty (every applicant) are not checked (owner 2026-11-26).
 */
export function newOverlaps(loaded: Assignment, current: Assignment, entryIds: string[], typedJudgeIds: string[]): Array<{ position: number; judgeIds: string[] }> {
	const typed = new Set(typedJudgeIds)
	const overlaps: Array<{ position: number; judgeIds: string[] }> = []
	entryIds.forEach((entryId, index) => {
		const judges = (current[entryId] ?? []).filter((judgeId) => typed.has(judgeId))
		if (judges.length < 2) {
			return
		}
		const before = new Set(loaded[entryId] ?? [])
		if (judges.every((judgeId) => before.has(judgeId))) {
			return
		}
		overlaps.push({ position: index + 1, judgeIds: judges })
	})
	return overlaps
}

/** The slots an Update sends, by applicant id, in row order. */
export function slotsFromAssignment(entryIds: string[], assignment: Assignment): Array<{ contestantId: string; judgeIds: string[] }> {
	return entryIds.map((entryId) => ({ contestantId: entryId, judgeIds: [...(assignment[entryId] ?? [])] }))
}
