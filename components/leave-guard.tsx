'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import Dialog from '@/components/ui/dialog'

// B63 (owner 2026-11-26): the create page and the rating sheet ask before leaving a form with changes; an untouched
// form asks nothing. A change is a field typed in or changed since the page loaded or last published (a template
// fill, a row added or removed, or a password typed in a dialog is not one).

/**
 * Whether the form has changes. Put `onInput` on the element that holds the form's fields: any input event inside it
 * counts, except one from inside a dialog (the password box). `markUnchanged()` after a publish.
 */
export function useFormChanges() {
	const [changed, setChanged] = useState(false)
	const onInput = (event: FormEvent<HTMLElement>) => {
		const target = event.target as Element | null
		if (target?.closest?.('[role="dialog"]')) return
		setChanged(true)
	}
	return { changed, onInput, markUnchanged: () => setChanged(false) }
}

// The history entry the guard adds on top of the page while it has changes (Next copies its own state into it).
const GUARD_ENTRY = 'eventscorerLeaveGuard'
const isGuardEntry = () => Boolean((window.history.state as Record<string, unknown> | null)?.[GUARD_ENTRY])

/**
 * While `changed`, closing or reloading the page asks the browser's own question, and a click on a link to another
 * page of the app, or the browser's Back, asks in a dialog (Stay on this page, or Leave without saving). Links that
 * open elsewhere (a new tab, a download, another site, the same page) are left alone.
 */
export default function LeaveGuard({ changed }: { changed: boolean }) {
	const router = useRouter()
	// Where Leave without saving goes: a link's address, or back past the page.
	const [pendingHref, setPendingHref] = useState<string | 'back' | null>(null)
	// Set once the person chose to leave, so the navigation that follows is not asked about again.
	const leaving = useRef(false)

	useEffect(() => {
		if (!changed) return
		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			if (leaving.current) return
			event.preventDefault()
			event.returnValue = ''
		}
		// Capture on the document runs before the link's own handler (Next's client navigation) and stops it.
		const onClick = (event: MouseEvent) => {
			if (leaving.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
			const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
			if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return
			const url = new URL(link.href, window.location.href)
			if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return
			event.preventDefault()
			event.stopPropagation()
			setPendingHref(`${url.pathname}${url.search}${url.hash}`)
		}
		window.addEventListener('beforeunload', onBeforeUnload)
		document.addEventListener('click', onClick, true)
		return () => {
			window.removeEventListener('beforeunload', onBeforeUnload)
			document.removeEventListener('click', onClick, true)
		}
	}, [changed])

	// The browser's Back: while there are changes an extra entry for this same page sits on top, so Back lands on the
	// page itself (Next shows the same page) and asks. The entry goes back on top at once; once the changes are
	// published it is taken off again.
	useEffect(() => {
		if (!changed) {
			if (isGuardEntry()) window.history.back()
			return
		}
		if (!isGuardEntry()) window.history.pushState({ [GUARD_ENTRY]: true }, '')
		const onPopState = () => {
			if (leaving.current || isGuardEntry()) return
			window.history.pushState({ [GUARD_ENTRY]: true }, '')
			setPendingHref('back')
		}
		window.addEventListener('popstate', onPopState)
		return () => window.removeEventListener('popstate', onPopState)
	}, [changed])

	const leave = () => {
		if (pendingHref === null) return
		leaving.current = true
		setPendingHref(null)
		if (pendingHref === 'back') {
			// Past the guard entry and the page itself.
			window.history.go(-2)
		} else if (isGuardEntry()) {
			// The link takes the guard entry's place, so Back from there returns to the page as usual.
			router.replace(pendingHref)
		} else {
			router.push(pendingHref)
		}
	}

	return (
		<Dialog
			open={pendingHref !== null}
			onClose={() => setPendingHref(null)}
			data-testid='form-leave-confirm'
			eyebrow='Unsaved changes'
			title='Leave this page?'
			className='max-w-md'
			overlayClassName='print:hidden'
			actions={
				<>
					<Button variant='admin-tonal' data-testid='form-leave-stay' onClick={() => setPendingHref(null)}>
						Stay on this page
					</Button>
					<Button variant='admin-confirm' data-testid='form-leave-go' onClick={leave}>
						Leave without saving
					</Button>
				</>
			}
		>
			<p className='font-body-sm text-body-sm text-slate-700'>Your changes on this page are not saved. Leaving drops them.</p>
		</Dialog>
	)
}
