'use client'

import { useEffect, useMemo, useState } from 'react'
import Select, { type MultiValue, type SingleValue, type StylesConfig } from 'react-select'

import { buildDirectRatingCriteriaFromConfig, deriveDirectRatingConfigFromCriteria, directScoreWeightTotal, directScoreWeightsFromConfig, DIRECT_RATING_SELECT_GROUP_OPTIONS, normalizeDirectRatingConfig, type DirectRatingSelectOption } from '@/lib/direct-rating-config'
import { DEFAULT_RUBRIC_LEGEND } from '@/lib/rubric-legend'
import type { AdminEventEditorInput, ContestantInput, CreateEventResponse, DirectRatingConfig, DirectScoreFieldKey, EventScorer, JudgeDirectoryItem, JudgeInput } from '@/lib/types'

type JudgeDraft = {
	id: string
	name: string
	email: string
}

type RatingEntry = {
	id: string
	name: string
}

type CreateEventApiResponse = CreateEventResponse & {
	error?: string
}

type AdminEventReadApiResponse = {
	event?: EventScorer
	error?: string
}

type AdminEventUpdateApiResponse = {
	ok?: boolean
	event?: EventScorer
	error?: string
}

type JudgeDirectoryApiResponse = {
	judges?: JudgeDirectoryItem[]
	error?: string
}

type JudgeDirectoryOption = {
	value: string
	label: string
	name: string
	email?: string
	usageCount: number
	lastUsedAt: string
}

type RatingSheetProps = {
	editEventId?: string
}

