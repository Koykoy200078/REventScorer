'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { buttonClassName } from '@/components/ui/button'
import { DIALOG_PANEL, DIALOG_TEXT, DIALOG_TITLE, ERROR_TEXT, EYEBROW, FIELD_DANGER, OVERLAY } from '@/components/ui/form-styles'
import { cx } from '@/lib/ui/cx'

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
				<div className={cx(OVERLAY, 'fixed inset-0 z-50 flex items-center justify-center')}>
					<div role='dialog' aria-modal='true' aria-labelledby={titleId} aria-describedby={descriptionId} className={cx(DIALOG_PANEL, 'w-full max-w-md')}>
						<h3 id={titleId} className={DIALOG_TITLE}>
							Delete Event
						</h3>
						<p id={descriptionId} className={cx(DIALOG_TEXT, 'mt-1')}>
							Delete {eventTitle}. This removes all related contestants, judges, submissions, scores, and links.
						</p>
						<form className='mt-4 space-y-3' onSubmit={handleDelete}>
							<div>
								<label htmlFor={`${titleId}-password`} className={EYEBROW}>
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
									className={cx(FIELD_DANGER, 'mt-2 w-full px-3 py-2')}
									autoFocus
									required
								/>
							</div>
							<div>
								<label htmlFor={`${titleId}-delete-confirm`} className={EYEBROW}>
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
									className={cx(FIELD_DANGER, 'mt-2 w-full px-3 py-2')}
									placeholder='DELETE'
									required
								/>
							</div>
							{error ? <p className={ERROR_TEXT}>{error}</p> : null}
							<div className='flex flex-wrap justify-end gap-2 pt-2'>
								<button type='button' onClick={closeModal} className={buttonClassName('admin-tonal')}>
									Cancel
								</button>
								<button type='submit' disabled={isSubmitting || !hasValidDeletePhrase} className={buttonClassName('admin-danger')}>
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
