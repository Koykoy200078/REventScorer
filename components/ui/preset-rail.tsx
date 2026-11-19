'use client'

import { useId, useRef, type ComponentPropsWithRef, type KeyboardEvent, type ReactNode } from 'react'

import Icon from '@/components/ui/icon'
import { CLICKABLE, DISABLED, FOCUS_RING } from '@/components/ui/styles'
import { cx } from '@/lib/ui/cx'
import { PRESET_PERCENTS, presetIndexOf, presetValues } from '@/lib/ui/presets'
import { nextRailIndex } from '@/lib/ui/rail'

/** A radio group needs a name: give `aria-label`, or `aria-labelledby` pointing at the criterion title. */
type AccessibleName =
	| { 'aria-label': string; 'aria-labelledby'?: string }
	| { 'aria-label'?: string; 'aria-labelledby': string }

/**
 * A score as the rails and the "/ max" suffix show it: two decimals, as the old judge form and the
 * mockups' maxima do (`30.00`, `0.50`). Presets are always whole hundredths (presetValues rounds
 * them so step 0.01 accepts them); the three-decimal form (`0.125`) is only for a maximum or a
 * value that has more decimals.
 */
export function formatScore(value: number): string {
	if (!Number.isFinite(value)) return ''
	const hundredths = Math.round(value * 100)
	if (Math.abs(value * 100 - hundredths) < 1e-9) return (hundredths / 100).toFixed(2)
	return String(Math.round(value * 1000) / 1000)
}

/** Each judge view's own per-criterion rail, by the owner's ruling. */
export type PresetRailVariant = 'unified-individual' | 'unified-group' | 'group' | 'individual'

type ChipStyle = {
	on: string
	off: string
	/** The "(90%)" sub-label's span; absent where the percentage is plain text or not shown. */
	subOn?: string
	subOff?: string
	/** Whether the chip shows the percentage at all (PR-2 shows the number only). */
	percent: boolean
}

// PR-1 U61, PR-2 U203 (wide: U290), PR-3 G40 (score-pill-group hook dropped), PR-4 tray I4c19454.
const RAIL: Record<PresetRailVariant, string> = {
	'unified-individual': 'flex flex-wrap items-center gap-2 pt-1',
	'unified-group': 'flex items-center gap-1.5 pt-1',
	group: 'flex flex-wrap items-center gap-1.5',
	individual: 'flex items-center gap-1 bg-surface-container-low p-1 rounded-lg border border-slate-200',
}
const RAIL_WIDE = 'flex items-center gap-2 max-w-xl pt-1'

// Chips: PR-1 U62/U71, PR-2 U204/U207, PR-3 G41/G50, PR-4 I4c19555/I4c20198, with the JS hooks
// (pill-chip, score-pill, score-chip, active) dropped and v3 shadow-sm written as v4 shadow-xs.
const CHIP: Record<PresetRailVariant, ChipStyle> = {
	'unified-individual': {
		off: 'flex-1 min-w-[100px] py-2 px-3 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 hover:text-slate-900 font-label-md text-label-md text-center transition-all',
		on: 'flex-1 min-w-[100px] py-2 px-3 rounded-lg bg-emerald-600 border border-emerald-600 text-white font-semibold font-label-md text-label-md text-center shadow-xs',
		subOff: 'font-label-sm text-label-sm text-slate-500',
		subOn: 'font-label-sm text-label-sm text-emerald-100',
		percent: true,
	},
	'unified-group': {
		off: 'flex-1 py-1.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 font-label-sm text-label-sm text-center transition-all',
		on: 'flex-1 py-1.5 rounded-md bg-teal-600 border border-teal-600 text-white font-semibold font-label-sm text-label-sm text-center shadow-xs',
		percent: false,
	},
	group: {
		off: 'px-3.5 py-1.5 rounded-lg border border-surface-container-high bg-surface-variant/30 text-on-surface-variant hover:bg-surface-variant text-label-md font-label-md font-semibold transition-all',
		on: 'px-3.5 py-1.5 rounded-lg border border-primary bg-primary text-on-primary font-bold shadow-xs text-label-md font-label-md transition-all',
		subOff: 'text-[11px] opacity-75',
		subOn: 'text-[11px] text-on-primary/90',
		percent: true,
	},
	individual: {
		off: 'font-label-md text-label-md px-2.5 py-1 rounded transition-all text-on-surface-variant hover:text-on-surface',
		on: 'font-label-md text-label-md px-2.5 py-1 rounded transition-all bg-primary text-on-primary font-bold shadow-xs',
		percent: true,
	},
}

/** Reads the controlled score; an empty string is "no score yet", not 0. */
function toScore(value: number | string | null | undefined): number {
	if (typeof value === 'number') return value
	if (typeof value !== 'string' || value.trim() === '') return Number.NaN
	return Number(value)
}

