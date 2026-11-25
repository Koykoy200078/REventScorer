'use client'

import { useId, type ComponentPropsWithRef, type ReactNode } from 'react'

import { formatScore } from '@/components/ui/preset-rail'
import { DISABLED } from '@/components/ui/styles'
import { cx } from '@/lib/ui/cx'

/** Each judge view's own manual score box, by the owner's ruling. */
export type ScoreInputVariant = 'unified-individual' | 'unified-group' | 'group' | 'individual'

type InputStyle = {
	root: string
	label: string
	input: string
	/** The "/ max" suffix; SI-3 has none (its card header shows the maximum). */
	suffix?: string
}

// The inputs keep each mockup's own focus treatment (outline-hidden plus a ring or a border
// colour), which is what DESIGN.md asks of inputs. v3 outline-none / shadow-sm are written as v4
// outline-hidden / shadow-xs, the metric-score / score-direct-input hooks are dropped, and the
// mockups' unlinked <label> / <span> captions become <label for>.
const STYLE: Record<ScoreInputVariant, InputStyle> = {
	// SI-1: box U58c68 (inside block U58c1), label U58c181, input U58c337, suffix U58c802.
	'unified-individual': {
		root: 'flex items-center gap-2 bg-slate-50 border border-slate-200 px-space-md py-1.5 rounded-lg shadow-xs',
		label: 'font-label-sm text-label-sm text-slate-500 font-semibold uppercase tracking-wider',
		input:
			'w-24 px-2 py-1 text-right font-headline-sm text-headline-sm font-bold text-slate-900 bg-white border-2 border-emerald-500 rounded-md shadow-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-600',
		suffix: 'font-body-sm text-body-sm text-slate-500 font-medium',
	},
	// SI-2: box U195 (wide: U284), label U196, input U197c9, suffix U198.
	'unified-group': {
		root: 'flex items-center gap-1.5 bg-teal-50/70 border border-teal-200 px-2 py-1 rounded-md',
		label: 'font-label-sm text-label-sm text-teal-800 font-semibold',
		input:
			'w-16 px-1.5 py-0.5 text-right font-label-md text-label-md font-bold text-slate-900 bg-white border border-teal-300 rounded focus:outline-hidden focus:ring-1 focus:ring-teal-600',
		suffix: 'font-label-sm text-label-sm text-teal-700 font-medium',
	},
	// SI-3: wrapper G56, caption G57, input G58.
	group: {
		root: 'ml-auto flex items-center gap-1',
		label: 'font-label-sm text-label-sm text-on-surface-variant',
		input:
			'w-20 px-2 py-1 text-label-md font-label-md font-semibold rounded bg-surface border border-surface-container-high text-on-surface focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary text-right',
	},
	// SI-4: box I4c18813, caption I4c18936, input I4c19042, suffix I4c19358.
	individual: {
		root: 'flex items-center gap-space-xs bg-surface-container-low px-space-md py-1.5 rounded-lg border border-slate-200',
		label: 'font-label-sm text-label-sm uppercase font-bold text-on-surface-variant',
		input:
			'w-24 bg-white text-right font-score-display text-headline-sm font-bold text-on-surface px-2 py-1 rounded border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-primary',
		suffix: 'font-label-sm text-label-sm font-bold text-on-surface-variant',
	},
}

// SI-1's outer block U58c1 and its hint line U58c895; SI-2's wide box U284.
const BLOCK = 'flex flex-col items-end gap-1 self-start md:self-auto'
const HINT = 'text-[11px] text-slate-500 font-medium'
const WIDE_GROUP_BOX = 'flex items-center gap-1.5 bg-teal-50/70 border border-teal-200 px-2.5 py-1 rounded-md self-start md:self-auto'
// B77 (owner 2026-11-26): placeholder hints are slate-500 (about 4.8:1 on white), darker than the guide's slate-400.
const PLACEHOLDER = 'placeholder:text-slate-500'

