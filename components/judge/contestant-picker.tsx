'use client'

import { memo, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

import { Badge } from '@/components/ui/badge'
import Icon from '@/components/ui/icon'
import { SearchInput } from '@/components/ui/search-input'
import { CLICKABLE, FOCUS_RING } from '@/components/ui/styles'
import { rosterCardClassName } from '@/components/ui/tabs'
import { entryMatches, hasPickerSearch } from '@/lib/judge/picker'
import type { RosterStatus } from '@/lib/judge/status'
import type { EventContestant } from '@/lib/types'
import { cx } from '@/lib/ui/cx'

const TRIGGER = cx('px-2 py-1 flex items-center gap-1 font-label-sm text-label-sm font-bold text-slate-800 hover:text-emerald-700 transition-colors rounded', FOCUS_RING, CLICKABLE)
// Not drawn by the mockups (ruling R4): the C-1 surface as a column, positioned against the fixed
// header (no positioned ancestor in between), so it cannot scroll sideways at 375 px.
const PANEL = 'absolute top-full mt-2 left-4 right-4 sm:left-auto sm:right-6 sm:w-[22rem] max-h-[60vh] z-50 flex flex-col bg-white rounded-xl border border-slate-200 shadow-xs p-space-sm'

export interface ContestantPickerProps {
	contestants: EventContestant[]
	activeIndex: number
	statusById: Readonly<Record<string, RosterStatus>>
	slotLabels: ReadonlyMap<string, string>
	open: boolean
	onOpenChange: (open: boolean) => void
	onSelect: (index: number) => void
}

/**
 * The judge's contestant picker (Stage 5 Task 5, spec §2.5): the trigger "Entry k of n" in the header
 * stepper, and a panel listing every entry. The panel is always mounted (hidden when closed), so
 * every roster-entry stays attached, and a search box comes first when the list has more than 10
 * entries (owner). Choosing an entry, Escape, or a pointerdown outside the trigger and the panel
 * closes it; a choice and Escape give focus back to the trigger (recheck N8). The search box takes
 * focus only when the panel was opened from the keyboard (recheck N4), so a phone keyboard does not
 * cover the list. The search text is this component's own state and is cleared on every close.
 */
export const ContestantPicker = memo(function ContestantPicker({ contestants, activeIndex, statusById, slotLabels, open, onOpenChange, onSelect }: ContestantPickerProps) {
	const panelId = useId()
	const listId = useId()
	const [query, setQuery] = useState('')
	const triggerRef = useRef<HTMLButtonElement>(null)
	const panelRef = useRef<HTMLDivElement>(null)
	const searchRef = useRef<HTMLInputElement>(null)
	const openedByKeyboardRef = useRef(false)
	const withSearch = hasPickerSearch(contestants.length)
	const count = contestants.length
	const active = contestants[activeIndex]
	const matches = contestants.map((contestant) => entryMatches(query, { name: contestant.name, slotLabel: slotLabels.get(contestant.id) }))
	const trimmed = query.trim()
	const noMatch = trimmed !== '' && !matches.some(Boolean)

	const close = (returnFocus: boolean) => {
		setQuery('')
		onOpenChange(false)
		if (returnFocus) triggerRef.current?.focus()
	}

	// Outside pointerdown closes the panel without moving focus. The trigger is left to its own click,
	// so a press on it while open closes the panel once and does not reopen it (critique m2).
	useEffect(() => {
		if (!open) return
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null
			if (target && (triggerRef.current?.contains(target) || panelRef.current?.contains(target))) return
			setQuery('')
			onOpenChange(false)
		}
		document.addEventListener('pointerdown', onPointerDown)
		return () => document.removeEventListener('pointerdown', onPointerDown)
	}, [open, onOpenChange])

	// On open: the search box when opened from the keyboard, otherwise the active entry (no search box);
	// the active entry is scrolled into view inside the list.
	useLayoutEffect(() => {
		if (!open) return
		const activeButton = panelRef.current?.querySelector<HTMLButtonElement>('[data-testid="roster-entry"][aria-current="true"]')
		activeButton?.scrollIntoView({ block: 'nearest' })
		if (withSearch) {
			if (openedByKeyboardRef.current) searchRef.current?.focus()
		} else {
			activeButton?.focus()
		}
		openedByKeyboardRef.current = false
	}, [open, withSearch])

	const firstVisibleEntry = () => panelRef.current?.querySelector<HTMLButtonElement>('li:not([hidden]) [data-testid="roster-entry"]') ?? null

	const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'Escape') {
			event.preventDefault()
			close(true)
		}
	}

	const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
		if (event.key === 'ArrowDown') {
			event.preventDefault()
			firstVisibleEntry()?.focus()
		} else if (event.key === 'Enter') {
			event.preventDefault()
			if (trimmed === '') return
			const index = matches.findIndex(Boolean)
			if (index === -1) return
			onSelect(index)
			close(true)
		}
	}

	return (
		<>
			<button
				ref={triggerRef}
				type='button'
				data-testid='contestant-picker'
				aria-expanded={open}
				aria-controls={panelId}
				className={TRIGGER}
				onClick={() => {
					if (open) close(false)
					else onOpenChange(true)
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
						openedByKeyboardRef.current = true
						if (event.key === 'ArrowDown' && !open) {
							event.preventDefault()
							onOpenChange(true)
						}
					}
				}}
			>
				<span className='hidden sm:inline'>
					Entry {activeIndex + 1} of {count}
					{active?.section ? ` • ${active.section}` : null}
				</span>
				<span className='sm:hidden'>
					{activeIndex + 1}/{count}
				</span>
				<Icon name='arrow_drop_down' className='text-[14px]' />
			</button>
			<div ref={panelRef} id={panelId} hidden={!open} className={PANEL} onKeyDown={onPanelKeyDown}>
				{withSearch ? (
					<div className='pb-space-sm'>
						<SearchInput
							ref={searchRef}
							data-testid='contestant-search'
							label='Search entries'
							placeholder='Search by name or slot'
							aria-controls={listId}
							value={query}
							onValueChange={setQuery}
							onKeyDown={onSearchKeyDown}
						/>
						{noMatch ? (
							<p role='status' data-testid='contestant-search-empty' className='pt-space-xs font-body-sm text-body-sm text-slate-500'>
								No entry matches &quot;{trimmed}&quot;.
							</p>
						) : null}
					</div>
				) : null}
				<ul id={listId} data-testid='judge-roster' role='list' className='min-h-0 overflow-y-auto flex flex-col gap-space-xs'>
					{contestants.map((contestant, index) => {
						const isActive = index === activeIndex
						const status = statusById[contestant.id] ?? 'none'
						const slotLabel = slotLabels.get(contestant.id)
						const isIndividual = contestant.entryType === 'individual'
						return (
							<li key={contestant.id} hidden={!matches[index]}>
								<button
									suppressHydrationWarning
									type='button'
									data-testid='roster-entry'
									data-contestant-id={contestant.id}
									data-status={status}
									aria-current={isActive ? 'true' : undefined}
									className={cx(rosterCardClassName(isActive ? 'active' : status === 'scored' ? 'done' : 'other'), 'w-full', FOCUS_RING, CLICKABLE)}
									onClick={() => {
										onSelect(index)
										close(true)
									}}
								>
									<span className='flex items-center justify-between gap-space-xs w-full'>
										<span className='min-w-0 truncate font-label-md text-label-md font-semibold'>
											{index + 1}. {contestant.name}
										</span>
										{status === 'scored' ? (
											<Badge variant='unified-roster-done'>✓ Scored</Badge>
										) : status === 'queued' ? (
											<Badge variant='admin-status-idle'>Queued</Badge>
										) : status === 'draft' ? (
											<Badge variant='unified-roster-queued'>Draft</Badge>
										) : null}
									</span>
									{isIndividual || slotLabel ? (
										<span className='font-label-sm text-label-sm text-slate-500 truncate'>{[isIndividual ? 'Individual' : null, slotLabel].filter(Boolean).join(' • ')}</span>
									) : null}
								</button>
							</li>
						)
					})}
				</ul>
			</div>
		</>
	)
})