export type PresetRailProps = Omit<
	ComponentPropsWithRef<'div'>,
	'children' | 'onChange' | 'role' | 'aria-label' | 'aria-labelledby'
> &
	AccessibleName & {
		variant: PresetRailVariant
		/** The sub-criterion maximum; the chips are 0, 50, 75, 90 and 100% of it (presetValues). */
		max: number
		/** The current score, as a number or as the form's input string ('' = none). */
		value: number | string | null | undefined
		/** Called with the chip's score on click and on arrow/Home/End keys. */
		onChange: (value: number) => void
		/** Optional word per chip, in PRESET_PERCENTS order, shown after the percentage: "(90% Exceeds)". */
		labels?: ReadonlyArray<string | undefined>
		/** How a chip's score is written; formatScore by default. */
		format?: (value: number) => string
		disabled?: boolean
		/** `unified-group` only: the full-width group card's rail (U290, gap-2 max-w-xl). */
		wide?: boolean
	}

/**
 * A criterion's score preset chips as a radio group, in each view's own style: 'unified-individual'
 * (PR-1: U61 rail, U62 chip, U71 checked), 'unified-group' (PR-2: U203 or wide U290, U204, U207),
 * 'group' (PR-3: G40, G41, G50) and 'individual' (PR-4: tray I4c19454, I4c19555, I4c20198). The
 * chips come from presetValues(max); the one equal to the score (presetIndexOf) is checked. Only
 * one chip is in the tab order; arrow keys (Right/Up higher, Left/Down lower, stopping at the ends,
 * stepping from a typed score to its neighbouring preset) and Home/End change the value at once.
 * Props: `variant`, `max`, the controlled `value` and `onChange(score)`, `labels`, `format`,
 * `disabled`, `wide`, an accessible name, and any other div props (on the rail). In the group view
 * the mockup's manual input shares the row: put this rail and ScoreInput 'group' in one
 * `flex flex-wrap items-center gap-1.5` row.
 */
export function PresetRail({
	variant,
	max,
	value,
	onChange,
	labels,
	format = formatScore,
	disabled = false,
	wide = false,
	className,
	...rest
}: PresetRailProps) {
	const chips = useRef<Array<HTMLButtonElement | null>>([])
	const values = presetValues(max)
	const score = toScore(value)
	const checked = presetIndexOf(score, max)
	const tabStop = checked >= 0 ? checked : 0
	const style = CHIP[variant]

	/** Where the arrow keys start from when the score is not a preset: between its two neighbours. */
	function startIndex(key: string): number {
		if (checked >= 0 || !Number.isFinite(score)) return checked
		if (key === 'ArrowLeft' || key === 'ArrowDown') {
			const above = values.findIndex((preset) => preset > score)
			return above < 0 ? values.length : above
		}
		return values.filter((preset) => preset < score).length - 1
	}

	function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
		const next = nextRailIndex(startIndex(event.key), event.key, values.length)
		if (next === null) return
		event.preventDefault()
		chips.current[next]?.focus()
		if (next !== checked) onChange(values[next])
	}

	return (
		<div
			role='radiogroup'
			className={cx(variant === 'unified-group' && wide ? RAIL_WIDE : RAIL[variant], className)}
			{...rest}
		>
			{values.map((preset, index) => {
				const isOn = index === checked
				const word = labels?.[index]
				const percent = `(${PRESET_PERCENTS[index]}%${word ? ` ${word}` : ''})`
				const sub = isOn ? style.subOn : style.subOff
				let after: ReactNode = null
				if (style.percent) after = sub ? <span className={sub}>{percent}</span> : percent
				return (
					<button
						key={index}
						ref={(element) => {
							chips.current[index] = element
						}}
						type='button'
						role='radio'
						aria-checked={isOn}
						tabIndex={index === tabStop ? 0 : -1}
						disabled={disabled}
						onClick={() => {
							if (!isOn) onChange(preset)
						}}
						onKeyDown={handleKeyDown}
						className={cx(isOn ? style.on : style.off, CLICKABLE, FOCUS_RING, DISABLED)}
					>
						{format(preset)}
						{after ? ' ' : null}
						{after}
					</button>
				)
			})}
		</div>
	)
}

/** Each judge view's own "apply to every criterion" rail. */
export type BatchRailVariant = 'unified' | 'group' | 'individual'

export type BatchRailAction = Omit<ComponentPropsWithRef<'button'>, 'children' | 'type'> & {
	/** The button text, such as "90% (Exceeds)". BR-1's reset has none (give `aria-label`). */
	label?: ReactNode
	/** A leading mark such as "⚡" or "⚖", hidden from screen readers. Resets default to the view's ↺ / restart icon. */
	marker?: ReactNode
	/** The marker's colour in the unified (emerald / teal) and group (primary / none) rails. */
	tone?: 'primary' | 'secondary'
	/** `reset` uses the view's reset styling (red hover, error text). */
	kind?: 'preset' | 'reset'
}

