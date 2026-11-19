'use client'

import {
	useEffect,
	useEffectEvent,
	useId,
	useRef,
	type ComponentPropsWithoutRef,
	type ComponentPropsWithRef,
	type ReactNode,
	type RefObject,
} from 'react'

import Icon from '@/components/ui/icon'
import { CLICKABLE, FOCUS_RING } from '@/components/ui/styles'
import { cx } from '@/lib/ui/cx'

const FOCUSABLE = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * The elements inside the panel that Tab can reach, in document order. Hidden ones and those taken
 * out of the tab order with tabindex -1 (such as the inactive items of a roving-tabindex rail) are
 * left out.
 */
function focusablesIn(panel: HTMLElement): HTMLElement[] {
	return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
		(el) => el.tabIndex >= 0 && el.getClientRects().length > 0,
	)
}

/** Whether any of the items comes after (forward) or before (backward) the given node in document order. */
function hasItemBeyond(items: HTMLElement[], node: Node, forward: boolean): boolean {
	const side = forward ? Node.DOCUMENT_POSITION_FOLLOWING : Node.DOCUMENT_POSITION_PRECEDING
	for (const item of items) {
		if (node.compareDocumentPosition(item) & side) return true
	}
	return false
}

type DialogProps = Omit<ComponentPropsWithoutRef<'div'>, 'title'> & {
	/** Shows the dialog. While false nothing is rendered. */
	open: boolean
	/** Called by the close button and the Escape key. The caller sets open to false. */
	onClose: () => void
	/** The heading (A1110). It also names the dialog through aria-labelledby. */
	title: ReactNode
	/** The small uppercase line above the heading (A1109). */
	eyebrow?: ReactNode
	/** The footer buttons (A1147 row), for example a cancel (S-3) and a confirm (P-5) button. */
	actions?: ReactNode
	/** Accessible name of the round close button (A1112). */
	closeLabel?: string
	/** The element to focus when the dialog opens. Without it the first focusable element is used. */
	initialFocusRef?: RefObject<HTMLElement | null>
	/** Extra classes for the overlay (A1105). className goes on the panel. */
	overlayClassName?: string
}

/**
 * The admin modal of catalogue section 14: overlay A1105 (blurred slate backdrop) and panel A1106,
 * with the header row A1107 (eyebrow A1109, title A1110, round close button A1112), the children as
 * the body, and the footer row A1147 when actions are given. Props: open, onClose, title, eyebrow,
 * actions, closeLabel, initialFocusRef, overlayClassName; other native div props and className go on
 * the panel, which carries role dialog, aria-modal and aria-labelledby. While open, Escape closes it,
 * Tab and Shift+Tab stay inside the panel, focus moves in on open and returns to the element that had
 * it on close. It is rendered in place, not in a portal, so it keeps the admin palette of a
 * surrounding theme-admin element: mount it at page level, never inside the header, a dock or any
 * element with a transform, filter or backdrop blur, which would trap the fixed overlay.
 */
export default function Dialog({
	open,
	onClose,
	title,
	eyebrow,
	actions,
	closeLabel = 'Close',
	initialFocusRef,
	overlayClassName,
	className,
	children,
	...rest
}: DialogProps) {
	const titleId = useId()
	const panelRef = useRef<HTMLDivElement>(null)

	const close = useEffectEvent(() => onClose())
	const focusInitial = useEffectEvent((panel: HTMLElement) => {
		const target = initialFocusRef?.current ?? focusablesIn(panel)[0]
		target?.focus()
	})

	useEffect(() => {
		if (!open) return
		const panel = panelRef.current
		if (!panel) return
		const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
		focusInitial(panel)

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				if (event.defaultPrevented) return
				event.preventDefault()
				close()
				return
			}
			if (event.key !== 'Tab' || !panel) return
			const items = focusablesIn(panel)
			if (items.length === 0) {
				event.preventDefault()
				return
			}
			const first = items[0]
			const last = items[items.length - 1]
			const active = document.activeElement
			if (!active || !panel.contains(active)) {
				event.preventDefault()
				const target = event.shiftKey ? last : first
				target.focus()
			} else if (items.indexOf(active as HTMLElement) === -1) {
				// Focus sits inside the panel on an element Tab cannot reach (for example a heading given
				// tabindex -1 through initialFocusRef). The browser moves on from there in document order,
				// so step in only when no tab stop lies that way and focus would leave the panel.
				if (!hasItemBeyond(items, active, !event.shiftKey)) {
					event.preventDefault()
					const target = event.shiftKey ? last : first
					target.focus()
				}
			} else if (event.shiftKey && active === first) {
				event.preventDefault()
				last.focus()
			} else if (!event.shiftKey && active === last) {
				event.preventDefault()
				first.focus()
			}
		}

		document.addEventListener('keydown', onKeyDown)
		return () => {
			document.removeEventListener('keydown', onKeyDown)
			if (previous?.isConnected) previous.focus()
		}
	}, [open])

	if (!open) return null

	return (
		<div
			className={cx(
				'fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4',
				overlayClassName,
			)}
		>
			<div
				{...rest}
				ref={panelRef}
				role='dialog'
				aria-modal='true'
				aria-labelledby={titleId}
				className={cx(
					'w-full max-w-2xl max-h-full overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-2xl p-space-lg flex flex-col gap-space-md',
					className,
				)}
			>
				<div className='flex items-center justify-between pb-space-xs border-b border-slate-100'>
					<div>
						{eyebrow ? (
							<span className='font-label-sm text-label-sm text-emerald-700 uppercase font-bold tracking-wider'>
								{eyebrow}
							</span>
						) : null}
						<h3 id={titleId} className='font-headline-md text-headline-md text-slate-900 font-bold'>
							{title}
						</h3>
					</div>
					<button
						type='button'
						aria-label={closeLabel}
						onClick={onClose}
						className={cx(
							'w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors shrink-0',
							CLICKABLE,
							FOCUS_RING,
						)}
					>
						<Icon name='close' className='text-[18px]' />
					</button>
				</div>
				{children}
				{actions ? (
					<div className='flex justify-end gap-space-sm pt-space-xs border-t border-slate-100'>{actions}</div>
				) : null}
			</div>
		</div>
	)
}

