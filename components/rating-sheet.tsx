'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

import { buildDirectRatingCriteriaFromConfig, DIRECT_RATING_TRACK_STRAND_OPTION_GROUPS, normalizeDirectRatingConfig } from '@/lib/direct-rating-config'
import { DEFAULT_RUBRIC_LEGEND } from '@/lib/rubric-legend'
import type { ContestantInput, CreateEventResponse, DirectRatingConfig, JudgeInput, EventProgramTag } from '@/lib/types'

type JudgeDraft = {
	id: string
	name: string
	email: string
	assignedRange?: string
}

function isNumberInRange(num: number, rangeStr: string): boolean {
	if (!rangeStr || !rangeStr.trim()) return true
	const parts = rangeStr.split(',')
	for (const part of parts) {
		const p = part.trim()
		if (!p) continue
		if (p.includes('-')) {
			const [startStr, endStr] = p.split('-')
			const start = parseInt(startStr.trim(), 10)
			const end = parseInt(endStr.trim(), 10)
			if (!isNaN(start) && !isNaN(end) && num >= start && num <= end) return true
			if (!isNaN(start) && isNaN(end) && num >= start) return true
		} else {
			const exact = parseInt(p, 10)
			if (!isNaN(exact) && exact === num) return true
		}
	}
	return false
}

function formatIndicesToRanges(indices: number[], totalCount: number): string {
	if (!indices || indices.length === 0) return ''
	if (indices.length === totalCount) return '' // Empty means all
	const sorted = [...new Set(indices)].sort((a, b) => a - b)
	const ranges: string[] = []
	let start = sorted[0]
	let prev = sorted[0]

	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i] === prev + 1) {
			prev = sorted[i]
		} else {
			ranges.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`)
			start = sorted[i]
			prev = sorted[i]
		}
	}
	ranges.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`)
	return ranges.join(', ')
}

type RatingEntry = {
	id: string
	name: string
	noatScore: string
	academicTrack?: string
	laptopAvailable?: string
	programTag?: EventProgramTag | null
}

type CreateEventApiResponse = CreateEventResponse & {
	error?: string
}

type ImportRecord = {
	last_first_name?: string
	first_name?: string
	last_name?: string
	noat_score?: string | number
	program_applied_for?: string
	academic_track?: string
	laptop_available?: string
}

function inferProgramTagFromString(programAppliedFor: string): EventProgramTag | null {
	const upper = programAppliedFor.toUpperCase()
	if (upper.includes('BSINT')) return 'BSINT'
	if (upper.includes('BSCS')) return 'BSCS'
	return null
}

function parseImportRecords(rawJson: string): { records: ImportRecord[]; error: string | null } {
	try {
		const parsed = JSON.parse(rawJson) as unknown
		if (!Array.isArray(parsed)) return { records: [], error: 'JSON must be an array of records.' }
		const records: ImportRecord[] = []
		for (const item of parsed) {
			if (!item || typeof item !== 'object') continue
			const rec = item as Record<string, unknown>
			records.push({
				last_first_name: typeof rec.last_first_name === 'string' ? rec.last_first_name : undefined,
				first_name: typeof rec.first_name === 'string' ? rec.first_name : undefined,
				last_name: typeof rec.last_name === 'string' ? rec.last_name : undefined,
				noat_score: typeof rec.noat_score === 'string' || typeof rec.noat_score === 'number' ? rec.noat_score : undefined,
				program_applied_for: typeof rec.program_applied_for === 'string' ? rec.program_applied_for : undefined,
				academic_track: typeof rec.academic_track === 'string' ? rec.academic_track : undefined,
				laptop_available: typeof rec.laptop_available === 'string' ? rec.laptop_available : undefined,
			})
		}
		return { records, error: null }
	} catch {
		return { records: [], error: 'Invalid JSON.' }
	}
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
		assignedRange: '',
	}
}

function entriesFromNewLines(value: string): string[] {
	return value
		.split(/\r?\n/)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
}

