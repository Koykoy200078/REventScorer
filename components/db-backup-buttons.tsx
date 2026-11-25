'use client'

import { useId, useRef, useState } from 'react'
import { buttonClassName } from '@/components/ui/button'
import Dialog from '@/components/ui/dialog'
import { DIALOG_TEXT, ERROR_TEXT, EYEBROW, FIELD, FIELD_DANGER, LOG_BOX } from '@/components/ui/form-styles'
import { cx } from '@/lib/ui/cx'

export default function DbBackupButtons() {
	const [isModalOpen, setIsModalOpen] = useState(false)
	const [mode, setMode] = useState<'export' | 'import'>('export')
	const [password, setPassword] = useState('')
	const [passwordError, setPasswordError] = useState('')
	const [isProcessing, setIsProcessing] = useState(false)
	const [selectedFile, setSelectedFile] = useState<File | null>(null)
	const [importLogs, setImportLogs] = useState<{ success: boolean; stdout?: string; stderr?: string; error?: string } | null>(null)
	
	const fileInputRef = useRef<HTMLInputElement>(null)

	const openModal = (action: 'export' | 'import') => {
		setMode(action)
		setPassword('')
		setPasswordError('')
		setSelectedFile(null)
		setImportLogs(null)
		setIsModalOpen(true)
	}

	const passwordRef = useRef<HTMLInputElement>(null)
	const formId = useId()
	// Escape and the close button: nothing while an import runs; after a successful import the page reloads, as
	// "Close & Reload" does (B68).
	const closeModal = () => {
		if (isProcessing) return
		if (importLogs?.success) {
			window.location.reload()
			return
		}
		setIsModalOpen(false)
	}

	const handleAction = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		if (!password.trim()) {
			setPasswordError('Password is required.')
			return
		}

		if (mode === 'import' && !selectedFile) {
			setPasswordError('Please select a .sql file to import.')
			return
		}

		setIsProcessing(true)
		setPasswordError('')

		try {
			// 1. Verify password first
			const verifyResponse = await fetch('/api/admin/update-auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password }),
			})

			if (!verifyResponse.ok) {
				const responseBody = (await verifyResponse.json().catch(() => null)) as { error?: string } | null
				setPasswordError(responseBody?.error || 'Incorrect password.')
				setIsProcessing(false)
				return
			}

			// 2. Perform action
			if (mode === 'export') {
				// Trigger file download
				// We can just use window.location.href or a form submission, but fetch allows passing password easily if we put it in headers/query
				// Actually, the API can return the file blob
				const exportResponse = await fetch('/api/admin/export-db', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ password }),
				})

				if (!exportResponse.ok) {
					const errorData = await exportResponse.json().catch(() => null)
					setPasswordError(errorData?.error || 'Failed to export database.')
					setIsProcessing(false)
					return
				}

				const blob = await exportResponse.blob()
				const url = window.URL.createObjectURL(blob)
				const a = document.createElement('a')
				a.href = url
				a.download = `backup-${new Date().toISOString().split('T')[0]}.sql`
				document.body.appendChild(a)
				a.click()
				a.remove()
				window.URL.revokeObjectURL(url)
				
				setIsModalOpen(false)
			} else {
				// Import mode
				const formData = new FormData()
				formData.append('password', password)
				formData.append('file', selectedFile!)

				const importResponse = await fetch('/api/admin/import-db', {
					method: 'POST',
					body: formData,
				})

				const responseData = await importResponse.json().catch(() => null)

				if (!importResponse.ok) {
					setPasswordError(responseData?.error || 'Failed to import database.')
					setImportLogs({ success: false, ...responseData })
					setIsProcessing(false)
					return
				}

				setImportLogs({ success: true, ...responseData })
			}
		} catch (error) {
			console.error('Backup action error:', error)
			setPasswordError(`Unable to ${mode} database. Try again.`)
		} finally {
			setIsProcessing(false)
		}
	}

	return (
		<>
			<div className='mt-6 flex flex-wrap gap-3'>
				<button
					onClick={() => openModal('export')}
					className={buttonClassName('admin-outline')}
				>
					Export Database (.sql)
				</button>
				<button
					onClick={() => openModal('import')}
					className={buttonClassName('admin-remove', 'sm')}
				>
					Import Database (.sql)
				</button>
			</div>

			{/* B68: the shared Dialog (a named dialog, labelled fields, Escape, a focus trap and focus return). */}
			<Dialog
				open={isModalOpen}
				onClose={closeModal}
				title={importLogs ? (importLogs.success ? 'Import Successful' : 'Import Failed') : mode === 'export' ? 'Export Database' : 'Import Database'}
				initialFocusRef={passwordRef}
				className='max-w-md'
				actions={
					importLogs ? (
						importLogs.success ? (
							<button type='button' onClick={() => window.location.reload()} className={buttonClassName('admin-confirm')}>
								Close & Reload
							</button>
						) : (
							<button type='button' onClick={() => setIsModalOpen(false)} className={buttonClassName('admin-tonal')}>
								Close
							</button>
						)
					) : (
						<>
							<button type='button' onClick={closeModal} disabled={isProcessing} className={buttonClassName('admin-tonal')}>
								Cancel
							</button>
							<button type='submit' form={formId} disabled={isProcessing} className={mode === 'export' ? buttonClassName('admin-confirm') : buttonClassName('admin-danger')}>
								{isProcessing ? 'Processing...' : mode === 'export' ? 'Export' : 'Import'}
							</button>
						</>
					)
				}
			>
				{importLogs ? (
					<div className='flex flex-col gap-4'>
						{importLogs.error ? <p className={ERROR_TEXT}>{importLogs.error}</p> : null}
						{importLogs.stdout || importLogs.stderr ? (
							<div className={cx(LOG_BOX, 'max-h-60 overflow-y-auto')}>
								{importLogs.stdout ? (
									<div className='whitespace-pre-wrap break-words'>
										<span className='font-bold text-sky-400'>[STDOUT]</span>
										<br />
										{importLogs.stdout}
									</div>
								) : null}
								{importLogs.stderr ? (
									<div className='whitespace-pre-wrap break-words mt-2'>
										<span className='font-bold text-rose-400'>[STDERR]</span>
										<br />
										{importLogs.stderr}
									</div>
								) : null}
							</div>
						) : (
							<p className={DIALOG_TEXT}>No logs output available.</p>
						)}
					</div>
				) : (
					<form id={formId} className='flex flex-col gap-space-sm' onSubmit={handleAction}>
						<p className={DIALOG_TEXT}>
							{mode === 'export' ? 'Enter the update password to generate a .sql backup.' : 'Enter the update password and select a .sql file to restore. WARNING: This will overwrite existing data!'}
						</p>
						<label className={cx(EYEBROW, 'flex flex-col gap-space-xs')}>
							Password
							<input
								ref={passwordRef}
								type='password'
								autoComplete='current-password'
								value={password}
								onChange={(e) => {
									setPassword(e.target.value)
									if (passwordError) setPasswordError('')
								}}
								className={cx(FIELD, 'w-full px-3 py-2 normal-case tracking-normal font-normal')}
								required
							/>
						</label>
						{mode === 'import' ? (
							<label className={cx(EYEBROW, 'flex flex-col gap-space-xs')}>
								SQL File
								<input
									type='file'
									accept='.sql'
									ref={fileInputRef}
									onChange={(e) => {
										setSelectedFile(e.target.files?.[0] || null)
										if (passwordError) setPasswordError('')
									}}
									className={cx(FIELD_DANGER, 'w-full px-3 py-2 normal-case tracking-normal font-normal')}
									required
								/>
							</label>
						) : null}
						{passwordError ? (
							<p role='alert' className={ERROR_TEXT}>
								{passwordError}
							</p>
						) : null}
					</form>
				)}
			</Dialog>
		</>
	)
}