type BatchStyle = {
	root: string
	label: string
	/** BR-2 puts the buttons in a tray under the label. */
	tray?: string
	preset: string
	reset: string
	marker: Record<'primary' | 'secondary', string | undefined>
	resetMarker: ReactNode
}

// BR-1 U37c519 (U37c563 label, U37c664 / U37c959 presets, U37c1252 reset).
// BR-2 G10c813 (G10c882 label, G10c992 tray, G10c1105 / G10c1378 presets, G10c1626 reset).
// BR-3 I4c16568 (I4c16714 label, I4c16823 presets, I4c17513 reset).
const BATCH: Record<BatchRailVariant, BatchStyle> = {
	unified: {
		root: 'flex items-center gap-space-xs',
		label: 'font-label-sm text-label-sm text-slate-500 font-medium mr-1',
		preset:
			'px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-label-sm text-label-sm font-medium flex items-center gap-1 transition-colors',
		reset:
			'px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 hover:text-red-600 font-label-sm text-label-sm font-medium transition-colors',
		marker: { primary: 'text-emerald-600 font-bold', secondary: 'text-teal-600 font-bold' },
		resetMarker: '↺',
	},
	group: {
		root: 'flex flex-col items-start md:items-end gap-1.5 shrink-0',
		label: 'font-label-sm text-label-sm text-on-surface-variant font-medium',
		tray: 'flex items-center gap-1.5 bg-surface-variant/50 p-1 rounded-lg border border-surface-container-high',
		preset:
			'px-2.5 py-1 text-label-sm font-label-sm font-semibold rounded bg-surface hover:bg-surface-bright text-on-surface shadow-xs transition-colors flex items-center gap-1',
		reset:
			'px-2 py-1 text-label-sm font-label-sm font-medium rounded text-on-surface-variant hover:text-error transition-colors flex items-center gap-1',
		marker: { primary: 'text-primary', secondary: undefined },
		resetMarker: '↺',
	},
	individual: {
		root: 'flex flex-wrap items-center gap-space-xs bg-surface-container-low p-1.5 rounded-lg border border-slate-200 self-start lg:self-center',
		label: 'font-label-sm text-label-sm text-on-surface-variant px-2 font-medium',
		preset:
			'font-label-md text-label-md px-space-sm py-1 rounded bg-surface hover:bg-surface-container text-on-surface font-semibold shadow-xs transition-colors',
		reset:
			'font-label-md text-label-md px-space-sm py-1 rounded bg-surface hover:bg-surface-container text-error font-semibold shadow-xs transition-colors',
		marker: { primary: undefined, secondary: undefined },
		resetMarker: <Icon name='restart_alt' className='text-[14px] align-middle' />,
	},
}

export type BatchRailProps = Omit<ComponentPropsWithRef<'div'>, 'children'> & {
	variant: BatchRailVariant
	/** The rail's caption, such as "Quick Calibrations:"; it also names the button group. */
	label?: ReactNode
	actions: ReadonlyArray<BatchRailAction>
}

/**
 * The "apply a preset to every criterion" buttons, in each view's own style: 'unified' (BR-1,
 * U37c519), 'group' (BR-2, G10c813, buttons in a tray under the caption) and 'individual' (BR-3,
 * I4c16568). A `role="group"` named by its caption. Props: `variant`, `label` (the caption),
 * `actions` (each: `label`, `marker`, `tone`, `kind` and any button props such as `onClick`,
 * `title`, `aria-label`, `disabled`) and any other div props (on the rail). A reset with no label
 * and no `aria-label` is announced as "Reset scores", the mockup's title.
 */
export function BatchRail({ variant, label, actions, className, ...rest }: BatchRailProps) {
	const captionId = useId()
	const style = BATCH[variant]

	const buttons = actions.map((action, index) => {
		const { label: text, marker, tone = 'primary', kind = 'preset', className: extra, 'aria-label': named, ...button } = action
		const isReset = kind === 'reset'
		const mark = marker ?? (isReset ? style.resetMarker : null)
		const markClass = isReset ? undefined : style.marker[tone]
		const fallbackName = isReset && !text && !button['aria-labelledby'] ? 'Reset scores' : undefined
		return (
			<button
				key={index}
				{...button}
				type='button'
				aria-label={named ?? fallbackName}
				className={cx(isReset ? style.reset : style.preset, CLICKABLE, FOCUS_RING, DISABLED, extra)}
			>
				{mark ? (
					<span aria-hidden='true' className={markClass}>
						{mark}
					</span>
				) : null}
				{mark && text ? ' ' : null}
				{text}
			</button>
		)
	})

	return (
		<div
			role='group'
			aria-labelledby={label ? captionId : undefined}
			className={cx(style.root, className)}
			{...rest}
		>
			{label ? (
				<span id={captionId} className={style.label}>
					{label}
				</span>
			) : null}
			{style.tray ? <div className={style.tray}>{buttons}</div> : buttons}
		</div>
	)
}
