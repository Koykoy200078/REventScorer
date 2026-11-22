import type { ComponentPropsWithRef, ReactNode } from 'react'

import { CLICKABLE, FOCUS_RING } from '@/components/ui/styles'
import { cx } from '@/lib/ui/cx'
import { paginate, type PageSlice } from '@/lib/ui/paginate'

// Catalogue section 11: the score matrix footer (A789 to A797).

// A789: the footer bar. The page buttons inherit its label-sm type.
const BAR =
	'px-space-lg py-space-md bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-space-xs font-label-sm text-label-sm text-slate-600'

// A790: the numbers inside the summary line.
const COUNT = 'text-slate-900 font-mono'

// A791: the page controls.
const PAGES = 'flex items-center gap-space-xs'

// A793: the current page. The mockup writes a span; it is a button here (with no action) so that
// React keeps the focused node when a page number becomes the current page.
const CURRENT = 'px-space-sm py-1 rounded bg-emerald-600 text-white font-bold font-mono shadow-2xs'

// A794: the other page numbers.
const PAGE = 'px-space-sm py-1 rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-700'

// Previous and Next: A794 when usable; at the ends aria-disabled brings in the look of A792
// (slate-400 text, not-allowed cursor, no hover), which the mockup itself shows, in place of the
// generic 50% opacity. aria-disabled rather than disabled keeps the button focusable, so focus
// stays put when a keyboard user steps to the first or last page.
const STEP =
	'px-space-sm py-1 rounded bg-white border border-slate-200 not-aria-disabled:hover:bg-slate-100 text-slate-700 aria-disabled:text-slate-400 aria-disabled:cursor-not-allowed'

export type PaginationCountProps = ComponentPropsWithRef<'strong'>

/**
 * A number inside the pagination summary line (catalogue A790: slate-900, mono), as in a line that
 * reads showing N of N. Props are any strong props; children are the number.
 */
export function PaginationCount({ className, ...rest }: PaginationCountProps) {
	return <strong className={cx(COUNT, className)} {...rest} />
}

export type PaginationProps = Omit<ComponentPropsWithRef<'div'>, 'children'> & {
	/** How many items the list holds. */
	total: number
	/** The page shown, from 1. Out-of-range values are clamped by paginate(). */
	page: number
	/** Items per page. */
	pageSize: number
	/** Called with the page to show (always within 1 and the page count). */
	onPageChange: (page: number) => void
	/** Visible text of the previous-page button. */
	previousLabel: ReactNode
	/** Visible text of the next-page button. */
	nextLabel: ReactNode
	/** The line on the left: a node, or a function of the current slice (page, pageCount, start, end). */
	summary?: ReactNode | ((slice: PageSlice) => ReactNode)
	/** Accessible name of the page controls. */
	navLabel?: string
	/** Accessible name of each page-number button, for example (n) => `Page ${n}`; the number alone by default. */
	pageLabel?: (page: number) => string
	/** Test hooks: data-testid of the previous, next and page-number buttons (the page ones also get data-page). */
	hooks?: { previous: string; next: string; page: string }
}

/**
 * The score matrix pagination footer (catalogue section 11: A789 bar, A790 summary, A791 controls,
 * A792 disabled previous, A793 current page, A794 page buttons). The page math comes from
 * paginate(), so `page` is clamped and every page number is shown. Every page number is a button,
 * so focus survives a page change; the current one has `aria-current='page'` and no action.
 * Previous and Next are `aria-disabled` at the ends (still focusable, no action). Props: `total`,
 * `page`, `pageSize`, `onPageChange(page)`, the visible `previousLabel` and `nextLabel`, an
 * optional `summary` (a node or a function of the slice; use `PaginationCount` for its numbers),
 * `navLabel` for the controls (default Pagination), `pageLabel(n)` for every page-number button,
 * `hooks` for test ids on the buttons, and any div props, which go on the bar.
 */
export function Pagination({
	total,
	page,
	pageSize,
	onPageChange,
	previousLabel,
	nextLabel,
	summary,
	navLabel = 'Pagination',
	pageLabel,
	hooks,
	className,
	...rest
}: PaginationProps) {
	const slice = paginate(total, page, pageSize)
	const pages = Array.from({ length: slice.pageCount }, (_, index) => index + 1)

	return (
		<div className={cx(BAR, className)} {...rest}>
			<span>{typeof summary === 'function' ? summary(slice) : summary}</span>
			<nav aria-label={navLabel} className={PAGES}>
				<button
					type='button'
					data-testid={hooks?.previous}
					className={cx(STEP, CLICKABLE, FOCUS_RING)}
					aria-disabled={slice.page <= 1}
					onClick={() => {
						if (slice.page > 1) onPageChange(slice.page - 1)
					}}
				>
					{previousLabel}
				</button>
				{pages.map((number) =>
					number === slice.page ? (
						<button
							key={number}
							type='button'
							data-testid={hooks?.page}
							data-page={hooks ? number : undefined}
							aria-current='page'
							aria-label={pageLabel?.(number)}
							className={cx(CURRENT, FOCUS_RING)}
						>
							{number}
						</button>
					) : (
						<button
							key={number}
							type='button'
							data-testid={hooks?.page}
							data-page={hooks ? number : undefined}
							aria-label={pageLabel?.(number)}
							className={cx(PAGE, CLICKABLE, FOCUS_RING)}
							onClick={() => onPageChange(number)}
						>
							{number}
						</button>
					),
				)}
				<button
					type='button'
					data-testid={hooks?.next}
					className={cx(STEP, CLICKABLE, FOCUS_RING)}
					aria-disabled={slice.page >= slice.pageCount}
					onClick={() => {
						if (slice.page < slice.pageCount) onPageChange(slice.page + 1)
					}}
				>
					{nextLabel}
				</button>
			</nav>
		</div>
	)
}
