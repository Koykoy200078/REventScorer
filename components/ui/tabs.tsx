'use client'

import Link from 'next/link'
import {
	createContext,
	useContext,
	useId,
	useLayoutEffect,
	useRef,
	type ComponentProps,
	type ComponentPropsWithRef,
	type KeyboardEvent,
	type ReactNode,
} from 'react'

import { CLICKABLE, DISABLED, FOCUS_RING } from '@/components/ui/styles'
import { cx } from '@/lib/ui/cx'
import { nextRailIndex } from '@/lib/ui/rail'

/** A tab list needs a name: give `aria-label`, or `aria-labelledby` pointing at a visible heading. */
type AccessibleName =
	| { 'aria-label': string; 'aria-labelledby'?: string }
	| { 'aria-label'?: string; 'aria-labelledby': string }

/** The tab rows are horizontal: Left/Right step (stopping at the ends), Home/End jump. */
const ROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End'])

/**
 * `individual`: the individual-only roster (T-2). `unified`: the unified roster cards (T-3).
 * `admin`: the admin console's tab row (T-1) as ARIA tabs on one page; RouteTabs is the same row
 * as page links.
 */
export type TabsVariant = 'individual' | 'unified' | 'admin'

// T-2: I4c10304 (not selected), I4c11167 (selected); the JS hooks examinee-tab / active-tab are
// dropped. T-3: U37c1605 (scored), U37c2264 (selected), U37c3184 (queued). v3 shadow-sm is v4 shadow-xs.
const INDIVIDUAL_OFF =
	'group text-left p-space-sm rounded-lg transition-all duration-150 bg-surface-container-low hover:bg-surface-container flex flex-col justify-between border border-slate-200/80'
const INDIVIDUAL_ON =
	'group text-left p-space-sm rounded-lg transition-all duration-150 bg-primary/10 ring-2 ring-primary flex flex-col justify-between shadow-xs border border-primary/30'
const UNIFIED_DONE =
	'flex flex-col text-left p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-all text-slate-700 shadow-xs'
const UNIFIED_ON =
	'flex flex-col text-left p-2.5 rounded-lg border-2 border-emerald-500 bg-emerald-50/70 shadow-xs transition-all text-emerald-950 ring-2 ring-emerald-600/20 relative'
const UNIFIED_QUEUED =
	'flex flex-col text-left p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-all text-slate-700 shadow-xs'
// U37c2458; py-0.2 (no such v3 key, so no padding in screen.png) is written as a 1px hairline.
const UNIFIED_TAG =
	'absolute -top-1.5 right-2 px-1.5 py-px rounded-full bg-emerald-600 text-white font-label-sm text-[10px] font-bold uppercase tracking-wider'

// T-1: A2c7585 nav, A2c7732 current link, A2c7972 other links (data-active-classes dropped).
const ROUTE_TABS = 'flex items-center gap-space-xs shrink-0'
const ROUTE_TAB_ON =
	'px-space-md py-space-xs rounded-lg transition-colors bg-white text-slate-900 font-semibold shadow-xs border border-slate-200 text-label-md'
const ROUTE_TAB_OFF =
	'px-space-md py-space-xs rounded-lg font-label-md text-label-md text-slate-600 hover:text-slate-900 hover:bg-white transition-colors'

// T-2 grid I4c10189; T-3 grid U37c1524; T-1 row A2c7585.
const LIST: Record<TabsVariant, string> = {
	individual: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-space-sm',
	unified: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2',
	admin: ROUTE_TABS,
}

// The selected T-2 card already draws a 2px primary ring (ring-2 ring-primary), which would hide
// FOCUS_RING's same-colour outline at a 1px offset. Its focus outline sits 4px out instead, so a
// 2px gap separates it from the ring.
const FOCUS_RING_CLEAR_OF_RING =
	'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary'

/**
 * Keeps exactly one tab in the tab order: the selected tab when it is enabled, else the first
 * enabled tab (so the list stays reachable with Tab before a selection, or when the selected tab
 * is disabled). Every tab is written, because React does not rewrite a tabIndex prop that has not
 * changed, so a fallback left at 0 would become a second tab stop after a later selection.
 */
function keepOneTabStop(list: HTMLElement) {
	const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
	const enabled = tabs.filter((tab) => !tab.disabled)
	const stop = enabled.find((tab) => tab.getAttribute('aria-selected') === 'true') ?? enabled[0]
	for (const tab of tabs) tab.tabIndex = tab === stop ? 0 : -1
}

