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
 * Applicants that two or more typed ranges cover (typed ranges that overlap by mistake), unless those judges already
 * shared the applicant when the sheet was loaded (sharing made by Edit Judge, owner 2026-11-26). Only typed ranges
 * count: an empty range (every applicant) and "none" are not checked, and neither is an applicant that goes to every
 * judge by the fallback (review F2). `checkedEntryIds`, when given, skips other rows (blank rows are not sent).
 */
export function newOverlaps(loaded: Assignment, entryIds: string[], typedRanges: Record<string, string>, checkedEntryIds?: Set<string>): Array<{ position: number; judgeIds: string[] }> {
	const coverage = Object.entries(typedRanges)
		.filter(([, text]) => {
			const typed = text.trim().toLowerCase()
			return typed !== '' && typed !== NO_APPLICANT
		})
		.map(([judgeId, text]) => ({ judgeId, positions: new Set(positionsOfRangeText(text, entryIds.length)) }))
	const overlaps: Array<{ position: number; judgeIds: string[] }> = []
	entryIds.forEach((entryId, index) => {
		if (checkedEntryIds && !checkedEntryIds.has(entryId)) {
			return
		}
		const judges = coverage.filter((range) => range.positions.has(index + 1)).map((range) => range.judgeId)
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

// D47 (owner 2026-11-26): a judge whose typed range differs from what the assignment says gets the typed range,
// read with the row numbers on screen.
export function withTypedRanges(assignment: Assignment, entries: Array<{ id: string }>, judges: Array<{ id: string; assignedRange?: string }>): Assignment {
	const entryIds = entries.map((entry) => entry.id)
	let next = assignment
	for (const judge of judges) {
		const typed = (judge.assignedRange ?? '').trim()
		if (typed !== rangeTextFor(judge.id, entryIds, next)) {
			next = applyRangeText(judge.id, typed, entryIds, next)
		}
	}
	return next
}

// D47: applicants added or imported since the sheet loaded, and not given a judge by a typed range, follow the
// owner's rule: judges whose range is empty (every applicant) get them, else every judge not set to "none".
export function withNewEntries(assignment: Assignment, entries: Array<{ id: string }>, judges: Array<{ id: string; assignedRange?: string }>, knownEntryIds: Set<string>): Assignment {
	const texts = Object.fromEntries(judges.map((judge) => [judge.id, judge.assignedRange ?? '']))
	const judgeIds = judges.map((judge) => judge.id)
	let next = assignment
	for (const entry of entries) {
		if (!knownEntryIds.has(entry.id) && (next[entry.id] ?? []).length === 0) {
			next = assignNewEntry(entry.id, judgeIds, texts, next)
		}
	}
	return next
}

// D47: removing a row. Typed ranges are applied with the numbering they were typed in, then the applicant goes and
// every judge's range is renumbered, so every remaining applicant keeps its judges. An applicant added since the sheet
// loaded that no range covers stays uncovered: it goes to every judge by the fallback on Update, and writing that into
// the range texts made them overlap (review round 2 G2).
export function afterRemovingEntry(
	assignment: Assignment,
	entries: Array<{ id: string }>,
	judges: Array<{ id: string; assignedRange?: string }>,
	removedId: string,
): { assignment: Assignment; rangeTexts: Record<string, string> } {
	const next = { ...withTypedRanges(assignment, entries, judges) }
	delete next[removedId]
	const remainingIds = entries.map((entry) => entry.id).filter((entryId) => entryId !== removedId)
	return { assignment: next, rangeTexts: Object.fromEntries(judges.map((judge) => [judge.id, rangeTextFor(judge.id, remainingIds, next)])) }
}

// D47: the slots an Update sends, by applicant id, and the typed ranges that now overlap (refused). An applicant left
// with no judge goes to every judge not set to "none", as before.
export function planUpdate(
	assignment: Assignment,
	loaded: Assignment,
	entries: Array<{ id: string }>,
	judges: Array<{ id: string; assignedRange?: string }>,
	contestantIds: Set<string>,
	judgeIds: Set<string>,
): { slots: Array<{ label: string; contestantId: string; judgeIds: string[] }>; overlaps: Array<{ position: number; judgeIds: string[] }> } {
	let next = withNewEntries(withTypedRanges(assignment, entries, judges), entries, judges, new Set(Object.keys(assignment)))
	const everyone = judges.filter((judge) => (judge.assignedRange ?? '').trim().toLowerCase() !== NO_APPLICANT && judgeIds.has(judge.id)).map((judge) => judge.id)
	const keptIds = entries.map((entry) => entry.id).filter((entryId) => contestantIds.has(entryId))
	for (const entryId of keptIds) {
		const assigned = (next[entryId] ?? []).filter((judgeId) => judgeIds.has(judgeId))
		next = { ...next, [entryId]: assigned.length > 0 ? assigned : everyone }
	}
	return {
		slots: slotsFromAssignment(keptIds, next).map((slot, index) => ({ label: `Slot ${index + 1}`, ...slot })),
		overlaps: newOverlaps(loaded, entries.map((entry) => entry.id), Object.fromEntries(judges.map((judge) => [judge.id, judge.assignedRange ?? ''])), new Set(keptIds)),
	}
}
