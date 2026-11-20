/**
 * The contestant picker's search (owner, 2026-11-20): shown only when the judge's list has more
 * than 10 entries; it matches the entry's name and its presentation-slot label.
 */

export const PICKER_SEARCH_THRESHOLD = 10

export function hasPickerSearch(count: number): boolean {
	return count > PICKER_SEARCH_THRESHOLD
}

/** Case-insensitive substring match on the name and the slot label; an empty query matches all. */
export function entryMatches(query: string, entry: { name: string; slotLabel?: string }): boolean {
	const needle = query.trim().toLowerCase()
	if (needle === '') return true
	return entry.name.toLowerCase().includes(needle) || (entry.slotLabel ?? '').toLowerCase().includes(needle)
}