type TabsState = {
	variant: TabsVariant
	value: string
	onChange: (value: string) => void
	activation: 'automatic' | 'manual'
	baseId: string
}

const TabsContext = createContext<TabsState | null>(null)

function useTabs(part: string): TabsState {
	const state = useContext(TabsContext)
	if (!state) throw new Error(`<${part}> must be inside <Tabs>`)
	return state
}

function tabId(baseId: string, value: string): string {
	return `${baseId}-tab-${encodeURIComponent(value)}`
}

function panelId(baseId: string, value: string): string {
	return `${baseId}-panel-${encodeURIComponent(value)}`
}

export type TabsProps = {
	variant: TabsVariant
	/** The selected tab's value. */
	value: string
	onChange: (value: string) => void
	/** `automatic` (default): arrow keys select as they move. `manual`: they move focus; Enter/Space select. */
	activation?: 'automatic' | 'manual'
	children: ReactNode
}

/**
 * State holder for a set of ARIA tabs: an examinee roster (catalogue T-2, the individual-only
 * roster I4c10189, and T-3, the unified roster cards U37c1524) or the admin console's tab row
 * (T-1, A2c7585, when its tabs switch panels on one page). It renders no element of its own, so
 * the `TabList` and the `TabPanel` can sit in different parts of the page. Props: `variant`
 * ('individual' | 'unified' | 'admin'), the controlled `value` and `onChange(value)`, `activation`
 * ('automatic' by default, or 'manual') and `children`.
 */
export function Tabs({ variant, value, onChange, activation = 'automatic', children }: TabsProps) {
	const baseId = useId()
	return (
		<TabsContext.Provider value={{ variant, value, onChange, activation, baseId }}>{children}</TabsContext.Provider>
	)
}

export type TabListProps = Omit<ComponentPropsWithRef<'div'>, 'role' | 'aria-label' | 'aria-labelledby'> &
	AccessibleName & {
		/** Replaces the variant's list classes (the six-wide grid), for a roster of another size. */
		layout?: string
	}

/**
 * The tab row with `role="tablist"`: the roster grid T-2 I4c10189 or T-3 U37c1524, or the admin
 * row T-1 A2c7585, by the `Tabs` variant. After every render it keeps exactly one enabled tab in
 * the tab order (the selected one, else the first enabled one). Props: an accessible name
 * (`aria-label` or `aria-labelledby`), `layout` to replace the grid classes, and any other div
 * props including `ref` (`className` is added to the grid classes).
 */
export function TabList({ layout, className, ref, ...rest }: TabListProps) {
	const { variant } = useTabs('TabList')
	const list = useRef<HTMLDivElement | null>(null)

	useLayoutEffect(() => {
		if (list.current) keepOneTabStop(list.current)
	})

	return (
		<div
			{...rest}
			ref={(element) => {
				list.current = element
				const theirs = typeof ref === 'function' ? ref(element) : undefined
				if (ref && typeof ref !== 'function') ref.current = element
				return () => {
					list.current = null
					if (typeof theirs === 'function') theirs()
					else if (typeof ref === 'function') ref(null)
					else if (ref) ref.current = null
				}
			}}
			role='tablist'
			className={cx(layout ?? LIST[variant], className)}
		/>
	)
}

export type TabProps = Omit<
	ComponentPropsWithRef<'button'>,
	'value' | 'type' | 'role' | 'id' | 'tabIndex' | 'aria-selected' | 'aria-controls'
> & {
	value: string
	/** `unified` only: the examinee is scored, so an unselected card is grey (U37c1605) instead of white (U37c3184). */
	done?: boolean
	/** `unified` only: the floating tag on the card's top edge (U37c2458), such as the active marker's text. */
	tag?: ReactNode
}

/**
 * One tab as a `role="tab"` button. Its shell follows the `Tabs` variant and state: a roster card,
 * T-2 I4c11167 / I4c10304 (selected / not) or T-3 U37c2264 / U37c1605 / U37c3184 (selected /
 * scored / queued), or an admin tab, T-1 A2c7732 / A2c7972 (selected / not; `done` and `tag` are
 * ignored). The content is `children`, styled by the caller: the roster's inner lines are not
 * here, and some change with the selected state, so components/judge/roster reproduces them from
 * the catalogue: T-2 I4c10576 row, I4c10628 meta line / I4c11493 selected (with the ping dot),
 * I4c10968 name, I4c11061 role / I4c11897 selected; T-3 U37c1771 row, U37c1824 name line /
 * U37c3399 queued, U37c2101 role / U37c2891 selected, U37c2173 / U37c2987 / U37c3727 status line
 * (scored / selected, with the pulse dot / queued). Their badges are Badge variants
 * `individual-roster-*` and `unified-roster-*`. The selected tab (else the first enabled one) is
 * the only tab stop; Left/Right/Home/End move between enabled tabs, selecting them in automatic
 * activation. Props: `value`, `done` and `tag` (unified only), and any other button props
 * (`onClick` and `onKeyDown` run first; call `preventDefault()` to stop the tab's own handling).
 */
