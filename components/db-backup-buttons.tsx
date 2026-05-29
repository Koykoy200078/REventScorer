'use client'

import { useState, useRef } from 'react'

export default function DbBackupButtons() {
	const [isModalOpen, setIsModalOpen] = useState(false)
	const [mode, setMode] = useState<'export' | 'import'>('export')
	const [password, setPassword] = useState('')
	const [passwordError, setPasswordError] = useState('')
	const [isProcessing, setIsProcessing] = useState(false)
	const [selectedFile, setSelectedFile] = useState<File | null>(null)
	
	const fileInputRef = useRef<HTMLInputElement>(null)

	const openModal = (action: 'export' | 'import') => {
		setMode(action)
		setPassword('')
		setPasswordError('')
		setSelectedFile(null)
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

				if (!importResponse.ok) {
					const errorData = await importResponse.json().catch(() => null)
					setPasswordError(errorData?.error || 'Failed to import database.')
					setIsProcessing(false)
					return
				}

				alert('Database imported successfully. Please reload the page.')
				setIsModalOpen(false)
				window.location.reload()
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
					className='inline-flex items-center rounded-full border border-cyan-700/30 bg-cyan-50 px-5 py-2.5 text-sm font-medium text-cyan-900 transition hover:bg-cyan-100'
				>
					Export Database (.sql)
				</button>
				<button
					onClick={() => openModal('import')}
					className='inline-flex items-center rounded-full border border-rose-700/30 bg-rose-50 px-5 py-2.5 text-sm font-medium text-rose-900 transition hover:bg-rose-100'
				>
					Import Database (.sql)
				</button>
			</div>

			{isModalOpen ? (
				<div className='fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4'>
					<div role='dialog' aria-modal='true' className='w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl'>
						<h3 className='text-lg font-semibold text-slate-900'>
							{mode === 'export' ? 'Export Database' : 'Import Database'}
						</h3>
						<p className='mt-1 text-sm text-slate-600'>
							{mode === 'export'
								? 'Enter the update password to generate a .sql backup.'
								: 'Enter the update password and select a .sql file to restore. WARNING: This will overwrite existing data!'}
						</p>
						<form className='mt-4 space-y-4' onSubmit={handleAction}>
							<div>
								<label className='text-xs font-medium uppercase tracking-wide text-slate-500'>Password</label>
								<input
									type='password'
									value={password}
									onChange={(e) => {
										setPassword(e.target.value)
										if (passwordError) setPasswordError('')
									}}
									className='mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-200'
									autoFocus
									required
								/>
							</div>
							
							{mode === 'import' && (
								<div>
									<label className='text-xs font-medium uppercase tracking-wide text-slate-500'>SQL File</label>
									<input
										type='file'
										accept='.sql'
										ref={fileInputRef}
										onChange={(e) => {
											setSelectedFile(e.target.files?.[0] || null)
											if (passwordError) setPasswordError('')
										}}
										className='mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-200'
										required
									/>
								</div>
							)}

							{passwordError ? <p className='text-sm text-rose-600'>{passwordError}</p> : null}
							
							<div className='flex flex-wrap justify-end gap-2 pt-2'>
								<button
									type='button'
									onClick={() => setIsModalOpen(false)}
									className='rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50'
								>
									Cancel
								</button>
								<button
									type='submit'
									disabled={isProcessing}
									className={`rounded-full px-6 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
										mode === 'export' ? 'bg-cyan-600 hover:bg-cyan-700' : 'bg-rose-600 hover:bg-rose-700'
									}`}
								>
									{isProcessing ? 'Processing...' : mode === 'export' ? 'Export' : 'Import'}
								</button>
							</div>
						</form>
					</div>
				</div>
			) : null}
		</>
	)
}
