'use client'

import { useId, useRef, useState, type FormEvent } from 'react'

import Dialog from '@/components/ui/dialog'

type UnlockDialogProps = {
	/** Shows the dialog. */
	open: boolean
	/** Called once the server accepted the password; this browser then holds the admin cookie. */
	onUnlocked: () => void
	/** Called by Cancel, the close button and Escape. */
	onCancel: () => void
	/** Why the password is asked for, shown above the field. */
	reason?: string
}

/**
 * Phase 3 Task 13 (S5, S6): asks for the update password and posts it to /api/admin/update-auth.
 * The server's own error text is shown as it comes (a wrong password, or the limiter's "Too many
 * attempts" wording). Hooks: unlock-dialog (the panel), unlock-reason, unlock-password,
 * unlock-error, unlock-submit, unlock-cancel.
 */
export default function UnlockDialog({ open, onUnlocked, onCancel, reason }: UnlockDialogProps) {
	const formId = useId()
	const inputRef = useRef<HTMLInputElement>(null)
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [isChecking, setIsChecking] = useState(false)

	function reset(): void {
		setPassword('')
		setError(null)
	}

	function cancel(): void {
		reset()
		onCancel()
	}

	async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()
		if (!password.trim()) {
			setError('Enter the update password.')
			return
		}
		setIsChecking(true)
		setError(null)
		try {
			const response = await fetch('/api/admin/update-auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password }),
			})
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { error?: string } | null
				setError(body?.error || 'The password was not accepted.')
				return
			}
			reset()
			onUnlocked()
		} catch {
			setError('Unable to check the password. Try again.')
		} finally {
			setIsChecking(false)
		}
	}

	return (
		<Dialog
			open={open}
			onClose={cancel}
			title='Update password required'
			eyebrow='Unlock'
			initialFocusRef={inputRef}
			className='max-w-md'
			data-testid='unlock-dialog'
			actions={
				<>
					<button
						type='button'
						data-testid='unlock-cancel'
						onClick={cancel}
						className='px-space-md py-space-xs rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-label-md text-label-md font-semibold transition-colors'
					>
						Cancel
					</button>
					<button
						type='submit'
						form={formId}
						data-testid='unlock-submit'
						disabled={isChecking}
						className='px-space-md py-space-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-label-md text-label-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60'
					>
						{isChecking ? 'Checking...' : 'Unlock'}
					</button>
				</>
			}
		>
			<form id={formId} onSubmit={(event) => void submit(event)} className='flex flex-col gap-space-sm'>
				{reason ? (
					<p data-testid='unlock-reason' className='font-body-sm text-body-sm text-slate-600'>
						{reason}
					</p>
				) : null}
				<label className='flex flex-col gap-space-xs font-label-md text-label-md text-slate-700'>
					Update password
					<input
						ref={inputRef}
						type='password'
						data-testid='unlock-password'
						autoComplete='current-password'
						value={password}
						onChange={(event) => {
							setPassword(event.target.value)
							if (error) setError(null)
						}}
						className='w-full px-space-md py-2 rounded-lg bg-white border border-slate-200 text-slate-900 font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
					/>
				</label>
				{error ? (
					<p data-testid='unlock-error' role='alert' className='font-body-sm text-body-sm text-rose-600'>
						{error}
					</p>
				) : null}
			</form>
		</Dialog>
	)
}
