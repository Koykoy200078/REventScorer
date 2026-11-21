// The Score Audit Matrix's search, filters and pages (spec R49, Stage 5 Task 7 step 2).

import type { ProgramLabel } from '@/lib/admin/program'
import type { EntryStatusKind } from '@/lib/admin/status'

export const MATRIX_PAGE_SIZE = 10

export interface MatrixEntry {
	contestantId: string
	name: string
	section?: string
	participants: string[]
	program: ProgramLabel | null
	status: EntryStatusKind
	strands: string[]
	remarks: string[]
}

export interface MatrixFilters {
	query: string
	tracks: Record<ProgramLabel, boolean>
	status: 'all' | EntryStatusKind
	strand: string
	remark: string
}

export const ALL_OPTION = 'All'

// A case-insensitive substring of the entry's name, section or one of its participants' names; a blank query matches.
export function matchesSearch(entry: Pick<MatrixEntry, 'name' | 'section' | 'participants'>, query: string): boolean {
	const needle = query.trim().toLowerCase()
	if (!needle) {
		return true
	}

	return [entry.name, entry.section ?? '', ...entry.participants].some((value) => value.toLowerCase().includes(needle))
}

// A track checkbox hides only the entries of its own program, so an entry without a program always shows. The strand and
// remark filters match one of the entry's values exactly.
export function filterEntries<T extends MatrixEntry>(entries: T[], filters: MatrixFilters): T[] {
	return entries.filter((entry) => {
		if (entry.program && !filters.tracks[entry.program]) {
			return false
		}

		if (filters.status !== 'all' && entry.status !== filters.status) {
			return false
		}

		if (filters.strand !== ALL_OPTION && !entry.strands.includes(filters.strand)) {
			return false
		}

		if (filters.remark !== ALL_OPTION && !entry.remarks.includes(filters.remark)) {
			return false
		}

		return matchesSearch(entry, filters.query)
	})
}

export interface MatrixPage<T> {
	items: T[]
	page: number
	pages: number
	from: number
	to: number
	total: number
}

// One page of the rows, the page clamped to the ones that exist; "all" shows every row on one page. from/to are 1-based
// ("Showing {from}-{to} of {total}"), both 0 when there are no rows.
export function paginate<T>(items: T[], page: number, size: number | 'all'): MatrixPage<T> {
	const total = items.length
	const perPage = size === 'all' ? Math.max(total, 1) : Math.max(1, Math.floor(size))
	const pages = Math.max(1, Math.ceil(total / perPage))
	const current = Math.min(Math.max(1, Math.floor(Number.isFinite(page) ? page : 1)), pages)
	const start = (current - 1) * perPage
	const pageItems = items.slice(start, start + perPage)

	return { items: pageItems, page: current, pages, from: total === 0 ? 0 : start + 1, to: start + pageItems.length, total }
}
