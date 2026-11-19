import type { ComponentPropsWithRef, ReactNode } from 'react'

import { cx } from '@/lib/ui/cx'

// Catalogue section 10: the admin console score matrix (A473 to A533). The mockup has no sticky
// header, no zebra striping and no sort control, so none is added here.

// A473 scroll wrapper and A474 table.
const WRAPPER = 'w-full overflow-x-auto'
const TABLE = 'w-full text-left border-collapse'

// A476: the one header row. Its th cells keep the browser bold weight over the inherited
// font-semibold, exactly as the mockup renders.
const HEAD_ROW =
	'bg-slate-100/80 border-b border-slate-200 text-slate-600 font-label-sm text-label-sm uppercase tracking-wider font-semibold'

// A477 to A483: header cells. Column widths (w-16, min-w-[280px] ...) come from the caller.
const HEADER_CELL = {
	left: 'py-space-sm px-space-md',
	center: 'py-space-sm px-space-md text-center',
	right: 'py-space-sm px-space-md text-right',
} as const

// A486
const BODY = 'divide-y divide-slate-200'

// A488: every body row, with the row hover. The contestant-row script hook is left out.
const ROW = 'bg-white hover:bg-slate-50 transition-colors'

// A489, A492, A515: the three body cell strings, as counted in the catalogue.
const CELL = {
	left: 'py-space-md px-space-md align-top',
	center: 'py-space-md px-space-md text-center align-top',
	right: 'py-space-md px-space-md text-right align-top',
} as const

export type DataTableAlign = keyof typeof CELL

export type DataTableProps = ComponentPropsWithRef<'table'> & {
	/** Read by screen readers only; leave it out when the table is named by aria-labelledby. */
	caption?: ReactNode
	/** Classes for the horizontal scroll wrapper (A473). */
	wrapperClassName?: string
}

/**
 * The score matrix table shell (catalogue section 10: A473 scroll wrapper, A474 table). It renders
 * a real `<table>` inside a full-width wrapper that scrolls sideways on narrow screens; the
 * scrollbar stays visible. Props: `caption` (an optional screen-reader caption), `wrapperClassName`
 * for the wrapper, and any table props (`className`, `ref`, `aria-labelledby` ...), which go on the
 * `<table>`. Children are a `DataTableHead` and a `DataTableBody`.
 */
export function DataTable({ caption, wrapperClassName, className, children, ...rest }: DataTableProps) {
	return (
		<div className={cx(WRAPPER, wrapperClassName)}>
			<table className={cx(TABLE, className)} {...rest}>
				{caption ? <caption className='sr-only'>{caption}</caption> : null}
				{children}
			</table>
		</div>
	)
}

export type DataTableHeadProps = ComponentPropsWithRef<'tr'>

/**
 * The table header (catalogue A476): a `<thead>` holding the single header row, tinted slate with a
 * bottom rule and small uppercase labels. Props are those of the header row `<tr>` (`className`,
 * `ref` ...); children are `DataTableHeaderCell`s.
 */
export function DataTableHead({ className, children, ...rest }: DataTableHeadProps) {
	return (
		<thead>
			<tr className={cx(HEAD_ROW, className)} {...rest}>
				{children}
			</tr>
		</thead>
	)
}

export type DataTableHeaderCellProps = Omit<ComponentPropsWithRef<'th'>, 'align'> & {
	/** Text alignment: left (default), center (A477 rank, A483 actions) or right (A480 scores). */
	align?: DataTableAlign
}

/**
 * One column header (catalogue A477 to A483: py-space-sm px-space-md, plus text-center or
 * text-right). It is a `<th scope='col'>` by default. Props: `align` (left, center or right), and
 * any th props (`scope`, `className` for the column width, `aria-sort` ...); children are the label.
 */
export function DataTableHeaderCell({ align = 'left', scope = 'col', className, ...rest }: DataTableHeaderCellProps) {
	return <th scope={scope} className={cx(HEADER_CELL[align], className)} {...rest} />
}

export type DataTableBodyProps = ComponentPropsWithRef<'tbody'>

/**
 * The table body (catalogue A486): a `<tbody>` with a slate-200 rule between rows. Props are any
 * tbody props; children are `DataTableRow`s.
 */
export function DataTableBody({ className, ...rest }: DataTableBodyProps) {
	return <tbody className={cx(BODY, className)} {...rest} />
}

export type DataTableRowProps = ComponentPropsWithRef<'tr'>

/**
 * One body row (catalogue A488): white, turning slate-50 on hover with a colour transition. Props
 * are any tr props (`className`, `data-*`, `ref` ...); children are `DataTableCell`s.
 */
export function DataTableRow({ className, ...rest }: DataTableRowProps) {
	return <tr className={cx(ROW, className)} {...rest} />
}

export type DataTableCellProps = Omit<ComponentPropsWithRef<'td'>, 'align'> & {
	/** Text alignment: left (default, A492), center (A489 rank, A533 actions) or right (A515 scores). */
	align?: DataTableAlign
	/** Render a `<th scope='row'>` that names its row, with the same look as a plain cell. */
	rowHeader?: boolean
}

/**
 * One body cell (catalogue A489, A492, A515: py-space-md px-space-md align-top, plus text-center
 * or text-right). Props: `align` (left, center or right), `rowHeader` to make the cell the header
 * of its row (a `<th scope='row'>` at normal weight, so it looks like the other cells), and any td
 * props; children are the cell content, which the screen styles.
 */
export function DataTableCell({ align = 'left', rowHeader = false, className, ...rest }: DataTableCellProps) {
	if (rowHeader) return <th scope='row' className={cx(CELL[align], 'font-normal', className)} {...rest} />
	return <td className={cx(CELL[align], className)} {...rest} />
}
