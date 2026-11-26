'use client'

import { isMemberRowName } from '@/lib/member-rows'
import { useMemo, useRef, useState } from 'react'

import UnlockDialog from '@/components/unlock-dialog'

import { buildFinalOralDefenseCriteria, FINAL_ORAL_DEFENSE_CONTESTANT_SAMPLES, PAPER_PRESENTATION_CONTESTANT_SAMPLES, PAPER_PRESENTATION_CRITERIA } from '@/lib/default-rubric'
import { DEFAULT_RUBRIC_LEGEND, formatLegendScore, formatRubricLegend, normalizeRubricLegend } from '@/lib/rubric-legend'
import type { ContestantEntryType, CreateEventResponse, CriterionInput, EventProgramTag, EventScoringType, RubricLegendItem } from '@/lib/types'
import LeaveGuard, { useFormChanges } from '@/components/leave-guard'
import { buttonClassName } from '@/components/ui/button'
import { BODY, BOX, BOX_SKY, CELL_LABEL, CHECKBOX, CHIP_EMERALD, ENTRY_TYPE_GROUP, ENTRY_TYPE_INDIVIDUAL, ERROR_BOX, EYEBROW, FIELD, FIELD_STATIC, H1, H2, H3, HELP, LABEL, LABEL_SM, LEDE, LINK, NOTE_BOX, OPTION_CHIP, PANEL, PANEL_SKY, TABLE_CAPTION, TABLE_DIVIDE, TABLE_HEAD, TABLE_ROW, TABLE_SHELL, VALUE, WELL } from '@/components/ui/form-styles'
import { cx } from '@/lib/ui/cx'

