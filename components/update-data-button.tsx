'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'

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
				Edit
			</button>
			{isOpen ? (
				<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4'>
					<div role='dialog' aria-modal='true' aria-labelledby={titleId} aria-describedby={descriptionId} className='w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl'>
						<h3 id={titleId} className='text-lg font-semibold text-slate-900'>
							Confirm Update
						</h3>
						<p id={descriptionId} className='mt-1 text-sm text-slate-600'>
							Enter the update password to edit all event data.
						</p>
						<form className='mt-4 space-y-3' onSubmit={handleSubmit}>
							<div>
								<label htmlFor={`${titleId}-password`} className='text-xs font-medium uppercase tracking-wide text-slate-500'>
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
									className='mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200'
									autoFocus
									required
								/>
							</div>
							{error ? <p className='text-sm text-rose-600'>{error}</p> : null}
							<div className='flex flex-wrap justify-end gap-2 pt-2'>
								<button type='button' onClick={closeModal} className='rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50'>
									Cancel
								</button>
								<button type='submit' disabled={isSubmitting} className='rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70'>
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
