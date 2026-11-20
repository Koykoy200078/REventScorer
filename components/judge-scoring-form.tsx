'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { JudgeBatchRail } from '@/components/judge/batch-rail'
import { ContestantPicker } from '@/components/judge/contestant-picker'
import { DirectRatingPanel } from '@/components/judge/direct-rating-panel'
import { ExamineeRoster, type ExamineeFigures } from '@/components/judge/examinee-roster'
import { GroupSection } from '@/components/judge/group-section'
import { IndividualSection } from '@/components/judge/individual-section'
import { ContextStripGroup, ContextStripIndividual, JudgeMeta, UnifiedContext } from '@/components/judge/judge-context'
import { JudgeDock, PreviewLine, PreviewValue, type DockNav } from '@/components/judge/judge-dock'
import { JudgeHeader } from '@/components/judge/judge-header'
import { JudgeNotices } from '@/components/judge/notices'
import { RemarksSection } from '@/components/judge/remarks'
import { ViewSwitcher } from '@/components/judge/view-switcher'
import { formatScore } from '@/components/ui/preset-rail'
import { ProgressRing } from '@/components/ui/progress-bar'
import { DockSpacer, DockStatus, DockSum, DockTerm, DockTotal, type DockVariant } from '@/components/ui/sticky-dock'
import { TabPanel, Tabs } from '@/components/ui/tabs'

import { deriveDirectRatingConfigFromCriteria, detectDirectRatingScoreFields, normalizeDirectRatingConfig } from '@/lib/direct-rating-config'
import { baselineAfterSave, browserDraftStorage, DRAFT_WRITE_DELAY_MS, draftToKeep, formFollowsSave, hasUnsavedChanges, initialBaselines, ownDraftToKeep, queuedRowToShow, queuedSaveBaseline, restoredDetails, restoredRow, savedFormRow, storedDraftToKeep, summarizeDraftStatus, writePendingDrafts } from '@/lib/judge/draft-state'
import type { ContestantBaseline, DraftOutcome, DraftStatus, QueuedSave } from '@/lib/judge/draft-state'
import { clearContestantDraft, loadDraft, readContestantDraft, saveContestantDraft } from '@/lib/judge/draft-store'
import type { ContestantDraft } from '@/lib/judge/draft-store'
import { migrateLegacyDirectRating } from '@/lib/judge/legacy-direct'
import { buildInputContestantDetails, buildInputMatrix, detectInitiallyScoredContestants, hasPositiveDraftScore } from '@/lib/judge/matrix'
import type { InputContestantDetailsMap, InputScoreMatrix } from '@/lib/judge/matrix'
import { buildContestantRow, buildSaveRequest, buildScorePayload } from '@/lib/judge/payload'
import { batchFillRow, batchScope, countEntered, resetConfirmText, resetRow } from '@/lib/judge/presets'
import type { BatchPercent } from '@/lib/judge/presets'
import { normalizeScoreInput } from '@/lib/judge/score-input'
import { AUTO_SYNC_INTERVAL_MS, isServerUnreachableScoreUploadError, listQueuedScoreUploadsForToken, queuedScoreUploadId, removeQueuedScoreUpload, shouldQueueScoreUpload, SubmitScoresError, upsertQueuedScoreUpload } from '@/lib/judge/score-queue'
import type { QueuedScoreUpload, SubmitScoresRequestBody, SubmitScoresResponseBody } from '@/lib/judge/score-queue'
import { browserStepMismatch, firstStepMismatch, stepCheckOrder } from '@/lib/judge/step-check'
import { advanceTarget, cellTotals, enteredCount, memberStatus, percentOf, rosterStatus, saveButtonLabel } from '@/lib/judge/status'
import type { MemberStatus, RosterStatus } from '@/lib/judge/status'
import { directFormulaWeights, dockMode, formulaSentence, previewDetails, previewKind, previewScore, splitGroupBlocks } from '@/lib/judge/summary'
import { autoResolveStrand, isTVLAcademicTrack } from '@/lib/judge/strand'
import { formatRubricLegend, normalizeRubricLegend } from '@/lib/rubric-legend'
import { contestantCells, resolveJudgeLayout, resolveView, revealTarget, selectedExaminee, visibleCells, withViewParam } from '@/lib/judge/layout'
import type { JudgeView } from '@/lib/judge/layout'
import type { DirectRatingConfig, EventContestant, EventCriterion, EventPresentationSlot, EventScoringType, JudgeContestantDetailsMap, JudgeProfile, RubricLegendItem, ScoreMatrix } from '@/lib/types'

interface JudgeScoringFormProps {
	token: string
	eventTitle: string
	contestants: EventContestant[]
	criteria: EventCriterion[]
	judge: JudgeProfile
	rubricLegend?: RubricLegendItem[]
	directRatingConfig?: DirectRatingConfig
	presentationSlots?: EventPresentationSlot[]
	existingScores?: ScoreMatrix
	existingSavedContestantIds?: string[]
	existingContestantDetails?: JudgeContestantDetailsMap
	submittedAt?: string
	initialContestantId?: string
	adminEditMode?: boolean
	/** Stage 5 Task 5: the event's own scoring type and description, and the view from ?view=. */
	eventScoringType?: EventScoringType
	eventDescription?: string
	initialView?: JudgeView | null
}

const BODY_INNER = {
	unified: 'w-full max-w-5xl mx-auto py-space-xl flex flex-col gap-space-xl',
	group: 'w-full max-w-5xl mx-auto py-space-xl flex flex-col gap-space-lg',
	individual: 'w-full max-w-5xl mx-auto py-space-lg flex flex-col gap-space-lg',
	direct: 'w-full max-w-5xl mx-auto py-space-lg flex flex-col gap-space-lg',
} as const