type ContestantDraft = {
	id: string
	name: string
	entryType: ContestantEntryType
	participants: string[]
	programTag: EventProgramTag | null
	section?: string
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

function createContestant(entryType: ContestantEntryType = 'group', name = '', participants?: string[], programTag: EventProgramTag | null = null, section = ''): ContestantDraft {
	const defaultParticipants = entryType === 'group' ? [''] : []
	return { id: localId(), name, entryType, participants: participants ?? defaultParticipants, programTag, section }
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

// D40: the shared member-row rule (lib/member-rows.ts).
function hasMemberPrefix(value: string): boolean {
	return isMemberRowName(value.trim())
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
	// B63: leaving with changes asks first.
	const formChanges = useFormChanges()
	const [title, setTitle] = useState('')
	const [description, setDescription] = useState('')
	const [createdBy, setCreatedBy] = useState('')
	const [eventScoringType, setEventScoringType] = useState<EventScoringType>('standard')
	const [contestants, setContestants] = useState<ContestantDraft[]>([createContestant(), createContestant()])
	const [bulkContestantEnabled, setBulkContestantEnabled] = useState(false)
	const [bulkContestantText, setBulkContestantText] = useState('')
	const [bulkContestantEntryType, setBulkContestantEntryType] = useState<ContestantEntryType>('group')
	const [bulkContestantProgramTag, setBulkContestantProgramTag] = useState<EventProgramTag | null>(null)
	const [bulkContestantSection, setBulkContestantSection] = useState('')
	const [judges, setJudges] = useState<JudgeDraft[]>([createJudge()])
	const [presentationSlots, setPresentationSlots] = useState<PresentationSlotDraft[]>(() => buildPresentationSlots(contestants.length))
	const [criteria, setCriteria] = useState<CriterionDraft[]>([createCriterion()])
	const [rubricLegend, setRubricLegend] = useState<RubricLegendDraft[]>(() => defaultRubricLegendDrafts())
	const [showRubricLegend, setShowRubricLegend] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [showPreview, setShowPreview] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [created, setCreated] = useState<CreateEventResponse | null>(null)
	const [copiedValue, setCopiedValue] = useState<string | null>(null)
	const [isUnlockOpen, setIsUnlockOpen] = useState(false)
	const pendingPublishRef = useRef<unknown>(null)

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

	const uniqueSections = useMemo(() => {
		const sections = new Set<string>()
		for (const contestant of contestants) {
			const section = contestant.section?.trim()
			if (section) {
				sections.add(section)
			}
		}
		return Array.from(sections).sort()
	}, [contestants])

	function loadPaperTemplate(): void {
		const sampleContestants = [...PAPER_PRESENTATION_CONTESTANT_SAMPLES]
		setTitle('Paper Presentation')
		setDescription('Dynamic scoring rubric based on paper presentation criteria.')
		setEventScoringType('standard')
		setContestants(contestantsFromNames(sampleContestants, 'group'))
		setPresentationSlots(buildPresentationSlots(sampleContestants.length))
		setCriteria(toCriterionDraft(PAPER_PRESENTATION_CRITERIA))
		setRubricLegend(defaultRubricLegendDrafts())
		setShowRubricLegend(false)
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
		setShowRubricLegend(false)
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

	function updateContestant(index: number, value: Partial<Pick<ContestantDraft, 'name' | 'section'>>): void {
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
		const importedContestants = names.map((name) => createContestant(bulkContestantEntryType, name, bulkContestantEntryType === 'group' ? [''] : [], bulkContestantProgramTag, bulkContestantSection))
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
			showRubricLegend,
			contestants: contestants.map((contestant) => ({
				name: contestant.name,
				entryType: contestant.entryType,
				programTag: contestant.programTag,
				section: contestant.section,
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
			presentationSlots: presentationSlots.map((slot, index) => {
				const activeJudgeIds = slot.judgeIds.filter((judgeId) => judgeNameById.has(judgeId))
				const normalizedJudgeIds = activeJudgeIds.length === 0 && judges.length === 1 ? [judges[0].id] : activeJudgeIds

				return {
					label: slot.label || `Slot ${index + 1}`,
					contestantIndex: index,
					judgeNames: normalizedJudgeIds.map((judgeId) => judgeNameById.get(judgeId) ?? '').filter((name) => name.length > 0),
				}
			}),
		}

		await publishEvent(payload)
	}

	// Phase 3 Task 13 (S6): creating an event needs the update password. A 401 opens the unlock
	// dialog and keeps the payload; once unlocked, the same payload is sent again (once).
	async function publishEvent(payload: unknown): Promise<void> {
		setError(null)
		setIsSaving(true)
		try {
			const response = await fetch('/api/eventscorer/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})

			const responseData = (await response.json()) as CreateEventResponse & { error?: string }

			if (response.status === 401) {
				pendingPublishRef.current = payload
				setIsUnlockOpen(true)
				return
			}

			if (!response.ok) {
				throw new Error(responseData.error ?? 'Unable to create scorer event.')
			}

			if (typeof window !== 'undefined') {
				const origin = window.location.origin
				responseData.adminUrl = responseData.adminUrl.replace(/^https?:\/\/[^/]+/, origin)
				for (const link of responseData.judgeLinks) {
					link.url = link.url.replace(/^https?:\/\/[^/]+/, origin)
				}
			}

			setCreated(responseData)
			formChanges.markUnchanged()
			setShowPreview(false)
		} catch (submitError) {
			setError(submitError instanceof Error ? submitError.message : 'Unable to create scorer event.')
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<div className='mx-auto w-full max-w-6xl px-4 py-8 sm:px-8'>
			<div className={PANEL}>
				<div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
					<div>
						<h1 className={H1}>Create Scorer Event</h1>
						<p className={cx(LEDE, 'mt-2 max-w-3xl')}>Build a fully dynamic rubric with parent criteria, subcriteria, judges, and contestant entries.</p>
					</div>

					<button type='button' onClick={loadPaperTemplate} className={buttonClassName('admin-outline')}>
						Use Paper Presentation Template
					</button>
					<button type='button' onClick={loadFinalOralTemplate} className={buttonClassName('admin-outline')}>
						Use Final Oral Defense Template
					</button>
				</div>

				<form onSubmit={onSubmit} onInput={formChanges.onInput} className='mt-8 space-y-8'>
					<section className={cx(WELL, 'grid gap-4 sm:grid-cols-2')}>
						<label className={LABEL}>
							Event Title
							<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder='Example: Science Fair Finals' className={cx(FIELD, 'mt-2 w-full px-3 py-2')} />
						</label>
						<label className={LABEL}>
							Created By (Admin)
							<input value={createdBy} onChange={(event) => setCreatedBy(event.target.value)} placeholder='Example: Event Committee' className={cx(FIELD, 'mt-2 w-full px-3 py-2')} />
						</label>
						<label className={LABEL}>
							Scoring Event Type
							<select value={eventScoringType} onChange={(event) => setEventScoringType(event.target.value as EventScoringType)} className={cx(FIELD, 'mt-2 w-full px-3 py-2')}>
								<option value='standard'>Standard Scoring</option>
								<option value='final-oral-defense'>Final Oral Defense</option>
							</select>
							<p className={cx(HELP, 'mt-1')}>This controls how final results are computed and shown for judges/admin.</p>
						</label>
						<label className={cx(LABEL, 'sm:col-span-2')}>
							Description
							<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder='Optional context for judges' className={cx(FIELD, 'mt-2 w-full px-3 py-2')} />
						</label>
					</section>

					<section className={PANEL}>
						<div className='mb-4 flex items-center justify-between'>
							<h2 className={H2}>Contestants / Entries</h2>
							<div className='flex items-center gap-2'>
								<button type='button' onClick={() => addContestant('group')} className={buttonClassName('admin-outline')}>
									Add Team/Group
								</button>
								<button type='button' onClick={() => addContestant('individual')} className={buttonClassName('admin-outline')}>
									Add Individual
								</button>
							</div>
						</div>
						<p className={cx(HELP, 'mb-3')}>Set each entry as a whole team/group or an individual presenter.</p>
						<label className={cx(LABEL_SM, 'mb-3 flex items-center gap-2')}>
							<input type='checkbox' checked={bulkContestantEnabled} onChange={(event) => setBulkContestantEnabled(event.target.checked)} className={CHECKBOX} />
							Enable Bulk Add Team/Group Entries
						</label>
						{bulkContestantEnabled ? (
							<div className={cx(WELL, 'mb-4')}>
								<p className={LABEL_SM}>Bulk Add Entries (one per line)</p>
								<textarea value={bulkContestantText} onChange={(event) => setBulkContestantText(event.target.value)} rows={4} placeholder={`A\nB\nC`} className={cx(FIELD, 'mt-2 w-full px-3 py-2')} />
								<div className='mt-2 flex flex-wrap items-center gap-2'>
									<select value={bulkContestantEntryType} onChange={(event) => setBulkContestantEntryType(event.target.value as ContestantEntryType)} className={cx(FIELD, 'px-3 py-2')}>
										<option value='individual'>Add as Individual entries</option>
										<option value='group'>Add as Team/Group entries</option>
									</select>
									<select value={bulkContestantProgramTag ?? ''} onChange={(event) => setBulkContestantProgramTag(event.target.value === '' ? null : (event.target.value as EventProgramTag))} className={cx(FIELD, 'px-3 py-2')}>
										<option value=''>No Program Tag</option>
										<option value='BSINT'>BSINT</option>
										<option value='BSCS'>BSCS</option>
									</select>
									<input
										value={bulkContestantSection}
										onChange={(event) => setBulkContestantSection(event.target.value)}
										placeholder='Section (e.g. A, B)'
										list='section-options'
										className={cx(FIELD, 'w-32 px-3 py-2')}
									/>
									<button type='button' onClick={addContestantsFromNewLines} className={buttonClassName('admin-outline')}>
										Add Entries from New Lines
									</button>
								</div>
							</div>
						) : null}
						<div className='space-y-3'>
							{contestants.map((contestant, index) => (
								<div key={contestant.id} className={WELL}>
									<div className='mb-2 flex items-center justify-between'>
										<p className={HELP}>Entry {index + 1}</p>
										<span className={contestant.entryType === 'individual' ? ENTRY_TYPE_INDIVIDUAL : ENTRY_TYPE_GROUP}>{contestant.entryType === 'individual' ? 'Individual' : 'Team/Group'}</span>
									</div>
									<div className='grid gap-2 sm:grid-cols-[1fr_170px_150px_120px_auto]'>
										<input
											value={contestant.name}
											onChange={(event) => updateContestant(index, { name: event.target.value })}
											placeholder={contestant.entryType === 'individual' ? `Individual ${index + 1} name` : `Team/Group ${index + 1} name`}
											className={cx(FIELD, 'w-full px-3 py-2')}
										/>
										<select value={contestant.entryType} onChange={(event) => updateContestantEntryType(index, event.target.value as ContestantEntryType)} className={cx(FIELD, 'px-3 py-2')}>
											<option value='group'>Team/Group</option>
											<option value='individual'>Individual</option>
										</select>
										<select value={contestant.programTag ?? ''} onChange={(event) => updateContestantProgramTag(index, event.target.value === '' ? null : (event.target.value as EventProgramTag))} className={cx(FIELD, 'px-3 py-2')}>
											<option value=''>No Program Tag</option>
											<option value='BSINT'>BSINT</option>
											<option value='BSCS'>BSCS</option>
										</select>
										<input
											value={contestant.section ?? ''}
											onChange={(event) => updateContestant(index, { section: event.target.value })}
											placeholder='Section'
											list='section-options'
											className={cx(FIELD, 'px-3 py-2')}
										/>
										{contestants.length > 1 ? (
											<button type='button' onClick={() => removeContestant(index)} className={buttonClassName('admin-remove', 'sm')}>
												Remove
											</button>
										) : null}
									</div>

									{contestant.entryType === 'group' ? (
										<div className={cx(BOX, 'mt-3')}>
											<div className='mb-2 flex items-center justify-between'>
												<p className={LABEL_SM}>Individual Participant Names</p>
												<button type='button' onClick={() => addParticipantName(index)} className={buttonClassName('admin-outline', 'xs')}>
													Add Participant
												</button>
											</div>

											<div className='space-y-2'>
												{contestant.participants.length === 0 ? <p className={HELP}>No participant added yet.</p> : null}
												{contestant.participants.map((participant, participantIndex) => (
													<div key={`${contestant.id}-participant-${participantIndex}`} className='flex gap-2'>
														<input
															value={participant}
															onChange={(event) => updateParticipantName(index, participantIndex, event.target.value)}
															placeholder={`Participant ${participantIndex + 1} name`}
															className={cx(FIELD, 'w-full px-3 py-2')}
														/>
														<button type='button' onClick={() => removeParticipantName(index, participantIndex)} className={buttonClassName('admin-remove', 'sm')}>
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
						<datalist id='section-options'>
							{uniqueSections.map((section) => (
								<option key={section} value={section} />
							))}
						</datalist>
					</section>

					<section className={PANEL}>
						<div className='mb-4 flex items-center justify-between'>
							<h2 className={H2}>Judges</h2>
							<button type='button' onClick={addJudge} className={buttonClassName('admin-outline')}>
								Add Judge
							</button>
						</div>
						<div className='space-y-3'>
							{judges.map((judge, index) => (
								<div key={judge.id} className='grid gap-2 sm:grid-cols-[1fr_1fr_auto]'>
									<input value={judge.name} onChange={(event) => updateJudge(judge.id, { name: event.target.value })} placeholder={`Judge ${index + 1} name`} className={cx(FIELD, 'px-3 py-2')} />
									<input value={judge.email} onChange={(event) => updateJudge(judge.id, { email: event.target.value })} placeholder='Email (optional)' className={cx(FIELD, 'px-3 py-2')} />
									{judges.length > 1 ? (
										<button type='button' onClick={() => removeJudge(judge.id)} className={cx(buttonClassName('admin-remove', 'sm'), 'sm:self-center')}>
											Remove
										</button>
									) : null}
								</div>
							))}
						</div>
					</section>

					<section className={PANEL}>
						<div className='mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
							<h2 className={H2}>Presentation Schedule</h2>
							<span className={HELP}>Assign judges per slot. Unassigned slots are hidden from judges.</span>
						</div>

						<div className='space-y-4'>
							{presentationSlots.map((slot, index) => {
								const contestant = contestants[index]
								const contestantName = contestant?.name.trim() || `Entry ${index + 1}`
								const contestantLabel = contestant?.entryType === 'individual' ? 'Individual' : 'Group'
								return (
									<div key={slot.id} className={WELL}>
										<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
											<div>
												<p className={H3}>Slot {index + 1}</p>
												<p className={HELP}>
													{contestantLabel}: {contestantName}
												</p>
											</div>
											<label className={LABEL_SM}>
												Slot label
												<input
													value={slot.label}
													onChange={(event) => updatePresentationSlotLabel(index, event.target.value)}
													placeholder='Example: 9:00 AM - Room A'
													className={cx(FIELD, 'mt-1 w-full px-3 py-2')}
												/>
											</label>
										</div>

										<div className='mt-3 flex flex-wrap gap-2'>
											{judges.length === 0 ? (
												<p className={HELP}>Add judges to assign this slot.</p>
											) : (
												judges.map((judge, judgeIndex) => (
													<label key={judge.id} className={cx(OPTION_CHIP, 'flex items-center gap-2')}>
														<input type='checkbox' checked={slot.judgeIds.includes(judge.id)} onChange={() => togglePresentationSlotJudge(index, judge.id)} className={CHECKBOX} />
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

					<section className={PANEL}>
						<div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
							<h2 className={H2}>Rubric Criteria</h2>
							<div className='flex items-center gap-3'>
								<span className={CHIP_EMERALD}>Event Max Score: {totalEventMaxScore.toFixed(2)}</span>
								<button type='button' onClick={addCriterion} className={buttonClassName('admin-outline')}>
									Add Parent Criterion
								</button>
							</div>
						</div>
						<p className={cx(HELP, 'mb-4')}>Choose each criterion scope: Per Contestant (Individual) for member-based questions, or Group Criteria Only for one team-level set of questions.</p>

						<div className='space-y-5'>
							{criteria.map((criterion, criterionIndex) => {
								const parentMaxScore = criterionMaxScore(criterion)

								return (
									<div key={criterion.id} className={WELL}>
										<div className='mb-3 grid gap-2 sm:grid-cols-[1fr_180px_180px_auto]'>
											<input
												value={criterion.name}
												onChange={(event) =>
													updateCriterion(criterion.id, {
														name: event.target.value,
													})
												}
												placeholder={`Parent criterion ${criterionIndex + 1}`}
												className={cx(FIELD, 'px-3 py-2')}
											/>
											<div className={cx(FIELD_STATIC, 'flex items-center')}>Parent Max: {parentMaxScore.toFixed(2)}</div>
											<select
												value={criterion.appliesTo}
												onChange={(event) =>
													updateCriterion(criterion.id, {
														appliesTo: event.target.value as 'group' | 'individual',
													})
												}
												className={cx(FIELD, 'px-3 py-2')}>
												<option value='group'>Apply To: Group Criteria Only</option>
												<option value='individual'>Apply To: Per Contestant (Individual)</option>
											</select>
											{criteria.length > 1 ? (
												<button type='button' onClick={() => removeCriterion(criterion.id)} className={buttonClassName('admin-remove', 'sm')}>
													Remove Parent
												</button>
											) : null}
										</div>
										{criterion.appliesTo === 'individual' ? (
											<p className={cx(HELP, 'mb-3')}>This criterion will be expanded per member and scored per contestant member, even when the event uses Standard Scoring.</p>
										) : (
											<p className={cx(HELP, 'mb-3')}>This criterion will stay as group-only questions (one set for the whole team/entry).</p>
										)}

										<div className='mb-3 flex items-center justify-between'>
											<span className={HELP}>Subcriteria total max score: {parentMaxScore.toFixed(2)}</span>
											<button type='button' onClick={() => addSubCriterion(criterion.id)} className={buttonClassName('admin-outline', 'xs')}>
												Add Subcriterion
											</button>
										</div>

										<div className='space-y-2'>
											{criterion.subCriteria.map((subCriterion, subCriterionIndex) => (
												<div key={subCriterion.id} className={cx(BOX, 'grid gap-2 sm:grid-cols-[1fr_160px_auto]')}>
													<input
														value={subCriterion.name}
														onChange={(event) =>
															updateSubCriterion(criterion.id, subCriterion.id, {
																name: event.target.value,
															})
														}
														placeholder={`Subcriterion ${subCriterionIndex + 1}`}
														className={cx(FIELD, 'px-3 py-2')}
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
														className={cx(FIELD, 'px-3 py-2')}
													/>
													{criterion.subCriteria.length > 1 ? (
														<button type='button' onClick={() => removeSubCriterion(criterion.id, subCriterion.id)} className={buttonClassName('admin-remove', 'sm')}>
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

					<section className={PANEL}>
						<div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
							<div>
								<h2 className={H2}>Rubric Legend</h2>
								<p className={cx(HELP, 'mt-1')}>Customize the score meanings shown to judges and in the admin dashboard.</p>
							</div>
							<label className={cx(LABEL, 'flex items-center gap-2')}>
								<input type='checkbox' checked={showRubricLegend} onChange={(event) => setShowRubricLegend(event.target.checked)} className={CHECKBOX} />
								Enable Rubric Legend
							</label>
						</div>

						{showRubricLegend ? (
							<>
								<div className='mb-3 flex items-center gap-2'>
									<button type='button' onClick={resetRubricLegend} className={buttonClassName('admin-outline')}>
										Reset Default Legend
									</button>
									<button type='button' onClick={addRubricLegendItem} className={buttonClassName('admin-outline')}>
										Add Legend Item
									</button>
								</div>

								<p className={NOTE_BOX}>Current Legend: {rubricLegendText}</p>

								<div className='mt-3 space-y-2'>
									{rubricLegend.map((legendItem, legendIndex) => (
										<div key={legendItem.id} className={cx(BOX, 'grid gap-2 sm:grid-cols-[140px_1fr_auto]')}>
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
												className={cx(FIELD, 'px-3 py-2')}
											/>
											<input
												value={legendItem.label}
												onChange={(event) =>
													updateRubricLegendItem(legendItem.id, {
														label: event.target.value,
													})
												}
												placeholder={`Meaning for score ${legendIndex + 1}`}
												className={cx(FIELD, 'px-3 py-2')}
											/>
											{rubricLegend.length > 1 ? (
												<button type='button' onClick={() => removeRubricLegendItem(legendItem.id)} className={buttonClassName('admin-remove', 'sm')}>
													Remove
												</button>
											) : null}
										</div>
									))}
								</div>

								<div className='mt-3 flex flex-wrap gap-2'>
									{normalizedRubricLegend.map((legendItem) => (
										<span key={`${legendItem.score}-${legendItem.label}`} className={CHIP_EMERALD}>
											{formatLegendScore(legendItem.score)} - {legendItem.label}
										</span>
									))}
								</div>
							</>
						) : (
							<p className={HELP}>Rubric Legend is disabled. Enable it to customize score meanings for judges.</p>
						)}
					</section>

					<section className={PANEL_SKY}>
						<div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
							<div>
								<h2 className={H2}>Preview Before Publish</h2>
								<p className={cx(HELP, 'mt-1')}>Use preview mode to verify your full event setup, then switch back to edit anytime before publishing.</p>
							</div>
							<button
								type='button'
								onClick={() => {
									setShowPreview((current) => !current)
									setError(null)
								}}
								className={buttonClassName('admin-outline')}>
								{showPreview ? 'Hide Preview' : 'Preview Draft'}
							</button>
						</div>

						{showPreview ? (
							<div className='mt-4 space-y-4'>
								<div className='grid gap-3 sm:grid-cols-3'>
									<div className={BOX_SKY}>
										<p className={EYEBROW}>Event Title</p>
										<p className={cx(VALUE, 'mt-1')}>{title.trim() || 'Untitled Event'}</p>
									</div>
									<div className={BOX_SKY}>
										<p className={EYEBROW}>Created By</p>
										<p className={cx(VALUE, 'mt-1')}>{createdBy.trim() || 'Not provided'}</p>
									</div>
									<div className={BOX_SKY}>
										<p className={EYEBROW}>Scoring Type</p>
										<p className={cx(VALUE, 'mt-1')}>{eventScoringType === 'final-oral-defense' ? 'Final Oral Defense' : 'Standard Scoring'}</p>
									</div>
								</div>

								<div className={BOX_SKY}>
									<p className={EYEBROW}>Description</p>
									<p className={cx(BODY, 'mt-1')}>{description.trim() || 'No description provided.'}</p>
								</div>

								{showRubricLegend && (
									<div className={BOX_SKY}>
										<p className={EYEBROW}>Rubric Legend</p>
										<p className={cx(BODY, 'mt-1')}>{rubricLegendText}</p>
									</div>
								)}

								<div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
									<div className={BOX_SKY}>
										<p className={HELP}>Entries</p>
										<p className={H2}>{contestants.length}</p>
									</div>
									<div className={BOX_SKY}>
										<p className={HELP}>Judges</p>
										<p className={H2}>{judges.length}</p>
									</div>
									<div className={BOX_SKY}>
										<p className={HELP}>Criteria / Subcriteria</p>
										<p className={H2}>
											{criteria.length} / {totalSubCriteria}
										</p>
									</div>
									<div className={BOX_SKY}>
										<p className={HELP}>Event Max Score</p>
										<p className={H2}>{totalEventMaxScore.toFixed(2)}</p>
									</div>
								</div>

								<div className='space-y-4'>
									<div className={cx(TABLE_SHELL, 'overflow-hidden')}>
										<div className={TABLE_CAPTION}>
											<p className={H3}>Entries Matrix</p>
										</div>
										<div className={cx(TABLE_HEAD, 'hidden sm:grid sm:grid-cols-[56px_minmax(180px,1fr)_130px_120px_minmax(220px,1.3fr)] sm:gap-2')}>
											<span>#</span>
											<span>Entry</span>
											<span>Type</span>
											<span>Program</span>
											<span>Participants</span>
										</div>
										<div className={TABLE_DIVIDE}>
											{contestants.map((contestant, index) => {
												const cleanParticipants = contestant.participants.map((participant) => participant.trim()).filter((participant) => participant.length > 0)
												const participantDisplay = contestant.entryType === 'group' && cleanParticipants.length > 0 ? cleanParticipants.join(', ') : '-'

												return (
													<div key={contestant.id} className={cx(TABLE_ROW, 'grid gap-2 sm:grid-cols-[56px_minmax(180px,1fr)_130px_120px_minmax(220px,1.3fr)] sm:items-center')}>
														<p>
															<span className={cx(CELL_LABEL, 'sm:hidden')}># </span>
															{index + 1}
														</p>
														<p>
															<span className={cx(CELL_LABEL, 'sm:hidden')}>Entry: </span>
															{contestant.name.trim() || `Entry ${index + 1}`}
														</p>
														<p>
															<span className={cx(CELL_LABEL, 'sm:hidden')}>Type: </span>
															{contestant.entryType === 'individual' ? 'Individual' : 'Team/Group'}
														</p>
														<p>
															<span className={cx(CELL_LABEL, 'sm:hidden')}>Program: </span>
															{contestant.programTag || '-'}
														</p>
														<p>
															<span className={cx(CELL_LABEL, 'sm:hidden')}>Participants: </span>
															{participantDisplay}
														</p>
													</div>
												)
											})}
										</div>
									</div>

									<div className='grid gap-4 xl:grid-cols-2'>
										<div className={cx(TABLE_SHELL, 'overflow-hidden')}>
											<div className={TABLE_CAPTION}>
												<p className={H3}>Judges Matrix</p>
											</div>
											<div className={cx(TABLE_HEAD, 'hidden sm:grid sm:grid-cols-[56px_minmax(160px,1fr)_minmax(190px,1fr)] sm:gap-2')}>
												<span>#</span>
												<span>Judge</span>
												<span>Email</span>
											</div>
											<div className={TABLE_DIVIDE}>
												{judges.map((judge, index) => (
													<div key={judge.id} className={cx(TABLE_ROW, 'grid gap-2 sm:grid-cols-[56px_minmax(160px,1fr)_minmax(190px,1fr)] sm:items-center')}>
														<p>
															<span className={cx(CELL_LABEL, 'sm:hidden')}># </span>
															{index + 1}
														</p>
														<p>
															<span className={cx(CELL_LABEL, 'sm:hidden')}>Judge: </span>
															{judge.name.trim() || `Judge ${index + 1}`}
														</p>
														<p>
															<span className={cx(CELL_LABEL, 'sm:hidden')}>Email: </span>
															{judge.email.trim() || '-'}
														</p>
													</div>
												))}
											</div>
										</div>

										<div className={cx(TABLE_SHELL, 'overflow-hidden')}>
											<div className={TABLE_CAPTION}>
												<p className={H3}>Slot Assignment Matrix</p>
											</div>
											<div className={cx(TABLE_HEAD, 'hidden sm:grid sm:grid-cols-[minmax(130px,1fr)_minmax(170px,1fr)_minmax(220px,1.2fr)] sm:gap-2')}>
												<span>Slot</span>
												<span>Entry</span>
												<span>Assigned Judges</span>
											</div>
											<div className={TABLE_DIVIDE}>
												{presentationSlots.map((slot, index) => {
													const assignedJudgeNames = slot.judgeIds.map((judgeId) => judgeNameById.get(judgeId) ?? '').filter((judgeName) => judgeName.length > 0)
													const contestant = contestants[index]
													const contestantName = contestant?.name.trim() || `Entry ${index + 1}`

													return (
														<div key={slot.id} className={cx(TABLE_ROW, 'grid gap-2 sm:grid-cols-[minmax(130px,1fr)_minmax(170px,1fr)_minmax(220px,1.2fr)] sm:items-center')}>
															<p>
																<span className={cx(CELL_LABEL, 'sm:hidden')}>Slot: </span>
																{slot.label || `Slot ${index + 1}`}
															</p>
															<p>
																<span className={cx(CELL_LABEL, 'sm:hidden')}>Entry: </span>
																{contestantName}
															</p>
															<p>
																<span className={cx(CELL_LABEL, 'sm:hidden')}>Assigned Judges: </span>
																{assignedJudgeNames.length > 0 ? assignedJudgeNames.join(', ') : 'No judges assigned yet.'}
															</p>
														</div>
													)
												})}
											</div>
										</div>
									</div>

									<div className={cx(TABLE_SHELL, 'overflow-hidden')}>
										<div className={TABLE_CAPTION}>
											<p className={H3}>Criteria Matrix</p>
										</div>
										<div className={cx(TABLE_HEAD, 'hidden sm:grid sm:grid-cols-[56px_minmax(170px,0.8fr)_120px_96px_minmax(230px,1.3fr)] sm:gap-2')}>
											<span>#</span>
											<span>Criterion</span>
											<span>Scope</span>
											<span>Max</span>
											<span>Subcriteria</span>
										</div>
										<div className={TABLE_DIVIDE}>
											{criteria.map((criterion, criterionIndex) => (
												<div key={criterion.id} className={cx(TABLE_ROW, 'grid gap-2 sm:grid-cols-[56px_minmax(170px,0.8fr)_120px_96px_minmax(230px,1.3fr)] sm:items-start')}>
													<p>
														<span className={cx(CELL_LABEL, 'sm:hidden')}># </span>
														{criterionIndex + 1}
													</p>
													<p>
														<span className={cx(CELL_LABEL, 'sm:hidden')}>Criterion: </span>
														{criterion.name.trim() || `Criterion ${criterionIndex + 1}`}
													</p>
													<p>
														<span className={cx(CELL_LABEL, 'sm:hidden')}>Scope: </span>
														{criterion.appliesTo === 'individual' ? 'Per Contestant (Individual)' : 'Group Criteria Only'}
													</p>
													<p>
														<span className={cx(CELL_LABEL, 'sm:hidden')}>Max: </span>
														{criterionMaxScore(criterion).toFixed(2)}
													</p>
													<p>
														<span className={cx(CELL_LABEL, 'sm:hidden')}>Subcriteria: </span>
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

					{error ? <div className={ERROR_BOX}>{error}</div> : null}

					<div className='flex flex-wrap items-center gap-3'>
						<button type='submit' disabled={isSaving} className={buttonClassName('admin-primary')}>
							{isSaving ? 'Publishing Event...' : 'Publish Event and Generate Judge Links'}
						</button>
					</div>
				</form>

				<UnlockDialog
					open={isUnlockOpen}
					reason='Publishing an event needs the update password.'
					onCancel={() => {
						pendingPublishRef.current = null
						setIsUnlockOpen(false)
						setError('The event was not published: the update password is required.')
					}}
					onUnlocked={() => {
						const payload = pendingPublishRef.current
						pendingPublishRef.current = null
						setIsUnlockOpen(false)
						if (payload !== null) void publishEvent(payload)
					}}
				/>

				{created ? (
					<section data-testid='published-event' data-event-id={created.eventId} className={cx(PANEL_SKY, 'mt-8')}>
						<h2 className={H2}>Event Published Successfully</h2>
						<p className={cx(LEDE, 'mt-1')}>Share each judge link privately.</p>

						<div className={cx(BOX_SKY, 'mt-4')}>
							<p className={EYEBROW}>Admin Results Page</p>
							<a href={created.adminUrl} className={cx(LINK, 'mt-1 block')}>
								{created.adminUrl}
							</a>
						</div>

						<div className='mt-4 space-y-3'>
							{created.judgeLinks.map((link) => (
								<div key={link.judgeId} className={BOX_SKY}>
									<div className='mb-2 flex items-center justify-between gap-2'>
										<p className={H3}>{link.judgeName}</p>
										<button type='button' onClick={() => copyLink(link.url)} className={buttonClassName('admin-outline', 'xs')}>
											{copiedValue === link.url ? 'Copied' : 'Copy Link'}
										</button>
									</div>
									<a href={link.url} className={cx(LINK, 'block break-all')}>
										{link.url}
									</a>
								</div>
							))}
						</div>

						<p className={cx(HELP, 'mt-3')}>Generated at {dateDisplay(new Date().toISOString())}</p>
					</section>
				) : null}
			</div>
			<LeaveGuard changed={formChanges.changed} />
		</div>
	)
}
