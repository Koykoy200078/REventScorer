'use client'

import { useId, type ChangeEventHandler, type ComponentPropsWithRef, type ReactNode } from 'react'

import Icon from '@/components/ui/icon'
import type { IconName } from '@/components/ui/icon-data'
import { DISABLED } from '@/components/ui/styles'
import { cx } from '@/lib/ui/cx'

/** unified = TA-1 (U325), group = TA-2 (G248c1), individual = TA-3 (I4c31098). */
export type TextareaVariant = 'unified' | 'group' | 'individual'

/** The field itself per variant, with the focus treatment each mockup shows. */
const FIELD: Record<TextareaVariant, string> = {
	unified:
		'w-full bg-white text-slate-900 border border-slate-300 rounded-lg p-space-md font-body-md text-body-md placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 resize-y shadow-inner',
	group:
		'w-full rounded-lg bg-surface-variant/20 border border-surface-container-high px-space-md py-space-sm font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary transition-colors resize-y',
	individual:
		'w-full bg-surface-container-low text-on-surface font-body-md text-body-md p-space-md rounded-lg border border-slate-200 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-primary shadow-inner resize-y',
}

/**
 * The outer stack per variant: U324 for TA-1; for TA-2 and TA-3 the gap of the card that holds the
 * field and its hint row in the mockup (G216, I4c29127).
 */
const ROOT: Record<TextareaVariant, string> = {
	unified: 'flex flex-col gap-space-xs',
	group: 'flex flex-col gap-space-md',
	individual: 'flex flex-col gap-space-md',
}

/** The hint row under the field: U326, G250 with G251 and G255, I4c31630 with I4c31729. */
const META: Record<TextareaVariant, { row: string; hint: string; icon: string; counter: string }> = {
	unified: {
		row: 'flex items-center justify-between text-slate-500 font-label-sm text-label-sm',
		hint: 'flex items-center gap-1',
		icon: 'text-[15px] text-emerald-600',
		counter: '',
	},
	group: {
		row: 'flex items-center justify-between text-on-surface-variant pt-1',
		hint: 'flex items-center gap-1 text-[12px]',
		icon: 'text-primary text-[14px]',
		counter: 'text-[12px]',
	},
	individual: {
		row: 'flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm',
		hint: 'flex items-center gap-1',
		icon: 'text-[15px] text-primary',
		counter: '',
	},
}

export type TextareaProps = Omit<ComponentPropsWithRef<'textarea'>, 'value' | 'defaultValue' | 'onChange'> & {
	/** Which mockup to follow. */
	variant: TextareaVariant
	/** The current text (controlled). */
	value: string
	onChange: ChangeEventHandler<HTMLTextAreaElement>
	/** A visible label above the field, in the G247 style. Without it, name the field with aria-labelledby or aria-label. */
	label?: ReactNode
	/** Left text of the hint row, for example the draft status. */
	hint?: ReactNode
	/** Icon before the hint, for example cloud_done as in G251 and I4c31729. */
	hintIcon?: IconName
	/** Right text of the hint row, for example a character count. */
	counter?: ReactNode
	/** Extra classes for the outer stack. className goes on the textarea. */
	wrapperClassName?: string
}

/**
 * The remarks field of catalogue section 16 in its three variants: TA-1 (U324 stack, U325 field,
 * U326 hint row), TA-2 (G247 label, G248c1 field, G250 hint row) and TA-3 (I4c31098 field, I4c31630
 * hint row). It is controlled: value and onChange are required. Props: variant, value, onChange,
 * label, hint, hintIcon, counter, wrapperClassName; rows defaults to 3 and every other native
 * textarea prop, ref and className go on the textarea. The hint and the counter describe the field
 * through aria-describedby. Keyboard focus uses the focus style of each mockup, and the field dims
 * when disabled.
 */
export default function Textarea({
	variant,
	value,
	onChange,
	label,
	hint,
	hintIcon,
	counter,
	wrapperClassName,
	id: idProp,
	rows = 3,
	className,
	'aria-describedby': describedByProp,
	...rest
}: TextareaProps) {
	const autoId = useId()
	const id = idProp ?? autoId
	const hintId = `${id}-hint`
	const counterId = `${id}-counter`
	const hasHint = hint != null && hint !== false
	const hasCounter = counter != null && counter !== false
	const describedBy =
		[describedByProp, hasHint ? hintId : null, hasCounter ? counterId : null].filter(Boolean).join(' ') || undefined
	const meta = META[variant]

	return (
		<div className={cx(ROOT[variant], wrapperClassName)}>
			<div className='flex flex-col gap-1'>
				{label ? (
					<label htmlFor={id} className='font-label-sm text-label-sm font-semibold text-on-surface'>
						{label}
					</label>
				) : null}
				<textarea
					{...rest}
					id={id}
					rows={rows}
					value={value}
					onChange={onChange}
					aria-describedby={describedBy}
					className={cx(FIELD[variant], DISABLED, className)}
				/>
			</div>
			{hasHint || hasCounter ? (
				<div className={meta.row}>
					{hasHint ? (
						<span id={hintId} className={meta.hint}>
							{hintIcon ? <Icon name={hintIcon} className={meta.icon} /> : null}
							<span>{hint}</span>
						</span>
					) : null}
					{hasCounter ? (
						<span id={counterId} className={cx('ml-auto', meta.counter)}>
							{counter}
						</span>
					) : null}
				</div>
			) : null}
		</div>
	)
}
