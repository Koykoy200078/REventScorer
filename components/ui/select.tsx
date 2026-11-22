import type { ComponentPropsWithRef, ReactNode } from 'react'
import type { CSSObjectWithLabel } from 'react-select'

import Icon from '@/components/ui/icon'
import { CLICKABLE, DISABLED, FOCUS_RING } from '@/components/ui/styles'
import { cx } from '@/lib/ui/cx'

// Catalogue section 13, DD-1 (A460 to A462): the only select in the mockups, the admin matrix
// status filter. screen.png shows a bordered box with a chevron inside the pill, but that box is
// the forms plugin's (catalogue section 13 and section G: screenshot, not intent). The markup
// intent wins, so the filter is A462 as written: a bare native select, with its native arrow,
// sitting in the pill. The DD-2 to DD-5 header switchers are buttons, not selects, and belong to
// the app header.

/** filter: DD-1 as a whole, the labelled pill. field: a boxed select, full width, for forms. */
export type SelectVariant = 'filter' | 'field'

// A460: the pill, and A461: its label.
const PILL = 'flex items-center gap-space-xs bg-white border border-slate-200 px-space-md py-1.5 rounded-lg shadow-2xs'
const PILL_LABEL = 'font-label-sm text-label-sm text-slate-500 uppercase font-semibold'

// A462 as written, less its focus outline removal, which would cancel FOCUS_RING.
const FILTER_TEXT = 'bg-transparent text-slate-800 font-label-md text-label-md cursor-pointer'

// Not in the mockups, field only: a box modelled on the forms plugin's select (1px gray-500
// border, square corners, padding 0.5rem 2.5rem 0.5rem 0.75rem) with its own chevron.
const BOX = 'peer appearance-none border border-gray-500 rounded-none py-2 pl-3 pr-10'

// Not in the mockups: the box on a white field at body size, for a form with its own label.
const FIELD_TEXT = 'w-full bg-white text-slate-900 font-body-md text-body-md'

// The field chevron: 1.5em of body-md (21px), 0.5rem from the right.
const CHEVRON = 'pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 peer-disabled:opacity-50'

type NativeSelectProps = Omit<ComponentPropsWithRef<'select'>, 'multiple' | 'size'> & {
	/** Classes for the outer element: the pill (filter) or the positioning wrapper (field). */
	wrapperClassName?: string
}

export type SelectProps = NativeSelectProps &
	(
		| {
				variant?: 'filter'
				/** The visible label inside the pill (A461); it also names the select. */
				label: ReactNode
		  }
		| {
				variant: 'field'
				/** A field is named by the form: a label with htmlFor, or aria-label. */
				label?: never
		  }
	)

/**
 * A native select drawn like the admin status filter (catalogue section 13, DD-1: A460 pill, A461
 * label, A462 select). Variant filter (default) is the whole DD-1 as the markup writes it: a white
 * pill that is a `<label>`, holding the uppercase `label` and a bare native select with its native
 * arrow (the box in screen.png is the forms plugin's and is not drawn). Variant field (not in the
 * mockups) is a boxed select (1px gray-500 border, square corners, its own chevron), full width,
 * on white at body size, for forms that label it themselves. Props: `variant`, `label` (filter
 * only), `wrapperClassName` for the outer element, and any select props (`value`, `onChange`,
 * `disabled`, `name`, `className`, `ref` ...), which go on the `<select>`; children are its
 * `<option>`s. Focus shows FOCUS_RING; disabled dims the select (and the field chevron).
 */
export function Select(props: SelectProps) {
	const { variant = 'filter', label, wrapperClassName, className, children, ...rest } = props

	if (variant === 'field') {
		return (
			<span className={cx('relative block', wrapperClassName)}>
				<select className={cx(BOX, FIELD_TEXT, CLICKABLE, FOCUS_RING, DISABLED, className)} {...rest}>
					{children}
				</select>
				<Icon name='expand_more' className={cx(CHEVRON, 'text-[21px]')} />
			</span>
		)
	}

	// The pill's label wraps the select, so its text would include every option's; a text label names the select
	// exactly through aria-label (unless the caller names it).
	const named = 'aria-label' in rest || 'aria-labelledby' in rest
	return (
		<label className={cx(PILL, wrapperClassName)}>
			<span className={PILL_LABEL}>{label}</span>
			<select aria-label={!named && typeof label === 'string' ? label : undefined} className={cx(FILTER_TEXT, FOCUS_RING, DISABLED, className)} {...rest}>
				{children}
			</select>
		</label>
	)
}

// react-select draws its control with inline styles, so each variant is written as CSS values.
// Default-palette colours are read from the Tailwind variables when the build emits them, with the
// hex values as a fallback; the type roles are static theme tokens and always exist.
const GRAY_500 = 'var(--color-gray-500, #6b7280)'
const SLATE_100 = 'var(--color-slate-100, #f1f5f9)'
const SLATE_400 = 'var(--color-slate-400, #94a3b8)'
const SLATE_500 = 'var(--color-slate-500, #64748b)'
const SLATE_600 = 'var(--color-slate-600, #475569)'
const SLATE_800 = 'var(--color-slate-800, #1e293b)'
const SLATE_900 = 'var(--color-slate-900, #0f172a)'
const PRIMARY = 'var(--color-primary, #059669)'

function typeRole(role: 'label-md' | 'body-md' | 'label-sm') {
	return {
		fontSize: `var(--text-${role})`,
		lineHeight: `var(--text-${role}--line-height)`,
		letterSpacing: `var(--text-${role}--letter-spacing)`,
		fontWeight: `var(--text-${role}--font-weight)`,
	}
}

