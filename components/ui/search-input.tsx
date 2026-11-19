import type { ComponentPropsWithRef } from 'react'

import Icon from '@/components/ui/icon'
import { DISABLED } from '@/components/ui/styles'
import { cx } from '@/lib/ui/cx'

// Catalogue section 12: the score matrix search (A443 to A445).

// A443
const WRAPPER = 'relative flex-1 max-w-md'

// A444, plus pointer-events-none so a click on the icon reaches the input.
const ICON = 'pointer-events-none absolute left-3 top-2.5 text-slate-400 text-[18px]'

// A445 in v4 spelling. The mockup draws its own focus (emerald ring and border), so the shared
// FOCUS_RING is not added: its outline would be cancelled by outline-hidden and doubled by the ring.
const INPUT =
	'w-full pl-9 pr-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 font-body-sm text-body-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs'

export type SearchInputProps = Omit<ComponentPropsWithRef<'input'>, 'value' | 'defaultValue' | 'type' | 'aria-label'> & {
	/** The search text (controlled). */
	value: string
	/** Called with the new text on every change. */
	onValueChange: (value: string) => void
	/** Accessible name of the field; the placeholder is not a label. */
	label: string
	/** Classes for the wrapper (A443), which also places the icon. */
	wrapperClassName?: string
}

/**
 * The score matrix search field (catalogue section 12: A443 wrapper, A444 search icon, A445
 * input): a white, rounded text field with a leading search icon, a slate-200 border and an
 * emerald ring on focus. It is controlled and has the searchbox role. Props: `value`,
 * `onValueChange(text)`, `label` (the accessible name), `wrapperClassName` for the wrapper, and any
 * other input props (`placeholder`, `onChange`, `disabled`, `className`, `ref` ...), which go on
 * the `<input>`.
 */
export function SearchInput({ value, onValueChange, label, wrapperClassName, className, onChange, ...rest }: SearchInputProps) {
	return (
		<div className={cx(WRAPPER, wrapperClassName)}>
			<Icon name='search' className={ICON} />
			<input
				type='text'
				role='searchbox'
				aria-label={label}
				value={value}
				onChange={(event) => {
					onChange?.(event)
					onValueChange(event.target.value)
				}}
				className={cx(INPUT, DISABLED, className)}
				{...rest}
			/>
		</div>
	)
}
