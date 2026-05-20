'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'

type DeleteEventButtonProps = {
	eventId: string
	eventTitle: string
	className?: string
}

export default function DeleteEventButton({ eventId, eventTitle, className }: DeleteEventButtonProps) {
	const router = useRouter()
	const titleId = useId()
	const descriptionId = useId()
	const [isOpen, setIsOpen] = useState(false)
	const [password, setPassword] = useState('')
	const [deletePhrase, setDeletePhrase] = useState('')
	const [error, setError] = useState('')
	const [isSubmitting, setIsSubmitting] = useState(false)

	const hasValidDeletePhrase = deletePhrase.trim() === 'DELETE'

	const openModal = () => {
		setPassword('')
		setDeletePhrase('')
		setError('')
		setIsOpen(true)
	}

	const closeModal = () => {
		if (isSubmitting) {
			return
		}

		setIsOpen(false)
		setPassword('')
		setDeletePhrase('')
		setError('')
	}

	const handleDelete = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()

		if (!password.trim()) {
			setError('Password is required.')
			return
		}

		if (!hasValidDeletePhrase) {
			setError('Type DELETE to confirm removal.')
			return
		}

		setIsSubmitting(true)
		setError('')

		try {
			const authResponse = await fetch('/api/admin/update-auth', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ password }),
			})

			if (!authResponse.ok) {
				const authBody = (await authResponse.json().catch(() => null)) as { error?: string } | null
				setError(authBody?.error || 'Incorrect password.')
				return
			}

			const deleteResponse = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ confirmText: deletePhrase.trim() }),
			})

			if (!deleteResponse.ok) {
				const deleteBody = (await deleteResponse.json().catch(() => null)) as { error?: string } | null
				setError(deleteBody?.error || 'Unable to delete this event.')
				return
			}

			setIsOpen(false)
			setPassword('')
			setDeletePhrase('')
			router.refresh()
		} catch {
			setError('Unable to delete this event. Try again.')
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<>
			<button type='button' onClick={openModal} className={className}>
				Delete
			</button>
			{isOpen ? (
				<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4'>
					<div role='dialog' aria-modal='true' aria-labelledby={titleId} aria-describedby={descriptionId} className='w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl'>
						<h3 id={titleId} className='text-lg font-semibold text-slate-900'>
							Delete Event
						</h3>
						<p id={descriptionId} className='mt-1 text-sm text-slate-600'>
							Delete {eventTitle}. This removes all related contestants, judges, submissions, scores, and links.
						</p>
						<form className='mt-4 space-y-3' onSubmit={handleDelete}>
							<div>
								<label htmlFor={`${titleId}-password`} className='text-xs font-medium uppercase tracking-wide text-slate-500'>
									Update Password
								</label>
								<input
									id={`${titleId}-password`}
									type='password'
									value={password}
									onChange={(inputEvent) => {
										setPassword(inputEvent.target.value)
										if (error) {
											setError('')
										}
									}}
									className='mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200'
									autoFocus
									required
								/>
							</div>
							<div>
								<label htmlFor={`${titleId}-delete-confirm`} className='text-xs font-medium uppercase tracking-wide text-slate-500'>
									Type DELETE To Confirm
								</label>
								<input
									id={`${titleId}-delete-confirm`}
									type='text'
									value={deletePhrase}
									onChange={(inputEvent) => {
										setDeletePhrase(inputEvent.target.value)
										if (error) {
											setError('')
										}
									}}
									className='mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200'
									placeholder='DELETE'
									required
								/>
							</div>
							{error ? <p className='text-sm text-rose-600'>{error}</p> : null}
							<div className='flex flex-wrap justify-end gap-2 pt-2'>
								<button type='button' onClick={closeModal} className='rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50'>
									Cancel
								</button>
								<button type='submit' disabled={isSubmitting || !hasValidDeletePhrase} className='rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-70'>
									{isSubmitting ? 'Deleting...' : 'Delete Event'}
								</button>
							</div>
						</form>
					</div>
				</div>
			) : null}
		</>
	)
}
