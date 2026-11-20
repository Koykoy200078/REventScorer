'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Select from 'react-select'

import { deriveDirectRatingConfigFromCriteria, detectDirectRatingScoreFields, DIRECT_RATING_STRAND_SELECT_GROUPS, normalizeDirectRatingConfig, resolveStrandAlignmentBonus } from '@/lib/direct-rating-config'
import { baselineAfterSave, browserDraftStorage, DRAFT_WRITE_DELAY_MS, draftToKeep, formFollowsSave, hasUnsavedChanges, initialBaselines, ownDraftToKeep, queuedRowToShow, queuedSaveBaseline, restoredDetails, restoredRow, savedFormRow, storedDraftToKeep, summarizeDraftStatus, writePendingDrafts } from '@/lib/judge/draft-state'
import type { ContestantBaseline, DraftOutcome, DraftStatus, QueuedSave } from '@/lib/judge/draft-state'
import { clearContestantDraft, loadDraft, readContestantDraft, saveContestantDraft } from '@/lib/judge/draft-store'
import type { ContestantDraft } from '@/lib/judge/draft-store'
import { migrateLegacyDirectRating } from '@/lib/judge/legacy-direct'
import { buildContestantDetailsPayload, buildInputContestantDetails, buildInputMatrix, detectInitiallyScoredContestants, formatDate, hasPositiveDraftScore } from '@/lib/judge/matrix'
import type { InputContestantDetailsMap, InputScoreMatrix } from '@/lib/judge/matrix'
import { applicableSubCriteriaForContestant, criterionScopeLabel, groupSubCriteriaByMember, isIndividualCriterion } from '@/lib/judge/members'
import { normalizeScoreInput, parseAndClampScore, round } from '@/lib/judge/score-input'
import { AUTO_SYNC_INTERVAL_MS, isServerUnreachableScoreUploadError, listQueuedScoreUploadsForToken, queuedScoreUploadId, removeQueuedScoreUpload, shouldQueueScoreUpload, SubmitScoresError, upsertQueuedScoreUpload } from '@/lib/judge/score-queue'
import type { QueuedScoreUpload, SubmitScoresRequestBody, SubmitScoresResponseBody } from '@/lib/judge/score-queue'
import { autoResolveStrand, DIRECT_REMARK_OPTIONS, isTVLAcademicTrack, TVL_LEAF_STRAND_OPTIONS } from '@/lib/judge/strand'
import { formatRubricLegend, normalizeRubricLegend } from '@/lib/rubric-legend'
import type { DirectRatingConfig, EventContestant, EventCriterion, EventPresentationSlot, JudgeContestantDetailsMap, JudgeProfile, RubricLegendItem, ScoreMatrix } from '@/lib/types'

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
}

