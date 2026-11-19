'use client'

import Link from 'next/link'
import { useRef, type ComponentProps, type ComponentPropsWithRef, type KeyboardEvent, type ReactNode } from 'react'

import { CLICKABLE, DISABLED, FOCUS_RING } from '@/components/ui/styles'
import { cx } from '@/lib/ui/cx'
import { nextRailIndex } from '@/lib/ui/rail'

/** A radio group needs a name: give `aria-label`, or `aria-labelledby` pointing at a visible heading. */
type AccessibleName =
	| { 'aria-label': string; 'aria-labelledby'?: string }
	| { 'aria-label'?: string; 'aria-labelledby': string }

/**
 * As in a native radio group, Right/Down select the next item and Left/Up the previous one
 * (stopping at the ends); Home/End jump. Up/Down are mapped here because nextRailIndex treats Up
 * as "higher", which is right for scores but backwards for a radio group.
 */
const STRIP_KEYS: ReadonlyMap<string, string> = new Map([
	['ArrowRight', 'ArrowRight'],
	['ArrowDown', 'ArrowRight'],
	['ArrowLeft', 'ArrowLeft'],
	['ArrowUp', 'ArrowLeft'],
	['Home', 'Home'],
	['End', 'End'],
])

// SC-1 (U24, U25 active, U28 inactive). v3 shadow-sm is v4 shadow-xs.
const TOGGLE = 'flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 self-start md:self-auto'
const TOGGLE_ON =
	'px-space-md py-1.5 rounded-md bg-emerald-600 text-white font-label-md text-label-md font-semibold transition-colors shadow-xs'
const TOGGLE_OFF = 'px-space-md py-1.5 rounded-md text-slate-600 hover:text-slate-900 font-label-md text-label-md transition-colors'

// SC-2 (U3c5487 container, U3c5579 active, U3c5803 inactive). The owner chose U's emerald active
// link for every view, so G4c5007's and I4c5215's white actives are not used.
const SWITCHER = 'flex items-center bg-slate-100 p-1 rounded-lg gap-1 border border-slate-200/80'
const SWITCHER_ON =
	'px-space-md py-1.5 rounded-md text-sm font-semibold transition-colors whitespace-nowrap bg-emerald-600 text-white shadow-xs'
const SWITCHER_OFF =
	'font-label-md text-label-md px-space-md py-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white/70 transition-colors whitespace-nowrap'

export type SegmentedItem<V extends string> = {
	value: V
	label: ReactNode
	disabled?: boolean
}

export type SegmentedControlProps<V extends string> = Omit<
	ComponentPropsWithRef<'div'>,
	'children' | 'onChange' | 'role' | 'aria-label' | 'aria-labelledby'
> &
	AccessibleName & {
		items: ReadonlyArray<SegmentedItem<V>>
		value: V
		onChange: (value: V) => void
		disabled?: boolean
	}

/**
 * The unified judge mockup's in-page view toggle (catalogue SC-1: U24 strip, U25 current item,
 * U28/U31 other items). It is a radio group: the current item gets the emerald fill with
 * `aria-checked` and `aria-current`, only that item is in the tab order, and the arrow keys
 * (Right/Down next, Left/Up previous) and Home/End move the selection at once (stopping at the
 * ends, skipping disabled items). Props: `items`
 * ({ value, label, disabled? }), the controlled `value` and `onChange(value)`, `disabled` for the
 * whole strip, an accessible name (`aria-label` or `aria-labelledby`), and any other div props,
 * which go on the strip.
 */
export function SegmentedControl<V extends string>({
	items,
	value,
	onChange,
	disabled = false,
	className,
	...rest
}: SegmentedControlProps<V>) {
	const buttons = useRef<Array<HTMLButtonElement | null>>([])
	const enabled = items.flatMap((item, index) => (disabled || item.disabled ? [] : [index]))
	const checked = items.findIndex((item) => item.value === value)
	const tabStop = enabled.includes(checked) ? checked : (enabled[0] ?? -1)

	function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
		const key = STRIP_KEYS.get(event.key)
		if (key === undefined) return
		const next = nextRailIndex(enabled.indexOf(index), key, enabled.length)
		if (next === null) return
		event.preventDefault()
		const target = enabled[next]
		buttons.current[target]?.focus()
		if (items[target].value !== value) onChange(items[target].value)
	}

	return (
		<div role='radiogroup' className={cx(TOGGLE, className)} {...rest}>
			{items.map((item, index) => {
				const isOn = index === checked
				return (
					<button
						key={item.value}
						ref={(element) => {
							buttons.current[index] = element
						}}
						type='button'
						role='radio'
						aria-checked={isOn}
						aria-current={isOn ? 'true' : undefined}
						tabIndex={index === tabStop ? 0 : -1}
						disabled={disabled || item.disabled}
						onClick={() => {
							if (!isOn) onChange(item.value)
						}}
						onKeyDown={(event) => handleKeyDown(event, index)}
						className={cx(isOn ? TOGGLE_ON : TOGGLE_OFF, CLICKABLE, FOCUS_RING, DISABLED)}
					>
						{item.label}
					</button>
				)
			})}
		</div>
	)
}

export type RouteSwitcherItem = Omit<ComponentProps<typeof Link>, 'children' | 'className' | 'aria-current'> & {
	label: ReactNode
	/** The page being shown: emerald fill and `aria-current="page"`. */
	current?: boolean
}

export type RouteSwitcherProps = Omit<ComponentPropsWithRef<'nav'>, 'children'> & {
	items: ReadonlyArray<RouteSwitcherItem>
}

/**
 * The judge header's view switcher (catalogue SC-2: U3c5487 strip, U3c5579 current link, U3c5803
 * other links). A `<nav>` of Next links; the current one carries `aria-current="page"` and, by
 * the owner's ruling, the unified mockup's emerald fill in every view. Props: `items` (any Link
 * props such as `href` and `scroll`, plus `label` and `current?`) and any other nav props, which go
 * on the strip (give `aria-label` when the page has another nav). The mockup's
 * `hidden md:flex ... flex-1` wrapper belongs to the header, not to this strip.
 */
export function RouteSwitcher({ items, className, ...rest }: RouteSwitcherProps) {
	return (
		<nav className={cx(SWITCHER, className)} {...rest}>
			{items.map(({ label, current = false, ...link }, index) => (
				<Link
					key={index}
					{...link}
					aria-current={current ? 'page' : undefined}
					className={cx(current ? SWITCHER_ON : SWITCHER_OFF, CLICKABLE, FOCUS_RING)}
				>
					{label}
				</Link>
			))}
		</nav>
	)
}