export function JudgeScoringForm({ token, eventTitle, eventDescription, eventScoringType, initialView, contestants, criteria: rawCriteria, judge, rubricLegend, directRatingConfig, presentationSlots, existingScores: rawExistingScores, existingSavedContestantIds, existingContestantDetails, submittedAt, initialContestantId, adminEditMode = false }: JudgeScoringFormProps) {
	const topRef = useRef<HTMLDivElement>(null)
	const autoSyncInProgressRef = useRef(false)
	const { criteria, scores: existingScores } = useMemo(() => migrateLegacyDirectRating(rawCriteria, rawExistingScores, directRatingConfig), [rawCriteria, rawExistingScores, directRatingConfig])
	
	const [scores, setScores] = useState<InputScoreMatrix>(() => {
		const matrix = buildInputMatrix(contestants, criteria, existingScores)
		const derivedConfig = deriveDirectRatingConfigFromCriteria(criteria)
		const normalizedConfig = normalizeDirectRatingConfig(directRatingConfig, derivedConfig ?? undefined)
		const directFields = detectDirectRatingScoreFields(criteria, normalizedConfig)
		const noatField = directFields.find((f) => f.key === 'noat')

		if (noatField) {
			for (const contestant of contestants) {
				if (typeof contestant.noatScore === 'number' && Number.isFinite(contestant.noatScore)) {
					if (!matrix[contestant.id]) matrix[contestant.id] = {}
					matrix[contestant.id][noatField.subCriterionId] = contestant.noatScore.toString()
				}
			}
		}

		return matrix
	})
	const [contestantDetails, setContestantDetails] = useState<InputContestantDetailsMap>(() => buildInputContestantDetails(contestants, existingContestantDetails))
	const [savedContestantIds, setSavedContestantIds] = useState<Set<string>>(() => detectInitiallyScoredContestants(contestants, criteria, existingScores, existingSavedContestantIds))
	const [activeContestantIndex, setActiveContestantIndex] = useState(() => {
		if (!initialContestantId) {
			return 0
		}

		const targetIndex = contestants.findIndex((contestant) => contestant.id === initialContestantId)
		return targetIndex >= 0 ? targetIndex : 0
	})
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [successMessage, setSuccessMessage] = useState<string | null>(null)
	const [lastSubmittedAt, setLastSubmittedAt] = useState<string | undefined>(submittedAt)
	const [queuedUploads, setQueuedUploads] = useState<QueuedScoreUpload[]>([])
	const [isAutoSyncing, setIsAutoSyncing] = useState(false)
	// D30: unsaved scores are kept on this device as a draft per contestant (lib/judge/draft-state.ts
	// and draft-store.ts). The baselines are the saved rows as last known from the server; a
	// contestant the judge changed (or whose draft was restored) is unsaved while it differs.
	const [draftStatus, setDraftStatus] = useState<DraftStatus>('none')
	const [loadedBaselines] = useState(() => initialBaselines(contestants, existingScores, buildInputContestantDetails(contestants, existingContestantDetails)))
	const baselinesRef = useRef<Record<string, ContestantBaseline>>(loadedBaselines)
	const latestStateRef = useRef({ scores, contestantDetails, queuedCount: 0 })
	const touchedContestantIdsRef = useRef(new Set<string>())
	const pendingDraftIdsRef = useRef(new Set<string>())
	const draftOutcomesRef = useRef(new Map<string, DraftOutcome>())
	const draftTimerRef = useRef<number | null>(null)
	const draftsRestoredRef = useRef(false)
	// Review P2: for a contestant whose baseline came from this page's upload of a queued save, that
	// save's queue time, until a save confirmed straight away sets the baseline instead. Another tab's
	// draft of the contestant is kept only if it follows that very save (lib/judge/draft-state.ts
	// storedDraftToKeep): once uploaded, the save is no longer in the queue to tell it by.
	const uploadedQueuedAtRef = useRef(new Map<string, string>())
	// Review of the D30 fixes (other tabs of the judge link, or the admin edit tab, on one device):
	// when each contestant's form row last took a value here (the judge's change, this page's own
	// queued save, or the draft or queued row restored into it), and the latest queued save of it this
	// page saw (kept after it leaves the queue, until a save confirmed straight away). A save queued
	// later elsewhere is newer than the form: the form writes no draft over it and yields to it once
	// this page uploads it (lib/judge/draft-state.ts ownDraftToKeep, formFollowsSave); drafts of later
	// changes name that save (also after another tab uploaded it unbeknown to this page).
	const formSinceRef = useRef(new Map<string, number>())
	const seenSaveRef = useRef(new Map<string, QueuedSave>())
	// Admin edit mode (?fromAdmin=1) keeps its drafts apart from the judge's own, so on a shared
	// device neither brings back the other's unsaved changes.
	const draftToken = adminEditMode ? `${token}:admin` : token
	// The event's own cells (before the legacy migration): only these tell whether a kept draft
	// is stale (lib/judge/draft-store.ts loadDraft).
	const rawSubCriterionIds = useMemo(() => new Set(rawCriteria.flatMap((criterion) => criterion.subCriteria.map((subCriterion) => subCriterion.id))), [rawCriteria])
	const activeContestant = contestants[activeContestantIndex]
	const activeContestantId = activeContestant?.id ?? ''
	const normalizedLegend = useMemo(() => normalizeRubricLegend(rubricLegend), [rubricLegend])
	const rubricLegendText = useMemo(() => formatRubricLegend(normalizedLegend), [normalizedLegend])
	const resolvedDirectRatingConfig = useMemo(() => {
		const derivedConfig = deriveDirectRatingConfigFromCriteria(criteria)
		return normalizeDirectRatingConfig(directRatingConfig, derivedConfig ?? undefined)
	}, [criteria, directRatingConfig])
	const directScoreFields = useMemo(() => detectDirectRatingScoreFields(criteria, resolvedDirectRatingConfig), [criteria, resolvedDirectRatingConfig])
	const directNoatField = useMemo(() => directScoreFields.find((field) => field.key === 'noat') ?? null, [directScoreFields])
	const noatScoreByContestantId = useMemo(() => {
		if (!directNoatField) {
			return new Map<string, number>()
		}

		const entries = new Map<string, number>()
		for (const contestant of contestants) {
			if (typeof contestant.noatScore === 'number' && Number.isFinite(contestant.noatScore)) {
				entries.set(contestant.id, contestant.noatScore)
			}
		}

		return entries
	}, [contestants, directNoatField])

	const slotLabelsByContestant = useMemo(() => {
		const labels = new Map<string, string>()
		if (!presentationSlots) {
			return labels
		}

		for (const slot of presentationSlots) {
			labels.set(slot.contestantId, slot.label)
		}

		return labels
	}, [presentationSlots])

	const activeSlotLabel = activeContestantId ? slotLabelsByContestant.get(activeContestantId) : undefined
	const draftScoredContestantIds = useMemo(() => {
		const ids = contestants
			.filter((contestant) => {
				if (!directNoatField || !noatScoreByContestantId.has(contestant.id)) {
					return hasPositiveDraftScore(scores, contestant.id, criteria)
				}

				return hasPositiveDraftScore(scores, contestant.id, criteria, new Set([directNoatField.subCriterionId]))
			})
			.map((contestant) => contestant.id)
		return new Set(ids)
	}, [contestants, criteria, directNoatField, noatScoreByContestantId, scores])
	const queuedContestantIds = useMemo(() => new Set(queuedUploads.map((entry) => entry.contestantId)), [queuedUploads])

	useEffect(() => {
		if (!directNoatField || noatScoreByContestantId.size === 0) {
			return
		}

		setScores((previous) => {
			let hasChange = false
			const nextScores: InputScoreMatrix = { ...previous }
			for (const [contestantId, noatScore] of noatScoreByContestantId) {
				const normalizedValue = normalizeScoreInput(String(noatScore), directNoatField.maxScore)
				const existingValue = previous[contestantId]?.[directNoatField.subCriterionId]
				if (existingValue === normalizedValue) {
					continue
				}

				hasChange = true
				const contestantScores = { ...(nextScores[contestantId] ?? {}) }
				contestantScores[directNoatField.subCriterionId] = normalizedValue
				nextScores[contestantId] = contestantScores
			}

			return hasChange ? nextScores : previous
		})
	}, [directNoatField, noatScoreByContestantId])




	const contestantsById = useMemo(() => new Map(contestants.map((contestant) => [contestant.id, contestant])), [contestants])
	const lockedSubCriterionIds = useCallback((contestantId: string): ReadonlySet<string> => (directNoatField && noatScoreByContestantId.has(contestantId) ? new Set([directNoatField.subCriterionId]) : new Set<string>()), [directNoatField, noatScoreByContestantId])

	// D30: whether a contestant has unsaved changes. Only a contestant the judge changed (or whose
	// draft was restored) can have them. It reads the latest committed state (latestStateRef), so
	// it also answers from timers and page events.
	const isUnsaved = useCallback(
		(contestantId: string): boolean => {
			const contestant = contestantsById.get(contestantId)
			if (!contestant || !touchedContestantIdsRef.current.has(contestantId)) return false
			const latest = latestStateRef.current
			return hasUnsavedChanges(criteria, contestant, latest.scores[contestantId], latest.contestantDetails[contestantId], baselinesRef.current[contestantId], lockedSubCriterionIds(contestantId))
		},
		[contestantsById, criteria, lockedSubCriterionIds],
	)

	// D30: writes the draft of every contestant changed since the last write, or clears it when the
	// contestant holds nothing unsaved any more (lib/judge/draft-state.ts draftToKeep: a save still
	// queued for it counts too). A full or blocked storage never stops scoring: the draft status says
	// so (Task 5's "Draft kept on this device" label) and the leave-page warning stays. Review F3: the
	// contestant stays pending, so the next flush writes it again (the next change, the page hidden or
	// unloading, a sync that freed space), and the older stored draft stays meanwhile, as the best
	// copy this device has (lib/judge/draft-state.ts writePendingDrafts). A contestant this tab never
	// changed can still have a draft on this device, from another tab of the same judge link: it is
	// rebased onto the new baseline only while it is current against it and the save still queued
	// (or just uploaded), and cleared otherwise, never rebased into a draft a later load would trust
	// (review P1/P2: lib/judge/draft-state.ts storedDraftToKeep). A contestant this tab changed is
	// written only while its form follows the save of it still queued, or the latest one this page saw
	// (that save is named in the draft, also after it left the queue); a form older than a save queued
	// in another tab writes nothing over it (lib/judge/draft-state.ts ownDraftToKeep).
	const flushDraftWrites = useCallback(() => {
		if (draftTimerRef.current !== null) {
			window.clearTimeout(draftTimerRef.current)
			draftTimerRef.current = null
		}
		if (pendingDraftIdsRef.current.size === 0) return

		const storage = browserDraftStorage()
		const latest = latestStateRef.current
		const queue = listQueuedScoreUploadsForToken(token)
		const report = writePendingDrafts(
			storage,
			draftToken,
			{ pending: pendingDraftIdsRef.current, outcomes: draftOutcomesRef.current },
			(contestantId) => {
				const contestant = contestantsById.get(contestantId)
				const baseline = baselinesRef.current[contestantId]
				const queued = queuedSaveBaseline(rawCriteria, directRatingConfig, contestantId, queue, baseline)
				const locked = lockedSubCriterionIds(contestantId)
				if (queued) seenSaveRef.current.set(contestantId, queued)

				if (!touchedContestantIdsRef.current.has(contestantId)) {
					const stored = storage ? readContestantDraft(storage, draftToken, contestantId) : null
					if (!stored) return null
					return { draft: contestant ? storedDraftToKeep(criteria, contestant, stored, baseline, queued, uploadedQueuedAtRef.current.get(contestantId), locked, rawSubCriterionIds) : null, own: false }
				}
				if (!contestant) return { draft: null, own: true }
				return ownDraftToKeep(criteria, contestant, { values: latest.scores[contestantId] ?? {}, details: latest.contestantDetails[contestantId] }, formSinceRef.current.get(contestantId), baseline, queued, seenSaveRef.current.get(contestantId), locked)
			},
			new Date(),
		)
		// A contestant whose draft is cleared holds nothing unsaved; one whose clear failed stays this
		// page's until a retry clears it.
		for (const contestantId of report.cleared) touchedContestantIdsRef.current.delete(contestantId)
		for (const { error } of report.failed) console.warn(`Unsaved scores could not be kept on this device (${error}).`)
		setDraftStatus(summarizeDraftStatus(draftOutcomesRef.current))
	}, [contestantsById, criteria, directRatingConfig, draftToken, lockedSubCriterionIds, rawCriteria, rawSubCriterionIds, token])

	const scheduleDraftWrite = useCallback(() => {
		if (draftTimerRef.current !== null) window.clearTimeout(draftTimerRef.current)
		draftTimerRef.current = window.setTimeout(flushDraftWrites, DRAFT_WRITE_DELAY_MS)
	}, [flushDraftWrites])

	// A change the judge made (never the NOAT prefill or the strand and remark auto-fill).
	const noteJudgeChange = useCallback(
		(contestantId: string): void => {
			touchedContestantIdsRef.current.add(contestantId)
			formSinceRef.current.set(contestantId, Date.now())
			pendingDraftIdsRef.current.add(contestantId)
			scheduleDraftWrite()
		},
		[scheduleDraftWrite],
	)

	// D30: the server confirmed a save of this contestant (a direct save, or a queued one uploaded:
	// then with its queue time). Its row becomes the baseline; then its draft is cleared, or kept
	// against the new baseline when the judge changed it again since. An upload is re-checked on the
	// next write, so a draft being restored at the same moment has reached the form first. Review of
	// the D30 fixes: an uploaded save queued after this page's form of the contestant last took a value
	// (in another tab of the judge link, or the admin edit tab) is newer than the form, so the form
	// yields to it: it shows the uploaded row, and the contestant is settled like one this page never
	// changed (its draft here is cleared, or kept only if it follows that save).
	const confirmSavedScores = useCallback(
		(contestantId: string, payload: SubmitScoresRequestBody, writeNow: boolean, uploadedQueuedAt?: string) => {
			const baseline = baselineAfterSave(rawCriteria, directRatingConfig, contestantId, payload, baselinesRef.current[contestantId])
			// The route keeps the sent details, or the old ones when none were sent (B45).
			const sentDetails = payload.contestantDetails?.[contestantId]
			if (sentDetails) setStoredDetails((previous) => ({ ...previous, [contestantId]: sentDetails }))
			baselinesRef.current = { ...baselinesRef.current, [contestantId]: baseline }
			if (uploadedQueuedAt === undefined) {
				uploadedQueuedAtRef.current.delete(contestantId)
				seenSaveRef.current.delete(contestantId)
			} else {
				uploadedQueuedAtRef.current.set(contestantId, uploadedQueuedAt)
				seenSaveRef.current.set(contestantId, { ...baseline, queuedAt: uploadedQueuedAt })
				if (touchedContestantIdsRef.current.has(contestantId) && !formFollowsSave(formSinceRef.current.get(contestantId), uploadedQueuedAt)) {
					const row = savedFormRow(criteria, baseline)
					setScores((previous) => ({ ...previous, [contestantId]: restoredRow(criteria, previous[contestantId], row.values, lockedSubCriterionIds(contestantId)) }))
					setContestantDetails((previous) => ({ ...previous, [contestantId]: restoredDetails(previous[contestantId], row.details) }))
					touchedContestantIdsRef.current.delete(contestantId)
					draftOutcomesRef.current.delete(contestantId)
					formSinceRef.current.set(contestantId, Date.parse(uploadedQueuedAt))
					setDraftStatus(summarizeDraftStatus(draftOutcomesRef.current))
				}
			}
			pendingDraftIdsRef.current.add(contestantId)
			if (writeNow) flushDraftWrites()
			else scheduleDraftWrite()
		},
		[criteria, directRatingConfig, flushDraftWrites, lockedSubCriterionIds, rawCriteria, scheduleDraftWrite],
	)

	function updateScore(contestantId: string, subCriterionId: string, value: string, maxScore: number): void {
		const normalizedValue = normalizeScoreInput(value, maxScore)

		setScores((previous) => ({
			...previous,
			[contestantId]: {
				...(previous[contestantId] ?? {}),
				[subCriterionId]: normalizedValue,
			},
		}))
		noteJudgeChange(contestantId)
	}

	function updateContestantDetailsField(contestantId: string, field: 'strand' | 'remark' | 'additionalInfo', value: string): void {
		setContestantDetails((previous) => ({
			...previous,
			[contestantId]: {
				...(previous[contestantId] ?? { strand: '', remark: '', additionalInfo: '' }),
				[field]: value,
			},
		}))
		noteJudgeChange(contestantId)
	}

	const goToContestantRef = useRef<(index: number) => void>(() => {})
	useEffect(() => {
		goToContestantRef.current = goToContestant
	})

	function goToContestant(index: number): void {
		setActiveContestantIndex(Math.max(0, Math.min(index, contestants.length - 1)))
		setError(null)
		setSuccessMessage(null)
	}

	function scrollToTopAfterSubmit(): void {
		window.requestAnimationFrame(() => {
			topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
		})
	}

	const refreshQueuedUploads = useCallback(() => {
		setQueuedUploads(listQueuedScoreUploadsForToken(token))
	}, [token])

	// What this device kept for the judge link, read after mount (never during render, so hydration
	// sees the server's values): the queued saves, then, once, the drafts loadDraft still trusts
	// (it drops a draft whose contestant was saved since it began, unless the save still queued for
	// it here replaces that row: review F2). Each is checked again first: one that holds nothing
	// unsaved any more (the same values saved elsewhere, changes only in deleted cells) is cleared,
	// the others are rewritten against today's baseline and queue, so a later reload judges them by
	// the row the server holds now. A contestant with a queued save but no such draft shows the
	// queued row while it differs from the server's (lib/judge/draft-state.ts queuedRowToShow), and
	// a draft of it is written. A restored contestant is unsaved again.
	const restoreDeviceState = useCallback(() => {
		refreshQueuedUploads()
		if (draftsRestoredRef.current) return
		draftsRestoredRef.current = true
		const storage = browserDraftStorage()
		const queue = listQueuedScoreUploadsForToken(token)
		const queuedBaselines = new Map<string, QueuedSave>()
		for (const { contestantId } of queue) {
			const queued = queuedSaveBaseline(rawCriteria, directRatingConfig, contestantId, queue, baselinesRef.current[contestantId])
			if (!queued) continue
			queuedBaselines.set(contestantId, queued)
			seenSaveRef.current.set(contestantId, queued)
		}

		const restored = new Map<string, Pick<ContestantDraft, 'values' | 'details'>>()
		if (storage) {
			const queuedRows = Object.fromEntries([...queuedBaselines].map(([contestantId, queued]) => [contestantId, { row: queued.scores, queuedAt: queued.queuedAt }]))
			for (const [contestantId, draft] of Object.entries(loadDraft(storage, draftToken, existingScores, rawSubCriterionIds, queuedRows))) {
				const contestant = contestantsById.get(contestantId)
				if (!contestant) continue
				const rebased = draftToKeep(criteria, contestant, draft, baselinesRef.current[contestantId], queuedBaselines.get(contestantId), lockedSubCriterionIds(contestantId))
				if (!rebased) {
					clearContestantDraft(storage, draftToken, contestantId)
					continue
				}
				// A failed rewrite leaves the draft as loadDraft trusted it, and is tried again on the next write.
				if (!saveContestantDraft(storage, draftToken, contestantId, rebased, new Date()).ok) pendingDraftIdsRef.current.add(contestantId)
				restored.set(contestantId, draft)
				draftOutcomesRef.current.set(contestantId, 'kept')
				// The form takes the draft as it was written (a draft kept while a save is queued was
				// written after that save).
				const queuedAt = queuedBaselines.get(contestantId)?.queuedAt
				formSinceRef.current.set(contestantId, Math.max(Date.parse(draft.updatedAt) || 0, queuedAt === undefined ? 0 : Date.parse(queuedAt) || 0))
			}
		}
		for (const [contestantId, queued] of queuedBaselines) {
			const contestant = contestantsById.get(contestantId)
			if (!contestant || restored.has(contestantId)) continue
			const row = queuedRowToShow(criteria, contestant, queue, baselinesRef.current[contestantId], lockedSubCriterionIds(contestantId))
			if (!row) continue
			restored.set(contestantId, row)
			pendingDraftIdsRef.current.add(contestantId)
			formSinceRef.current.set(contestantId, Date.parse(queued.queuedAt))
		}
		if (restored.size === 0) return

		setScores((previous) => {
			const next = { ...previous }
			for (const [contestantId, draft] of restored) next[contestantId] = restoredRow(criteria, previous[contestantId], draft.values, lockedSubCriterionIds(contestantId))
			return next
		})
		setContestantDetails((previous) => {
			const next = { ...previous }
			for (const [contestantId, draft] of restored) next[contestantId] = restoredDetails(previous[contestantId], draft.details)
			return next
		})
		for (const contestantId of restored.keys()) touchedContestantIdsRef.current.add(contestantId)
		setDraftStatus(summarizeDraftStatus(draftOutcomesRef.current))
		// After the restored rows reached the form (the write reads them from latestStateRef).
		if (pendingDraftIdsRef.current.size > 0) scheduleDraftWrite()
	}, [contestantsById, criteria, directRatingConfig, draftToken, existingScores, lockedSubCriterionIds, rawCriteria, rawSubCriterionIds, refreshQueuedUploads, scheduleDraftWrite, token])

	const markContestantsAsSaved = useCallback((contestantIds: string[]) => {
		if (contestantIds.length === 0) {
			return
		}

		setSavedContestantIds((previous) => {
			const next = new Set(previous)
			for (const contestantId of contestantIds) {
				next.add(contestantId)
			}
			return next
		})
	}, [])

	const submitPayload = useCallback(
		async (payload: SubmitScoresRequestBody): Promise<SubmitScoresResponseBody> => {
			const response = await fetch(`/api/eventscorer/judge/${token}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})

			let responseBody: SubmitScoresResponseBody = {}
			try {
				responseBody = (await response.json()) as SubmitScoresResponseBody
			} catch {
				responseBody = {}
			}

			if (!response.ok) {
				throw new SubmitScoresError(responseBody.error ?? 'Unable to submit scores.', response.status)
			}

			return responseBody
		},
		[token],
	)

	const syncQueuedUploads = useCallback(
		async (showSuccessMessage = false): Promise<void> => {
			if (autoSyncInProgressRef.current) {
				return
			}

			if (typeof navigator !== 'undefined' && !navigator.onLine) {
				return
			}

			const pendingUploads = listQueuedScoreUploadsForToken(token)
			if (pendingUploads.length === 0) {
				setQueuedUploads([])
				return
			}

			autoSyncInProgressRef.current = true
			setIsAutoSyncing(true)

			const syncedContestantIds: string[] = []
			let syncedCount = 0
			let removedCount = 0
			let latestSubmittedAtValue: string | undefined
			let permanentErrorMessage: string | null = null

			try {
				for (const pendingUpload of pendingUploads) {
					try {
						const responseBody = await submitPayload(pendingUpload.payload)
						removeQueuedScoreUpload(pendingUpload.id)
						removedCount += 1
						confirmSavedScores(pendingUpload.contestantId, pendingUpload.payload, false, pendingUpload.queuedAt)
						syncedContestantIds.push(pendingUpload.contestantId)
						syncedCount += 1

						if (responseBody.submittedAt) {
							latestSubmittedAtValue = responseBody.submittedAt
						}
					} catch (syncError) {
						if (syncError instanceof SubmitScoresError && typeof syncError.status === 'number' && syncError.status >= 400 && syncError.status < 500) {
							removeQueuedScoreUpload(pendingUpload.id)
							removedCount += 1

							if (!permanentErrorMessage) {
								permanentErrorMessage = `Auto-upload skipped ${pendingUpload.contestantName}: ${syncError.message}`
							}

							continue
						}

						break
					}
				}
			} finally {
				refreshQueuedUploads()
				setIsAutoSyncing(false)
				autoSyncInProgressRef.current = false
				// Review F3: the uploads freed space on this device, so draft writes it refused are tried again.
				if (removedCount > 0 && pendingDraftIdsRef.current.size > 0) scheduleDraftWrite()
			}

			if (syncedContestantIds.length > 0) {
				markContestantsAsSaved(syncedContestantIds)
			}

			if (latestSubmittedAtValue) {
				setLastSubmittedAt(latestSubmittedAtValue)
			}

			if (showSuccessMessage && syncedCount > 0) {
				setError(null)
				setSuccessMessage(`Auto-uploaded ${syncedCount} pending ${syncedCount === 1 ? 'entry' : 'entries'}.`)
			} else if (permanentErrorMessage) {
				setError(permanentErrorMessage)
			}
		},
		[confirmSavedScores, markContestantsAsSaved, refreshQueuedUploads, scheduleDraftWrite, submitPayload, token],
	)

	useEffect(() => {
		restoreDeviceState()
		void syncQueuedUploads(false)
	}, [restoreDeviceState, syncQueuedUploads])

	useEffect(() => {
		latestStateRef.current = { scores, contestantDetails, queuedCount: queuedUploads.length }
	}, [contestantDetails, queuedUploads.length, scores])

	// D30 (and B12's duplicate): the form's one leave-page warning, registered once. It asks while
	// saves are queued or a contestant has unsaved changes, and not otherwise.
	useEffect(() => {
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			const anyUnsaved = [...touchedContestantIdsRef.current].some((contestantId) => isUnsaved(contestantId))
			if (latestStateRef.current.queuedCount === 0 && !anyUnsaved) return
			e.preventDefault()
			e.returnValue = ''
		}

		window.addEventListener('beforeunload', handleBeforeUnload)
		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload)
		}
	}, [isUnsaved])

	// D30: what the write delay has not written yet is written when the page is hidden or unloads.
	useEffect(() => {
		const handlePageHide = () => {
			flushDraftWrites()
		}
		const handleVisibilityChange = () => {
			if (document.visibilityState === 'hidden') flushDraftWrites()
		}

		window.addEventListener('pagehide', handlePageHide)
		document.addEventListener('visibilitychange', handleVisibilityChange)
		return () => {
			window.removeEventListener('pagehide', handlePageHide)
			document.removeEventListener('visibilitychange', handleVisibilityChange)
		}
	}, [flushDraftWrites])

	// Auto-fill strand and additional remark from contestant data when switching contestants
	useEffect(() => {
		const laptopAvailable = activeContestant?.laptopAvailable
		const academicTrack = activeContestant?.academicTrack
		if (!activeContestantId) return
		
		setContestantDetails((previous) => {
			const current = previous[activeContestantId] || { strand: '', remark: '', additionalInfo: '' }
			let hasChanges = false
			const next = { ...current }

			if (!current.additionalInfo && laptopAvailable) {
				next.additionalInfo = laptopAvailable
				hasChanges = true
			}

			if (!current.strand && academicTrack && !isTVLAcademicTrack(academicTrack)) {
				const resolvedStrand = autoResolveStrand(academicTrack)
				if (resolvedStrand) {
					next.strand = resolvedStrand
					hasChanges = true
				}
			}

			return hasChanges ? {
				...previous,
				[activeContestantId]: next,
			} : previous
		})
	}, [activeContestantId]) // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		const handleOnline = () => {
			void syncQueuedUploads(true)
		}

		window.addEventListener('online', handleOnline)
		return () => {
			window.removeEventListener('online', handleOnline)
		}
	}, [syncQueuedUploads])

	useEffect(() => {
		if (queuedUploads.length === 0) {
			return
		}

		const intervalId = window.setInterval(() => {
			void syncQueuedUploads(false)
		}, AUTO_SYNC_INTERVAL_MS)

		return () => {
			window.clearInterval(intervalId)
		}
	}, [queuedUploads.length, syncQueuedUploads])

	async function submitScores(event: React.FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()
		if (!activeContestant) {
			setError('No contestant is selected.')
			return
		}

		// The browser checks the cells on screen; this checks the active entry's other cells the same
		// way, shows the first one that would fail and stops before the confirm (no POST).
		const bad = firstStepMismatch(stepCheckOrder(cells, layout, directFieldIds), scores[activeContestant.id] ?? {}, lockedSubCriterionIds(activeContestant.id), (raw, id) => browserStepMismatch(raw, maxBySubId.get(id) ?? 0))
		if (bad) {
			const target = revealTarget(cells, layout, view, bad)
			if (target.view) setView(target.view)
			if (target.memberLabel) setExamineeChoice({ contestantId: activeContestant.id, memberLabel: target.memberLabel })
			setReveal((previous) => ({ subId: bad, n: (previous?.n ?? 0) + 1 }))
			return
		}

		const isResubmission = savedContestantIds.has(activeContestant.id)
		const confirmationMessage = isResubmission ? `Resubmit scores for ${activeContestant.name}? This will overwrite your previously saved scores for this entry.` : `Submit scores for ${activeContestant.name}?`

		if (!window.confirm(confirmationMessage)) {
			return
		}

		setIsSaving(true)
		setError(null)
		setSuccessMessage(null)

		const payload = buildScorePayload(contestants, criteria, rawCriteria, scores)
		const requestPayload: SubmitScoresRequestBody = buildSaveRequest(activeContestant.id, payload, contestantDetails)
		const currentName = activeContestant.name
		const nextIndex = advanceTarget(activeContestantIndex, contestants.length, adminEditMode)

		try {
			const responseBody = await submitPayload(requestPayload)
			removeQueuedScoreUpload(queuedScoreUploadId(token, activeContestant.id))
			confirmSavedScores(activeContestant.id, requestPayload, true)
			refreshQueuedUploads()

			if (responseBody.submittedAt) {
				setLastSubmittedAt(responseBody.submittedAt)
			}

			markContestantsAsSaved([activeContestant.id])

			if (adminEditMode) {
				setSuccessMessage(`Saved scores for ${currentName}. Continue editing this participant or switch entries.`)
			} else if (nextIndex !== null) {
				setActiveContestantIndex(nextIndex)
				setSuccessMessage(`Saved scores for ${currentName}. Continue with ${contestants[nextIndex].name}.`)
			} else {
				setSuccessMessage(`Saved scores for ${currentName}. You can still review entries and resubmit if needed.`)
			}

			scrollToTopAfterSubmit()
		} catch (submitError) {
			if (shouldQueueScoreUpload(submitError)) {
				const serverUnreachable = isServerUnreachableScoreUploadError(submitError)
				const retryLabel = serverUnreachable ? 'the server is reachable' : 'internet is available'

				const queuedAt = new Date().toISOString()
				try {
					upsertQueuedScoreUpload({
						id: queuedScoreUploadId(token, activeContestant.id),
						token,
						contestantId: activeContestant.id,
						contestantName: activeContestant.name,
						payload: requestPayload,
						queuedAt,
					})
				} catch {
					// Neither uploaded nor kept on this device (its storage is full or blocked): the judge
					// is told and stays on the contestant, whose scores stay unsaved (the leave-page
					// warning holds).
					setError(`This save could not be kept on this device. Keep this page open and save again when ${retryLabel}.`)
					return
				}
				refreshQueuedUploads()
				// D30: the draft also remembers the row this queued save leaves once it uploads, and the
				// form follows this save (it took the saved values when it was queued).
				formSinceRef.current.set(activeContestant.id, Date.parse(queuedAt))
				pendingDraftIdsRef.current.add(activeContestant.id)
				flushDraftWrites()
				setError(null)

				if (adminEditMode) {
					setSuccessMessage(`Saved locally for ${currentName}. It will auto-upload when ${retryLabel}.`)
				} else if (nextIndex !== null) {
					setActiveContestantIndex(nextIndex)
					setSuccessMessage(`Saved locally for ${currentName}. It will auto-upload when ${retryLabel}. Continue with ${contestants[nextIndex].name}.`)
				} else {
					setSuccessMessage(`Saved locally for ${currentName}. It will auto-upload when ${retryLabel}.`)
				}

				scrollToTopAfterSubmit()
				void syncQueuedUploads(false)
			} else {
				setError(submitError instanceof Error ? submitError.message : 'Unable to submit scores.')
			}
		} finally {
			setIsSaving(false)
		}
	}

	// Stage 5 Task 5 Step 6: the shell. Every hook below runs before the empty-roster return and is
	// safe without an active contestant.
	const [pickerOpen, setPickerOpen] = useState(false)
	const layout = useMemo(() => resolveJudgeLayout({ criteria, directRatingConfig }, activeContestant), [criteria, directRatingConfig, activeContestant])
	// Step 7: the view (?view= is the judge's preference; only a unified entry has a choice), the
	// selected examinee (derived, so it never outlives its contestant) and the cells they show.
	const [requestedView, setRequestedView] = useState<JudgeView | null>(initialView ?? null)
	const [storedDetails, setStoredDetails] = useState<JudgeContestantDetailsMap>(existingContestantDetails ?? {})
	const [scrollToMember, setScrollToMember] = useState(0)
	const [examineeChoice, setExamineeChoice] = useState<{ contestantId: string; memberLabel: string } | null>(null)
	const [reveal, setReveal] = useState<{ subId: string; n: number } | null>(null)
	const switcherFocusRef = useRef(false)
	const view = resolveView(layout, requestedView)
	const cells = useMemo(() => contestantCells(criteria, activeContestant), [criteria, activeContestant])
	const examinee = selectedExaminee(cells, examineeChoice?.contestantId === activeContestantId ? examineeChoice.memberLabel : undefined)
	const kind = useMemo(() => previewKind({ criteria: rawCriteria, contestants, directRatingConfig, eventScoringType }), [rawCriteria, contestants, directRatingConfig, eventScoringType])
	const weighted = kind === 'weighted'
	// "Your preview" (spec §4.3): the admin's own compile over the row Save would send, with the
	// details the server will hold. Null-safe without an active contestant (critique B4).
	const payloadRow = useMemo(() => (activeContestant ? buildContestantRow(activeContestant, criteria, rawCriteria, scores) : null), [activeContestant, criteria, rawCriteria, scores])
	const activeDetails = activeContestantId ? contestantDetails[activeContestantId] : undefined
	const details = useMemo(() => previewDetails(activeDetails, activeContestantId ? storedDetails[activeContestantId] : undefined), [activeDetails, storedDetails, activeContestantId])
	const preview = useMemo(
		() => (payloadRow && activeContestant ? previewScore({ criteria: rawCriteria, contestants, directRatingConfig, eventScoringType }, judge.id, { contestantId: activeContestant.id, payloadRow, details }) : null),
		[payloadRow, activeContestant, rawCriteria, contestants, directRatingConfig, eventScoringType, judge.id, details],
	)
	const inputRow = useMemo(() => scores[activeContestantId] ?? {}, [scores, activeContestantId])
	const lockedIds = useMemo(() => lockedSubCriterionIds(activeContestantId), [lockedSubCriterionIds, activeContestantId])
	const directFieldIds = useMemo(() => directScoreFields.map((field) => field.subCriterionId), [directScoreFields])
	const entryCells = useMemo(() => [...cells.groupBlocks.flatMap((block) => block.cells), ...cells.examinees.flatMap((candidate) => candidate.cells)].map((cell) => cell.subCriterion), [cells])
	const entryTotals = cellTotals(entryCells, inputRow)
	const maxBySubId = useMemo(() => new Map<string, number>([...entryCells.map((cell) => [cell.id, cell.maxScore] as const), ...directScoreFields.map((field) => [field.subCriterionId, field.maxScore] as const)]), [entryCells, directScoreFields])
	const statusByMember = useMemo(() => {
		const byLabel: Record<string, MemberStatus> = {}
		for (const candidate of cells.examinees) byLabel[candidate.memberLabel] = memberStatus(candidate.cells.map((cell) => cell.subCriterion), inputRow, lockedIds)
		return byLabel
	}, [cells, inputRow, lockedIds])
	const dockVariant: DockVariant = view === 'unified' ? 'unified' : view === 'group' ? 'group' : 'individual'
	const setView = (next: JudgeView) => {
		// Only the in-page toggle (SC-1) remounts on a view change; focus follows it (critique M7).
		switcherFocusRef.current = document.activeElement?.closest('[data-testid="view-switcher"]') != null
		setRequestedView(next)
		// No request (F5): the URL keeps fromAdmin and contestantId; 'unified' removes ?view=.
		window.history.replaceState(null, '', window.location.pathname + withViewParam(window.location.search, next))
	}
	const selectExaminee = (memberLabel: string) => setExamineeChoice({ contestantId: activeContestantId, memberLabel })
	// Previous / next examinee bring the member-group into view.
	useLayoutEffect(() => {
		if (scrollToMember === 0) return
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
		document.querySelector('[data-testid="member-group"]')?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
	}, [scrollToMember])
	useLayoutEffect(() => {
		if (!switcherFocusRef.current) return
		switcherFocusRef.current = false
		document.querySelector<HTMLElement>('[data-testid="view-switcher"] [role="radio"][aria-checked="true"]')?.focus()
	}, [view])
	// A cell the step check stopped Save on is shown, focused and given the browser's own message.
	useLayoutEffect(() => {
		if (!reveal) return
		const input = document.querySelector<HTMLInputElement>(`[data-testid="score-input"][data-subcriterion-id="${CSS.escape(reveal.subId)}"]`)
		input?.focus()
		input?.reportValidity()
	}, [reveal])
	// The picker's statuses, memoised by value: a keystroke that changes no entry's status keeps the
	// same object, so the memoised picker does not re-render its entries (critique m9).
	const statusSignature = contestants.map((contestant) => contestant.id + ':' + rosterStatus({ queued: queuedContestantIds.has(contestant.id), saved: savedContestantIds.has(contestant.id), hasDraft: draftScoredContestantIds.has(contestant.id) })).join('|')
	const statusById = useMemo(() => {
		const byId: Record<string, RosterStatus> = {}
		for (const entry of statusSignature.split('|')) {
			const at = entry.lastIndexOf(':')
			if (at > 0) byId[entry.slice(0, at)] = entry.slice(at + 1) as RosterStatus
		}
		return byId
	}, [statusSignature])
	const contestantNames = useMemo(() => contestants.map((contestant) => contestant.name), [contestants])
	const saveLabel = saveButtonLabel({ names: contestantNames, activeIndex: activeContestantIndex, adminEditMode, isSaving })
	const selectFromPicker = useCallback((index: number) => goToContestantRef.current(index), [])
	// Judge page only (R16): focused cells scroll clear of the fixed header, the dock and the scroll
	// button above it.
	useEffect(() => {
		const root = document.documentElement
		root.style.scrollPaddingTop = 'calc(4rem + .75rem)'
		root.style.scrollPaddingBottom = 'calc(var(--es-dock-height, 0px) + 4.5rem + .75rem)'
		return () => {
			root.style.scrollPaddingTop = ''
			root.style.scrollPaddingBottom = ''
		}
	}, [])

	if (contestants.length === 0) {
		return (
			<div className='mx-auto w-full max-w-7xl px-4 py-8 sm:px-8'>
				<div className='rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800'>No contestants found for this event.</div>
			</div>
		)
	}

	const participants = (activeContestant.participants ?? []).map((name) => name.trim()).filter(Boolean)
	const manyExaminees = cells.examinees.length >= 2
	const examineeIndex = Math.max(0, cells.examinees.findIndex((candidate) => candidate.memberLabel === examinee?.memberLabel))
	const examineeTotals = cellTotals((examinee?.cells ?? []).map((cell) => cell.subCriterion), inputRow)
	const formatMax = (value: number) => value.toFixed(2)
	const onCell = (subCriterionId: string, raw: string, max: number) => updateScore(activeContestantId, subCriterionId, raw, max)
	const meta = <JudgeMeta judgeName={judge.name} adminEditMode={adminEditMode} lastSubmittedAt={lastSubmittedAt} legendText={view !== 'direct' && !directRatingConfig ? rubricLegendText : null} />
	const toggle = layout === 'unified' ? <ViewSwitcher variant='toggle' value={view === 'direct' ? 'unified' : view} onChange={setView} weighted={weighted} /> : null
	// The examinee tabs and the selected member-group share one <Tabs>; with one examinee there is
	// neither (spec §2.5 ExamineeRoster).
	const tabsOn = manyExaminees && examinee !== undefined && (view === 'unified' || view === 'individual')
	const withTabs = (children: React.ReactNode) =>
		tabsOn && examinee ? (
			<Tabs variant={view === 'unified' ? 'unified' : 'individual'} value={examinee.memberLabel} onChange={selectExaminee}>
				{children}
			</Tabs>
		) : (
			children
		)
	const memberPanel = (section: React.ReactNode) => (tabsOn ? <TabPanel>{section}</TabPanel> : section)
	// Step 8: Batch Fill and Reset act on the cells the view shows (spec §5; ruling R28 for Unified:
	// the selected examinee plus the group criteria). The direct view has no rail (owner).
	const shownIds = visibleCells(cells, layout, view, examinee?.memberLabel, directFieldIds)
	const scope = batchScope(shownIds, maxBySubId, lockedIds)
	const enteredInScope = countEntered(inputRow, scope)
	const scopeLabel = view === 'unified' ? `${examinee?.displayLabel ?? activeContestant.name} and the group criteria` : view === 'group' ? 'the group criteria' : manyExaminees || layout === 'unified' ? (examinee?.displayLabel ?? activeContestant.name) : activeContestant.name
	const applyBatch = (percent: BatchPercent) => {
		if (scope.length === 0) return
		setScores((previous) => ({ ...previous, [activeContestantId]: batchFillRow(previous[activeContestantId] ?? {}, scope, maxBySubId, percent) }))
		noteJudgeChange(activeContestantId)
	}
	const resetScope = () => {
		if (enteredInScope === 0) return
		if (!window.confirm(resetConfirmText(scopeLabel, enteredInScope))) return
		setScores((previous) => ({ ...previous, [activeContestantId]: resetRow(previous[activeContestantId] ?? {}, scope) }))
		noteJudgeChange(activeContestantId)
	}
	// Step 9: the figures (spec §4.1-4.5). The preview shows "—" until the entry is scored (R10).
	const activeStatus = statusById[activeContestantId] ?? 'none'
	const shownValue = activeStatus === 'none' ? null : (preview?.value ?? null)
	const split = splitGroupBlocks(cells.groupBlocks, kind, criteria)
	const countedNames = Array.from(new Set(split.counted.map((block) => block.criterion.name)))
	const formula = formulaSentence(kind, countedNames, split.other.length > 0)
	const countedTotals = cellTotals(split.counted.flatMap((block) => block.cells.map((cell) => cell.subCriterion)), inputRow)
	const groupEntered = enteredCount(split.counted.flatMap((block) => block.cells.map((cell) => cell.subCriterion)), inputRow)
	const figures: Record<string, ExamineeFigures> = {}
	for (const candidate of cells.examinees) {
		const subs = candidate.cells.map((cell) => cell.subCriterion)
		const totals = cellTotals(subs, inputRow)
		const entered = enteredCount(subs, inputRow)
		figures[candidate.memberLabel] = { status: statusByMember[candidate.memberLabel] ?? 'not-started', score: totals.score, max: totals.max, entered: entered.entered, total: entered.total }
	}
	const membersSum = Math.round(cells.examinees.reduce((sum, candidate) => sum + (figures[candidate.memberLabel]?.score ?? 0), 0) * 1000) / 1000
	const outOf = preview?.outOf ?? (kind === 'total' ? entryTotals.max : 100)
	const percentText = (value: number | null, max: number) => {
		const percent = value === null ? null : percentOf(value, max)
		return percent === null ? undefined : `${percent.toFixed(1)}%`
	}
	const mode = dockMode(layout, view, cells.examinees.length)
	const entryEntered = enteredCount(entryCells, inputRow)
	const examineeEntered = examinee ? figures[examinee.memberLabel] : undefined
	const ring = (entered: number, total: number) => <ProgressRing value={entered} max={Math.max(total, 1)} aria-label={`${entered} of ${total} fields entered`} />
	const dash = shownValue === null
	let dockSummary: React.ReactNode
	let dockStatus: React.ReactNode = null
	if (mode.figure === 'direct') {
		dockSummary = (
			<div className='flex flex-col gap-0.5 shrink-0 whitespace-nowrap'>
				<DockTotal variant='individual' label='Final rating (your preview)' value={<PreviewValue value={shownValue} kind={kind} hook />} outOf='/ 100' percent={percentText(shownValue, 100)} />
				<p className='font-body-sm text-body-sm text-slate-500'>
					Base {dash ? '—' : (preview?.result.baseFinalRating ?? 0).toFixed(2)} · strand bonus +{dash ? '—' : (preview?.result.bonusPoints ?? 0).toFixed(2)}
				</p>
			</div>
		)
	} else if (mode.figure === 'group-subtotal') {
		dockSummary = (
			<div className='flex flex-col gap-0.5 shrink-0 whitespace-nowrap'>
				<DockTotal variant='group' label={kind === 'weighted' && countedNames.length > 0 ? countedNames.join(' and ') : 'Group criteria'} value={formatScore(countedTotals.score)} outOf={`/ ${formatScore(countedTotals.max)} pts`} percent={percentText(countedTotals.score, countedTotals.max)} />
				<PreviewLine value={shownValue} kind={kind} outOf={outOf} />
			</div>
		)
		dockStatus = <DockStatus variant='group'>{`${groupEntered.entered} of ${groupEntered.total} group fields entered`}</DockStatus>
	} else if (mode.figure === 'examinee-subtotal' && examinee && examineeEntered) {
		dockSummary = (
			<div className='flex flex-col gap-0.5 shrink-0 whitespace-nowrap'>
				<DockTotal variant='individual' label={`${examinee.displayLabel} — subtotal`} value={formatScore(examineeEntered.score)} outOf={`/ ${formatScore(examineeEntered.max)} pts`} percent={percentText(examineeEntered.score, examineeEntered.max)} />
				<PreviewLine value={shownValue} kind={kind} outOf={outOf} />
			</div>
		)
		dockStatus = (
			<DockStatus variant='individual' indicator={ring(examineeEntered.entered, examineeEntered.total)} detail='0 counts as not entered'>
				{`${examineeEntered.entered} of ${examineeEntered.total} fields entered`}
			</DockStatus>
		)
	} else if (dockVariant === 'unified') {
		const breakdown =
			kind === 'weighted' ? (
				<>
					<DockTerm className='hidden sm:inline' label='Group:' value={dash ? '—' : `${(preview?.result.groupRating ?? 0).toFixed(2)}%`} />
					<span className='hidden sm:inline'>× 0.6 +</span>
					<DockTerm className='hidden sm:inline' label='Members (average):' value={dash ? '—' : `${(preview?.result.individualRating ?? 0).toFixed(2)}%`} />
					<span className='hidden sm:inline'>× 0.4</span>
				</>
			) : (
				<>
					<DockTerm className='hidden sm:inline' label='Group:' value={formatScore(countedTotals.score)} />
					<span className='hidden sm:inline'>+</span>
					<DockTerm className='hidden sm:inline' label='Members:' value={formatScore(membersSum)} />
					{!dash && Math.round((countedTotals.score + membersSum) * 1000) / 1000 === shownValue ? (
						<>
							<span className='hidden sm:inline'>=</span>
							<DockSum className='hidden sm:inline'>{(shownValue ?? 0).toFixed(2)}</DockSum>
						</>
					) : null}
				</>
			)
		dockSummary = (
			<DockTotal
				variant='unified'
				label={kind === 'weighted' ? 'Your preview' : 'Your total'}
				value={<PreviewValue value={shownValue} kind={kind} hook />}
				outOf={kind === 'weighted' ? '/ 100.00' : `/ ${formatScore(outOf)}`}
				breakdown={breakdown}
				title={kind === 'total' ? "Out of this entry's maximum" : undefined}
			/>
		)
	} else {
		dockSummary = (
			<DockTotal
				variant={dockVariant}
				label={kind === 'weighted' ? 'Your preview' : 'Your total'}
				value={<PreviewValue value={shownValue} kind={kind} hook />}
				outOf={kind === 'weighted' ? '/ 100' : `/ ${formatScore(outOf)} pts`}
				percent={percentText(shownValue, outOf)}
				title={kind === 'total' ? "Out of this entry's maximum" : undefined}
			/>
		)
		dockStatus =
			dockVariant === 'group' ? (
				<DockStatus variant='group'>{`${entryEntered.entered} of ${entryEntered.total} fields entered`}</DockStatus>
			) : (
				<DockStatus variant='individual' indicator={ring(entryEntered.entered, entryEntered.total)} detail='0 counts as not entered'>
					{`${entryEntered.entered} of ${entryEntered.total} fields entered`}
				</DockStatus>
			)
	}
	const stepExaminee = (delta: number) => {
		const target = cells.examinees[examineeIndex + delta]
		if (!target) return
		selectExaminee(target.memberLabel)
		setScrollToMember((count) => count + 1)
	}
	const dockNav: DockNav =
		mode.nav === 'examinee'
			? {
					kind: 'examinee',
					prev: { onClick: () => stepExaminee(-1), disabled: examineeIndex <= 0, name: cells.examinees[examineeIndex - 1]?.displayLabel },
					next: { onClick: () => stepExaminee(1), disabled: examineeIndex >= cells.examinees.length - 1, name: cells.examinees[examineeIndex + 1]?.displayLabel },
				}
			: {
					kind: 'entry',
					prev: { onClick: () => goToContestant(activeContestantIndex - 1), disabled: activeContestantIndex === 0 },
					next: { onClick: () => goToContestant(activeContestantIndex + 1), disabled: activeContestantIndex >= contestants.length - 1 },
				}
	const batch = (variant: 'unified' | 'group' | 'individual', label: string) => <JudgeBatchRail variant={variant} label={label} scopeSize={scope.length} enteredCount={enteredInScope} onFill={applyBatch} onReset={resetScope} />

	return (
		<div ref={topRef} className='min-h-screen bg-slate-50 font-body-md text-body-md text-slate-900 antialiased'>
			<JudgeHeader
				eventTitle={eventTitle}
				eventDescription={eventDescription}
				judgeName={judge.name}
				adminEditMode={adminEditMode}
				index={activeContestantIndex}
				count={contestants.length}
				picker={<ContestantPicker contestants={contestants} activeIndex={activeContestantIndex} statusById={statusById} slotLabels={slotLabelsByContestant} open={pickerOpen} onOpenChange={setPickerOpen} onSelect={selectFromPicker} />}
				switcher={layout === 'unified' ? <div className='hidden lg:flex'><ViewSwitcher variant='header' value={view === 'direct' ? 'unified' : view} onChange={setView} weighted={weighted} /></div> : null}
				onPrev={() => goToContestant(activeContestantIndex - 1)}
				onNext={() => goToContestant(activeContestantIndex + 1)}
			/>
			<main className='w-full pt-16 bg-slate-50 min-h-[calc(100vh-4rem)] flex flex-col'>
				<form data-testid='judge-form' data-layout={layout} data-view={view} onSubmit={submitScores}>
					{view === 'group' ? (
						<ContextStripGroup eventTitle={eventTitle} contestant={activeContestant} slotLabel={activeSlotLabel} participantCount={participants.length} entryMax={entryTotals.max} meta={meta} switcher={toggle} />
					) : null}
					{view === 'individual' || view === 'direct' ? (
						<ContextStripIndividual
							contestant={activeContestant}
							slotLabel={activeSlotLabel}
							badge={view === 'direct' ? 'Direct rating (100 max)' : manyExaminees || layout === 'unified' ? `Individual only (${formatMax(examineeTotals.max)} pts max)` : `Individual entry (${formatMax(entryTotals.max)} pts max)`}
							description={
								view === 'direct'
									? 'Enter AVE/GPA, NOAT, and Interview directly. NOAT may be admin-provided and read-only. Strand bonus is applied to Interview only, and Final Rating stays on a 0-100 scale.'
									: manyExaminees || layout === 'unified'
										? `Criteria for ${examinee?.displayLabel ?? activeContestant.name} only.`
										: 'Criteria for this entry.'
							}
							formula={view === 'individual' && kind === 'weighted' ? formula : null}
							meta={meta}
							switcher={toggle}
						/>
					) : null}
					<div className='w-full px-gutter-desktop'>
						<div className={BODY_INNER[view]}>
							{withTabs(
								<>
									{view === 'unified' ? (
										<UnifiedContext
											contestant={activeContestant}
											index={activeContestantIndex}
											count={contestants.length}
											slotLabel={activeSlotLabel}
											examineeCount={cells.examinees.length}
											entryMax={entryTotals.max}
											meta={meta}
											switcher={toggle}
											roster={<ExamineeRoster variant='unified' examinees={cells.examinees} selected={examinee?.memberLabel} figures={figures} batch={batch('unified', `Batch fill (${examinee?.displayLabel ?? activeContestant.name} + ${split.other.length > 0 ? 'group and other criteria' : 'group criteria'}):`)} />}
										/>
									) : null}
									<JudgeNotices error={error} successMessage={successMessage} queuedCount={queuedUploads.length} isAutoSyncing={isAutoSyncing} />
									{view === 'unified' ? (
										<>
											{memberPanel(<IndividualSection variant='unified' examinee={examinee} index={examineeIndex} count={cells.examinees.length} entryName={activeContestant.name} inputRow={inputRow} locked={lockedIds} onCell={onCell} />)}
											<GroupSection variant='unified' blocks={split} participants={participants} formula={formula} inputRow={inputRow} locked={lockedIds} onCell={onCell} />
										</>
									) : null}
									{view === 'group' ? <GroupSection variant='group' blocks={split} participants={participants} formula={formula} inputRow={inputRow} locked={lockedIds} onCell={onCell} batch={batch('group', 'Quick batch calibrations:')} /> : null}
									{view === 'individual' && (layout === 'unified' || manyExaminees) ? (
										<>
											<ExamineeRoster variant='individual' examinees={cells.examinees} selected={examinee?.memberLabel} figures={figures} />
											{memberPanel(<IndividualSection variant='individual' examinee={examinee} index={examineeIndex} count={cells.examinees.length} entryName={activeContestant.name} inputRow={inputRow} locked={lockedIds} onCell={onCell} batch={batch('individual', 'Quick calibrations:')} />)}
											{layout === 'individual' ? <GroupSection variant='entry' blocks={split} participants={participants} inputRow={inputRow} locked={lockedIds} onCell={onCell} /> : null}
										</>
									) : null}
									{view === 'individual' && layout === 'individual' && !manyExaminees ? (
										<>
											<IndividualSection variant='individual-entry' examinee={examinee} index={0} count={cells.examinees.length} entryName={activeContestant.name} entryTotals={entryTotals} inputRow={inputRow} locked={lockedIds} onCell={onCell} batch={batch('individual', 'Quick calibrations:')} />
											<GroupSection variant='entry' blocks={split} participants={participants} inputRow={inputRow} locked={lockedIds} onCell={onCell} />
										</>
									) : null}
									{view === 'direct' ? (
										<DirectRatingPanel
											contestant={activeContestant}
											index={activeContestantIndex}
											count={contestants.length}
											fields={directScoreFields}
											inputRow={inputRow}
											noatLocked={noatScoreByContestantId.has(activeContestantId)}
											details={{ strand: activeDetails?.strand ?? '', remark: activeDetails?.remark ?? '' }}
											finalRating={shownValue}
											weights={directFormulaWeights(rawCriteria, directRatingConfig)}
											onCell={onCell}
											onDetail={(field, value) => updateContestantDetailsField(activeContestantId, field, value)}
										/>
									) : null}
								</>,
							)}
							<RemarksSection activeContestant={activeContestant} activeContestantId={activeContestantId} contestantDetails={contestantDetails} updateContestantDetailsField={updateContestantDetailsField} />
							<p className='font-body-sm text-body-sm text-slate-500'>Tip: Save each contestant right after the presentation. If internet/service fails, scores are kept locally and auto-upload when connection is back.</p>
						</div>
					</div>
					<DockSpacer variant={dockVariant} />
					<JudgeDock variant={dockVariant} summary={dockSummary} status={dockStatus} nav={dockNav} save={{ label: saveLabel, isSaving, draftStatus }} />
				</form>
			</main>
		</div>
	)
}
