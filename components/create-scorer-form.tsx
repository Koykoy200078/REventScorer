'use client'

import { useEffect, useMemo, useState } from 'react'

import { buildFinalOralDefenseCriteria, FINAL_ORAL_DEFENSE_CONTESTANT_SAMPLES, PAPER_PRESENTATION_CONTESTANT_SAMPLES, PAPER_PRESENTATION_CRITERIA } from '@/lib/default-rubric'
import type { ContestantEntryType, CreateEventResponse, CriterionInput, EventScoringType } from '@/lib/types'

type ContestantDraft = {
	id: string
	name: string
	entryType: ContestantEntryType
	participants: string[]
}

type JudgeDraft = {
	id: string
	name: string
	email: string
}

type SubCriterionDraft = {
	id: string
	name: string
	maxScore: string
}

type CriterionDraft = {
	id: string
	name: string
	subCriteria: SubCriterionDraft[]
}

type PresentationSlotDraft = {
	id: string
	label: string
	judgeIds: string[]
}

function localId(): string {
	return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`
}

function createJudge(): JudgeDraft {
	return { id: localId(), name: '', email: '' }
}

function createContestant(entryType: ContestantEntryType = 'group', name = '', participants?: string[]): ContestantDraft {
	const defaultParticipants = entryType === 'group' ? [''] : []
	return { id: localId(), name, entryType, participants: participants ?? defaultParticipants }
}

function contestantsFromNames(names: string[], entryType: ContestantEntryType = 'group'): ContestantDraft[] {
	return names.map((name) => createContestant(entryType, name, entryType === 'group' ? [''] : []))
}

function createSubCriterion(): SubCriterionDraft {
	return { id: localId(), name: '', maxScore: '10' }
}

function createCriterion(): CriterionDraft {
	return {
		id: localId(),
		name: '',
		subCriteria: [createSubCriterion()],
	}
}

function createPresentationSlot(index: number): PresentationSlotDraft {
	return { id: localId(), label: `Slot ${index + 1}`, judgeIds: [] }
}

function buildPresentationSlots(count: number, previous?: PresentationSlotDraft[]): PresentationSlotDraft[] {
	const next: PresentationSlotDraft[] = []
	for (let index = 0; index < count; index += 1) {
		const existing = previous?.[index]
		next.push(existing ? { ...existing, label: existing.label || `Slot ${index + 1}` } : createPresentationSlot(index))
	}
	return next
}

function toCriterionDraft(criteria: CriterionInput[]): CriterionDraft[] {
	return criteria.map((criterion) => ({
		id: localId(),
		name: criterion.name,
		subCriteria: criterion.subCriteria.map((subCriterion) => ({
			id: localId(),
			name: subCriterion.name,
			maxScore: String(subCriterion.maxScore),
		})),
	}))
}

function toNumber(value: string): number {
	const numeric = Number.parseFloat(value)
	return Number.isFinite(numeric) ? numeric : 0
}

function entriesFromNewLines(value: string): string[] {
	return value
		.split(/\r?\n/)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
}

function isEmptyContestantDraft(contestant: ContestantDraft): boolean {
	if (contestant.name.trim().length > 0) {
		return false
	}

	return contestant.participants.every((participant) => participant.trim().length === 0)
}

function criterionMaxScore(criterion: CriterionDraft): number {
	return criterion.subCriteria.reduce((sum, subCriterion) => sum + toNumber(subCriterion.maxScore), 0)
}

function dateDisplay(iso: string): string {
	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(iso))
}

export function CreateScorerForm() {
	const [title, setTitle] = useState('')
	const [description, setDescription] = useState('')
	const [createdBy, setCreatedBy] = useState('')
	const [eventScoringType, setEventScoringType] = useState<EventScoringType>('standard')
	const [contestants, setContestants] = useState<ContestantDraft[]>([createContestant(), createContestant()])
	const [bulkContestantEnabled, setBulkContestantEnabled] = useState(false)
	const [bulkContestantText, setBulkContestantText] = useState('')
	const [bulkContestantEntryType, setBulkContestantEntryType] = useState<ContestantEntryType>('group')
	const [judges, setJudges] = useState<JudgeDraft[]>([createJudge()])
	const [presentationSlots, setPresentationSlots] = useState<PresentationSlotDraft[]>(() => buildPresentationSlots(contestants.length))
	const [criteria, setCriteria] = useState<CriterionDraft[]>([createCriterion()])
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [created, setCreated] = useState<CreateEventResponse | null>(null)
	const [copiedValue, setCopiedValue] = useState<string | null>(null)

	const totalEventMaxScore = useMemo(() => {
		return criteria.reduce((sum, criterion) => sum + criterionMaxScore(criterion), 0)
	}, [criteria])

	useEffect(() => {
		const activeJudgeIds = new Set(judges.map((judge) => judge.id))
		const onlyJudgeId = judges.length === 1 ? judges[0].id : null
		setPresentationSlots((previous) => {
			let hasChanges = false

			const nextSlots = previous.map((slot) => {
				const filteredJudgeIds = slot.judgeIds.filter((judgeId) => activeJudgeIds.has(judgeId))
				const nextJudgeIds = onlyJudgeId && filteredJudgeIds.length === 0 ? [onlyJudgeId] : filteredJudgeIds
				const unchanged = nextJudgeIds.length === slot.judgeIds.length && nextJudgeIds.every((judgeId, index) => judgeId === slot.judgeIds[index])

				if (unchanged) {
					return slot
				}

				hasChanges = true
				return {
					...slot,
					judgeIds: nextJudgeIds,
				}
			})

			return hasChanges ? nextSlots : previous
		})
	}, [judges, presentationSlots])

	function loadPaperTemplate(): void {
		const sampleContestants = [...PAPER_PRESENTATION_CONTESTANT_SAMPLES]
		setTitle('Paper Presentation')
		setDescription('Dynamic scoring rubric based on paper presentation criteria.')
		setEventScoringType('standard')
		setContestants(contestantsFromNames(sampleContestants, 'group'))
		setPresentationSlots(buildPresentationSlots(sampleContestants.length))
		setCriteria(toCriterionDraft(PAPER_PRESENTATION_CRITERIA))
		setError(null)
	}

	function loadFinalOralTemplate(): void {
		const sampleContestants = [...FINAL_ORAL_DEFENSE_CONTESTANT_SAMPLES]
		setTitle('Final Oral Defense')
		setDescription('Group and individual presentation scoring for final oral defense.')
		setEventScoringType('final-oral-defense')
		setContestants(contestantsFromNames(sampleContestants, 'group'))
		setPresentationSlots(buildPresentationSlots(sampleContestants.length))
		setCriteria(toCriterionDraft(buildFinalOralDefenseCriteria()))
		setError(null)
	}

	function updateContestant(index: number, value: Partial<Pick<ContestantDraft, 'name'>>): void {
		setContestants((previous) => previous.map((contestant, contestantIndex) => (contestantIndex === index ? { ...contestant, ...value } : contestant)))
	}

	function updateContestantEntryType(index: number, entryType: ContestantEntryType): void {
		setContestants((previous) =>
			previous.map((contestant, contestantIndex) => {
				if (contestantIndex !== index) {
					return contestant
				}

				if (entryType === 'individual') {
					return {
						...contestant,
						entryType,
						participants: [],
					}
				}

				return {
					...contestant,
					entryType,
					participants: contestant.participants.length > 0 ? contestant.participants : [''],
				}
			}),
		)
	}

	function updateParticipantName(contestantIndex: number, participantIndex: number, value: string): void {
		setContestants((previous) =>
			previous.map((contestant, currentContestantIndex) => {
				if (currentContestantIndex !== contestantIndex) {
					return contestant
				}

				return {
					...contestant,
					participants: contestant.participants.map((participant, currentParticipantIndex) => (currentParticipantIndex === participantIndex ? value : participant)),
				}
			}),
		)
	}

	function addParticipantName(contestantIndex: number): void {
		setContestants((previous) =>
			previous.map((contestant, currentContestantIndex) => {
				if (currentContestantIndex !== contestantIndex) {
					return contestant
				}

				return {
					...contestant,
					participants: [...contestant.participants, ''],
				}
			}),
		)
	}

	function removeParticipantName(contestantIndex: number, participantIndex: number): void {
		setContestants((previous) =>
			previous.map((contestant, currentContestantIndex) => {
				if (currentContestantIndex !== contestantIndex) {
					return contestant
				}

				return {
					...contestant,
					participants: contestant.participants.filter((_, currentParticipantIndex) => currentParticipantIndex !== participantIndex),
				}
			}),
		)
	}

	function addContestant(entryType: ContestantEntryType = 'group'): void {
		setContestants((previous) => [...previous, createContestant(entryType)])
		setPresentationSlots((previous) => [...previous, createPresentationSlot(previous.length)])
	}

	function removeContestant(index: number): void {
		setContestants((previous) => previous.filter((_, contestantIndex) => contestantIndex !== index))
		setPresentationSlots((previous) => previous.filter((_, slotIndex) => slotIndex !== index))
	}

	function addContestantsFromNewLines(): void {
		const names = entriesFromNewLines(bulkContestantText)

		if (names.length === 0) {
			setError('Please enter at least one entry name in the bulk input.')
			return
		}

		setError(null)
		const importedContestants = contestantsFromNames(names, bulkContestantEntryType)
		const shouldReplaceEmptyStarters = contestants.every((contestant) => isEmptyContestantDraft(contestant))

		if (shouldReplaceEmptyStarters) {
			setContestants(importedContestants)
			setPresentationSlots(buildPresentationSlots(importedContestants.length))
		} else {
			setContestants((previous) => [...previous, ...importedContestants])
			setPresentationSlots((previous) => buildPresentationSlots(previous.length + importedContestants.length, previous))
		}

		setBulkContestantText('')
	}

	function updateJudge(judgeId: string, value: Partial<Pick<JudgeDraft, 'name' | 'email'>>): void {
		setJudges((previous) => previous.map((judge) => (judge.id === judgeId ? { ...judge, ...value } : judge)))
	}

	function addJudge(): void {
		setJudges((previous) => [...previous, createJudge()])
	}

	function removeJudge(judgeId: string): void {
		setJudges((previous) => previous.filter((judge) => judge.id !== judgeId))
	}

	function updatePresentationSlotLabel(index: number, value: string): void {
		setPresentationSlots((previous) => previous.map((slot, slotIndex) => (slotIndex === index ? { ...slot, label: value } : slot)))
	}

	function togglePresentationSlotJudge(slotIndex: number, judgeId: string): void {
		setPresentationSlots((previous) =>
			previous.map((slot, currentIndex) => {
				if (currentIndex !== slotIndex) {
					return slot
				}

				const alreadyAssigned = slot.judgeIds.includes(judgeId)
				return {
					...slot,
					judgeIds: alreadyAssigned ? slot.judgeIds.filter((id) => id !== judgeId) : [...slot.judgeIds, judgeId],
				}
			}),
		)
	}

	function updateCriterion(criterionId: string, value: Partial<Pick<CriterionDraft, 'name'>>): void {
		setCriteria((previous) => previous.map((criterion) => (criterion.id === criterionId ? { ...criterion, ...value } : criterion)))
	}

	function addCriterion(): void {
		setCriteria((previous) => [...previous, createCriterion()])
	}

	function removeCriterion(criterionId: string): void {
		setCriteria((previous) => previous.filter((criterion) => criterion.id !== criterionId))
	}

	function addSubCriterion(criterionId: string): void {
		setCriteria((previous) =>
			previous.map((criterion) => {
				if (criterion.id !== criterionId) {
					return criterion
				}

				return {
					...criterion,
					subCriteria: [...criterion.subCriteria, createSubCriterion()],
				}
			}),
		)
	}

	function removeSubCriterion(criterionId: string, subCriterionId: string): void {
		setCriteria((previous) =>
			previous.map((criterion) => {
				if (criterion.id !== criterionId) {
					return criterion
				}

				return {
					...criterion,
					subCriteria: criterion.subCriteria.filter((sub) => sub.id !== subCriterionId),
				}
			}),
		)
	}

	function updateSubCriterion(criterionId: string, subCriterionId: string, value: Partial<Pick<SubCriterionDraft, 'name' | 'maxScore'>>): void {
		setCriteria((previous) =>
			previous.map((criterion) => {
				if (criterion.id !== criterionId) {
					return criterion
				}

				return {
					...criterion,
					subCriteria: criterion.subCriteria.map((subCriterion) => (subCriterion.id === subCriterionId ? { ...subCriterion, ...value } : subCriterion)),
				}
			}),
		)
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
				if (!success) throw new Error('Copy command failed')
			}
			setCopiedValue(value)
			window.setTimeout(() => {
				setCopiedValue((currentValue) => (currentValue === value ? null : currentValue))
			}, 1800)
		} catch (err) {
			console.error('Clipboard copy failed:', err)
			setCopiedValue(null)
		}
	}

	async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()
		setError(null)
		setCreated(null)
		setIsSaving(true)
		const judgeNameById = new Map(judges.map((judge) => [judge.id, judge.name.trim()]))

		const payload = {
			title,
			description,
			createdBy,
			eventScoringType,
			contestants: contestants.map((contestant) => ({
				name: contestant.name,
				entryType: contestant.entryType,
				participants: contestant.entryType === 'group' ? contestant.participants.map((participant) => participant.trim()).filter((participant) => participant.length > 0) : undefined,
			})),
			judges: judges.map((judge) => ({
				name: judge.name,
				email: judge.email,
			})),
			criteria: criteria.map((criterion) => ({
				name: criterion.name,
				subCriteria: criterion.subCriteria.map((subCriterion) => ({
					name: subCriterion.name,
					maxScore: toNumber(subCriterion.maxScore),
				})),
			})),
			presentationSlots: presentationSlots.map((slot, index) => ({
				label: slot.label || `Slot ${index + 1}`,
				contestantIndex: index,
				judgeNames: slot.judgeIds.map((judgeId) => judgeNameById.get(judgeId) ?? '').filter((name) => name.length > 0),
			})),
		}

		try {
			const response = await fetch('/api/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})

			const responseData = (await response.json()) as CreateEventResponse & { error?: string }

			if (!response.ok) {
				throw new Error(responseData.error ?? 'Unable to create scorer event.')
			}

			setCreated(responseData)
		} catch (submitError) {
			setError(submitError instanceof Error ? submitError.message : 'Unable to create scorer event.')
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<div className='mx-auto w-full max-w-6xl px-4 py-8 sm:px-8'>
			<div className='rounded-3xl border border-emerald-200 bg-white/90 p-6 shadow-xl shadow-emerald-900/10 backdrop-blur sm:p-8'>
				<div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
					<div>
						<h1 className='text-3xl font-semibold tracking-tight text-emerald-950'>Create Scorer Event</h1>
						<p className='mt-2 max-w-3xl text-sm text-emerald-800/80'>Build a fully dynamic rubric with parent criteria, subcriteria, judges, and contestant entries.</p>
					</div>
					<div className='flex flex-wrap items-center gap-3'>
						<button type='button' onClick={loadPaperTemplate} className='rounded-full border border-emerald-700/30 bg-emerald-50 px-5 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100'>
							Use Paper Presentation Template
						</button>
						<button type='button' onClick={loadFinalOralTemplate} className='rounded-full border border-emerald-700/30 bg-emerald-50 px-5 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100'>
							Use Final Oral Defense Template
						</button>
					</div>
				</div>

				<form onSubmit={onSubmit} className='mt-8 space-y-8'>
					<section className='grid gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 sm:grid-cols-2 sm:p-5'>
						<label className='text-sm font-medium text-emerald-950'>
							Event Title
							<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder='Example: Science Fair Finals' className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2' />
						</label>
						<label className='text-sm font-medium text-emerald-950'>
							Created By (Admin)
							<input value={createdBy} onChange={(event) => setCreatedBy(event.target.value)} placeholder='Example: Event Committee' className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2' />
						</label>
						<label className='text-sm font-medium text-emerald-950'>
							Scoring Event Type
							<select value={eventScoringType} onChange={(event) => setEventScoringType(event.target.value as EventScoringType)} className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2'>
								<option value='standard'>Standard Scoring</option>
								<option value='final-oral-defense'>Final Oral Defense</option>
							</select>
							<p className='mt-1 text-xs text-emerald-900/70'>This controls how final results are computed and shown for judges/admin.</p>
						</label>
						<label className='text-sm font-medium text-emerald-950 sm:col-span-2'>
							Description
							<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder='Optional context for judges' className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2' />
						</label>
					</section>

					<section className='rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5'>
						<div className='mb-4 flex items-center justify-between'>
							<h2 className='text-lg font-semibold text-emerald-950'>Contestants / Entries</h2>
							<div className='flex items-center gap-2'>
								<button type='button' onClick={() => addContestant('group')} className='rounded-full border border-emerald-700/30 px-4 py-1.5 text-sm text-emerald-900 transition hover:bg-emerald-50'>
									Add Team/Group
								</button>
								<button type='button' onClick={() => addContestant('individual')} className='rounded-full border border-emerald-700/30 px-4 py-1.5 text-sm text-emerald-900 transition hover:bg-emerald-50'>
									Add Individual
								</button>
							</div>
						</div>
						<p className='mb-3 text-xs text-emerald-900/70'>Set each entry as a whole team/group or an individual presenter.</p>
						<label className='mb-3 flex items-center gap-2 text-xs font-medium text-emerald-900'>
							<input type='checkbox' checked={bulkContestantEnabled} onChange={(event) => setBulkContestantEnabled(event.target.checked)} className='rounded border-emerald-400 text-emerald-700 focus:ring-emerald-500' />
							Enable Bulk Add Team/Group Entries
						</label>
						{bulkContestantEnabled ? (
							<div className='mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3'>
								<p className='text-xs font-medium text-emerald-900'>Bulk Add Entries (one per line)</p>
								<textarea value={bulkContestantText} onChange={(event) => setBulkContestantText(event.target.value)} rows={4} placeholder={`A\nB\nC`} className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2' />
								<div className='mt-2 flex flex-wrap items-center gap-2'>
									<select value={bulkContestantEntryType} onChange={(event) => setBulkContestantEntryType(event.target.value as ContestantEntryType)} className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2'>
										<option value='individual'>Add as Individual entries</option>
										<option value='group'>Add as Team/Group entries</option>
									</select>
									<button type='button' onClick={addContestantsFromNewLines} className='rounded-full border border-emerald-700/30 px-4 py-1.5 text-sm text-emerald-900 transition hover:bg-emerald-50'>
										Add Entries from New Lines
									</button>
								</div>
							</div>
						) : null}
						<div className='space-y-3'>
							{contestants.map((contestant, index) => (
								<div key={contestant.id} className='rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3'>
									<div className='mb-2 flex items-center justify-between'>
										<p className='text-xs text-emerald-900/80'>Entry {index + 1}</p>
										<span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${contestant.entryType === 'individual' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'}`}>{contestant.entryType === 'individual' ? 'Individual' : 'Team/Group'}</span>
									</div>
									<div className='grid gap-2 sm:grid-cols-[1fr_180px_auto]'>
										<input
											value={contestant.name}
											onChange={(event) => updateContestant(index, { name: event.target.value })}
											placeholder={contestant.entryType === 'individual' ? `Individual ${index + 1} name` : `Team/Group ${index + 1} name`}
											className='w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2'
										/>
										<select value={contestant.entryType} onChange={(event) => updateContestantEntryType(index, event.target.value as ContestantEntryType)} className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2'>
											<option value='group'>Team/Group</option>
											<option value='individual'>Individual</option>
										</select>
										{contestants.length > 1 ? (
											<button type='button' onClick={() => removeContestant(index)} className='rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50'>
												Remove
											</button>
										) : null}
									</div>

									{contestant.entryType === 'group' ? (
										<div className='mt-3 rounded-xl border border-emerald-200 bg-white p-3'>
											<div className='mb-2 flex items-center justify-between'>
												<p className='text-xs font-medium text-emerald-900'>Individual Participant Names</p>
												<button type='button' onClick={() => addParticipantName(index)} className='rounded-full border border-emerald-700/30 px-3 py-1 text-xs text-emerald-900 transition hover:bg-emerald-50'>
													Add Participant
												</button>
											</div>

											<div className='space-y-2'>
												{contestant.participants.length === 0 ? <p className='text-xs text-emerald-900/70'>No participant added yet.</p> : null}
												{contestant.participants.map((participant, participantIndex) => (
													<div key={`${contestant.id}-participant-${participantIndex}`} className='flex gap-2'>
														<input
															value={participant}
															onChange={(event) => updateParticipantName(index, participantIndex, event.target.value)}
															placeholder={`Participant ${participantIndex + 1} name`}
															className='w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2'
														/>
														<button type='button' onClick={() => removeParticipantName(index, participantIndex)} className='rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50'>
															Remove
														</button>
													</div>
												))}
											</div>
										</div>
									) : null}
								</div>
							))}
						</div>
					</section>

					<section className='rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5'>
						<div className='mb-4 flex items-center justify-between'>
							<h2 className='text-lg font-semibold text-emerald-950'>Judges</h2>
							<button type='button' onClick={addJudge} className='rounded-full border border-emerald-700/30 px-4 py-1.5 text-sm text-emerald-900 transition hover:bg-emerald-50'>
								Add Judge
							</button>
						</div>
						<div className='space-y-3'>
							{judges.map((judge, index) => (
								<div key={judge.id} className='grid gap-2 sm:grid-cols-[1fr_1fr_auto]'>
									<input value={judge.name} onChange={(event) => updateJudge(judge.id, { name: event.target.value })} placeholder={`Judge ${index + 1} name`} className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2' />
									<input value={judge.email} onChange={(event) => updateJudge(judge.id, { email: event.target.value })} placeholder='Email (optional)' className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2' />
									{judges.length > 1 ? (
										<button type='button' onClick={() => removeJudge(judge.id)} className='rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50 sm:self-center'>
											Remove
										</button>
									) : null}
								</div>
							))}
						</div>
					</section>

					<section className='rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5'>
						<div className='mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
							<h2 className='text-lg font-semibold text-emerald-950'>Presentation Schedule</h2>
							<span className='text-xs text-emerald-900/70'>Assign judges per slot. Unassigned slots are hidden from judges.</span>
						</div>

						<div className='space-y-4'>
							{presentationSlots.map((slot, index) => {
								const contestant = contestants[index]
								const contestantName = contestant?.name.trim() || `Entry ${index + 1}`
								const contestantLabel = contestant?.entryType === 'individual' ? 'Individual' : 'Group'
								return (
									<div key={slot.id} className='rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4'>
										<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
											<div>
												<p className='text-sm font-semibold text-emerald-950'>Slot {index + 1}</p>
												<p className='text-xs text-emerald-900/80'>
													{contestantLabel}: {contestantName}
												</p>
											</div>
											<label className='text-xs font-medium text-emerald-900'>
												Slot label
												<input
													value={slot.label}
													onChange={(event) => updatePresentationSlotLabel(index, event.target.value)}
													placeholder='Example: 9:00 AM - Room A'
													className='mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2'
												/>
											</label>
										</div>

										<div className='mt-3 flex flex-wrap gap-2'>
											{judges.length === 0 ? (
												<p className='text-xs text-emerald-900/70'>Add judges to assign this slot.</p>
											) : (
												judges.map((judge, judgeIndex) => (
													<label key={judge.id} className='flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs text-emerald-900'>
														<input type='checkbox' checked={slot.judgeIds.includes(judge.id)} onChange={() => togglePresentationSlotJudge(index, judge.id)} className='rounded border-emerald-400 text-emerald-700 focus:ring-emerald-500' />
														<span>{judge.name || `Judge ${judgeIndex + 1}`}</span>
													</label>
												))
											)}
										</div>
									</div>
								)
							})}
						</div>
					</section>

					<section className='rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5'>
						<div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
							<h2 className='text-lg font-semibold text-emerald-950'>Rubric Criteria</h2>
							<div className='flex items-center gap-3'>
								<span className='rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900'>Event Max Score: {totalEventMaxScore.toFixed(2)}</span>
								<button type='button' onClick={addCriterion} className='rounded-full border border-emerald-700/30 px-4 py-1.5 text-sm text-emerald-900 transition hover:bg-emerald-50'>
									Add Parent Criterion
								</button>
							</div>
						</div>

						<div className='space-y-5'>
							{criteria.map((criterion, criterionIndex) => {
								const parentMaxScore = criterionMaxScore(criterion)

								return (
									<div key={criterion.id} className='rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4'>
										<div className='mb-3 grid gap-2 sm:grid-cols-[1fr_180px_auto]'>
											<input
												value={criterion.name}
												onChange={(event) =>
													updateCriterion(criterion.id, {
														name: event.target.value,
													})
												}
												placeholder={`Parent criterion ${criterionIndex + 1}`}
												className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2'
											/>
											<div className='flex items-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900'>Parent Max: {parentMaxScore.toFixed(2)}</div>
											{criteria.length > 1 ? (
												<button type='button' onClick={() => removeCriterion(criterion.id)} className='rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50'>
													Remove Parent
												</button>
											) : null}
										</div>

										<div className='mb-3 flex items-center justify-between'>
											<span className='text-xs text-emerald-900/80'>Subcriteria total max score: {parentMaxScore.toFixed(2)}</span>
											<button type='button' onClick={() => addSubCriterion(criterion.id)} className='rounded-full border border-emerald-700/30 px-3 py-1 text-xs text-emerald-900 transition hover:bg-emerald-100'>
												Add Subcriterion
											</button>
										</div>

										<div className='space-y-2'>
											{criterion.subCriteria.map((subCriterion, subCriterionIndex) => (
												<div key={subCriterion.id} className='grid gap-2 rounded-xl border border-emerald-100 bg-white p-3 sm:grid-cols-[1fr_160px_auto]'>
													<input
														value={subCriterion.name}
														onChange={(event) =>
															updateSubCriterion(criterion.id, subCriterion.id, {
																name: event.target.value,
															})
														}
														placeholder={`Subcriterion ${subCriterionIndex + 1}`}
														className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2'
													/>
													<input
														value={subCriterion.maxScore}
														onChange={(event) =>
															updateSubCriterion(criterion.id, subCriterion.id, {
																maxScore: event.target.value,
															})
														}
														type='number'
														min={0}
														step='0.01'
														placeholder='Subcriterion max score'
														className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2'
													/>
													{criterion.subCriteria.length > 1 ? (
														<button type='button' onClick={() => removeSubCriterion(criterion.id, subCriterion.id)} className='rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50'>
															Remove
														</button>
													) : null}
												</div>
											))}
										</div>
									</div>
								)
							})}
						</div>
					</section>

					{error ? <div className='rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>{error}</div> : null}

					<button type='submit' disabled={isSaving} className='rounded-full bg-emerald-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60'>
						{isSaving ? 'Creating Scorer...' : 'Create Scorer and Generate Judge Links'}
					</button>
				</form>

				{created ? (
					<section className='mt-8 rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 sm:p-5'>
						<h2 className='text-lg font-semibold text-cyan-950'>Scorer Created Successfully</h2>
						<p className='mt-1 text-sm text-cyan-900/80'>Share each judge link privately.</p>

						<div className='mt-4 rounded-xl border border-cyan-200 bg-white p-3'>
							<p className='text-xs uppercase tracking-wide text-cyan-800/80'>Admin Results Page</p>
							<a href={created.adminUrl} className='mt-1 block text-sm font-medium text-cyan-900 underline'>
								{created.adminUrl}
							</a>
						</div>

						<div className='mt-4 space-y-3'>
							{created.judgeLinks.map((link) => (
								<div key={link.judgeId} className='rounded-xl border border-cyan-200 bg-white p-3'>
									<div className='mb-2 flex items-center justify-between gap-2'>
										<p className='text-sm font-semibold text-cyan-950'>{link.judgeName}</p>
										<button type='button' onClick={() => copyLink(link.url)} className='rounded-full border border-cyan-300 px-3 py-1 text-xs text-cyan-900 transition hover:bg-cyan-100'>
											{copiedValue === link.url ? 'Copied' : 'Copy Link'}
										</button>
									</div>
									<a href={link.url} className='block break-all text-sm text-cyan-900 underline'>
										{link.url}
									</a>
								</div>
							))}
						</div>

						<p className='mt-3 text-xs text-cyan-900/80'>Generated at {dateDisplay(new Date().toISOString())}</p>
					</section>
				) : null}
			</div>
		</div>
	)
}
