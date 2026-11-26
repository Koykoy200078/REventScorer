// D40 (owner 2026-11-26): the one rule for member rows, used by the server, scoring, the judge page and the admin
// editor. A criterion row is a member row when its name has " - " and the label before it ends in a number
// ("Student 2 - Delivery", "Day 2 - Talk"). An en dash, an em dash or a hyphen without spaces does not count: those
// rows are ordinary rows everywhere. This is the rule the server, scoring and the judge page have always used; the
// admin editor used a looser one and rewrote such rows. A leaf module: no imports.

const SEPARATOR = ' - '

/** The label before " - " and the wording after it; a name without " - " is the "Individual" label's whole wording. */
export function splitMemberRowName(name: string): { memberLabel: string; displayName: string } {
	const separatorIndex = name.indexOf(SEPARATOR)
	if (separatorIndex === -1) {
		return { memberLabel: 'Individual', displayName: name }
	}

	const memberLabel = name.slice(0, separatorIndex).trim()
	const displayName = name.slice(separatorIndex + SEPARATOR.length).trim()
	return { memberLabel: memberLabel || 'Individual', displayName: displayName || name }
}

/** The member number a label ends with ("Student 2" -> 2), or null. */
export function memberIndexFromLabel(memberLabel: string): number | null {
	const match = memberLabel.match(/(\d+)\s*$/)
	if (!match) {
		return null
	}

	const index = Number.parseInt(match[1], 10)
	return Number.isFinite(index) && index > 0 ? index : null
}

export function isMemberRowName(name: string): boolean {
	return memberIndexFromLabel(splitMemberRowName(name).memberLabel) !== null && name.includes(SEPARATOR)
}

/**
 * A row written like a member row with another dash ("Student 2 – X", "Student 2—X"). By the shared rule it is an
 * ordinary row, but it is never expanded per member: expanded, it would become "Student 1 - Student 2 – X" and member
 * 2's old row would count for member 1 (review round 2 G9).
 */
export function looksLikeMemberRowName(name: string): boolean {
	if (isMemberRowName(name)) {
		return true
	}
	const dash = name.search(/[–—]/)
	return dash > 0 && memberIndexFromLabel(name.slice(0, dash)) !== null && name.slice(dash + 1).trim().length > 0
}

/** The label without its number: "Student 2" -> "Student", "Day 2" -> "Day", "2" -> "". */
export function memberLabelWord(memberLabel: string): string {
	return memberLabel.replace(/\s*\d+\s*$/, '').trim()
}