// filter: A462 bare in the pill, no border or padding, a small chevron in the text colour where
// the native arrow would be. field: the box of the Select field variant.
const VARIANT_STYLE = {
	filter: {
		type: typeRole('label-md'),
		color: SLATE_800,
		background: 'transparent',
		borderWidth: 0,
		valuePadding: 0,
		indicatorPadding: '0 0 0 0.25rem',
		indicatorColor: SLATE_800,
		indicatorSize: '1.25em',
	},
	field: {
		type: typeRole('body-md'),
		color: SLATE_900,
		background: '#ffffff',
		borderWidth: 1,
		valuePadding: '0.5rem 0 0.5rem 0.75rem',
		indicatorPadding: '0 0.5rem 0 calc(2rem - 1.5em)',
		indicatorColor: GRAY_500,
		indicatorSize: '1.5em',
	},
} as const

type StyleFn<State = object> = (base: CSSObjectWithLabel, state: State) => CSSObjectWithLabel
type FocusState = { isFocused: boolean; isDisabled: boolean }
type OptionState = { isFocused: boolean; isSelected: boolean; isDisabled: boolean }

/**
 * The style functions selectStyles returns. They read only state flags that every react-select
 * passes, never the option type, so the object is assignable to StylesConfig of any Option, IsMulti
 * and Group, and passing it as `styles` leaves the option type to be inferred from `options`.
 */
export type SelectBoxStyles = {
	container: StyleFn
	control: StyleFn<FocusState>
	valueContainer: StyleFn
	singleValue: StyleFn
	placeholder: StyleFn
	input: StyleFn
	indicatorSeparator: StyleFn
	clearIndicator: StyleFn
	dropdownIndicator: StyleFn
	groupHeading: StyleFn
	option: StyleFn<OptionState>
	noOptionsMessage: StyleFn
	loadingMessage: StyleFn
}

/**
 * react-select styles that draw the same control as `Select`, with no indicator separator. Pass
 * it as the `styles` prop: selectStyles(variant). Variant filter (default) is A462 as written
 * (catalogue DD-1): no border and no padding, the A462 text (label-md, slate-800) on the
 * transparent pill, and a small chevron in the text colour where the native arrow would be.
 * Variant field (not in the mockups) is the Select field box: a 1px gray-500 border with square
 * corners, padding 0.5rem 2.5rem 0.5rem 0.75rem, body-md slate-900 on white, and a gray-500
 * chevron 1.5em wide at 0.5rem from the right. Focus shows the FOCUS_RING outline (2px primary,
 * 1px offset); disabled is at 50% opacity. The menu panel is not in the mockups: react-select
 * keeps its own, with options in slate and the selected one in primary, and group headings in the
 * A461 label style. The result fits the `styles` prop of any react-select without fixing its
 * option type (see SelectBoxStyles).
 */
export function selectStyles(variant: SelectVariant = 'filter'): SelectBoxStyles {
	const look = VARIANT_STYLE[variant]

	return {
		container: (base) => ({ ...base, ...look.type }),
		control: (base, { isFocused, isDisabled }) => ({
			...base,
			minHeight: 0,
			backgroundColor: look.background,
			borderColor: GRAY_500,
			borderStyle: 'solid',
			borderWidth: look.borderWidth,
			borderRadius: 0,
			boxShadow: 'none',
			cursor: isDisabled ? 'not-allowed' : 'pointer',
			opacity: isDisabled ? 0.5 : 1,
			outline: isFocused ? `2px solid ${PRIMARY}` : 'none',
			outlineOffset: 1,
			'&:hover': { borderColor: GRAY_500 },
		}),
		valueContainer: (base) => ({ ...base, padding: look.valuePadding }),
		singleValue: (base) => ({ ...base, marginLeft: 0, marginRight: 0, color: look.color }),
		placeholder: (base) => ({ ...base, marginLeft: 0, marginRight: 0, color: SLATE_400 }),
		input: (base) => ({ ...base, margin: 0, paddingTop: 0, paddingBottom: 0, color: look.color }),
		indicatorSeparator: () => ({ display: 'none' }),
		clearIndicator: (base) => ({
			...base,
			padding: '0 0 0 0.5rem',
			color: SLATE_400,
			'&:hover': { color: SLATE_600 },
			'& svg': { width: '1.25em', height: '1.25em' },
		}),
		dropdownIndicator: (base) => ({
			...base,
			padding: look.indicatorPadding,
			color: look.indicatorColor,
			'&:hover': { color: look.indicatorColor },
			'& svg': { width: look.indicatorSize, height: look.indicatorSize },
		}),
		groupHeading: (base) => ({
			...base,
			...typeRole('label-sm'),
			color: SLATE_500,
			textTransform: 'uppercase',
		}),
		option: (base, { isFocused, isSelected, isDisabled }) => ({
			...base,
			cursor: isDisabled ? 'not-allowed' : 'pointer',
			backgroundColor: isSelected ? PRIMARY : isFocused ? SLATE_100 : 'transparent',
			color: isDisabled ? SLATE_400 : isSelected ? '#ffffff' : look.color,
			':active': { backgroundColor: isDisabled ? undefined : isSelected ? PRIMARY : SLATE_100 },
		}),
		noOptionsMessage: (base) => ({ ...base, color: SLATE_500 }),
		loadingMessage: (base) => ({ ...base, color: SLATE_500 }),
	}
}