function buildContestantsPayload(entries: RatingEntry[]): (ContestantInput & { id?: string })[] {
	const uniqueContestantNames = new Set<string>()
	const contestants: (ContestantInput & { id?: string })[] = []

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
			id: entry.id,
			name,
			entryType: 'individual',
			...(noatScore !== undefined ? { noatScore } : {}),
			academicTrack: entry.academicTrack,
			laptopAvailable: entry.laptopAvailable,
			programTag: entry.programTag,
		})
	}

	return contestants
}

function buildJudgesPayload(judges: JudgeDraft[]): (JudgeInput & { id?: string })[] {
	const uniqueJudgeNames = new Set<string>()
	const normalizedJudges: (JudgeInput & { id?: string })[] = []

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
			id: judge.id,
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
	const searchParams = useSearchParams()
	const editEventId = searchParams.get('editEventId')

	const errorRef = useRef<HTMLDivElement>(null)
	
	const [entries, setEntries] = useState<RatingEntry[]>(() => [createEntry()])
	const [title, setTitle] = useState('Direct Rating Sheet')
	const [description, setDescription] = useState('Final Rating is auto-computed from AVE/GPA, NOAT, and Interview using admin-configured max scores. Strand alignment bonus is applied to Interview points only.')
	const [directRatingConfig, setDirectRatingConfig] = useState<DirectRatingConfig>(() => normalizeDirectRatingConfig(undefined))
	const [createdBy, setCreatedBy] = useState('')
	const [judges, setJudges] = useState<JudgeDraft[]>(() => [createJudge()])
	const [bulkEnabled, setBulkEnabled] = useState(false)
	const [bulkNamesText, setBulkNamesText] = useState('')
	const [importJsonMode, setImportJsonMode] = useState(false)
	const [importJsonText, setImportJsonText] = useState('')
	const [importParsed, setImportParsed] = useState<ImportRecord[] | null>(null)
	const [importParseError, setImportParseError] = useState<string | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [created, setCreated] = useState<CreateEventResponse | null>(null)
	const [publishedAt, setPublishedAt] = useState<string | null>(null)
	const [copiedValue, setCopiedValue] = useState<string | null>(null)
	const [isLoadingExisting, setIsLoadingExisting] = useState(false)
	const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
	const [updatePassword, setUpdatePassword] = useState('')
	const [updatePasswordError, setUpdatePasswordError] = useState('')
	const [isVerifyingPassword, setIsVerifyingPassword] = useState(false)

	useEffect(() => {
		if (!editEventId) return
		let mounted = true
		setIsLoadingExisting(true)

		fetch(`/api/eventscorer/admin/events/${editEventId}`)
			.then((res) => res.json())
			.then((data: any) => {
				if (!mounted) return
				if (data && data.event) {
					const ev = data.event
					setTitle(ev.title || 'Direct Rating Sheet')
					setDescription(ev.description || '')
					setCreatedBy(ev.createdBy || '')
					if (ev.directRatingConfig) {
						setDirectRatingConfig(normalizeDirectRatingConfig(ev.directRatingConfig))
					}
					if (ev.judges && ev.judges.length > 0) {
						setJudges(ev.judges.map((j: any) => {
							let assignedRange = ''
							if (ev.presentationSlots && ev.presentationSlots.length > 0 && ev.contestants) {
								const indices: number[] = []
								ev.presentationSlots.forEach((slot: any) => {
									if (slot.judgeIds && slot.judgeIds.includes(j.id)) {
										const contestantIndex = ev.contestants.findIndex((c: any) => c.id === slot.contestantId)
										if (contestantIndex !== -1) {
											indices.push(contestantIndex)
										}
									}
								})
								assignedRange = formatIndicesToRanges(indices, ev.contestants.length)
							}
							return { id: j.id, name: j.name, email: j.email || '', assignedRange }
						}))
					}
					if (ev.contestants && ev.contestants.length > 0) {
						setEntries(ev.contestants.map((c: any) => {
							const compiledData = data.compiled?.rankings?.find((r: any) => r.contestantId === c.id)
							const fallbackNoat = compiledData?.directDetails?.noat > 0 ? String(compiledData.directDetails.noat) : ''
							const fallbackStrand = compiledData?.directDetails?.strand || ''
							const fallbackRemark = compiledData?.directDetails?.remark || ''

							return {
								id: c.id || localId(),
								name: c.name,
								noatScore: (c.noatScore !== null && c.noatScore !== undefined && String(c.noatScore) !== '0') ? String(c.noatScore) : fallbackNoat,
								academicTrack: c.academicTrack || fallbackStrand,
								laptopAvailable: c.laptopAvailable || fallbackRemark,
								programTag: c.programTag || null,
							}
						}))
					}
				}
			})
			.catch((err) => {
				console.error('Failed to load event data', err)
			})
			.finally(() => {
				if (mounted) setIsLoadingExisting(false)
			})

		return () => {
			mounted = false
		}
	}, [editEventId])

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

	function handleImportPaste(text: string) {
		setImportJsonText(text)
		setImportParseError(null)
		if (!text.trim()) {
			setImportParsed(null)
			return
		}
		const { records, error: parseError } = parseImportRecords(text)
		if (parseError) {
			setImportParseError(parseError)
			setImportParsed(null)
			return
		}
		if (records.length === 0) {
			setImportParseError('No valid records found in the JSON data.')
			setImportParsed(null)
			return
		}
		setImportParsed(records)
	}

	function parseImportJson(): void {
		handleImportPaste(importJsonText)
	}

	function addEntriesFromImportData(): void {
		if (!importParsed || importParsed.length === 0) {
			return
		}
		const incomingRecords = [...importParsed]
		
		setEntries((previous) => {
			const nextEntries = previous.map((entry) => {
				if (incomingRecords.length === 0 || entry.name.trim().length > 0) return entry
				const rec = incomingRecords.shift()!
				return {
					...entry,
					name: rec.last_first_name?.trim() || '',
					noatScore: rec.noat_score !== undefined ? String(rec.noat_score) : '',
					academicTrack: rec.academic_track?.trim() || undefined,
					laptopAvailable: rec.laptop_available?.trim() || undefined,
					programTag: rec.program_applied_for ? inferProgramTagFromString(rec.program_applied_for) : null,
				}
			})
			
			if (incomingRecords.length === 0) return nextEntries
			
			const newEntries = incomingRecords.map((rec) => ({
				id: localId(),
				name: rec.last_first_name?.trim() || '',
				noatScore: rec.noat_score !== undefined ? String(rec.noat_score) : '',
				academicTrack: rec.academic_track?.trim() || undefined,
				laptopAvailable: rec.laptop_available?.trim() || undefined,
				programTag: rec.program_applied_for ? inferProgramTagFromString(rec.program_applied_for) : null,
			}))
			return [...nextEntries, ...newEntries]
		})
		setImportJsonText('')
		setImportParsed(null)
		setImportParseError(null)
		setImportJsonMode(false)
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

	async function publishRatingSheet() {
		setError(null)
		setIsSaving(true)

		const contestants = buildContestantsPayload(entries)
		const normalizedJudges = buildJudgesPayload(judges)

		if (contestants.length < 2) {
			setIsSaving(false)
			setError('At least 2 unique contestant names are required before publishing.')
			setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
			return
		}

		if (normalizedJudges.length === 0) {
			setIsSaving(false)
			setError('At least 1 judge name is required before publishing.')
			setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
			return
		}

		const explicitAssignments: Record<number, string[]> = {}
		for (const judge of judges) {
			if (judge.assignedRange && judge.assignedRange.trim()) {
				for (let i = 1; i <= entries.length; i++) {
					if (isNumberInRange(i, judge.assignedRange)) {
						if (!explicitAssignments[i]) explicitAssignments[i] = []
						explicitAssignments[i].push(judge.name || 'Unnamed Judge')
					}
				}
			}
		}

		for (const [entryStr, judgeNames] of Object.entries(explicitAssignments)) {
			if (judgeNames.length > 1) {
				setIsSaving(false)
				setError(`Overlap detected: Entry ${entryStr} is assigned to multiple judges (${judgeNames.join(', ')}). Ranges should not overlap.`)
				setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
				return
			}
		}

		const payload = {
			title: title.trim() || 'Direct Rating Sheet',
			description: description.trim(),
			createdBy: createdBy.trim(),
			eventScoringType: 'direct_rating',
			rubricLegend: DEFAULT_RUBRIC_LEGEND,
			showRubricLegend: false,
			directRatingConfig: normalizeDirectRatingConfig(directRatingConfig),
			contestants: contestants,
			judges: normalizedJudges,
			criteria: buildDirectRatingCriteriaFromConfig(normalizeDirectRatingConfig(directRatingConfig)),
			presentationSlots: entries.map((entry, index) => {
				const entryNumber = index + 1
				let assignedJudges = judges.filter(j => {
					if (!j.assignedRange || !j.assignedRange.trim()) return true
					return isNumberInRange(entryNumber, j.assignedRange)
				})
				
				if (assignedJudges.length === 0) {
					assignedJudges = judges
				}

				if (editEventId) {
					return {
						label: `Slot ${entryNumber}`,
						contestantIndex: index,
						judgeIds: assignedJudges.map(j => j.id)
					}
				} else {
					return {
						label: `Slot ${entryNumber}`,
						contestantIndex: index,
						judgeNames: assignedJudges.map(j => j.name)
					}
				}
			})
		}

		try {
			const method = editEventId ? 'PATCH' : 'POST'
			const url = editEventId ? `/api/eventscorer/admin/events/${editEventId}` : '/api/eventscorer/events'
			
			const requestBody = editEventId ? { eventEditor: payload } : payload

			const response = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody),
			})

			const responseData = await response.json()

			if (!response.ok) {
				throw new Error(responseData.error ?? 'Unable to publish rating sheet.')
			}

			if (editEventId) {
				const origin = window.location.origin
				const ev = responseData.event
				setCreated({
					eventId: editEventId,
					adminUrl: `${origin}/admin/${editEventId}`,
					judgeLinks: (ev?.judges || []).map((j: any) => ({
						judgeId: j.id,
						judgeName: j.name,
						url: `${origin}/judge/${j.token}`
					}))
				})
			} else {
				setCreated(responseData as CreateEventApiResponse)
			}
			
			setPublishedAt(new Date().toISOString())
		} catch (publishError) {
			const errorMessage = publishError instanceof Error ? publishError.message : 'Unable to publish rating sheet.'
			if (errorMessage.toLowerCase().includes('password required')) {
				setIsPasswordModalOpen(true)
				return
			}
			setError(errorMessage)
			setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
		} finally {
			setIsSaving(false)
		}
	}

	const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		if (!updatePassword.trim()) {
			setUpdatePasswordError('Password is required.')
			return
		}
		setIsVerifyingPassword(true)
		setUpdatePasswordError('')
		try {
			const response = await fetch('/api/admin/update-auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: updatePassword }),
			})
			if (!response.ok) {
				const responseBody = (await response.json().catch(() => null)) as { error?: string } | null
				setUpdatePasswordError(responseBody?.error || 'Incorrect password.')
				return
			}
			setIsPasswordModalOpen(false)
			setUpdatePassword('')
			setUpdatePasswordError('')
			// Re-run the update
			void publishRatingSheet()
		} catch {
			setUpdatePasswordError('Unable to verify password. Try again.')
		} finally {
			setIsVerifyingPassword(false)
		}
	}

	if (isLoadingExisting) {
		return (
			<div className="flex items-center justify-center min-h-[40vh]">
				<p className="text-emerald-800 font-medium">Loading existing event data...</p>
			</div>
		)
	}

	return (
		<section className='mx-auto w-full max-w-6xl px-4 pt-6 sm:px-8'>
			<div className='rounded-3xl border border-emerald-200 bg-white/95 p-6 shadow-xl shadow-emerald-900/10 sm:p-8'>
				<p className='text-xs uppercase tracking-[0.2em] text-emerald-800/80'>Dynamic Event Scorer</p>
				<h1 className='mt-2 text-3xl font-semibold tracking-tight text-emerald-950'>{editEventId ? 'Update Rating Sheet' : 'Create Rating Sheet'}</h1>
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

					<div className='mt-2 grid grid-cols-2 gap-3'>
						<label className='text-xs font-semibold uppercase tracking-wide text-emerald-900'>
							AVE/GPA Max
							<input type='number' min={1} step='0.01' value={directRatingConfig.maxScores.aveGpa} onChange={(event) => updateDirectMaxScore('aveGpa', event.target.value)} className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
						</label>
						<label className='text-xs font-semibold uppercase tracking-wide text-emerald-900'>
							NOAT Max
							<input type='number' min={1} step='0.01' value={directRatingConfig.maxScores.noat} onChange={(event) => updateDirectMaxScore('noat', event.target.value)} className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
						</label>
					</div>

					<div className='mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3'>
						<p className='mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-900'>Interview Components Max Scores</p>
						<div className='grid grid-cols-2 gap-3 md:grid-cols-5'>
							<label className='text-xs font-semibold uppercase tracking-wide text-emerald-900'>
								Content Max
								<input type='number' min={1} step='0.01' value={directRatingConfig.maxScores.interviewContent} onChange={(event) => updateDirectMaxScore('interviewContent', event.target.value)} className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
							</label>
							<label className='text-xs font-semibold uppercase tracking-wide text-emerald-900'>
								Comm. Skills Max
								<input type='number' min={1} step='0.01' value={directRatingConfig.maxScores.interviewComm} onChange={(event) => updateDirectMaxScore('interviewComm', event.target.value)} className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
							</label>
							<label className='text-xs font-semibold uppercase tracking-wide text-emerald-900'>
								Personality Max
								<input type='number' min={1} step='0.01' value={directRatingConfig.maxScores.interviewPers} onChange={(event) => updateDirectMaxScore('interviewPers', event.target.value)} className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
							</label>
							<label className='text-xs font-semibold uppercase tracking-wide text-emerald-900'>
								Interest Max
								<input type='number' min={1} step='0.01' value={directRatingConfig.maxScores.interviewInterest} onChange={(event) => updateDirectMaxScore('interviewInterest', event.target.value)} className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
							</label>
							<label className='text-xs font-semibold uppercase tracking-wide text-emerald-900'>
								Special Skills Max
								<input type='number' min={1} step='0.01' value={directRatingConfig.maxScores.interviewSpecial} onChange={(event) => updateDirectMaxScore('interviewSpecial', event.target.value)} className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2' />
							</label>
						</div>
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
						{judges.map((judge) => (
							<div key={judge.id} className={`grid gap-2 ${judges.length > 1 ? 'sm:grid-cols-[1fr_1fr_1fr_auto]' : 'sm:grid-cols-[1fr_1fr_auto]'}`}>
								<input
									type='text'
									value={judge.name}
									onChange={(e) => updateJudge(judge.id, { name: e.target.value })}
									placeholder='Judge Name'
									className='rounded-xl border border-slate-200 px-3 py-1.5 text-sm outline-none transition focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400'
								/>
								<input
									type='email'
									value={judge.email}
									onChange={(e) => updateJudge(judge.id, { email: e.target.value })}
									placeholder='Email (optional)'
									className='rounded-xl border border-slate-200 px-3 py-1.5 text-sm outline-none transition focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400'
								/>
								{judges.length > 1 ? (
									<input
										type='text'
										value={judge.assignedRange || ''}
										onChange={(e) => updateJudge(judge.id, { assignedRange: e.target.value })}
										placeholder='Entries Range (e.g. 1-25)'
										className='rounded-xl border border-slate-200 px-3 py-1.5 text-sm outline-none transition focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400'
										title='Specify which entry numbers this judge will rate, separated by commas (e.g., 1-25, 30-50). Leave blank to assign all.'
									/>
								) : null}
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
						<button type='button' onClick={() => { setBulkEnabled((current) => !current); setImportJsonMode(false); }} className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${bulkEnabled ? 'border-cyan-800 bg-cyan-900 text-white' : 'border-cyan-300 bg-white text-cyan-900 hover:bg-cyan-50'}`}>
							{bulkEnabled ? 'Hide Bulk Add' : 'Bulk Add Names'}
						</button>
						<button type='button' onClick={() => { setImportJsonMode((current) => !current); setBulkEnabled(false); }} className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${importJsonMode ? 'border-cyan-800 bg-cyan-900 text-white' : 'border-cyan-300 bg-white text-cyan-900 hover:bg-cyan-50'}`}>
							{importJsonMode ? 'Hide Import JSON' : 'Import from JSON Data'}
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

				{importJsonMode ? (
					<div className='mt-4 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4'>
						<p className='text-xs font-semibold uppercase tracking-wide text-cyan-900'>Import from JSON Data</p>
						<p className='mt-1 text-xs text-cyan-900/70'>Paste the JSON array from your import file. Names, NOAT scores, program tags, academic track, and laptop availability will be auto-imported.</p>
						<textarea
							value={importJsonText}
							onChange={(event) => handleImportPaste(event.target.value)}
							rows={6}
							placeholder='Paste JSON array here, e.g. [{"last_first_name": "...", "noat_score": "20", ...}]'
							className='mt-2 w-full rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200'
						/>
						{importParseError ? <p className='mt-1 text-xs text-rose-700'>{importParseError}</p> : null}
						{importParsed ? (
							<div className='mt-2 rounded-xl border border-cyan-200 bg-white p-2'>
								<p className='text-xs font-semibold text-cyan-900'>{importParsed.length} record{importParsed.length !== 1 ? 's' : ''} parsed</p>
								<div className='mt-1 max-h-32 overflow-y-auto space-y-1'>
									{importParsed.slice(0, 8).map((record, idx) => (
										<p key={idx} className='text-xs text-cyan-800'>
											{idx + 1}. {record.last_first_name ?? '(no name)'}
											{record.program_applied_for ? <span className='ml-2 rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800'>{inferProgramTagFromString(record.program_applied_for) ?? '?'}</span> : null}
											{record.noat_score !== undefined ? <span className='ml-1 text-emerald-700/80'> · NOAT: {record.noat_score}</span> : null}
											{record.academic_track ? <span className='ml-1 text-cyan-700/70 truncate'> · {record.academic_track.slice(0, 40)}{record.academic_track.length > 40 ? '…' : ''}</span> : null}
										</p>
									))}
									{importParsed.length > 8 ? <p className='text-xs text-cyan-900/60'>...and {importParsed.length - 8} more</p> : null}
								</div>
							</div>
						) : null}
						<div className='mt-3 flex flex-wrap gap-2'>
							<button type='button' onClick={parseImportJson} className='rounded-full border border-cyan-300 bg-cyan-50 px-4 py-2 text-xs font-semibold text-cyan-900 transition hover:bg-cyan-100'>
								Parse JSON
							</button>
							{importParsed && importParsed.length > 0 ? (
								<button type='button' onClick={addEntriesFromImportData} className='rounded-full border border-emerald-700 bg-emerald-900 px-4 py-1.5 text-sm text-white transition hover:bg-emerald-800'>
									Import {importParsed.length} Entries
								</button>
							) : null}
						</div>
					</div>
				) : null}

				<div className='mt-4 overflow-hidden rounded-2xl border border-cyan-100'>
					<table className='w-full border-separate border-spacing-0'>
						<thead>
							<tr className='bg-cyan-50 text-left text-[11px] font-semibold uppercase tracking-wide text-cyan-900'>
								<th className='rounded-l-2xl px-2 py-2'>Name</th>
								<th className='px-2 py-2'>Academic Track</th>
								<th className='px-2 py-2'>Laptop / Remark</th>
								<th className='px-2 py-2 text-right'>NOAT</th>
								<th className='rounded-r-2xl px-2 py-2 text-right'>Action</th>
							</tr>
						</thead>
						<tbody>
							{entries.map((entry) => (
								<tr key={entry.id} className='border-b border-cyan-100 bg-white'>
									<td className='px-2 py-2'>
										<input type='text' value={entry.name} onChange={(event) => updateEntry(entry.id, { name: event.target.value })} className='min-w-0 w-full rounded-lg border border-cyan-200 px-2 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200' placeholder='Student' />
										{entry.programTag ? <span className='mt-1 inline-block rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800'>{entry.programTag}</span> : null}
									</td>
									<td className='px-2 py-2'>
										<input
											type='text'
											value={entry.academicTrack ?? ''}
											onChange={(event) => updateEntry(entry.id, { academicTrack: event.target.value })}
											className='w-full rounded-lg border border-cyan-200 px-2 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200'
											placeholder='Track/Strand'
										/>
									</td>
									<td className='px-2 py-2'>
										<input
											type='text'
											value={entry.laptopAvailable ?? ''}
											onChange={(event) => updateEntry(entry.id, { laptopAvailable: event.target.value })}
											className='w-full rounded-lg border border-cyan-200 px-2 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200'
											placeholder='Remark'
										/>
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

				{error ? <div ref={errorRef} className='mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>{error}</div> : <div ref={errorRef} />}

				<div className='mt-4 flex flex-wrap items-center gap-3'>
					<button
						type='button'
						onClick={() => {
							void publishRatingSheet()
						}}
						disabled={isSaving}
						className='rounded-full bg-emerald-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60'>
						{isSaving ? (editEventId ? 'Updating Rating Sheet...' : 'Publishing Rating Sheet...') : (editEventId ? 'Update Rating Sheet and Generate Judge Links' : 'Save Rating Sheet and Generate Judge Links')}
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

			{isPasswordModalOpen ? (
				<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4'>
					<div role='dialog' aria-modal='true' className='w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl'>
						<h3 className='text-lg font-semibold text-slate-900'>Authentication Required</h3>
						<p className='mt-1 text-sm text-slate-600'>Enter the update password to edit this event.</p>
						<form className='mt-4 space-y-3' onSubmit={handlePasswordSubmit}>
							<div>
								<label className='text-xs font-medium uppercase tracking-wide text-slate-500'>Password</label>
								<input
									type='password'
									value={updatePassword}
									onChange={(e) => {
										setUpdatePassword(e.target.value)
										if (updatePasswordError) setUpdatePasswordError('')
									}}
									className='mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200'
									autoFocus
									required
								/>
							</div>
							{updatePasswordError ? <p className='text-sm text-rose-600'>{updatePasswordError}</p> : null}
							<div className='flex flex-wrap justify-end gap-2 pt-2'>
								<button
									type='button'
									onClick={() => {
										setIsPasswordModalOpen(false)
										setUpdatePassword('')
										setUpdatePasswordError('')
									}}
									className='rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50'
								>
									Cancel
								</button>
								<button type='submit' disabled={isVerifyingPassword} className='rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70'>
									{isVerifyingPassword ? 'Checking...' : 'Confirm'}
								</button>
							</div>
						</form>
					</div>
				</div>
			) : null}
		</section>
	)
}
