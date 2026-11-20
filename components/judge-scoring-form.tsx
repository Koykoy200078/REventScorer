'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ContestantPicker } from '@/components/judge/contestant-picker'
import { CriterionList } from '@/components/judge/criterion-list'
import { DirectRatingPanel } from '@/components/judge/direct-rating-panel'
import { JudgeMeta } from '@/components/judge/judge-context'
import { JudgeDock } from '@/components/judge/judge-dock'
import { JudgeHeader } from '@/components/judge/judge-header'
import { JudgeNotices } from '@/components/judge/notices'
import { RemarksSection } from '@/components/judge/remarks'
import { DockSpacer, type DockVariant } from '@/components/ui/sticky-dock'

import { deriveDirectRatingConfigFromCriteria, detectDirectRatingScoreFields, normalizeDirectRatingConfig, resolveStrandAlignmentBonus } from '@/lib/direct-rating-config'
import { baselineAfterSave, browserDraftStorage, DRAFT_WRITE_DELAY_MS, draftToKeep, formFollowsSave, hasUnsavedChanges, initialBaselines, ownDraftToKeep, queuedRowToShow, queuedSaveBaseline, restoredDetails, restoredRow, savedFormRow, storedDraftToKeep, summarizeDraftStatus, writePendingDrafts } from '@/lib/judge/draft-state'
import type { ContestantBaseline, DraftOutcome, DraftStatus, QueuedSave } from '@/lib/judge/draft-state'
import { clearContestantDraft, loadDraft, readContestantDraft, saveContestantDraft } from '@/lib/judge/draft-store'
import type { ContestantDraft } from '@/lib/judge/draft-store'
import { migrateLegacyDirectRating } from '@/lib/judge/legacy-direct'
import { buildInputContestantDetails, buildInputMatrix, detectInitiallyScoredContestants, hasPositiveDraftScore } from '@/lib/judge/matrix'
import type { InputContestantDetailsMap, InputScoreMatrix } from '@/lib/judge/matrix'
import { applicableSubCriteriaForContestant } from '@/lib/judge/members'
import { buildSaveRequest, buildScorePayload } from '@/lib/judge/payload'
import { normalizeScoreInput, parseAndClampScore, round } from '@/lib/judge/score-input'
import { AUTO_SYNC_INTERVAL_MS, isServerUnreachableScoreUploadError, listQueuedScoreUploadsForToken, queuedScoreUploadId, removeQueuedScoreUpload, shouldQueueScoreUpload, SubmitScoresError, upsertQueuedScoreUpload } from '@/lib/judge/score-queue'
import type { QueuedScoreUpload, SubmitScoresRequestBody, SubmitScoresResponseBody } from '@/lib/judge/score-queue'
import { advanceTarget, rosterStatus, saveButtonLabel } from '@/lib/judge/status'
import type { RosterStatus } from '@/lib/judge/status'
import { autoResolveStrand, isTVLAcademicTrack } from '@/lib/judge/strand'
import { formatRubricLegend, normalizeRubricLegend } from '@/lib/rubric-legend'
import { resolveJudgeLayout } from '@/lib/judge/layout'
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
	/** Stage 5 Task 5: the event's own scoring type and description, and the view from ?view= (accepted, not used yet). */
	eventScoringType?: EventScoringType
	eventDescription?: string
	initialView?: JudgeView | null
}