export function Tab({ value, done = false, tag, className, children, onClick, onKeyDown, ...rest }: TabProps) {
	const { variant, value: selectedValue, onChange, activation, baseId } = useTabs('Tab')
	const selected = value === selectedValue

	function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
		onKeyDown?.(event)
		if (event.defaultPrevented || !ROW_KEYS.has(event.key)) return
		const list = event.currentTarget.closest('[role="tablist"]')
		if (!list) return
		const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'))
		const next = nextRailIndex(tabs.indexOf(event.currentTarget), event.key, tabs.length)
		if (next === null) return
		event.preventDefault()
		const target = tabs[next]
		target.focus()
		const targetValue = target.dataset.value
		if (activation === 'automatic' && targetValue !== undefined && targetValue !== selectedValue) onChange(targetValue)
	}

	let shell: string
	if (variant === 'individual') shell = selected ? INDIVIDUAL_ON : INDIVIDUAL_OFF
	else if (variant === 'admin') shell = selected ? ROUTE_TAB_ON : ROUTE_TAB_OFF
	else shell = cx(selected ? UNIFIED_ON : done ? UNIFIED_DONE : UNIFIED_QUEUED, !selected && tag ? 'relative' : undefined)
	const focus = variant === 'individual' && selected ? FOCUS_RING_CLEAR_OF_RING : FOCUS_RING

	return (
		<button
			{...rest}
			type='button'
			role='tab'
			id={tabId(baseId, value)}
			aria-selected={selected}
			aria-controls={selected ? panelId(baseId, value) : undefined}
			tabIndex={selected ? 0 : -1}
			data-value={value}
			onClick={(event) => {
				onClick?.(event)
				if (!event.defaultPrevented && !selected) onChange(value)
			}}
			onKeyDown={handleKeyDown}
			className={cx(shell, CLICKABLE, focus, DISABLED, className)}
		>
			{variant === 'unified' && tag ? <span className={UNIFIED_TAG}>{tag}</span> : null}
			{children}
		</button>
	)
}

/** The panel's id and name tie it to the selected tab's `aria-controls`, so a caller cannot set them. */
export type TabPanelProps = Omit<ComponentPropsWithRef<'div'>, 'role' | 'id' | 'aria-labelledby'>

/**
 * The `role="tabpanel"` region for the selected tab, labelled by that tab. The mockups have no
 * panel element (the scoring sections simply follow the roster), so it adds no classes of its own.
 * Render one, for the selected value. Props: any div props except `id` and `aria-labelledby`.
 */
export function TabPanel(props: TabPanelProps) {
	const { value, baseId } = useTabs('TabPanel')
	return <div {...props} role='tabpanel' id={panelId(baseId, value)} aria-labelledby={tabId(baseId, value)} />
}

export type RouteTabItem = Omit<ComponentProps<typeof Link>, 'children' | 'className' | 'aria-current'> & {
	label: ReactNode
	/** The page being shown: white raised tab and `aria-current="page"`. */
	current?: boolean
}

export type RouteTabsProps = Omit<ComponentPropsWithRef<'nav'>, 'children'> & {
	items: ReadonlyArray<RouteTabItem>
}

/**
 * The admin console's page tabs in the header's second row (catalogue T-1: A2c7585 nav, A2c7732
 * current link, A2c7972 other links). They change pages, so they are a `<nav>` of Next links with
 * `aria-current="page"`, not ARIA tabs. Props: `items` (any Link props such as `href`, plus
 * `label` and `current?`) and any other nav props (give `aria-label` when the page has another nav).
 * The row around it (A2c7454) belongs to the header.
 */
export function RouteTabs({ items, className, ...rest }: RouteTabsProps) {
	return (
		<nav className={cx(ROUTE_TABS, className)} {...rest}>
			{items.map(({ label, current = false, ...link }, index) => (
				<Link
					key={index}
					{...link}
					aria-current={current ? 'page' : undefined}
					className={cx(current ? ROUTE_TAB_ON : ROUTE_TAB_OFF, CLICKABLE, FOCUS_RING)}
				>
					{label}
				</Link>
			))}
		</nav>
	)
}