export function JudgeScoringForm({ token, eventTitle, contestants, criteria: rawCriteria, judge, rubricLegend, directRatingConfig, presentationSlots, existingScores: rawExistingScores, existingSavedContestantIds, existingContestantDetails, submittedAt, initialContestantId, adminEditMode = false }: JudgeScoringFormProps) {
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

		const payload: ScoreMatrix = {}

		for (const contestant of contestants) {
			payload[contestant.id] = {}

			for (const criterion of criteria) {
				const applicableSubCriterionIds = new Set(applicableSubCriteriaForContestant(criterion, contestant).map((subCriterion) => subCriterion.id))

				for (const subCriterion of criterion.subCriteria) {
					if (!applicableSubCriterionIds.has(subCriterion.id)) {
						payload[contestant.id][subCriterion.id] = 0
						continue
					}

					const rawValue = scores[contestant.id]?.[subCriterion.id] ?? '0'
					payload[contestant.id][subCriterion.id] = round(parseAndClampScore(rawValue, subCriterion.maxScore))
				}
			}

			// ADD BACKWARD COMPATIBILITY FIELDS FOR ADMIN DASHBOARD
			if (criteria.some((c) => c.id === 'legacy-migrated-criterion')) {
				const oldInterviewId = rawCriteria.flatMap((c) => c.subCriteria).find((sc) => !sc.name.toLowerCase().includes('ave') && !sc.name.toLowerCase().includes('gpa') && sc.name.toLowerCase() !== 'noat')?.id
				const oldAveId = rawCriteria.flatMap((c) => c.subCriteria).find((sc) => sc.name.toLowerCase().includes('ave') || sc.name.toLowerCase().includes('gpa'))?.id
				const oldNoatId = rawCriteria.flatMap((c) => c.subCriteria).find((sc) => sc.name.toLowerCase() === 'noat')?.id

				if (oldInterviewId) {
					const contentScore = payload[contestant.id]['legacy-migrated-interviewContent'] ?? 0
					const commScore = payload[contestant.id]['legacy-migrated-interviewComm'] ?? 0
					const persScore = payload[contestant.id]['legacy-migrated-interviewPers'] ?? 0
					const interestScore = payload[contestant.id]['legacy-migrated-interviewInterest'] ?? 0
					const specialScore = payload[contestant.id]['legacy-migrated-interviewSpecial'] ?? 0
					payload[contestant.id][oldInterviewId] = round(contentScore + commScore + persScore + interestScore + specialScore)
				}

				if (oldAveId && payload[contestant.id]['legacy-migrated-aveGpa'] !== undefined) {
					payload[contestant.id][oldAveId] = payload[contestant.id]['legacy-migrated-aveGpa']
				}
				
				if (oldNoatId && payload[contestant.id]['legacy-migrated-noat'] !== undefined) {
					payload[contestant.id][oldNoatId] = payload[contestant.id]['legacy-migrated-noat']
				}
			}
		}

		const contestantDetailsPayload = buildContestantDetailsPayload(contestantDetails)

		const requestPayload: SubmitScoresRequestBody = {
			scores: payload,
			contestantId: activeContestant.id,
			...(Object.keys(contestantDetailsPayload).length > 0 ? { contestantDetails: contestantDetailsPayload } : {}),
		}
		const currentName = activeContestant.name
		const nextIndex = activeContestantIndex + 1

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
			} else if (nextIndex < contestants.length) {
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
				} else if (nextIndex < contestants.length) {
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

	if (contestants.length === 0) {
		return (
			<div className='mx-auto w-full max-w-7xl px-4 py-8 sm:px-8'>
				<div className='rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800'>No contestants found for this event.</div>
			</div>
		)
	}

	return (
		<div ref={topRef} className='mx-auto w-full max-w-7xl px-4 py-8 sm:px-8'>
			<div className='rounded-3xl border border-cyan-200 bg-white/95 p-6 shadow-xl shadow-cyan-950/10 sm:p-8'>
				<div className='flex flex-col gap-2'>
					<p className='text-xs uppercase tracking-[0.18em] text-cyan-800/80'>Judge Session</p>
					<h1 className='text-3xl font-semibold tracking-tight text-cyan-950'>{eventTitle}</h1>
					<p className='text-sm text-cyan-900/80'>
						Judge: <span className='font-semibold'>{judge.name}</span>
					</p>
					<p className='text-sm text-cyan-900/80'>Max possible score: {maxPossibleScore.toFixed(2)}</p>
					{lastSubmittedAt ? <p className='text-xs text-emerald-700'>Last submitted: {formatDate(lastSubmittedAt)}</p> : null}
					{queuedUploads.length > 0 ? <p data-testid='pending-uploads' className='text-xs text-amber-700'>Pending uploads: {queuedUploads.length}. Saved locally and waiting to sync.</p> : null}
					{isAutoSyncing ? <p className='text-xs text-cyan-800'>Auto-uploading pending saves...</p> : null}
				</div>

				<div className='mt-6 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4'>
					<p className='text-xs uppercase tracking-[0.16em] text-cyan-900'>Score One Entry At A Time</p>
					<p className='mt-1 text-xs text-cyan-900/80'>Entries marked as Scored already have saved scores.</p>
					<div data-testid='judge-roster' className='mt-3 flex flex-wrap gap-2'>
						{contestants.map((contestant, index) => {
							const isActive = index === activeContestantIndex
							const isSaved = savedContestantIds.has(contestant.id)
							const isQueued = queuedContestantIds.has(contestant.id)
							const hasDraft = draftScoredContestantIds.has(contestant.id)
							const slotLabel = slotLabelsByContestant.get(contestant.id)
							const isIndividual = contestant.entryType === 'individual'
							return (
								<button suppressHydrationWarning key={contestant.id} type='button' onClick={() => goToContestant(index)} data-testid='roster-entry' data-contestant-id={contestant.id} data-status={isQueued ? 'queued' : isSaved ? 'scored' : hasDraft ? 'draft' : 'none'} aria-current={isActive ? 'true' : undefined} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${isActive ? 'border-cyan-800 bg-cyan-900 text-white' : 'border-cyan-300 bg-white text-cyan-900 hover:bg-cyan-100'}`}>
									<div className='flex flex-col items-start'>
										<span>
											{index + 1}. {contestant.name}
										</span>
										{isIndividual ? <span className={`text-[10px] ${isActive ? 'text-white/80' : 'text-sky-700'}`}>Individual</span> : null}
										{slotLabel ? <span className={`text-[10px] ${isActive ? 'text-white/80' : 'text-cyan-800/70'}`}>{slotLabel}</span> : null}
									</div>
									{isQueued ? (
										<span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'}`}>Queued</span>
									) : isSaved ? (
										<span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>Scored</span>
									) : hasDraft ? (
										<span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'}`}>Draft</span>
									) : null}
								</button>
							)
						})}
					</div>
				</div>

				<form onSubmit={submitScores} className='mt-6 flex flex-col gap-4'>
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
								<article className='rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4'>
									<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
										<div>
											<h3 className='text-base font-semibold text-cyan-950'>Direct Score Entry</h3>
											<p className='text-[11px] font-medium text-cyan-900/85'>Enter AVE/GPA, NOAT, and Interview directly. NOAT may be admin-provided and read-only. Strand bonus is applied to Interview only, and Final Rating stays on a 0-100 scale.</p>
										</div>
										<div className='text-right'>
											<p className='text-xs font-semibold text-emerald-800'>
												Final Rating: {activeDirectFinalRating.toFixed(2)} / {directFinalRatingMaxPossible.toFixed(2)}
											</p>
											<p className='text-[11px] text-emerald-900/80'>
												Base: {activeDirectBaseFinalRating.toFixed(2)} / {directScoreMaxPossible.toFixed(2)} | Interview Bonus Applied: +{activeDirectAppliedInterviewBonus.toFixed(2)}
											</p>
										</div>
									</div>

									<div className='mt-3 grid gap-3 md:grid-cols-2'>
										{directScoreFields.filter((f) => !f.key.startsWith('interview')).map((field) => {
											const enteredValue = scores[activeContestantId]?.[field.subCriterionId] ?? '0'
											const enteredScore = parseAndClampScore(enteredValue, field.maxScore)
											const normalizedPercent = field.maxScore > 0 ? round((enteredScore / field.maxScore) * 100) : 0
											const isNoatLocked = field.key === 'noat' && noatScoreByContestantId.has(activeContestantId)

											return (
												<label key={field.subCriterionId} className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
													<span className='block text-sm font-semibold text-cyan-950'>{field.label}</span>
													<span className='mt-1 block text-xs text-cyan-900/90'>
														Max: {field.maxScore.toFixed(2)}
														{isNoatLocked ? ' | Admin provided' : ''}
													</span>
													<input
														suppressHydrationWarning
														data-testid='score-input'
														data-subcriterion-id={field.subCriterionId}
														value={enteredValue}
														onChange={(inputEvent) => {
															if (isNoatLocked) {
																return
															}
															updateScore(activeContestantId, field.subCriterionId, inputEvent.target.value, field.maxScore)
														}}
														type='number'
														inputMode='decimal'
														min={0}
														max={field.maxScore}
														step='0.01'
														readOnly={isNoatLocked}
														className='mt-2 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 placeholder:text-slate-500 caret-slate-900 outline-none ring-cyan-600 transition focus:border-cyan-500 focus:ring-2 read-only:cursor-default read-only:bg-slate-50 read-only:text-slate-600'
													/>
													<span className='mt-1 block text-xs font-medium text-slate-700'>
														Entered: {enteredScore.toFixed(2)} | Normalized: {normalizedPercent.toFixed(2)}%
													</span>
												</label>
											)
										})}
									</div>

									{directScoreFields.some((f) => f.key.startsWith('interview')) ? (
										<div className='mt-4 rounded-xl border border-cyan-200 bg-white/60 p-4'>
											<h4 className='mb-3 text-sm font-bold tracking-wider text-cyan-950 uppercase'>Interview</h4>
											<div className='grid gap-3 md:grid-cols-2'>
												{directScoreFields.filter((f) => f.key.startsWith('interview')).map((field) => {
													const enteredValue = scores[activeContestantId]?.[field.subCriterionId] ?? '0'
													const enteredScore = parseAndClampScore(enteredValue, field.maxScore)
													const normalizedPercent = field.maxScore > 0 ? round((enteredScore / field.maxScore) * 100) : 0

													return (
														<label key={field.subCriterionId} className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
															<span className='block text-sm font-semibold text-cyan-950'>{field.label}</span>
															<span className='mt-1 block text-xs text-cyan-900/90'>
																Max: {field.maxScore.toFixed(2)}
															</span>
															<input
																suppressHydrationWarning
																data-testid='score-input'
																data-subcriterion-id={field.subCriterionId}
																value={enteredValue}
																onChange={(inputEvent) => {
																	updateScore(activeContestantId, field.subCriterionId, inputEvent.target.value, field.maxScore)
																}}
																type='number'
																inputMode='decimal'
																min={0}
																max={field.maxScore}
																step='0.01'
																className='mt-2 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 placeholder:text-slate-500 caret-slate-900 outline-none ring-cyan-600 transition focus:border-cyan-500 focus:ring-2'
															/>
															<span className='mt-1 block text-xs font-medium text-slate-700'>
																Entered: {enteredScore.toFixed(2)} | Normalized: {normalizedPercent.toFixed(2)}%
															</span>
														</label>
													)
												})}
											</div>
										</div>
									) : null}

									<div className='mt-3 grid gap-3 md:grid-cols-2'>
										<label className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
											<span className='block text-sm font-semibold text-cyan-950'>Strand</span>
											{isTVLAcademicTrack(activeContestant.academicTrack) ? (
												<>
													<p className='mt-1 text-[10px] text-cyan-700/80'>TVL Track — select specific sub-strand</p>
													<div data-testid='strand-select' className='mt-2'>
														<Select
															instanceId={`strand-tvl-select-${activeContestantId}`}
															options={Array.from(new Set(TVL_LEAF_STRAND_OPTIONS.map((o) => o.group))).map((groupName) => ({
																label: groupName,
																options: TVL_LEAF_STRAND_OPTIONS.filter((o) => o.group === groupName).map((o) => ({ value: o.value, label: o.label })),
															}))}
															value={(() => {
																const val = contestantDetails[activeContestantId]?.strand ?? ''
																return val ? { value: val, label: TVL_LEAF_STRAND_OPTIONS.find(o => o.value === val)?.label ?? val } : null
															})()}
															onChange={(selected) => updateContestantDetailsField(activeContestantId, 'strand', selected?.value ?? '')}
															isClearable
															placeholder='Search or select...'
															classNamePrefix='react-select'
															styles={{
																control: (base) => ({ ...base, borderRadius: '0.5rem', borderColor: '#67e8f9', minHeight: '42px', fontSize: '14px', paddingLeft: '4px' }),
																valueContainer: (base) => ({ ...base, padding: '2px 12px' }),
																singleValue: (base) => ({ ...base, marginLeft: 0, marginRight: 0 })
															}}
														/>
													</div>
												</>
											) : (
												<div data-testid='strand-select' className='mt-2'>
													<Select
														instanceId={`strand-select-${activeContestantId}`}
														options={DIRECT_RATING_STRAND_SELECT_GROUPS.map((group) => ({
															label: group.label,
															options: group.options.map((o) => ({ value: o.value, label: o.label })),
														}))}
														value={(() => {
															const val = contestantDetails[activeContestantId]?.strand ?? ''
															return val ? { value: val, label: DIRECT_RATING_STRAND_SELECT_GROUPS.flatMap(g => g.options).find(o => o.value === val)?.label ?? val } : null
														})()}
														onChange={(selected) => updateContestantDetailsField(activeContestantId, 'strand', selected?.value ?? '')}
														isClearable
														placeholder='Search or select...'
														classNamePrefix='react-select'
														styles={{
															control: (base) => ({ ...base, borderRadius: '0.5rem', borderColor: '#67e8f9', minHeight: '42px', fontSize: '14px', paddingLeft: '4px' }),
															valueContainer: (base) => ({ ...base, padding: '2px 12px' }),
															singleValue: (base) => ({ ...base, marginLeft: 0, marginRight: 0 })
														}}
													/>
												</div>
											)}
										</label>

										<label className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
											<span className='block text-sm font-semibold text-cyan-950'>Remark</span>
											<div data-testid='remark-select' className='mt-2'>
												<Select
													instanceId={`remark-select-${activeContestantId}`}
													options={DIRECT_REMARK_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
													value={(() => {
														const val = contestantDetails[activeContestantId]?.remark ?? ''
														return val ? { value: val, label: val } : null
													})()}
													onChange={(selected) => updateContestantDetailsField(activeContestantId, 'remark', selected?.value ?? '')}
													isClearable
													placeholder='Search or select...'
													classNamePrefix='react-select'
													styles={{
														control: (base) => ({ ...base, borderRadius: '0.5rem', borderColor: '#67e8f9', minHeight: '42px', fontSize: '14px', paddingLeft: '4px' }),
														valueContainer: (base) => ({ ...base, padding: '2px 12px' }),
														singleValue: (base) => ({ ...base, marginLeft: 0, marginRight: 0 })
													}}
												/>
											</div>
										</label>
									</div>

									<p className='mt-3 text-xs text-cyan-900/80'>Final Rating formula: ((AVE/GPA / Max AVE) x 100 + (NOAT / Max NOAT) x 100 + ((Interview + aligned strand bonus) / Max Interview) x 100) / 3, with Interview capped at its max score.</p>
								</article>
							) : (
								criteria.map((criterion) => {
									const applicableSubCriteria = applicableSubCriteriaForContestant(criterion, activeContestant)
									const scopeLabel = criterionScopeLabel(criterion)
									const parentMaxScore = round(applicableSubCriteria.reduce((sum, subCriterion) => sum + Number(subCriterion.maxScore), 0))
									const parentCurrentTotal = round(
										applicableSubCriteria.reduce((sum, subCriterion) => {
											const rawValue = scores[activeContestantId]?.[subCriterion.id] ?? '0'
											return sum + parseAndClampScore(rawValue, subCriterion.maxScore)
										}, 0),
									)

									return (
										<article key={criterion.id} className='rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4'>
											<div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'>
												<div>
													<h3 className='text-base font-semibold text-cyan-950'>{criterion.name}</h3>
													<p className='text-[11px] font-medium text-cyan-900/85'>Scope: {scopeLabel}</p>
													{!directRatingConfig ? <p className='text-[11px] text-cyan-900/80'>Legend: {rubricLegendText}</p> : null}
												</div>
												<p className='text-xs text-cyan-900/90'>
													Parent Max: {parentMaxScore.toFixed(2)} | Current: {parentCurrentTotal.toFixed(2)}
												</p>
											</div>

											{isIndividualCriterion(criterion) ? (
												<div className='mt-3 space-y-4'>
													{groupSubCriteriaByMember(criterion.subCriteria, activeContestant).map((group) => {
														const groupMaxScore = round(group.items.reduce((sum, item) => sum + item.subCriterion.maxScore, 0))
														const groupCurrentTotal = round(
															group.items.reduce((sum, item) => {
																const rawValue = scores[activeContestantId]?.[item.subCriterion.id] ?? '0'
																return sum + parseAndClampScore(rawValue, item.subCriterion.maxScore)
															}, 0),
														)

														return (
															<div key={group.memberLabel} data-testid='member-group' data-member-label={group.memberLabel} className='rounded-2xl border border-cyan-200 bg-white p-3'>
																<div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
																	<div>
																		<h4 className='text-sm font-semibold text-cyan-950'>{group.memberDisplayLabel}</h4>
																	</div>
																	<p className='text-xs text-cyan-900/90 sm:text-right'>
																		Max: {groupMaxScore.toFixed(2)} | Current: {groupCurrentTotal.toFixed(2)}
																	</p>
																</div>

																<div className='mt-3 grid gap-3 xl:grid-cols-2'>
																	{group.items.map(({ subCriterion, displayName }) => (
																		<label key={subCriterion.id} className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
																			<span className='block text-sm font-semibold text-cyan-950'>{displayName}</span>
																			<span className='mt-1 block text-xs text-cyan-900/90'>Sub Max: {subCriterion.maxScore.toFixed(2)}</span>
																			<input
																				suppressHydrationWarning
																				data-testid='score-input'
																				data-subcriterion-id={subCriterion.id}
																				value={scores[activeContestantId]?.[subCriterion.id] ?? '0'}
																				onChange={(inputEvent) => updateScore(activeContestantId, subCriterion.id, inputEvent.target.value, subCriterion.maxScore)}
																				type='number'
																				inputMode='decimal'
																				min={0}
																				max={subCriterion.maxScore}
																				step='0.01'
																				className='mt-2 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 placeholder:text-slate-500 caret-slate-900 outline-none ring-cyan-600 transition focus:border-cyan-500 focus:ring-2'
																			/>
																			<span className='mt-1 block text-xs font-medium text-slate-700'>Entered Score: {scores[activeContestantId]?.[subCriterion.id] ?? '0'}</span>
																		</label>
																	))}
																</div>
															</div>
														)
													})}
												</div>
											) : (
												<div className='mt-3 grid gap-3 xl:grid-cols-2'>
													{criterion.subCriteria.map((subCriterion) => (
														<label key={subCriterion.id} className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
															<span className='block text-sm font-semibold text-cyan-950'>{subCriterion.name}</span>
															<span className='mt-1 block text-xs text-cyan-900/90'>Sub Max: {subCriterion.maxScore.toFixed(2)}</span>
															<input
																suppressHydrationWarning
																data-testid='score-input'
																data-subcriterion-id={subCriterion.id}
																value={scores[activeContestantId]?.[subCriterion.id] ?? '0'}
																onChange={(inputEvent) => updateScore(activeContestantId, subCriterion.id, inputEvent.target.value, subCriterion.maxScore)}
																type='number'
																inputMode='decimal'
																min={0}
																max={subCriterion.maxScore}
																step='0.01'
																className='mt-2 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 placeholder:text-slate-500 caret-slate-900 outline-none ring-cyan-600 transition focus:border-cyan-500 focus:ring-2'
															/>
															<span className='mt-1 block text-xs font-medium text-slate-700'>Entered Score: {scores[activeContestantId]?.[subCriterion.id] ?? '0'}</span>
														</label>
													))}
												</div>
											)}
										</article>
									)
								})
							)}
						</div>
						<div className='mt-6'>
							<label className='block rounded-xl border border-cyan-200 bg-white p-4 text-sm font-medium text-slate-900 shadow-sm'>
								<span className='block text-sm font-semibold text-cyan-950'>Additional Remark (Optional)</span>
								<p className='mt-1 text-xs text-cyan-900/70'>
									Add any additional comments or observations for this contestant.
									{activeContestant.laptopAvailable ? <span className='ml-1 text-cyan-700/70'>(Auto-filled from laptop availability — you may overwrite)</span> : null}
								</p>
								<textarea
									suppressHydrationWarning
									data-testid='additional-remark'
									value={contestantDetails[activeContestantId]?.additionalInfo ?? ''}
									onChange={(inputEvent) => updateContestantDetailsField(activeContestantId, 'additionalInfo', inputEvent.target.value)}
									placeholder='Enter any additional remark here...'
									rows={3}
									className='mt-3 w-full resize-none rounded-lg border border-cyan-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none ring-cyan-600 transition focus:border-cyan-500 focus:ring-2'
								/>
							</label>
						</div>
					</section>

					{error ? <p data-testid='judge-error' className='rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>{error}</p> : null}
					{successMessage ? <p data-testid='judge-success' className='rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700'>{successMessage}</p> : null}

					<div className='flex flex-wrap gap-3'>
						<button suppressHydrationWarning type='button' onClick={() => goToContestant(activeContestantIndex - 1)} disabled={activeContestantIndex === 0} className='rounded-full border border-cyan-300 bg-white px-5 py-2 text-sm font-medium text-cyan-900 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50'>
							Previous Entry
						</button>
						<button suppressHydrationWarning type='button' onClick={() => goToContestant(activeContestantIndex + 1)} disabled={activeContestantIndex >= contestants.length - 1} className='rounded-full border border-cyan-300 bg-white px-5 py-2 text-sm font-medium text-cyan-900 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50'>
							Next Entry
						</button>
						<button suppressHydrationWarning type='submit' disabled={isSaving} data-testid='save-scores' data-draft-status={draftStatus} className='rounded-full bg-cyan-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60'>
							{isSaving ? `Saving ${activeContestant.name}...` : `Save ${activeContestant.name} Scores`}
						</button>
					</div>

					<p className='text-xs text-cyan-900/90'>Tip: Save each contestant right after the presentation. If internet/service fails, scores are kept locally and auto-upload when connection is back.</p>
				</form>
			</div>
		</div>
	)
}