export function JudgeScoringForm({ token, eventTitle, eventDescription, contestants, criteria: rawCriteria, judge, rubricLegend, directRatingConfig, presentationSlots, existingScores: rawExistingScores, existingSavedContestantIds, existingContestantDetails, submittedAt, initialContestantId, adminEditMode = false }: JudgeScoringFormProps) {
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
	const isDirectScoreMode = directScoreFields.length > 0
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

	const maxPossibleScore = useMemo(() => round(criteria.reduce((sum, criterion) => sum + applicableSubCriteriaForContestant(criterion, activeContestant).reduce((subTotal, subCriterion) => subTotal + Number(subCriterion.maxScore), 0), 0)), [criteria, activeContestant])
	const totalSubCriterionCount = useMemo(() => criteria.reduce((sum, criterion) => sum + applicableSubCriteriaForContestant(criterion, activeContestant).length, 0), [criteria, activeContestant])
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

	const activeContestantTotal = useMemo(() => {
		if (!activeContestantId) {
			return 0
		}

		return round(
			criteria.reduce((total, criterion) => {
				const criterionTotal = applicableSubCriteriaForContestant(criterion, activeContestant).reduce((subTotal, subCriterion) => {
					const rawValue = scores[activeContestantId]?.[subCriterion.id] ?? '0'
					return subTotal + parseAndClampScore(rawValue, subCriterion.maxScore)
				}, 0)

				return total + criterionTotal
			}, 0),
		)
	}, [activeContestant, activeContestantId, criteria, scores])

	const directScoreMaxPossible = useMemo(() => {
		if (!isDirectScoreMode || directScoreFields.length === 0) {
			return 0
		}

		return 100
	}, [directScoreFields, isDirectScoreMode])

	const activeDirectInterviewFields = useMemo(() => directScoreFields.filter((field) => field.key.startsWith('interview')), [directScoreFields])
	const activeDirectInterviewMax = useMemo(() => activeDirectInterviewFields.reduce((sum, f) => sum + f.maxScore, 0), [activeDirectInterviewFields])

	const activeDirectBaseFinalRating = useMemo(() => {
		if (!isDirectScoreMode || !activeContestantId || directScoreFields.length === 0) {
			return 0
		}

		let avePercent = 0
		let noatPercent = 0
		let interviewScore = 0
		
		let hasAve = false
		let hasNoat = false
		let hasInterview = false

		for (const field of directScoreFields) {
			const rawValue = scores[activeContestantId]?.[field.subCriterionId] ?? '0'
			const score = parseAndClampScore(rawValue, field.maxScore)

			if (field.key === 'aveGpa') {
				if (field.maxScore > 0) avePercent = (score / field.maxScore) * 100
				hasAve = true
			} else if (field.key === 'noat') {
				if (field.maxScore > 0) noatPercent = (score / field.maxScore) * 100
				hasNoat = true
			} else if (field.key.startsWith('interview')) {
				interviewScore += score
				hasInterview = true
			}
		}

		let interviewPercent = 0
		if (hasInterview && activeDirectInterviewMax > 0) {
			interviewPercent = (interviewScore / activeDirectInterviewMax) * 100
		}

		let totalPercent = 0
		let divisor = 0
		if (hasAve) { totalPercent += avePercent; divisor++; }
		if (hasNoat) { totalPercent += noatPercent; divisor++; }
		if (hasInterview) { totalPercent += interviewPercent; divisor++; }

		return divisor > 0 ? round(totalPercent / divisor) : 0
	}, [activeContestantId, activeDirectInterviewMax, directScoreFields, isDirectScoreMode, scores])

	const activeDirectInterviewScore = useMemo(() => {
		if (!isDirectScoreMode || !activeContestantId || activeDirectInterviewFields.length === 0) {
			return 0
		}

		return activeDirectInterviewFields.reduce((sum, field) => {
			const rawValue = scores[activeContestantId]?.[field.subCriterionId] ?? '0'
			return sum + parseAndClampScore(rawValue, field.maxScore)
		}, 0)
	}, [activeContestantId, activeDirectInterviewFields, isDirectScoreMode, scores])

	const activeDirectStrand = activeContestantId ? (contestantDetails[activeContestantId]?.strand ?? '') : ''
	const activeDirectBonusPoints = useMemo(() => {
		if (!isDirectScoreMode || activeDirectStrand.trim().length === 0) {
			return 0
		}

		return round(resolveStrandAlignmentBonus(activeDirectStrand, resolvedDirectRatingConfig).bonusPoints)
	}, [activeDirectStrand, isDirectScoreMode, resolvedDirectRatingConfig])

	const activeDirectInterviewScoreWithBonus = useMemo(() => {
		if (!isDirectScoreMode || activeDirectInterviewFields.length === 0) {
			return activeDirectInterviewScore
		}

		return round(Math.min(activeDirectInterviewMax, activeDirectInterviewScore + activeDirectBonusPoints))
	}, [activeDirectBonusPoints, activeDirectInterviewFields.length, activeDirectInterviewMax, activeDirectInterviewScore, isDirectScoreMode])

	const activeDirectAppliedInterviewBonus = useMemo(() => round(Math.max(0, activeDirectInterviewScoreWithBonus - activeDirectInterviewScore)), [activeDirectInterviewScore, activeDirectInterviewScoreWithBonus])

	const activeDirectFinalRating = useMemo(() => {
		if (!isDirectScoreMode || !activeContestantId || directScoreFields.length === 0) {
			return 0
		}

		let avePercent = 0
		let noatPercent = 0
		
		let hasAve = false
		let hasNoat = false
		let hasInterview = activeDirectInterviewFields.length > 0

		for (const field of directScoreFields) {
			const rawValue = scores[activeContestantId]?.[field.subCriterionId] ?? '0'
			const score = parseAndClampScore(rawValue, field.maxScore)

			if (field.key === 'aveGpa') {
				if (field.maxScore > 0) avePercent = (score / field.maxScore) * 100
				hasAve = true
			} else if (field.key === 'noat') {
				if (field.maxScore > 0) noatPercent = (score / field.maxScore) * 100
				hasNoat = true
			}
		}

		let interviewPercent = 0
		if (hasInterview && activeDirectInterviewMax > 0) {
			interviewPercent = (activeDirectInterviewScoreWithBonus / activeDirectInterviewMax) * 100
		}

		let totalPercent = 0
		let divisor = 0
		if (hasAve) { totalPercent += avePercent; divisor++; }
		if (hasNoat) { totalPercent += noatPercent; divisor++; }
		if (hasInterview) { totalPercent += interviewPercent; divisor++; }

		return divisor > 0 ? round(totalPercent / divisor) : 0
	}, [activeContestantId, activeDirectInterviewFields.length, activeDirectInterviewMax, activeDirectInterviewScoreWithBonus, directScoreFields, isDirectScoreMode, scores])
	const directFinalRatingMaxPossible = useMemo(() => {
		if (!isDirectScoreMode) {
			return 0
		}

		return 100
	}, [isDirectScoreMode])

	const scoredFieldCount = useMemo(() => {
		if (!activeContestantId) {
			return 0
		}

		return criteria.reduce((sum, criterion) => {
			const countInCriterion = applicableSubCriteriaForContestant(criterion, activeContestant).reduce((count, subCriterion) => {
				const rawValue = scores[activeContestantId]?.[subCriterion.id] ?? '0'
				const parsedValue = Number.parseFloat(rawValue)
				return count + (Number.isFinite(parsedValue) && parsedValue > 0 ? 1 : 0)
			}, 0)

			return sum + countInCriterion
		}, 0)
	}, [activeContestant, activeContestantId, criteria, scores])

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
	const dockVariant: DockVariant = layout === 'unified' ? 'unified' : layout === 'group' ? 'group' : 'individual'
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
				onPrev={() => goToContestant(activeContestantIndex - 1)}
				onNext={() => goToContestant(activeContestantIndex + 1)}
			/>
			<main className='w-full pt-16 bg-slate-50 min-h-[calc(100vh-4rem)] flex flex-col'>
				<form onSubmit={submitScores}>
					<div className='w-full px-gutter-desktop'>
						<div className='w-full max-w-5xl mx-auto py-space-lg flex flex-col gap-space-lg'>
							<JudgeMeta judgeName={judge.name} adminEditMode={adminEditMode} lastSubmittedAt={lastSubmittedAt} />
							<JudgeNotices error={error} successMessage={successMessage} queuedCount={queuedUploads.length} isAutoSyncing={isAutoSyncing} />
							<section className='rounded-2xl border border-cyan-100 bg-white p-4 sm:p-5'>
								<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
									<div>
										<div className='flex items-center gap-2'>
											<h2 className='text-xl font-semibold text-cyan-950'>Now Scoring: {activeContestant.name}</h2>
											{activeContestant.entryType === 'individual' ? <span className='rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800'>Individual</span> : null}
										</div>
										<p className='mt-1 text-sm text-cyan-900/90'>
											Entry {activeContestantIndex + 1} of {contestants.length}
										</p>
										{activeSlotLabel ? <p className='text-xs text-cyan-900/80'>Slot: {activeSlotLabel}</p> : null}
									</div>
									<div className='flex flex-wrap items-center gap-2'>
										<span className='rounded-full bg-cyan-100 px-3 py-1 text-xs font-medium text-cyan-900'>
											Current Total: {activeContestantTotal.toFixed(2)} / {maxPossibleScore.toFixed(2)}
										</span>
										{isDirectScoreMode ? (
											<span className='rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900'>
												Final Rating: {activeDirectFinalRating.toFixed(2)} / {directFinalRatingMaxPossible.toFixed(2)}
											</span>
										) : null}
										<span className='rounded-full bg-white px-3 py-1 text-xs font-medium text-cyan-900 ring-1 ring-cyan-200'>
											Scored Fields: {scoredFieldCount} / {totalSubCriterionCount}
										</span>
									</div>
								</div>

								<div className='mt-4 space-y-4'>
									{isDirectScoreMode ? (
										<DirectRatingPanel
											activeContestant={activeContestant}
											activeContestantId={activeContestantId}
											directScoreFields={directScoreFields}
											scores={scores}
											noatScoreByContestantId={noatScoreByContestantId}
											contestantDetails={contestantDetails}
											activeDirectFinalRating={activeDirectFinalRating}
											directFinalRatingMaxPossible={directFinalRatingMaxPossible}
											activeDirectBaseFinalRating={activeDirectBaseFinalRating}
											directScoreMaxPossible={directScoreMaxPossible}
											activeDirectAppliedInterviewBonus={activeDirectAppliedInterviewBonus}
											updateScore={updateScore}
											updateContestantDetailsField={updateContestantDetailsField}
										/>
									) : (
										<CriterionList criteria={criteria} activeContestant={activeContestant} activeContestantId={activeContestantId} scores={scores} directRatingConfig={directRatingConfig} rubricLegendText={rubricLegendText} updateScore={updateScore} />
									)}
								</div>
								<RemarksSection activeContestant={activeContestant} activeContestantId={activeContestantId} contestantDetails={contestantDetails} updateContestantDetailsField={updateContestantDetailsField} />
							</section>
							<p className='font-body-sm text-body-sm text-slate-500'>Tip: Save each contestant right after the presentation. If internet/service fails, scores are kept locally and auto-upload when connection is back.</p>
						</div>
					</div>
					<DockSpacer variant={dockVariant} />
					<JudgeDock
						variant={dockVariant}
						total={{ label: 'Current total', value: activeContestantTotal.toFixed(2), outOf: `/ ${maxPossibleScore.toFixed(2)}` }}
						prev={{ onClick: () => goToContestant(activeContestantIndex - 1), disabled: activeContestantIndex === 0 }}
						next={{ onClick: () => goToContestant(activeContestantIndex + 1), disabled: activeContestantIndex >= contestants.length - 1 }}
						save={{ label: saveLabel, isSaving, draftStatus }}
					/>
				</form>
			</main>
		</div>
	)
}
