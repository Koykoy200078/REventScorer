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

const compact = (value: string) => value.trim().replace(/\s+/g, ' ')

export function isIndividualPresentationName(name: string): boolean {
	return compact(name).toLowerCase() === 'individual presentation'
}

/**
 * The member number of a row written like a member row with another separator: an en or em dash, a hyphen with or
 * without spaces, or a colon ("Student 2 – X", "Student 2-X", "P2: X"). The label is letters (spaces, "." and "#"
 * allowed) followed by a number, so "Time (3–5 min)" is not one.
 */
function lookAlikeMemberIndex(name: string): number | null {
	const match = compact(name).match(/^\p{L}[\p{L} .#]*?\s?(\d+)\s?[-\u2013\u2014:]\s?\S/u)
	const index = match ? Number.parseInt(match[1], 10) : 0
	return index > 0 ? index : null
}

/**
 * Review round 3 H1 (D60): whether an "Individual Presentation" criterion of plain rows is expanded per member (member
 * 1 keeping the rows' ids). The admin editor asks this about the rows it sends and the server about the rows it
 * receives, with the same team size, so the two always agree (they used to decide differently, and the server's
 * expansion drops ids). Not expanded when a row is already a member row, or when a row is written like the row of
 * another member of the team (2..memberCount) with another separator: expanded, it would count for member 1 (D58).
 */
export function shouldExpandIndividualPresentation(criterionName: string, rowNames: string[], memberCount: number): boolean {
	if (!isIndividualPresentationName(criterionName) || memberCount <= 1) {
		return false
	}
	return !rowNames.some((name) => {
		if (isMemberRowName(compact(name))) {
			return true
		}
		const index = lookAlikeMemberIndex(name)
		return index !== null && index >= 2 && index <= memberCount
	})
}

/** The label without its number: "Student 2" -> "Student", "Day 2" -> "Day", "2" -> "". */
export function memberLabelWord(memberLabel: string): string {
	return memberLabel.replace(/\s*\d+\s*$/, '').trim()
}