export type ScoreInputProps = Omit<
	ComponentPropsWithRef<'input'>,
	'type' | 'value' | 'min' | 'max' | 'step' | 'inputMode' | 'className' | 'children'
> & {
	variant: ScoreInputVariant
	/** The controlled entry, a string as the judge form keeps it ('' while empty). */
	value: string
	/** The sub-criterion maximum: the input's `max` and the "/ max" suffix. */
	max: number
	/**
	 * The caption, such as "Manual Score" or "Manual:"; it labels the input. Give `aria-labelledby`
	 * (the criterion title's id) as well, so each input's name says which criterion it scores.
	 */
	label: ReactNode
	/** `unified-individual` only: the small line under the box (U58c895). */
	hint?: ReactNode
	/** `unified-group` only: the full-width group card's box (U284). */
	wide?: boolean
	/** How the maximum is written in the suffix; formatScore by default. */
	format?: (max: number) => string
	/** Classes added to the outer element. */
	className?: string
	/** Classes added to the input. */
	inputClassName?: string
}

/**
 * The manual score box beside a criterion's preset rail, in each view's own style:
 * 'unified-individual' (SI-1: block U58c1, box U58c68, input U58c337, "/ max" U58c802, hint
 * U58c895), 'unified-group' (SI-2: box U195 or wide U284, input U197c9, "/ max" U198), 'group'
 * (SI-3: G56 with input G58 and no suffix) and 'individual' (SI-4: box I4c18813, input I4c19042,
 * "/ max" I4c19358). The input is `type="number"`, `inputMode="decimal"`, step 0.01, min 0 and
 * max = `max`, labelled by `label` and described by the suffix and hint. A caller's
 * `aria-labelledby` (such as the criterion title's id) is read before the caption, so the name is
 * "<criterion> <caption>" and inputs on one page can be told apart. Props: `variant`, the
 * controlled string `value`, `max`, `label`, `hint`, `wide`, `format`, `className` (outer element),
 * `inputClassName`, and every other input prop (`onChange`, `id`, `name`, `aria-labelledby`,
 * `readOnly`, `disabled`, `data-*`, `ref` ...), which goes on the input.
 */
export function ScoreInput({
	variant,
	value,
	max,
	label,
	hint,
	wide = false,
	format = formatScore,
	className,
	inputClassName,
	id,
	'aria-describedby': describedBy,
	'aria-labelledby': labelledBy,
	...rest
}: ScoreInputProps) {
	const autoId = useId()
	const inputId = id ?? `${autoId}-input`
	const captionId = `${autoId}-label`
	const suffixId = `${autoId}-max`
	const hintId = `${autoId}-hint`
	const style = STYLE[variant]
	const showHint = variant === 'unified-individual' && hint != null && hint !== false
	const description = cx(style.suffix ? suffixId : undefined, showHint ? hintId : undefined, describedBy)

	const field = (
		<input
			{...rest}
			id={inputId}
			type='number'
			inputMode='decimal'
			min={0}
			max={max}
			step='0.01'
			value={value}
			aria-labelledby={labelledBy ? cx(labelledBy, captionId) : undefined}
			aria-describedby={description || undefined}
			className={cx(style.input, PLACEHOLDER, DISABLED, inputClassName)}
		/>
	)
	const caption = (
		<label id={captionId} htmlFor={inputId} className={style.label}>
			{label}
		</label>
	)
	const suffix = style.suffix ? (
		<span id={suffixId} className={style.suffix}>
			/ {format(max)}
		</span>
	) : null

	if (variant === 'unified-individual') {
		return (
			<div className={cx(BLOCK, className)}>
				<div className={style.root}>
					{caption}
					<div className='flex items-center gap-1.5'>
						{field}
						{suffix}
					</div>
				</div>
				{showHint ? (
					<span id={hintId} className={HINT}>
						{hint}
					</span>
				) : null}
			</div>
		)
	}

	return (
		<div className={cx(variant === 'unified-group' && wide ? WIDE_GROUP_BOX : style.root, className)}>
			{caption}
			{field}
			{suffix}
		</div>
	)
}
