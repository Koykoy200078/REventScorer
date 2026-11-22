'use client'

import { useState, useRef } from 'react'
import { buttonClassName } from '@/components/ui/button'
import { DIALOG_PANEL, DIALOG_TEXT, DIALOG_TITLE, ERROR_TEXT, EYEBROW, FIELD, FIELD_DANGER, LOG_BOX, OVERLAY } from '@/components/ui/form-styles'
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

			{isModalOpen ? (
				<div className={cx(OVERLAY, 'fixed inset-0 z-[100] flex items-center justify-center')}>
					<div role='dialog' aria-modal='true' className={cx(DIALOG_PANEL, 'w-full max-w-md')}>
						<h3 className={DIALOG_TITLE}>
							{importLogs ? (importLogs.success ? 'Import Successful' : 'Import Failed') : (mode === 'export' ? 'Export Database' : 'Import Database')}
						</h3>
						{!importLogs && (
							<p className={cx(DIALOG_TEXT, 'mt-1')}>
								{mode === 'export'
									? 'Enter the update password to generate a .sql backup.'
									: 'Enter the update password and select a .sql file to restore. WARNING: This will overwrite existing data!'}
							</p>
						)}
						{importLogs ? (
							<div className='mt-4 flex flex-col gap-4'>
								{importLogs.error && (
									<p className={ERROR_TEXT}>{importLogs.error}</p>
								)}
								{(importLogs.stdout || importLogs.stderr) ? (
									<div className={cx(LOG_BOX, 'max-h-60 overflow-y-auto')}>
										{importLogs.stdout && (
											<div className='whitespace-pre-wrap break-words'>
												<span className='font-bold text-sky-400'>[STDOUT]</span>
												<br />
												{importLogs.stdout}
											</div>
										)}
										{importLogs.stderr && (
											<div className='whitespace-pre-wrap break-words mt-2'>
												<span className='font-bold text-rose-400'>[STDERR]</span>
												<br />
												{importLogs.stderr}
											</div>
										)}
									</div>
								) : (
									<p className={DIALOG_TEXT}>No logs output available.</p>
								)}
								<div className='flex justify-end pt-2'>
									{importLogs.success ? (
										<button
											type='button'
											onClick={() => window.location.reload()}
											className={buttonClassName('admin-confirm')}
										>
											Close & Reload
										</button>
									) : (
										<button
											type='button'
											onClick={() => setIsModalOpen(false)}
											className={buttonClassName('admin-tonal')}
										>
											Close
										</button>
									)}
								</div>
							</div>
						) : (
						<form className='mt-4 space-y-4' onSubmit={handleAction}>
							<div>
								<label className={EYEBROW}>Password</label>
								<input
									type='password'
									value={password}
									onChange={(e) => {
										setPassword(e.target.value)
										if (passwordError) setPasswordError('')
									}}
									className={cx(FIELD, 'mt-2 w-full px-3 py-2')}
									autoFocus
									required
								/>
							</div>
							
							{mode === 'import' && (
								<div>
									<label className={EYEBROW}>SQL File</label>
									<input
										type='file'
										accept='.sql'
										ref={fileInputRef}
										onChange={(e) => {
											setSelectedFile(e.target.files?.[0] || null)
											if (passwordError) setPasswordError('')
										}}
										className={cx(FIELD_DANGER, 'mt-2 w-full px-3 py-2')}
										required
									/>
								</div>
							)}

							{passwordError ? <p className={ERROR_TEXT}>{passwordError}</p> : null}
							
							<div className='flex flex-wrap justify-end gap-2 pt-2'>
								<button
									type='button'
									onClick={() => setIsModalOpen(false)}
									className={buttonClassName('admin-tonal')}
								>
									Cancel
								</button>
								<button
									type='submit'
									disabled={isProcessing}
									className={mode === 'export' ? buttonClassName('admin-confirm') : buttonClassName('admin-danger')}
								>
									{isProcessing ? 'Processing...' : mode === 'export' ? 'Export' : 'Import'}
								</button>
							</div>
						</form>
						)}
					</div>
				</div>
			) : null}
		</>
	)
}
