'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { buttonClassName } from '@/components/ui/button'
import { DIALOG_PANEL, DIALOG_TEXT, DIALOG_TITLE, ERROR_TEXT, EYEBROW, FIELD, OVERLAY } from '@/components/ui/form-styles'
import { cx } from '@/lib/ui/cx'

type UpdateDataButtonProps = {
	eventId: string | number
	className?: string
}

export default function UpdateDataButton({ eventId, className }: UpdateDataButtonProps) {
	const router = useRouter()
	const titleId = useId()
	const descriptionId = useId()
	const [isOpen, setIsOpen] = useState(false)
	const [password, setPassword] = useState('')
	const [error, setError] = useState('')
	const [isSubmitting, setIsSubmitting] = useState(false)

	const openModal = () => {
		setPassword('')
		setError('')
		setIsOpen(true)
	}

	const closeModal = () => {
		if (isSubmitting) {
			return
		}
		setIsOpen(false)
		setPassword('')
		setError('')
	}

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()

		if (!password.trim()) {
			setError('Password is required.')
			return
		}

		setIsSubmitting(true)
		setError('')

		try {
			const response = await fetch('/api/admin/update-auth', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ password }),
			})

			if (!response.ok) {
				const responseBody = (await response.json().catch(() => null)) as { error?: string } | null
				setError(responseBody?.error || 'Incorrect password.')
				return
			}

			closeModal()
			router.push(`/admin/${encodeURIComponent(String(eventId))}?update=1`)
		} catch {
			setError('Unable to verify password. Try again.')
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<>
			<button type='button' onClick={openModal} className={className}>
				Update
			</button>
			{isOpen ? (
				<div className={cx(OVERLAY, 'fixed inset-0 z-50 flex items-center justify-center')}>
					<div role='dialog' aria-modal='true' aria-labelledby={titleId} aria-describedby={descriptionId} className={cx(DIALOG_PANEL, 'w-full max-w-md')}>
						<h3 id={titleId} className={DIALOG_TITLE}>
							Confirm Update
						</h3>
						<p id={descriptionId} className={cx(DIALOG_TEXT, 'mt-1')}>
							Enter the update password to edit all event data.
						</p>
						<form className='mt-4 space-y-3' onSubmit={handleSubmit}>
							<div>
								<label htmlFor={`${titleId}-password`} className={EYEBROW}>
									Password
								</label>
								<input
									id={`${titleId}-password`}
									type='password'
									value={password}
									onChange={(event) => {
										setPassword(event.target.value)
										if (error) {
											setError('')
										}
									}}
									className={cx(FIELD, 'mt-2 w-full px-3 py-2')}
									autoFocus
									required
								/>
							</div>
							{error ? <p className={ERROR_TEXT}>{error}</p> : null}
							<div className='flex flex-wrap justify-end gap-2 pt-2'>
								<button type='button' onClick={closeModal} className={buttonClassName('admin-tonal')}>
									Cancel
								</button>
								<button type='submit' disabled={isSubmitting} className={buttonClassName('admin-confirm')}>
									{isSubmitting ? 'Checking...' : 'Confirm'}
								</button>
							</div>
						</form>
					</div>
				</div>
			) : null}
		</>
	)
}
