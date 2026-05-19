'use client'

import { useEffect, useMemo, useState } from 'react'

import { buildFinalOralDefenseCriteria, FINAL_ORAL_DEFENSE_CONTESTANT_SAMPLES, PAPER_PRESENTATION_CONTESTANT_SAMPLES, PAPER_PRESENTATION_CRITERIA } from '@/lib/default-rubric'
import { DEFAULT_RUBRIC_LEGEND, formatLegendScore, formatRubricLegend, normalizeRubricLegend } from '@/lib/rubric-legend'
import type { ContestantEntryType, CreateEventResponse, CriterionInput, EventProgramTag, EventScoringType, RubricLegendItem } from '@/lib/types'

type ContestantDraft = {
	id: string
	name: string
	entryType: ContestantEntryType
	participants: string[]
	programTag: EventProgramTag | null
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
	appliesTo: 'group' | 'individual'
	subCriteria: SubCriterionDraft[]
}

type PresentationSlotDraft = {
	id: string
	label: string
	judgeIds: string[]
}

type RubricLegendDraft = {
	id: string
	score: string
	label: string
}

function localId(): string {
	return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`
}

function createRubricLegendDraft(score: number, label: string): RubricLegendDraft {
	return {
		id: localId(),
		score: String(score),
		label,
	}
}

function defaultRubricLegendDrafts(): RubricLegendDraft[] {
	return DEFAULT_RUBRIC_LEGEND.map((legendItem) => createRubricLegendDraft(legendItem.score, legendItem.label))
}

function createJudge(): JudgeDraft {
	return { id: localId(), name: '', email: '' }
}

function createContestant(entryType: ContestantEntryType = 'group', name = '', participants?: string[], programTag: EventProgramTag | null = null): ContestantDraft {
	const defaultParticipants = entryType === 'group' ? [''] : []
	return { id: localId(), name, entryType, participants: participants ?? defaultParticipants, programTag }
}

function contestantsFromNames(names: string[], entryType: ContestantEntryType = 'group', programTag: EventProgramTag | null = null): ContestantDraft[] {
	return names.map((name) => createContestant(entryType, name, entryType === 'group' ? [''] : [], programTag))
}

function createSubCriterion(): SubCriterionDraft {
	return { id: localId(), name: '', maxScore: '10' }
}

function createCriterion(): CriterionDraft {
	return {
		id: localId(),
		name: '',
		appliesTo: 'group',
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
		appliesTo: criterion.name.trim().toLowerCase() === 'individual presentation' ? 'individual' : 'group',
		subCriteria: criterion.subCriteria.map((subCriterion) => ({
			id: localId(),
			name: subCriterion.name,
			maxScore: String(subCriterion.maxScore),
		})),
	}))
}

function hasMemberPrefix(value: string): boolean {
	const normalized = value.trim()
	const parts = normalized.match(/^(.+?)\s*[-\u2013\u2014]\s*(.+)$/)
	if (!parts) {
		return false
	}

	return /(\d+)\s*$/.test(parts[1])
}

function contestantMemberCount(contestant: ContestantDraft): number {
	if (contestant.entryType === 'individual') {
		return 1
	}

	const participantCount = contestant.participants.map((participant) => participant.trim()).filter((participant) => participant.length > 0).length
	return participantCount > 0 ? participantCount : 1
}

function normalizeSubCriteriaForPayload(subCriteria: SubCriterionDraft[]): Array<{ name: string; maxScore: number }> {
	return subCriteria.map((subCriterion) => ({
		name: subCriterion.name,
		maxScore: toNumber(subCriterion.maxScore),
	}))
}

function expandSubCriteriaForIndividualCriteria(subCriteria: SubCriterionDraft[], contestants: ContestantDraft[]): Array<{ name: string; maxScore: number }> {
	const normalizedSubCriteria = normalizeSubCriteriaForPayload(subCriteria)
	if (normalizedSubCriteria.length === 0) {
		return normalizedSubCriteria
	}

	if (normalizedSubCriteria.some((subCriterion) => hasMemberPrefix(subCriterion.name))) {
		return normalizedSubCriteria
	}

	const maxMemberCount = contestants.reduce((highest, contestant) => Math.max(highest, contestantMemberCount(contestant)), 1)
	const expanded: Array<{ name: string; maxScore: number }> = []

	for (let memberIndex = 1; memberIndex <= Math.max(1, maxMemberCount); memberIndex += 1) {
		for (const subCriterion of normalizedSubCriteria) {
			expanded.push({
				name: `Student ${memberIndex} - ${subCriterion.name}`,
				maxScore: subCriterion.maxScore,
			})
		}
	}

	return expanded
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
	const [bulkContestantProgramTag, setBulkContestantProgramTag] = useState<EventProgramTag | null>(null)
	const [judges, setJudges] = useState<JudgeDraft[]>([createJudge()])
	const [presentationSlots, setPresentationSlots] = useState<PresentationSlotDraft[]>(() => buildPresentationSlots(contestants.length))
	const [criteria, setCriteria] = useState<CriterionDraft[]>([createCriterion()])
	const [rubricLegend, setRubricLegend] = useState<RubricLegendDraft[]>(() => defaultRubricLegendDrafts())
	const [isSaving, setIsSaving] = useState(false)
	const [showPreview, setShowPreview] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [created, setCreated] = useState<CreateEventResponse | null>(null)
	const [copiedValue, setCopiedValue] = useState<string | null>(null)

	const totalEventMaxScore = useMemo(() => {
		return criteria.reduce((sum, criterion) => sum + criterionMaxScore(criterion), 0)
	}, [criteria])

	const totalSubCriteria = useMemo(() => {
		return criteria.reduce((sum, criterion) => sum + criterion.subCriteria.length, 0)
	}, [criteria])

	const normalizedRubricLegend = useMemo(() => {
		const legendItems = rubricLegend.map((legendItem) => ({
			score: toNumber(legendItem.score),
			label: legendItem.label,
		}))

		return normalizeRubricLegend(legendItems)
	}, [rubricLegend])

	const rubricLegendText = useMemo(() => formatRubricLegend(normalizedRubricLegend), [normalizedRubricLegend])

	const judgeNameById = useMemo(() => {
		return new Map(judges.map((judge) => [judge.id, judge.name.trim()]))
	}, [judges])

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
		setRubricLegend(defaultRubricLegendDrafts())
		setShowPreview(false)
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
		setRubricLegend(defaultRubricLegendDrafts())
		setShowPreview(false)
		setError(null)
	}

	function updateRubricLegendItem(legendId: string, value: Partial<Pick<RubricLegendDraft, 'score' | 'label'>>): void {
		setRubricLegend((previous) => previous.map((legendItem) => (legendItem.id === legendId ? { ...legendItem, ...value } : legendItem)))
	}

	function addRubricLegendItem(): void {
		setRubricLegend((previous) => [...previous, createRubricLegendDraft(0, '')])
	}

	function removeRubricLegendItem(legendId: string): void {
		setRubricLegend((previous) => previous.filter((legendItem) => legendItem.id !== legendId))
	}

	function resetRubricLegend(): void {
		setRubricLegend(defaultRubricLegendDrafts())
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

	function updateContestantProgramTag(index: number, programTag: EventProgramTag | null): void {
		setContestants((previous) => previous.map((contestant, contestantIndex) => (contestantIndex === index ? { ...contestant, programTag } : contestant)))
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
		const importedContestants = contestantsFromNames(names, bulkContestantEntryType, bulkContestantProgramTag)
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

	function updateCriterion(criterionId: string, value: Partial<Pick<CriterionDraft, 'name' | 'appliesTo'>>): void {
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

		const payload = {
			title,
			description,
			createdBy,
			eventScoringType,
			rubricLegend: rubricLegend
				.map(
					(legendItem): RubricLegendItem => ({
						score: toNumber(legendItem.score),
						label: legendItem.label.trim(),
					}),
				)
				.filter((legendItem) => legendItem.label.length > 0),
			contestants: contestants.map((contestant) => ({
				name: contestant.name,
				entryType: contestant.entryType,
				programTag: contestant.programTag,
				participants: contestant.entryType === 'group' ? contestant.participants.map((participant) => participant.trim()).filter((participant) => participant.length > 0) : undefined,
			})),
			judges: judges.map((judge) => ({
				name: judge.name,
				email: judge.email,
			})),
			criteria: criteria.map((criterion) => ({
				name: criterion.name,
				subCriteria: criterion.appliesTo === 'individual' ? expandSubCriteriaForIndividualCriteria(criterion.subCriteria, contestants) : normalizeSubCriteriaForPayload(criterion.subCriteria),
			})),
			presentationSlots: presentationSlots.map((slot, index) => ({
				label: slot.label || `Slot ${index + 1}`,
				contestantIndex: index,
				judgeNames: slot.judgeIds.map((judgeId) => judgeNameById.get(judgeId) ?? '').filter((name) => name.length > 0),
			})),
		}

		try {
			const response = await fetch('/api/eventscorer/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})

			const responseData = (await response.json()) as CreateEventResponse & { error?: string }

			if (!response.ok) {
				throw new Error(responseData.error ?? 'Unable to create scorer event.')
			}

			setCreated(responseData)
			setShowPreview(false)
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
									<select value={bulkContestantProgramTag ?? ''} onChange={(event) => setBulkContestantProgramTag(event.target.value === '' ? null : (event.target.value as EventProgramTag))} className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2'>
										<option value=''>No Program Tag</option>
										<option value='BSINT'>BSINT</option>
										<option value='BSCS'>BSCS</option>
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
									<div className='grid gap-2 sm:grid-cols-[1fr_170px_150px_auto]'>
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
										<select value={contestant.programTag ?? ''} onChange={(event) => updateContestantProgramTag(index, event.target.value === '' ? null : (event.target.value as EventProgramTag))} className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2'>
											<option value=''>No Program Tag</option>
											<option value='BSINT'>BSINT</option>
											<option value='BSCS'>BSCS</option>
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
						<p className='mb-4 text-xs text-emerald-900/80'>Choose each criterion scope: Per Contestant (Individual) for member-based questions, or Group Criteria Only for one team-level set of questions.</p>

						<div className='space-y-5'>
							{criteria.map((criterion, criterionIndex) => {
								const parentMaxScore = criterionMaxScore(criterion)

								return (
									<div key={criterion.id} className='rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4'>
										<div className='mb-3 grid gap-2 sm:grid-cols-[1fr_180px_180px_auto]'>
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
											<select
												value={criterion.appliesTo}
												onChange={(event) =>
													updateCriterion(criterion.id, {
														appliesTo: event.target.value as 'group' | 'individual',
													})
												}
												className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2'>
												<option value='group'>Apply To: Group Criteria Only</option>
												<option value='individual'>Apply To: Per Contestant (Individual)</option>
											</select>
											{criteria.length > 1 ? (
												<button type='button' onClick={() => removeCriterion(criterion.id)} className='rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50'>
													Remove Parent
												</button>
											) : null}
										</div>
										{criterion.appliesTo === 'individual' ? (
											<p className='mb-3 text-xs text-emerald-900/80'>This criterion will be expanded per member and scored per contestant member, even when the event uses Standard Scoring.</p>
										) : (
											<p className='mb-3 text-xs text-emerald-900/80'>This criterion will stay as group-only questions (one set for the whole team/entry).</p>
										)}

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

					<section className='rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5'>
						<div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
							<div>
								<h2 className='text-lg font-semibold text-emerald-950'>Rubric Legend</h2>
								<p className='mt-1 text-xs text-emerald-900/80'>Customize the score meanings shown to judges and in the admin dashboard.</p>
							</div>
							<div className='flex items-center gap-2'>
								<button type='button' onClick={resetRubricLegend} className='rounded-full border border-emerald-700/30 px-4 py-1.5 text-sm text-emerald-900 transition hover:bg-emerald-50'>
									Reset Default Legend
								</button>
								<button type='button' onClick={addRubricLegendItem} className='rounded-full border border-emerald-700/30 px-4 py-1.5 text-sm text-emerald-900 transition hover:bg-emerald-50'>
									Add Legend Item
								</button>
							</div>
						</div>

						<p className='rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900'>Current Legend: {rubricLegendText}</p>

						<div className='mt-3 space-y-2'>
							{rubricLegend.map((legendItem, legendIndex) => (
								<div key={legendItem.id} className='grid gap-2 rounded-xl border border-emerald-100 bg-white p-3 sm:grid-cols-[140px_1fr_auto]'>
									<input
										value={legendItem.score}
										onChange={(event) =>
											updateRubricLegendItem(legendItem.id, {
												score: event.target.value,
											})
										}
										type='number'
										min={0}
										step='0.01'
										placeholder={`Score ${legendIndex + 1}`}
										className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 outline-none ring-emerald-500 transition focus:ring-2'
									/>
									<input
										value={legendItem.label}
										onChange={(event) =>
											updateRubricLegendItem(legendItem.id, {
												label: event.target.value,
											})
										}
										placeholder={`Meaning for score ${legendIndex + 1}`}
										className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2'
									/>
									{rubricLegend.length > 1 ? (
										<button type='button' onClick={() => removeRubricLegendItem(legendItem.id)} className='rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50'>
											Remove
										</button>
									) : null}
								</div>
							))}
						</div>

						<div className='mt-3 flex flex-wrap gap-2'>
							{normalizedRubricLegend.map((legendItem) => (
								<span key={`${legendItem.score}-${legendItem.label}`} className='rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900'>
									{formatLegendScore(legendItem.score)} - {legendItem.label}
								</span>
							))}
						</div>
					</section>

					<section className='rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 sm:p-5'>
						<div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
							<div>
								<h2 className='text-lg font-semibold text-cyan-950'>Preview Before Publish</h2>
								<p className='mt-1 text-xs text-cyan-900/80'>Use preview mode to verify your full event setup, then switch back to edit anytime before publishing.</p>
							</div>
							<button
								type='button'
								onClick={() => {
									setShowPreview((current) => !current)
									setError(null)
								}}
								className='rounded-full border border-cyan-400 bg-white px-4 py-2 text-sm font-medium text-cyan-900 transition hover:bg-cyan-100'>
								{showPreview ? 'Hide Preview' : 'Preview Draft'}
							</button>
						</div>

						{showPreview ? (
							<div className='mt-4 space-y-4'>
								<div className='grid gap-3 sm:grid-cols-3'>
									<div className='rounded-xl border border-cyan-200 bg-white p-3'>
										<p className='text-xs uppercase tracking-wide text-cyan-800/80'>Event Title</p>
										<p className='mt-1 text-sm font-semibold text-cyan-950'>{title.trim() || 'Untitled Event'}</p>
									</div>
									<div className='rounded-xl border border-cyan-200 bg-white p-3'>
										<p className='text-xs uppercase tracking-wide text-cyan-800/80'>Created By</p>
										<p className='mt-1 text-sm font-semibold text-cyan-950'>{createdBy.trim() || 'Not provided'}</p>
									</div>
									<div className='rounded-xl border border-cyan-200 bg-white p-3'>
										<p className='text-xs uppercase tracking-wide text-cyan-800/80'>Scoring Type</p>
										<p className='mt-1 text-sm font-semibold text-cyan-950'>{eventScoringType === 'final-oral-defense' ? 'Final Oral Defense' : 'Standard Scoring'}</p>
									</div>
								</div>

								<div className='rounded-xl border border-cyan-200 bg-white p-3'>
									<p className='text-xs uppercase tracking-wide text-cyan-800/80'>Description</p>
									<p className='mt-1 text-sm text-cyan-950'>{description.trim() || 'No description provided.'}</p>
								</div>

								<div className='rounded-xl border border-cyan-200 bg-white p-3'>
									<p className='text-xs uppercase tracking-wide text-cyan-800/80'>Rubric Legend</p>
									<p className='mt-1 text-sm text-cyan-950'>{rubricLegendText}</p>
								</div>

								<div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
									<div className='rounded-xl border border-cyan-200 bg-white p-3'>
										<p className='text-xs text-cyan-800/80'>Entries</p>
										<p className='text-lg font-semibold text-cyan-950'>{contestants.length}</p>
									</div>
									<div className='rounded-xl border border-cyan-200 bg-white p-3'>
										<p className='text-xs text-cyan-800/80'>Judges</p>
										<p className='text-lg font-semibold text-cyan-950'>{judges.length}</p>
									</div>
									<div className='rounded-xl border border-cyan-200 bg-white p-3'>
										<p className='text-xs text-cyan-800/80'>Criteria / Subcriteria</p>
										<p className='text-lg font-semibold text-cyan-950'>
											{criteria.length} / {totalSubCriteria}
										</p>
									</div>
									<div className='rounded-xl border border-cyan-200 bg-white p-3'>
										<p className='text-xs text-cyan-800/80'>Event Max Score</p>
										<p className='text-lg font-semibold text-cyan-950'>{totalEventMaxScore.toFixed(2)}</p>
									</div>
								</div>

								<div className='space-y-4'>
									<div className='overflow-hidden rounded-xl border border-cyan-200 bg-white'>
										<div className='border-b border-cyan-200 bg-cyan-50/70 px-3 py-2'>
											<p className='text-sm font-semibold text-cyan-950'>Entries Matrix</p>
										</div>
										<div className='hidden bg-cyan-100/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-900 sm:grid sm:grid-cols-[56px_minmax(180px,1fr)_130px_120px_minmax(220px,1.3fr)] sm:gap-2'>
											<span>#</span>
											<span>Entry</span>
											<span>Type</span>
											<span>Program</span>
											<span>Participants</span>
										</div>
										<div className='divide-y divide-cyan-100'>
											{contestants.map((contestant, index) => {
												const cleanParticipants = contestant.participants.map((participant) => participant.trim()).filter((participant) => participant.length > 0)
												const participantDisplay = contestant.entryType === 'group' && cleanParticipants.length > 0 ? cleanParticipants.join(', ') : '-'

												return (
													<div key={contestant.id} className='grid gap-2 px-3 py-2 text-xs text-cyan-900 sm:grid-cols-[56px_minmax(180px,1fr)_130px_120px_minmax(220px,1.3fr)] sm:items-center'>
														<p>
															<span className='font-medium sm:hidden'># </span>
															{index + 1}
														</p>
														<p>
															<span className='font-medium sm:hidden'>Entry: </span>
															{contestant.name.trim() || `Entry ${index + 1}`}
														</p>
														<p>
															<span className='font-medium sm:hidden'>Type: </span>
															{contestant.entryType === 'individual' ? 'Individual' : 'Team/Group'}
														</p>
														<p>
															<span className='font-medium sm:hidden'>Program: </span>
															{contestant.programTag || '-'}
														</p>
														<p>
															<span className='font-medium sm:hidden'>Participants: </span>
															{participantDisplay}
														</p>
													</div>
												)
											})}
										</div>
									</div>

									<div className='grid gap-4 xl:grid-cols-2'>
										<div className='overflow-hidden rounded-xl border border-cyan-200 bg-white'>
											<div className='border-b border-cyan-200 bg-cyan-50/70 px-3 py-2'>
												<p className='text-sm font-semibold text-cyan-950'>Judges Matrix</p>
											</div>
											<div className='hidden bg-cyan-100/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-900 sm:grid sm:grid-cols-[56px_minmax(160px,1fr)_minmax(190px,1fr)] sm:gap-2'>
												<span>#</span>
												<span>Judge</span>
												<span>Email</span>
											</div>
											<div className='divide-y divide-cyan-100'>
												{judges.map((judge, index) => (
													<div key={judge.id} className='grid gap-2 px-3 py-2 text-xs text-cyan-900 sm:grid-cols-[56px_minmax(160px,1fr)_minmax(190px,1fr)] sm:items-center'>
														<p>
															<span className='font-medium sm:hidden'># </span>
															{index + 1}
														</p>
														<p>
															<span className='font-medium sm:hidden'>Judge: </span>
															{judge.name.trim() || `Judge ${index + 1}`}
														</p>
														<p>
															<span className='font-medium sm:hidden'>Email: </span>
															{judge.email.trim() || '-'}
														</p>
													</div>
												))}
											</div>
										</div>

										<div className='overflow-hidden rounded-xl border border-cyan-200 bg-white'>
											<div className='border-b border-cyan-200 bg-cyan-50/70 px-3 py-2'>
												<p className='text-sm font-semibold text-cyan-950'>Slot Assignment Matrix</p>
											</div>
											<div className='hidden bg-cyan-100/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-900 sm:grid sm:grid-cols-[minmax(130px,1fr)_minmax(170px,1fr)_minmax(220px,1.2fr)] sm:gap-2'>
												<span>Slot</span>
												<span>Entry</span>
												<span>Assigned Judges</span>
											</div>
											<div className='divide-y divide-cyan-100'>
												{presentationSlots.map((slot, index) => {
													const assignedJudgeNames = slot.judgeIds.map((judgeId) => judgeNameById.get(judgeId) ?? '').filter((judgeName) => judgeName.length > 0)
													const contestant = contestants[index]
													const contestantName = contestant?.name.trim() || `Entry ${index + 1}`

													return (
														<div key={slot.id} className='grid gap-2 px-3 py-2 text-xs text-cyan-900 sm:grid-cols-[minmax(130px,1fr)_minmax(170px,1fr)_minmax(220px,1.2fr)] sm:items-center'>
															<p>
																<span className='font-medium sm:hidden'>Slot: </span>
																{slot.label || `Slot ${index + 1}`}
															</p>
															<p>
																<span className='font-medium sm:hidden'>Entry: </span>
																{contestantName}
															</p>
															<p>
																<span className='font-medium sm:hidden'>Assigned Judges: </span>
																{assignedJudgeNames.length > 0 ? assignedJudgeNames.join(', ') : 'No judges assigned yet.'}
															</p>
														</div>
													)
												})}
											</div>
										</div>
									</div>

									<div className='overflow-hidden rounded-xl border border-cyan-200 bg-white'>
										<div className='border-b border-cyan-200 bg-cyan-50/70 px-3 py-2'>
											<p className='text-sm font-semibold text-cyan-950'>Criteria Matrix</p>
										</div>
										<div className='hidden bg-cyan-100/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-900 sm:grid sm:grid-cols-[56px_minmax(170px,0.8fr)_120px_96px_minmax(230px,1.3fr)] sm:gap-2'>
											<span>#</span>
											<span>Criterion</span>
											<span>Scope</span>
											<span>Max</span>
											<span>Subcriteria</span>
										</div>
										<div className='divide-y divide-cyan-100'>
											{criteria.map((criterion, criterionIndex) => (
												<div key={criterion.id} className='grid gap-2 px-3 py-2 text-xs text-cyan-900 sm:grid-cols-[56px_minmax(170px,0.8fr)_120px_96px_minmax(230px,1.3fr)] sm:items-start'>
													<p>
														<span className='font-medium sm:hidden'># </span>
														{criterionIndex + 1}
													</p>
													<p>
														<span className='font-medium sm:hidden'>Criterion: </span>
														{criterion.name.trim() || `Criterion ${criterionIndex + 1}`}
													</p>
													<p>
														<span className='font-medium sm:hidden'>Scope: </span>
														{criterion.appliesTo === 'individual' ? 'Per Contestant (Individual)' : 'Group Criteria Only'}
													</p>
													<p>
														<span className='font-medium sm:hidden'>Max: </span>
														{criterionMaxScore(criterion).toFixed(2)}
													</p>
													<p>
														<span className='font-medium sm:hidden'>Subcriteria: </span>
														{criterion.subCriteria.map((subCriterion, subCriterionIndex) => `${subCriterionIndex + 1}) ${subCriterion.name.trim() || `Subcriterion ${subCriterionIndex + 1}`} [${toNumber(subCriterion.maxScore).toFixed(2)}]`).join(' | ')}
													</p>
												</div>
											))}
										</div>
									</div>
								</div>
							</div>
						) : null}
					</section>

					{error ? <div className='rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>{error}</div> : null}

					<div className='flex flex-wrap items-center gap-3'>
						<button type='button' onClick={() => setShowPreview(true)} className='rounded-full border border-cyan-400 bg-cyan-50 px-6 py-3 text-sm font-medium text-cyan-900 transition hover:bg-cyan-100'>
							Preview Draft
						</button>
						<button type='submit' disabled={isSaving} className='rounded-full bg-emerald-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60'>
							{isSaving ? 'Publishing Event...' : 'Publish Event and Generate Judge Links'}
						</button>
					</div>
				</form>

				{created ? (
					<section className='mt-8 rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 sm:p-5'>
						<h2 className='text-lg font-semibold text-cyan-950'>Event Published Successfully</h2>
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