function localId(): string {
	return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`
}

function createEntry(): RatingEntry {
	return {
		id: localId(),
		name: '',
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
		contestants.push({
			name,
			entryType: 'individual',
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

export function RatingSheet({ editEventId }: RatingSheetProps) {
	const normalizedEditEventId = typeof editEventId === 'string' ? editEventId.trim() : ''
	const isEditMode = normalizedEditEventId.length > 0
	const [entries, setEntries] = useState<RatingEntry[]>(() => [createEntry()])
	const [title, setTitle] = useState('')
	const [description, setDescription] = useState('')
	const [directRatingConfig, setDirectRatingConfig] = useState<DirectRatingConfig>(() => normalizeDirectRatingConfig(undefined))
	const [createdBy, setCreatedBy] = useState('')
	const [judges, setJudges] = useState<JudgeDraft[]>(() => [createJudge()])
	const [bulkEnabled, setBulkEnabled] = useState(false)
	const [bulkNamesText, setBulkNamesText] = useState('')
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null)
	const [created, setCreated] = useState<CreateEventResponse | null>(null)
	const [publishedAt, setPublishedAt] = useState<string | null>(null)
	const [copiedValue, setCopiedValue] = useState<string | null>(null)
	const [existingJudges, setExistingJudges] = useState<JudgeDirectoryItem[]>([])
	const [isLoadingJudgeDirectory, setIsLoadingJudgeDirectory] = useState(true)
	const [judgeDirectoryError, setJudgeDirectoryError] = useState<string | null>(null)
	const [isLoadingEditEvent, setIsLoadingEditEvent] = useState(isEditMode)

	const totalEntries = entries.length
	const directScoreWeights = useMemo(() => directScoreWeightsFromConfig(directRatingConfig), [directRatingConfig])
	const directScoreWeightSum = useMemo(() => directScoreWeightTotal(directScoreWeights), [directScoreWeights])
	const selectedAlignedStrandSet = new Set([...directRatingConfig.strandBonus.singleAlignedStrands, ...directRatingConfig.strandBonus.multiAlignedStrands].map((strand) => strand.toLowerCase()))
	const alignedStrandOptionsByLowerValue = useMemo(() => {
		const map = new Map<string, DirectRatingSelectOption>()

		for (const group of DIRECT_RATING_SELECT_GROUP_OPTIONS) {
			for (const option of group.options) {
				map.set(option.value.toLowerCase(), option)
			}
		}

		return map
	}, [])
	const selectedAlignedStrandOptions = useMemo(() => {
		const currentSelections = [...directRatingConfig.strandBonus.singleAlignedStrands, ...directRatingConfig.strandBonus.multiAlignedStrands]
		const uniqueSelections: string[] = []
		const seen = new Set<string>()

		for (const strand of currentSelections) {
			const key = strand.toLowerCase()
			if (seen.has(key)) {
				continue
			}

			seen.add(key)
			uniqueSelections.push(strand)
		}

		return uniqueSelections.map((strand) => alignedStrandOptionsByLowerValue.get(strand.toLowerCase()) ?? { value: strand, label: strand, track: 'Custom' })
	}, [alignedStrandOptionsByLowerValue, directRatingConfig.strandBonus.multiAlignedStrands, directRatingConfig.strandBonus.singleAlignedStrands])
	const alignedStrandSelectStyles = useMemo<StylesConfig<DirectRatingSelectOption, true>>(
		() => ({
			control: (base, state) => ({
				...base,
				minHeight: 42,
				borderColor: state.isFocused ? '#10b981' : '#a7f3d0',
				boxShadow: state.isFocused ? '0 0 0 2px rgba(16,185,129,0.2)' : 'none',
				':hover': {
					borderColor: '#34d399',
				},
			}),
			menu: (base) => ({
				...base,
				zIndex: 50,
			}),
			menuPortal: (base) => ({
				...base,
				zIndex: 60,
			}),
		}),
		[],
	)
	const existingJudgeOptions = useMemo<JudgeDirectoryOption[]>(
		() =>
			existingJudges.map((judge) => ({
				value: judge.name.toLowerCase(),
				label: judge.email ? `${judge.name} (${judge.email})` : judge.name,
				name: judge.name,
				email: judge.email,
				usageCount: judge.usageCount,
				lastUsedAt: judge.lastUsedAt,
			})),
		[existingJudges],
	)
	const existingJudgeOptionByName = useMemo(() => {
		const map = new Map<string, JudgeDirectoryOption>()

		for (const option of existingJudgeOptions) {
			map.set(option.name.toLowerCase(), option)
		}

		return map
	}, [existingJudgeOptions])
	const judgeDirectorySelectStyles = useMemo<StylesConfig<JudgeDirectoryOption, false>>(
		() => ({
			control: (base, state) => ({
				...base,
				minHeight: 40,
				borderColor: state.isFocused ? '#10b981' : '#a7f3d0',
				boxShadow: state.isFocused ? '0 0 0 2px rgba(16,185,129,0.2)' : 'none',
				':hover': {
					borderColor: '#34d399',
				},
			}),
			menu: (base) => ({
				...base,
				zIndex: 50,
			}),
		}),
		[],
	)

	useEffect(() => {
		let isMounted = true

		const loadJudgeDirectory = async () => {
			try {
				const response = await fetch('/api/eventscorer/events/judges', { method: 'GET' })
				const responseData = (await response.json()) as JudgeDirectoryApiResponse

				if (!response.ok) {
					throw new Error(responseData.error ?? 'Unable to load existing judges.')
				}

				if (!isMounted) {
					return
				}

				setExistingJudges(Array.isArray(responseData.judges) ? responseData.judges : [])
			} catch (loadError) {
				if (!isMounted) {
					return
				}

				setJudgeDirectoryError(loadError instanceof Error ? loadError.message : 'Unable to load existing judges.')
			} finally {
				if (isMounted) {
					setIsLoadingJudgeDirectory(false)
				}
			}
		}

		void loadJudgeDirectory()

		return () => {
			isMounted = false
		}
	}, [])

	useEffect(() => {
		if (!isEditMode) {
			return
		}

		let isMounted = true

		const loadEventForEditing = async () => {
			setIsLoadingEditEvent(true)

			try {
				const response = await fetch(`/api/eventscorer/admin/events/${encodeURIComponent(normalizedEditEventId)}`, { method: 'GET' })
				const responseData = (await response.json()) as AdminEventReadApiResponse

				if (!response.ok) {
					throw new Error(responseData.error ?? 'Unable to load rating sheet for editing.')
				}

				if (!responseData.event) {
					throw new Error('Rating sheet event was not returned by the server.')
				}

				const eventToEdit = responseData.event
				const derivedDirectRatingConfig = deriveDirectRatingConfigFromCriteria(eventToEdit.criteria)

				if (!derivedDirectRatingConfig) {
					throw new Error('Selected event is not a direct-rating sheet.')
				}

				if (!isMounted) {
					return
				}

				setTitle(eventToEdit.title)
				setDescription(eventToEdit.description ?? '')
				setCreatedBy(eventToEdit.createdBy ?? '')
				setEntries(eventToEdit.contestants.length > 0 ? eventToEdit.contestants.map((contestant) => createEntryWithName(contestant.name)) : [createEntry()])
				setJudges(
					eventToEdit.judges.length > 0
						? eventToEdit.judges.map((judge) => ({
								id: localId(),
								name: judge.name,
								email: judge.email ?? '',
							}))
						: [createJudge()],
				)
				setDirectRatingConfig(normalizeDirectRatingConfig(eventToEdit.directRatingConfig, derivedDirectRatingConfig))
				setBulkEnabled(false)
				setBulkNamesText('')
				setCreated(null)
				setPublishedAt(null)
				setSaveSuccessMessage(null)
				setCopiedValue(null)
				setError(null)
			} catch (loadError) {
				if (!isMounted) {
					return
				}

				setError(loadError instanceof Error ? loadError.message : 'Unable to load rating sheet for editing.')
			} finally {
				if (isMounted) {
					setIsLoadingEditEvent(false)
				}
			}
		}

		void loadEventForEditing()

		return () => {
			isMounted = false
		}
	}, [isEditMode, normalizedEditEventId])

	const updateEntry = (id: string, patch: Partial<RatingEntry>) => {
		setEntries((previous) => previous.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))
	}

	const updateJudge = (id: string, patch: Partial<JudgeDraft>) => {
		setJudges((previous) => previous.map((judge) => (judge.id === id ? { ...judge, ...patch } : judge)))
	}

	const applyExistingJudge = (id: string, selectedOption: SingleValue<JudgeDirectoryOption>) => {
		if (!selectedOption) {
			return
		}

		updateJudge(id, {
			name: selectedOption.name,
			email: selectedOption.email ?? '',
		})
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

	const updateDirectScoreWeight = (field: DirectScoreFieldKey, value: string) => {
		const numericValue = Number.parseFloat(value)

		setDirectRatingConfig((previous) => {
			const normalized = normalizeDirectRatingConfig(previous)

			if (!Number.isFinite(numericValue) || numericValue < 0) {
				return normalized
			}

			const nextScoreWeights = {
				...directScoreWeightsFromConfig(normalized),
				[field]: Math.round(numericValue * 1000) / 1000,
			}

			return {
				...normalized,
				scoreWeights: nextScoreWeights,
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

	const updateAlignedStrandSelections = (selectedOptions: MultiValue<DirectRatingSelectOption>) => {
		setDirectRatingConfig((previous) => {
			const normalized = normalizeDirectRatingConfig(previous)
			const uniqueSelections: string[] = []
			const seen = new Set<string>()

			for (const selectedOption of selectedOptions) {
				const selectedValue = selectedOption.value.trim()
				if (selectedValue.length === 0) {
					continue
				}

				const currentKey = selectedValue.toLowerCase()
				if (seen.has(currentKey)) {
					continue
				}

				seen.add(currentKey)
				uniqueSelections.push(selectedValue)
			}

			const nextSingle = uniqueSelections.length === 1 ? uniqueSelections : []
			const nextMulti = uniqueSelections.length > 1 ? uniqueSelections : []

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
		setSaveSuccessMessage(null)
		setCreated(null)

		const contestants = buildContestantsPayload(entries)
		const normalizedJudges = buildJudgesPayload(judges).map((judge) => {
			if (judge.email && judge.email.trim().length > 0) {
				return judge
			}

			const existingJudge = existingJudgeOptionByName.get(judge.name.toLowerCase())
			if (!existingJudge?.email) {
				return judge
			}

			return {
				...judge,
				email: existingJudge.email,
			}
		})

		if (contestants.length < 2) {
			setIsSaving(false)
			setError(`At least 2 unique contestant names are required before ${isEditMode ? 'saving' : 'publishing'}.`)
			return
		}

		if (normalizedJudges.length === 0) {
			setIsSaving(false)
			setError(`At least 1 judge name is required before ${isEditMode ? 'saving' : 'publishing'}.`)
			return
		}

		const normalizedDirectRatingConfig = normalizeDirectRatingConfig(directRatingConfig)
		const normalizedDirectScoreWeightTotal = directScoreWeightTotal(directScoreWeightsFromConfig(normalizedDirectRatingConfig))

		if (Math.abs(normalizedDirectScoreWeightTotal - 100) > 0.001) {
			setIsSaving(false)
			setError(`Direct score weights must total 100%. Current total: ${normalizedDirectScoreWeightTotal.toFixed(2)}%.`)
			return
		}

		const eventEditorPayload: AdminEventEditorInput = {
			title: title.trim() || 'Direct Rating Sheet',
			description: description.trim() || undefined,
			createdBy: createdBy.trim() || undefined,
			eventScoringType: 'standard',
			rubricLegend: DEFAULT_RUBRIC_LEGEND,
			directRatingConfig: normalizedDirectRatingConfig,
			contestants,
			judges: normalizedJudges,
			criteria: buildDirectRatingCriteriaFromConfig(normalizedDirectRatingConfig).map((criterion) => ({
				name: criterion.name,
				subCriteria: criterion.subCriteria.map((subCriterion) => ({
					name: subCriterion.name,
					maxScore: subCriterion.maxScore,
				})),
			})),
		}

		try {
			if (isEditMode) {
				const response = await fetch(`/api/eventscorer/admin/events/${encodeURIComponent(normalizedEditEventId)}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ eventEditor: eventEditorPayload }),
				})

				const responseData = (await response.json()) as AdminEventUpdateApiResponse

				if (!response.ok) {
					if (response.status === 401) {
						throw new Error('Update password is required. Open this event in Admin, click Update, then return to save the rating sheet.')
					}

					throw new Error(responseData.error ?? 'Unable to update rating sheet.')
				}

				if (!responseData.event) {
					throw new Error('Updated rating sheet was not returned by the server.')
				}

				const origin = typeof window !== 'undefined' ? window.location.origin : ''
				const adminUrl = origin ? `${origin}/admin/${responseData.event.id}` : `/admin/${responseData.event.id}`

				setCreated({
					eventId: responseData.event.id,
					adminUrl,
					judgeLinks: responseData.event.judges.map((judge) => ({
						judgeId: judge.id,
						judgeName: judge.name,
						token: judge.token,
						url: origin ? `${origin}/judge/${judge.token}` : `/judge/${judge.token}`,
					})),
				})
				const savedAtIso = new Date().toISOString()
				setPublishedAt(savedAtIso)
				setSaveSuccessMessage(`Rating sheet changes saved successfully at ${dateDisplay(savedAtIso)}.`)
				return
			}

			const response = await fetch('/api/eventscorer/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(eventEditorPayload),
			})

			const responseData = (await response.json()) as CreateEventApiResponse

			if (!response.ok) {
				throw new Error(responseData.error ?? 'Unable to publish rating sheet.')
			}

			setCreated(responseData)
			const savedAtIso = new Date().toISOString()
			setPublishedAt(savedAtIso)
			setSaveSuccessMessage(`Rating sheet published successfully at ${dateDisplay(savedAtIso)}.`)
		} catch (publishError) {
			setSaveSuccessMessage(null)
			setError(publishError instanceof Error ? publishError.message : isEditMode ? 'Unable to update rating sheet.' : 'Unable to publish rating sheet.')
		} finally {
			setIsSaving(false)
		}
	}

	if (isLoadingEditEvent) {
		return (
			<section className='mx-auto w-full max-w-6xl px-4 pt-6 sm:px-8'>
				<div className='rounded-3xl border border-emerald-200 bg-white/95 p-6 shadow-xl shadow-emerald-900/10 sm:p-8'>
					<p className='text-xs uppercase tracking-[0.2em] text-emerald-800/80'>Dynamic Event Scorer</p>
					<h1 className='mt-2 text-3xl font-semibold tracking-tight text-emerald-950'>Edit Rating Sheet</h1>
					<p className='mt-3 text-sm text-emerald-900/80'>Loading selected rating sheet...</p>
				</div>
			</section>
		)
	}

	return (
		<section className='mx-auto w-full max-w-6xl px-4 pt-6 sm:px-8'>
			<div className='rounded-3xl border border-emerald-200 bg-white/95 p-6 shadow-xl shadow-emerald-900/10 sm:p-8'>
				<p className='text-xs uppercase tracking-[0.2em] text-emerald-800/80'>Dynamic Event Scorer</p>
				<h1 className='mt-2 text-3xl font-semibold tracking-tight text-emerald-950'>{isEditMode ? 'Edit Rating Sheet' : 'Create Rating Sheet'}</h1>
				<p className='mt-3 max-w-3xl text-sm text-emerald-900/80'>
					{isEditMode ? 'Update direct score max values, weights, strand bonus setup, contestants, and judges for this rating sheet.' : 'Set direct score max values and optional strand bonuses in admin. Judges enter scores and details, and any aligned bonus is applied to Interview before Final Rating is auto-computed.'}
				</p>
				{isEditMode && publishedAt ? <p className='mt-3 inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900'>Last saved: {dateDisplay(publishedAt)}</p> : null}
			</div>

			<div className='mt-6 rounded-3xl border border-emerald-200 bg-white/95 p-6 shadow-xl shadow-emerald-900/10 sm:p-8'>
				<h2 className='text-lg font-semibold text-emerald-950'>{isEditMode ? 'Edit Settings' : 'Publish Settings'}</h2>
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
					<p className='mt-1 text-xs text-emerald-900/80'>Set max scores and weight percentages per field. Final Rating uses your configured AVE/GPA, NOAT, and Interview weights; strand bonus is added to Interview points only (capped by Interview max).</p>

					<div className='mt-3 rounded-xl border border-emerald-200 bg-white p-3'>
						<div className='flex flex-wrap items-center justify-between gap-2'>
							<p className='text-xs font-semibold uppercase tracking-wide text-emerald-900'>Max Score + Weight (%) Per Field</p>
							<span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${Math.abs(directScoreWeightSum - 100) <= 0.001 ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>Total: {directScoreWeightSum.toFixed(2)}%</span>
						</div>
						<div className='mt-2 grid gap-3 sm:grid-cols-3'>
							<div className='rounded-xl border border-emerald-100 bg-emerald-50/50 p-3'>
								<p className='text-[11px] font-semibold uppercase tracking-wide text-emerald-900'>AVE/GPA</p>
								<label className='mt-2 block text-[11px] font-semibold uppercase tracking-wide text-emerald-900'>
									Max Score
									<input type='number' min={1} step='0.01' value={directRatingConfig.maxScores.aveGpa} onChange={(event) => updateDirectMaxScore('aveGpa', event.target.value)} className='mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
								</label>
								<label className='mt-2 block text-[11px] font-semibold uppercase tracking-wide text-emerald-900'>
									Weight (%)
									<input type='number' min={0} step='0.01' value={directScoreWeights.aveGpa} onChange={(event) => updateDirectScoreWeight('aveGpa', event.target.value)} className='mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
								</label>
							</div>
							<div className='rounded-xl border border-emerald-100 bg-emerald-50/50 p-3'>
								<p className='text-[11px] font-semibold uppercase tracking-wide text-emerald-900'>NOAT</p>
								<label className='mt-2 block text-[11px] font-semibold uppercase tracking-wide text-emerald-900'>
									Max Score
									<input type='number' min={1} step='0.01' value={directRatingConfig.maxScores.noat} onChange={(event) => updateDirectMaxScore('noat', event.target.value)} className='mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
								</label>
								<label className='mt-2 block text-[11px] font-semibold uppercase tracking-wide text-emerald-900'>
									Weight (%)
									<input type='number' min={0} step='0.01' value={directScoreWeights.noat} onChange={(event) => updateDirectScoreWeight('noat', event.target.value)} className='mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
								</label>
							</div>
							<div className='rounded-xl border border-emerald-100 bg-emerald-50/50 p-3'>
								<p className='text-[11px] font-semibold uppercase tracking-wide text-emerald-900'>Interview</p>
								<label className='mt-2 block text-[11px] font-semibold uppercase tracking-wide text-emerald-900'>
									Max Score
									<input
										type='number'
										min={1}
										step='0.01'
										value={directRatingConfig.maxScores.interview}
										onChange={(event) => updateDirectMaxScore('interview', event.target.value)}
										className='mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2'
									/>
								</label>
								<label className='mt-2 block text-[11px] font-semibold uppercase tracking-wide text-emerald-900'>
									Weight (%)
									<input type='number' min={0} step='0.01' value={directScoreWeights.interview} onChange={(event) => updateDirectScoreWeight('interview', event.target.value)} className='mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
								</label>
							</div>
						</div>
						<p className='mt-3 text-[11px] text-emerald-900/75'>Set any values you want. Before saving, total weight must equal 100%.</p>
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
						<p className='mt-1 text-[11px] text-emerald-900/75'>Use Select2-style search and multi-select. DepEd tracks, strands, and the requested TVL sub-specializations are included.</p>
						<Select<DirectRatingSelectOption, true>
							isMulti
							value={selectedAlignedStrandOptions}
							onChange={updateAlignedStrandSelections}
							options={DIRECT_RATING_SELECT_GROUP_OPTIONS}
							instanceId='rating-sheet-aligned-strands'
							inputId='rating-sheet-aligned-strands-input'
							placeholder='Search and select aligned strands/specializations'
							closeMenuOnSelect={false}
							hideSelectedOptions={false}
							className='mt-2 text-sm'
							classNamePrefix='strand-select2'
							styles={alignedStrandSelectStyles}
						/>
					</div>

					<p className='mt-3 text-[11px] text-emerald-900/75'>
						Final Rating formula: ((AVE/GPA / Max AVE) x {directScoreWeights.aveGpa.toFixed(2)}) + ((NOAT / Max NOAT) x {directScoreWeights.noat.toFixed(2)}) + (((Interview + aligned strand bonus) / Max Interview) x {directScoreWeights.interview.toFixed(2)}), with Interview capped at its max score.
					</p>
				</div>

				<div className='mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4'>
					<div className='flex flex-wrap items-center justify-between gap-2'>
						<h3 className='text-sm font-semibold text-emerald-950'>Judges</h3>
						<button type='button' onClick={addJudge} className='rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100'>
							Add Judge
						</button>
					</div>
					<p className='mt-1 text-xs text-emerald-900/80'>Select from existing judge records to reuse saved details, or type a new name/email manually.</p>
					{judgeDirectoryError ? <p className='mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800'>{judgeDirectoryError}</p> : null}
					<div className='mt-3 space-y-2'>
						{judges.map((judge, index) => {
							const selectedExistingJudge = existingJudgeOptionByName.get(judge.name.trim().toLowerCase()) ?? null

							return (
								<div key={judge.id} className='grid gap-2 sm:grid-cols-[1.2fr_1fr_1fr_auto]'>
									<Select<JudgeDirectoryOption, false>
										value={selectedExistingJudge}
										onChange={(selectedOption: SingleValue<JudgeDirectoryOption>) => applyExistingJudge(judge.id, selectedOption)}
										options={existingJudgeOptions}
										isClearable
										isLoading={isLoadingJudgeDirectory}
										placeholder={isLoadingJudgeDirectory ? 'Loading existing judges...' : 'Select existing judge'}
										noOptionsMessage={() => (isLoadingJudgeDirectory ? 'Loading existing judges...' : 'No existing judge found')}
										className='text-sm'
										classNamePrefix='judge-select2'
										instanceId={`judge-directory-select-${index}`}
										inputId={`judge-directory-select-input-${index}`}
										styles={judgeDirectorySelectStyles}
									/>
									<input value={judge.name} onChange={(event) => updateJudge(judge.id, { name: event.target.value })} placeholder={`Judge ${index + 1} name`} className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
									<input value={judge.email} onChange={(event) => updateJudge(judge.id, { email: event.target.value })} placeholder='Email (optional)' className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
									<button type='button' onClick={() => removeJudge(judge.id)} disabled={judges.length <= 1} className='rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60'>
										Remove
									</button>
								</div>
							)
						})}
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
										<button type='button' onClick={() => removeEntry(entry.id)} className='rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50' disabled={entries.length <= 1}>
											Remove
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<p className='mt-4 text-xs text-cyan-900/80'>Rows are used to build the contestant list when saving. Judges will submit scores and details using their generated links.</p>

				{error ? <div className='mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>{error}</div> : null}
				{saveSuccessMessage ? <div className='mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800'>{saveSuccessMessage}</div> : null}

				<div className='mt-4 flex flex-wrap items-center gap-3'>
					<button
						type='button'
						onClick={() => {
							void publishRatingSheet()
						}}
						disabled={isSaving}
						className='rounded-full bg-emerald-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60'>
						{isSaving ? (isEditMode ? 'Saving Rating Sheet...' : 'Publishing Rating Sheet...') : isEditMode ? 'Save Rating Sheet Changes' : 'Save Rating Sheet and Generate Judge Links'}
					</button>
				</div>
			</div>

			{created ? (
				<section className='mt-6 rounded-3xl border border-cyan-200 bg-cyan-50/70 p-6 shadow-xl shadow-cyan-900/10 sm:p-8'>
					<h2 className='text-lg font-semibold text-cyan-950'>{isEditMode ? 'Rating Sheet Updated Successfully' : 'Rating Sheet Published Successfully'}</h2>
					<p className='mt-1 text-sm text-cyan-900/80'>{isEditMode ? 'Share updated judge links privately.' : 'Share each judge link privately.'}</p>

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
