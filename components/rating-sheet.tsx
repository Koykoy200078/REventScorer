'use client'

import { useState } from 'react'

import { buildDirectRatingCriteriaFromConfig, DIRECT_RATING_TRACK_STRAND_OPTION_GROUPS, normalizeDirectRatingConfig } from '@/lib/direct-rating-config'
import { DEFAULT_RUBRIC_LEGEND } from '@/lib/rubric-legend'
import type { ContestantInput, CreateEventResponse, DirectRatingConfig, JudgeInput } from '@/lib/types'

type JudgeDraft = {
	id: string
	name: string
	email: string
}

type RatingEntry = {
	id: string
	name: string
	noatScore: string
}

type CreateEventApiResponse = CreateEventResponse & {
	error?: string
}

function localId(): string {
	return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`
}

function createEntry(): RatingEntry {
	return {
		id: localId(),
		name: '',
		noatScore: '',
	}
}

function createEntryWithName(name: string): RatingEntry {
	return {
		...createEntry(),
		name,
	}
}

function createJudge(): JudgeDraft {
	return {
		id: localId(),
		name: '',
		email: '',
	}
}

function entriesFromNewLines(value: string): string[] {
	return value
		.split(/\r?\n/)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
}

function buildContestantsPayload(entries: RatingEntry[]): ContestantInput[] {
	const uniqueContestantNames = new Set<string>()
	const contestants: ContestantInput[] = []

	for (const entry of entries) {
		const name = entry.name.trim()
		if (!name) {
			continue
		}

		const nameKey = name.toLowerCase()
		if (uniqueContestantNames.has(nameKey)) {
			continue
		}

		uniqueContestantNames.add(nameKey)
		const parsedNoat = Number.parseFloat(entry.noatScore)
		const noatScore = Number.isFinite(parsedNoat) && parsedNoat >= 0 ? Math.round(parsedNoat * 1000) / 1000 : undefined
		contestants.push({
			name,
			entryType: 'individual',
			...(noatScore !== undefined ? { noatScore } : {}),
		})
	}

	return contestants
}

function buildJudgesPayload(judges: JudgeDraft[]): JudgeInput[] {
	const uniqueJudgeNames = new Set<string>()
	const normalizedJudges: JudgeInput[] = []

	for (const judge of judges) {
		const name = judge.name.trim()
		if (!name) {
			continue
		}

		const nameKey = name.toLowerCase()
		if (uniqueJudgeNames.has(nameKey)) {
			continue
		}

		uniqueJudgeNames.add(nameKey)
		const email = judge.email.trim()

		normalizedJudges.push({
			name,
			...(email ? { email } : {}),
		})
	}

	return normalizedJudges
}

function dateDisplay(iso: string): string {
	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(iso))
}

export function RatingSheet() {
	const [entries, setEntries] = useState<RatingEntry[]>(() => [createEntry()])
	const [title, setTitle] = useState('Direct Rating Sheet')
	const [description, setDescription] = useState('Final Rating is auto-computed from AVE/GPA, NOAT, and Interview using admin-configured max scores. Strand alignment bonus is applied to Interview points only.')
	const [directRatingConfig, setDirectRatingConfig] = useState<DirectRatingConfig>(() => normalizeDirectRatingConfig(undefined))
	const [createdBy, setCreatedBy] = useState('')
	const [judges, setJudges] = useState<JudgeDraft[]>(() => [createJudge()])
	const [bulkEnabled, setBulkEnabled] = useState(false)
	const [bulkNamesText, setBulkNamesText] = useState('')
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [created, setCreated] = useState<CreateEventResponse | null>(null)
	const [publishedAt, setPublishedAt] = useState<string | null>(null)
	const [copiedValue, setCopiedValue] = useState<string | null>(null)

	const totalEntries = entries.length
	const selectedAlignedStrandSet = new Set([...directRatingConfig.strandBonus.singleAlignedStrands, ...directRatingConfig.strandBonus.multiAlignedStrands].map((strand) => strand.toLowerCase()))

	const updateEntry = (id: string, patch: Partial<RatingEntry>) => {
		setEntries((previous) => previous.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))
	}

	const updateJudge = (id: string, patch: Partial<JudgeDraft>) => {
		setJudges((previous) => previous.map((judge) => (judge.id === id ? { ...judge, ...patch } : judge)))
	}

	const addEntry = () => {
		setEntries((previous) => [...previous, createEntry()])
	}

	const addJudge = () => {
		setJudges((previous) => [...previous, createJudge()])
	}

	const updateDirectMaxScore = (field: keyof DirectRatingConfig['maxScores'], value: string) => {
		const numericValue = Number.parseFloat(value)

		setDirectRatingConfig((previous) => {
			const normalized = normalizeDirectRatingConfig(previous)

			if (!Number.isFinite(numericValue) || numericValue <= 0) {
				return normalized
			}

			return {
				...normalized,
				maxScores: {
					...normalized.maxScores,
					[field]: Math.round(numericValue * 1000) / 1000,
				},
			}
		})
	}

	const updateAlignedBonusPoints = (value: string) => {
		const numericValue = Number.parseFloat(value)

		setDirectRatingConfig((previous) => {
			const normalized = normalizeDirectRatingConfig(previous)

			if (!Number.isFinite(numericValue) || numericValue < 0) {
				return normalized
			}

			return {
				...normalized,
				strandBonus: {
					...normalized.strandBonus,
					singleAlignedBonusPoints: Math.round(numericValue * 1000) / 1000,
					multiAlignedBonusPoints: Math.round(numericValue * 1000) / 1000,
				},
			}
		})
	}

	const toggleAlignedStrand = (strand: string, checked: boolean) => {
		setDirectRatingConfig((previous) => {
			const normalized = normalizeDirectRatingConfig(previous)
			const normalizedStrand = strand.toLowerCase()
			const currentSelections = [...normalized.strandBonus.singleAlignedStrands, ...normalized.strandBonus.multiAlignedStrands]
			const uniqueSelections: string[] = []
			const seen = new Set<string>()

			for (const currentStrand of currentSelections) {
				const currentKey = currentStrand.toLowerCase()
				if (seen.has(currentKey)) {
					continue
				}

				seen.add(currentKey)
				uniqueSelections.push(currentStrand)
			}

			const selectionsWithoutTarget = uniqueSelections.filter((entry) => entry.toLowerCase() !== normalizedStrand)
			const nextSelections = checked ? [...selectionsWithoutTarget, strand] : selectionsWithoutTarget
			const nextSingle = nextSelections.length === 1 ? nextSelections : []
			const nextMulti = nextSelections.length > 1 ? nextSelections : []

			return normalizeDirectRatingConfig(
				{
					...normalized,
					strandBonus: {
						...normalized.strandBonus,
						singleAlignedStrands: nextSingle,
						multiAlignedStrands: nextMulti,
					},
				},
				normalized,
			)
		})
	}

	const addBulkEntries = () => {
		const names = entriesFromNewLines(bulkNamesText)
		if (names.length === 0) {
			return
		}

		setEntries((previous) => {
			const incomingNames = [...names]
			const nextEntries = previous.map((entry) => {
				if (incomingNames.length === 0) {
					return entry
				}

				if (entry.name.trim().length > 0) {
					return entry
				}

				const name = incomingNames.shift()
				if (!name) {
					return entry
				}

				return {
					...entry,
					name,
				}
			})

			if (incomingNames.length === 0) {
				return nextEntries
			}

			return [...nextEntries, ...incomingNames.map((name) => createEntryWithName(name))]
		})
		setBulkNamesText('')
		setBulkEnabled(false)
	}

	const removeEntry = (id: string) => {
		setEntries((previous) => (previous.length > 1 ? previous.filter((entry) => entry.id !== id) : previous))
	}

	const removeJudge = (id: string) => {
		setJudges((previous) => (previous.length > 1 ? previous.filter((judge) => judge.id !== id) : previous))
	}

	async function copyLink(value: string): Promise<void> {
		try {
			if (navigator.clipboard && window.isSecureContext) {
				await navigator.clipboard.writeText(value)
			} else {
				const textArea = document.createElement('textarea')
				textArea.value = value
				textArea.style.position = 'fixed'
				textArea.style.left = '-999999px'
				textArea.style.top = '-999999px'
				document.body.appendChild(textArea)
				textArea.focus()
				textArea.select()
				const success = document.execCommand('copy')
				textArea.remove()
				if (!success) {
					throw new Error('Copy command failed')
				}
			}

			setCopiedValue(value)
			window.setTimeout(() => {
				setCopiedValue((currentValue) => (currentValue === value ? null : currentValue))
			}, 1800)
		} catch (copyError) {
			console.error('Clipboard copy failed:', copyError)
			setCopiedValue(null)
		}
	}

	async function publishRatingSheet(): Promise<void> {
		setIsSaving(true)
		setError(null)
		setCreated(null)

		const contestants = buildContestantsPayload(entries)
		const normalizedJudges = buildJudgesPayload(judges)

		if (contestants.length < 2) {
			setIsSaving(false)
			setError('At least 2 unique contestant names are required before publishing.')
			return
		}

		if (normalizedJudges.length === 0) {
			setIsSaving(false)
			setError('At least 1 judge name is required before publishing.')
			return
		}

		const normalizedDirectRatingConfig = normalizeDirectRatingConfig(directRatingConfig)

		const payload = {
			title: title.trim() || 'Direct Rating Sheet',
			description: description.trim() || undefined,
			createdBy: createdBy.trim() || undefined,
			eventScoringType: 'standard' as const,
			rubricLegend: DEFAULT_RUBRIC_LEGEND,
			directRatingConfig: normalizedDirectRatingConfig,
			contestants,
			judges: normalizedJudges,
			criteria: buildDirectRatingCriteriaFromConfig(normalizedDirectRatingConfig),
		}

		try {
			const response = await fetch('/api/eventscorer/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})

			const responseData = (await response.json()) as CreateEventApiResponse

			if (!response.ok) {
				throw new Error(responseData.error ?? 'Unable to publish rating sheet.')
			}

			setCreated(responseData)
			setPublishedAt(new Date().toISOString())
		} catch (publishError) {
			setError(publishError instanceof Error ? publishError.message : 'Unable to publish rating sheet.')
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<section className='mx-auto w-full max-w-6xl px-4 pt-6 sm:px-8'>
			<div className='rounded-3xl border border-emerald-200 bg-white/95 p-6 shadow-xl shadow-emerald-900/10 sm:p-8'>
				<p className='text-xs uppercase tracking-[0.2em] text-emerald-800/80'>Dynamic Event Scorer</p>
				<h1 className='mt-2 text-3xl font-semibold tracking-tight text-emerald-950'>Create Rating Sheet</h1>
				<p className='mt-3 max-w-3xl text-sm text-emerald-900/80'>Set direct score max values and optional strand bonuses in admin. Judges enter scores and details, and any aligned bonus is applied to Interview before Final Rating is auto-computed.</p>
			</div>

			<div className='mt-6 rounded-3xl border border-emerald-200 bg-white/95 p-6 shadow-xl shadow-emerald-900/10 sm:p-8'>
				<h2 className='text-lg font-semibold text-emerald-950'>Publish Settings</h2>
				<div className='mt-4 grid gap-3 sm:grid-cols-2'>
					<label className='text-sm font-medium text-emerald-950'>
						Rating Sheet Title
						<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder='Direct Rating Sheet' className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
					</label>
					<label className='text-sm font-medium text-emerald-950'>
						Created By (Optional)
						<input value={createdBy} onChange={(event) => setCreatedBy(event.target.value)} placeholder='Admissions Committee' className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
					</label>
					<label className='text-sm font-medium text-emerald-950 sm:col-span-2'>
						Description (Optional)
						<textarea
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							rows={2}
							placeholder='Final Rating auto-compute: normalized AVE/GPA, NOAT, Interview, with optional aligned bonus applied to Interview only.'
							className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2'
						/>
					</label>
				</div>

				<div className='mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4'>
					<div className='flex flex-wrap items-center justify-between gap-2'>
						<h3 className='text-sm font-semibold text-emerald-950'>Direct Rating Defaults</h3>
						<span className='rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-900'>Base Final Rating Scale: 0-100</span>
					</div>
					<p className='mt-1 text-xs text-emerald-900/80'>Set max scores per field (default 100). Strand bonus is added to Interview points only (capped by Interview max), then Final Rating is computed as the average percentage.</p>

					<div className='mt-3 grid gap-3 sm:grid-cols-3'>
						<label className='text-xs font-semibold uppercase tracking-wide text-emerald-900'>
							AVE/GPA Max Score
							<input type='number' min={1} step='0.01' value={directRatingConfig.maxScores.aveGpa} onChange={(event) => updateDirectMaxScore('aveGpa', event.target.value)} className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
						</label>
						<label className='text-xs font-semibold uppercase tracking-wide text-emerald-900'>
							NOAT Max Score
							<input type='number' min={1} step='0.01' value={directRatingConfig.maxScores.noat} onChange={(event) => updateDirectMaxScore('noat', event.target.value)} className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
						</label>
						<label className='text-xs font-semibold uppercase tracking-wide text-emerald-900'>
							Interview Max Score
							<input
								type='number'
								min={1}
								step='0.01'
								value={directRatingConfig.maxScores.interview}
								onChange={(event) => updateDirectMaxScore('interview', event.target.value)}
								className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2'
							/>
						</label>
					</div>

					<div className='mt-4 rounded-xl border border-emerald-200 bg-white p-3'>
						<div className='flex items-center justify-between gap-2'>
							<p className='text-xs font-semibold uppercase tracking-wide text-emerald-900'>Aligned Strand Bonus Points</p>
							<input
								type='number'
								min={0}
								step='0.01'
								value={directRatingConfig.strandBonus.singleAlignedBonusPoints}
								onChange={(event) => updateAlignedBonusPoints(event.target.value)}
								className='w-24 rounded-lg border border-emerald-200 bg-white px-2 py-1 text-right text-sm font-semibold text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2'
							/>
						</div>
						<p className='mt-1 text-[11px] text-emerald-900/75'>Use one bonus value for both single-aligned and multi-aligned strand matches.</p>
					</div>

					<div className='mt-3 rounded-xl border border-emerald-200 bg-white p-3'>
						<div className='flex flex-wrap items-center justify-between gap-2'>
							<p className='text-xs font-semibold uppercase tracking-wide text-emerald-900'>Aligned Strand Selection</p>
							<span className='rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-900'>Selected: {selectedAlignedStrandSet.size}</span>
						</div>
						<p className='mt-1 text-[11px] text-emerald-900/75'>DepEd has 4 main SHS tracks. Check one or more offered strands/tracks to mark them as aligned. The same bonus value is applied for any aligned match.</p>
						<div className='mt-2 max-h-44 space-y-2 overflow-y-auto rounded-xl border border-emerald-200 bg-white px-2 py-2'>
							{DIRECT_RATING_TRACK_STRAND_OPTION_GROUPS.map((group) => (
								<div key={group.track} className='rounded-lg border border-emerald-100 bg-emerald-50/40 p-2'>
									<p className='px-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-900'>{group.track}</p>
									<div className='mt-1 space-y-1'>
										{group.options.map((option) => {
											const indentStyle = option.depth > 0 ? { paddingLeft: `${8 + option.depth * 12}px` } : undefined

											if (option.hasChildren) {
												return (
													<div key={`aligned-${group.track}-${option.value}`} style={indentStyle} className='px-2 py-1 text-xs font-semibold text-emerald-900/80'>
														{option.label}
													</div>
												)
											}

											const isChecked = selectedAlignedStrandSet.has(option.value.toLowerCase())

											return (
												<label key={`aligned-${group.track}-${option.value}`} style={indentStyle} className='flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1 text-xs text-emerald-950 transition hover:bg-emerald-50'>
													<input type='checkbox' checked={isChecked} onChange={(event) => toggleAlignedStrand(option.value, event.target.checked)} className='mt-0.5 h-4 w-4 rounded border-emerald-300 text-emerald-700 focus:ring-emerald-500' />
													<span>{option.label}</span>
												</label>
											)
										})}
									</div>
								</div>
							))}
						</div>
					</div>

					<p className='mt-3 text-[11px] text-emerald-900/75'>Final Rating formula: ((AVE/GPA / Max AVE) x 100 + (NOAT / Max NOAT) x 100 + ((Interview + aligned strand bonus) / Max Interview) x 100) / 3, with Interview capped at its max score.</p>
				</div>

				<div className='mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4'>
					<div className='flex flex-wrap items-center justify-between gap-2'>
						<h3 className='text-sm font-semibold text-emerald-950'>Judges</h3>
						<button type='button' onClick={addJudge} className='rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100'>
							Add Judge
						</button>
					</div>
					<div className='mt-3 space-y-2'>
						{judges.map((judge, index) => (
							<div key={judge.id} className='grid gap-2 sm:grid-cols-[1fr_1fr_auto]'>
								<input value={judge.name} onChange={(event) => updateJudge(judge.id, { name: event.target.value })} placeholder={`Judge ${index + 1} name`} className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
								<input value={judge.email} onChange={(event) => updateJudge(judge.id, { email: event.target.value })} placeholder='Email (optional)' className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
								<button type='button' onClick={() => removeJudge(judge.id)} disabled={judges.length <= 1} className='rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60'>
									Remove
								</button>
							</div>
						))}
					</div>
				</div>
			</div>

			<div className='mt-6 rounded-3xl border border-cyan-200 bg-white/95 p-6 shadow-xl shadow-cyan-900/10 sm:p-8'>
				<div className='flex flex-wrap items-center justify-between gap-3'>
					<h2 className='text-lg font-semibold text-cyan-950'>Rating Entries</h2>
					<div className='flex flex-wrap items-center gap-2'>
						<span className='rounded-full bg-cyan-100 px-3 py-1 text-xs font-medium text-cyan-900'>Total: {totalEntries}</span>
						<button type='button' onClick={addEntry} className='rounded-full border border-cyan-300 bg-cyan-50 px-4 py-2 text-xs font-semibold text-cyan-900 transition hover:bg-cyan-100'>
							Add Row
						</button>
						<button type='button' onClick={() => setBulkEnabled((current) => !current)} className='rounded-full border border-cyan-300 bg-white px-4 py-2 text-xs font-semibold text-cyan-900 transition hover:bg-cyan-50'>
							{bulkEnabled ? 'Hide Bulk Add' : 'Bulk Add Names'}
						</button>
					</div>
				</div>

				{bulkEnabled ? (
					<div className='mt-4 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4'>
						<label className='text-xs font-semibold uppercase tracking-wide text-cyan-900'>
							Bulk Names
							<textarea value={bulkNamesText} onChange={(event) => setBulkNamesText(event.target.value)} rows={4} className='mt-2 w-full rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200' placeholder='One student name per line' />
						</label>
						<div className='mt-3 flex flex-wrap gap-2'>
							<button type='button' onClick={addBulkEntries} className='rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100'>
								Add Names
							</button>
							<button type='button' onClick={() => setBulkNamesText('')} className='rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50'>
								Clear
							</button>
						</div>
					</div>
				) : null}

				<div className='mt-4 overflow-hidden rounded-2xl border border-cyan-100'>
					<table className='w-full border-separate border-spacing-0'>
						<thead>
							<tr className='bg-cyan-50 text-left text-[11px] font-semibold uppercase tracking-wide text-cyan-900'>
								<th className='rounded-l-2xl px-2 py-2'>Name</th>
								<th className='px-2 py-2 text-right'>NOAT</th>
								<th className='rounded-r-2xl px-2 py-2 text-right'>Action</th>
							</tr>
						</thead>
						<tbody>
							{entries.map((entry) => (
								<tr key={entry.id} className='border-b border-cyan-100 bg-white'>
									<td className='px-2 py-2'>
										<input type='text' value={entry.name} onChange={(event) => updateEntry(entry.id, { name: event.target.value })} className='min-w-0 w-full rounded-lg border border-cyan-200 px-2 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200' placeholder='Student' />
									</td>
									<td className='px-2 py-2 text-right'>
										<input
											type='number'
											min={0}
											max={directRatingConfig.maxScores.noat}
											step='0.01'
											value={entry.noatScore}
											onChange={(event) => updateEntry(entry.id, { noatScore: event.target.value })}
											className='w-24 rounded-lg border border-cyan-200 px-2 py-2 text-right text-sm text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200'
											placeholder='0'
										/>
									</td>
									<td className='px-2 py-2 text-right'>
										<button type='button' onClick={() => removeEntry(entry.id)} className='rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50' disabled={entries.length <= 1}>
											Remove
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<p className='mt-4 text-xs text-cyan-900/80'>Rows are used to build the contestant list when publishing. Optional NOAT values are admin-only and display as read-only on the judge side.</p>

				{error ? <div className='mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>{error}</div> : null}

				<div className='mt-4 flex flex-wrap items-center gap-3'>
					<button
						type='button'
						onClick={() => {
							void publishRatingSheet()
						}}
						disabled={isSaving}
						className='rounded-full bg-emerald-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60'>
						{isSaving ? 'Publishing Rating Sheet...' : 'Save Rating Sheet and Generate Judge Links'}
					</button>
				</div>
			</div>

			{created ? (
				<section className='mt-6 rounded-3xl border border-cyan-200 bg-cyan-50/70 p-6 shadow-xl shadow-cyan-900/10 sm:p-8'>
					<h2 className='text-lg font-semibold text-cyan-950'>Rating Sheet Published Successfully</h2>
					<p className='mt-1 text-sm text-cyan-900/80'>Share each judge link privately.</p>

					<div className='mt-4 rounded-xl border border-cyan-200 bg-white p-3'>
						<p className='text-xs uppercase tracking-wide text-cyan-800/80'>Admin Results Page</p>
						<a href={created.adminUrl} className='mt-1 block break-all text-sm font-medium text-cyan-900 underline'>
							{created.adminUrl}
						</a>
					</div>

					<div className='mt-4 space-y-3'>
						{created.judgeLinks.map((link) => (
							<div key={link.judgeId} className='rounded-xl border border-cyan-200 bg-white p-3'>
								<div className='mb-2 flex items-center justify-between gap-2'>
									<p className='text-sm font-semibold text-cyan-950'>{link.judgeName}</p>
									<button type='button' onClick={() => void copyLink(link.url)} className='rounded-full border border-cyan-300 px-3 py-1 text-xs text-cyan-900 transition hover:bg-cyan-100'>
										{copiedValue === link.url ? 'Copied' : 'Copy Link'}
									</button>
								</div>
								<a href={link.url} className='block break-all text-sm text-cyan-900 underline'>
									{link.url}
								</a>
							</div>
						))}
					</div>

					{publishedAt ? <p className='mt-3 text-xs text-cyan-900/80'>Generated at {dateDisplay(publishedAt)}</p> : null}
				</section>
			) : null}
		</section>
	)
}