const STAT_TONE = {
	emerald: 'text-emerald-700',
	slate: 'text-slate-900',
	sky: 'text-sky-700',
} as const

/**
 * The three-column summary box inside the modal (A1116), as a description list. Children are
 * DialogStat items. Other native dl props and className go on the list.
 */
export function DialogStatGrid({ className, ...rest }: ComponentPropsWithRef<'dl'>) {
	return (
		<dl
			className={cx('grid grid-cols-3 gap-space-sm p-space-sm bg-slate-50 border border-slate-200 rounded-lg', className)}
			{...rest}
		/>
	)
}

type DialogStatProps = Omit<ComponentPropsWithRef<'div'>, 'children'> & {
	/** The small grey caption (A1118). */
	label: ReactNode
	/** The figure or word below it (A1119, A1123, A1127). */
	value: ReactNode
	/** Colour of the value: emerald (A1119), slate (A1123) or sky (A1127). */
	tone?: keyof typeof STAT_TONE
}

/**
 * One label and value pair of the modal summary box (A1118 caption with the A1119, A1123 or A1127
 * value). Props: label, value, tone (emerald by default); other native div props go on the pair.
 */
export function DialogStat({ label, value, tone = 'emerald', className, ...rest }: DialogStatProps) {
	return (
		<div className={className} {...rest}>
			<dt className='font-label-sm text-label-sm text-slate-500 block'>{label}</dt>
			<dd className={cx('font-headline-sm text-headline-sm font-mono font-bold', STAT_TONE[tone])}>{value}</dd>
		</div>
	)
}

type DialogLedgerProps = Omit<ComponentPropsWithRef<'div'>, 'title'> & {
	/** The uppercase caption above the list (A1131). It also names the list. */
	title: ReactNode
}

/**
 * The captioned ledger box inside the modal (A1130 wrapper, A1131 caption, A1132 list). Children are
 * DialogLedgerRow items. Props: title; other native div props and className go on the wrapper. The
 * wrapper stacks with a flex gap, which keeps the spacing of A1130 in Tailwind v4.
 */
export function DialogLedger({ title, className, children, ...rest }: DialogLedgerProps) {
	const titleId = useId()
	return (
		<div className={cx('flex flex-col gap-space-xs', className)} {...rest}>
			<span id={titleId} className='font-label-sm text-label-sm text-slate-500 uppercase font-bold tracking-wider'>
				{title}
			</span>
			<ul
				aria-labelledby={titleId}
				className='divide-y divide-slate-200 bg-slate-50 border border-slate-200 rounded-lg p-space-sm'
			>
				{children}
			</ul>
		</div>
	)
}

type DialogLedgerRowProps = Omit<ComponentPropsWithRef<'li'>, 'children'> & {
	/** Left text, for example who scored (A1133 first span). */
	label: ReactNode
	/** Right figure (A1133 second span). */
	value: ReactNode
}

/**
 * One row of the modal ledger (A1133): label on the left, emerald figure on the right. Props: label,
 * value; other native li props and className go on the row.
 */
export function DialogLedgerRow({ label, value, className, ...rest }: DialogLedgerRowProps) {
	return (
		<li className={cx('flex justify-between items-center py-2 text-label-md font-label-md', className)} {...rest}>
			<span className='text-slate-800 font-medium'>{label}</span>
			<span className='font-mono text-emerald-700 font-bold'>{value}</span>
		</li>
	)
}
