export type PageSlice = {
	/** The page shown, from 1, clamped to the pages that exist. */
	page: number
	/** At least 1, so an empty list still has a page to show. */
	pageCount: number
	/** Index of the first item shown. */
	start: number
	/** Index after the last item shown, so `items.slice(start, end)`. */
	end: number
}

/** Which slice of `total` items a page shows. A page size below 1 shows everything on one page. */
export function paginate(total: number, page: number, pageSize: number): PageSlice {
	const count = Math.max(0, Math.floor(total) || 0)
	const size = pageSize >= 1 ? Math.floor(pageSize) : Math.max(count, 1)
	const pageCount = Math.max(1, Math.ceil(count / size))
	const wanted = Number.isFinite(page) ? Math.floor(page) : 1
	const current = Math.min(Math.max(wanted, 1), pageCount)
	const start = (current - 1) * size
	return { page: current, pageCount, start, end: Math.min(start + size, count) }
}
