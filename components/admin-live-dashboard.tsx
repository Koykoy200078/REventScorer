'use client'

import { saveAs } from 'file-saver'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import { AdminHeader, ADMIN_TAB_LABELS } from '@/components/admin/admin-header'
import { BreakdownDialog } from '@/components/admin/breakdown-dialog'
import { DashboardTab } from '@/components/admin/dashboard-tab'
import { INITIAL_MATRIX_VIEW, type MatrixFilterPatch, type MatrixRow, MatrixTab, type MatrixView } from '@/components/admin/matrix-tab'
import { RankingsTab } from '@/components/admin/rankings-tab'
import { TelemetryTab } from '@/components/admin/telemetry-tab'
import type { ConnectionState } from '@/components/admin/connection'
import { EventBand } from '@/components/admin/event-band'
import { Button, buttonClassName } from '@/components/ui/button'
import Dialog from '@/components/ui/dialog'
import Icon from '@/components/ui/icon'
import { TabPanel, Tabs } from '@/components/ui/tabs'
import UnlockDialog from '@/components/unlock-dialog'
import { scoreMatrixRows, toCsv } from '@/lib/admin/csv'
import { entryMaxScore } from '@/lib/judge/members'
import { breakdownRows } from '@/lib/admin/breakdown'
import { createEditorId } from '@/lib/admin/editor-id'
import { participantRankingsByProgram, rankingsBySection, subCriteriaRankingsByProgram, teamsByProgram } from '@/lib/admin/analytics'
import { buildAdminEventEditorSnapshot, criterionTotalScoreForEditor, prepareEventEditorPayloadForSubmit, synchronizeEventEditorDraft, uniqueTrimmedNames } from '@/lib/admin/editor-snapshot'
import { formatDate, formatScore } from '@/lib/admin/format'
import { adminFormulaSentence, scoringKind } from '@/lib/admin/formula'
import { adminKpis, programCohorts } from '@/lib/admin/kpis'
import { assignedJudgeIdsForContestant } from '@/lib/admin/judges'
import { observationsLog, remarkItems } from '@/lib/admin/observations-log'
import { podiumPlaces } from '@/lib/admin/podium'
import { buildProgramAssignmentsFromEvent, type ProgramLabel, resolveProgramLabel } from '@/lib/admin/program'
import { type AdminTab, parseAdminTabParam, searchForTab } from '@/lib/admin/tabs'
import { ADMIN_SAVE_AUTO_SYNC_INTERVAL_MS, AdminSaveError, type AdminSaveRequestBody, isJudgeAssignmentQueuedAction, isProgramAssignmentQueuedAction, isRecord, listQueuedAdminSaveActionsForEvent, type QueuedAdminSaveAction, queuedAdminSaveActionId, type QueuedAdminSaveKind, queuedAdminSaveKindLabel, removeQueuedAdminSaveAction, shouldQueueAdminSave, upsertQueuedAdminSaveAction } from '@/lib/admin/queue'
import { entryStatus, judgeProgress } from '@/lib/admin/status'
import { normalizeRubricLegend } from '@/lib/rubric-legend'
import { shouldKeepQueued } from '@/lib/save-retry'
import type { AdminEventEditorInput, AdminScoreRealtimeUpdate, EventCompiledResults, EventScorer } from '@/lib/types'
import { exportAsExcel, exportSectionAnalyticsAsExcel } from './export-excel'


interface AdminLiveDashboardProps {
	initialEvent: EventScorer
	initialCompiled: EventCompiledResults
	baseUrl: string
	initialOpenEditor?: boolean
	allowEventEditor?: boolean
	wsAuthToken?: string
	/** S5: the page was rendered without the update password, so the judges carry no link or email. */
	initialJudgeLinksLocked?: boolean
	/** The editor flag as the URL has it, whether or not the browser is unlocked (R45; used from Task 7 step 4). */
	openEditor?: boolean
	/** The tab of ?tab= (R40; used from Task 7 step 4). */
	initialTab?: AdminTab
}

interface AdminEventResponse {
	event: EventScorer
	compiled: EventCompiledResults
	error?: string
	judgeLinksLocked?: boolean
}

type PendingQueueFilter = 'all' | QueuedAdminSaveKind

// Phase 3 Task 13: the write a 401 stopped, run once after the unlock.
// The editor's remove buttons: the admin outline button at xs, in rose.
const REMOVE_BUTTON = buttonClassName('admin-remove', 'xs')

type UnlockRetry =
	| { kind: 'program'; assignments: Array<{ contestantId: string; programTag: ProgramLabel | null }> }
	| { kind: 'judge'; contestantId: string; judgeIds: string[] }
	| { kind: 'editor' }
	| { kind: 'open-editor' }
	| { kind: 'queue' }

export function AdminLiveDashboard({ initialEvent, initialCompiled, baseUrl, initialOpenEditor = false, allowEventEditor = false, wsAuthToken, initialJudgeLinksLocked = false, openEditor = false, initialTab = 'dashboard' }: AdminLiveDashboardProps) {
	const [event, setEvent] = useState(initialEvent)
	const [compiled, setCompiled] = useState(initialCompiled)
	const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
	const [lastSignalAt, setLastSignalAt] = useState<string | null>(null)
	const [refreshError, setRefreshError] = useState<string | null>(null)
	const [isRefreshing, setIsRefreshing] = useState(false)
	// Task 7 (R40, R45): the open tab (first from ?tab=, so the first render matches the server) and whether the
	// editor view replaces the tab panel (?update=1 in an unlocked browser). Live refreshes leave both alone.
	const [activeTab, setActiveTab] = useState<AdminTab>(initialTab)
	const [editorView, setEditorView] = useState(allowEventEditor)
	// ?update=1 in a locked browser offers "Unlock to edit" (owner); after the unlock the editor is allowed.
	const [, setEditorAllowed] = useState(allowEventEditor)
	// B57: the card shows only while the page was opened as the editor link (?update=1) and the editor is not open.
	const [editorLinkOpen, setEditorLinkOpen] = useState(openEditor)
	// The tab a click asked for while the editor held unsaved edits: the question is open (owner, 2026-11-22).
	const [pendingLeave, setPendingLeave] = useState<AdminTab | 'hub' | null>(null)
	const router = useRouter()
	// Any tab, or Back, leaves the editor view; the URL follows without a navigation.
	const showTab = useCallback((value: string) => {
		const tab = parseAdminTabParam(value)
		setActiveTab(tab)
		setEditorView(false)
		setEditorLinkOpen(false)
		window.history.replaceState(null, '', window.location.pathname + searchForTab(window.location.search, tab) + window.location.hash)
	}, [])
	const [copiedLink, setCopiedLink] = useState<string | null>(null)
	const [manualAssignments, setManualAssignments] = useState<Record<string, ProgramLabel | null>>(() => buildProgramAssignmentsFromEvent(initialEvent))
	const [isSavingProgramAssignments, setIsSavingProgramAssignments] = useState(false)
	// Only the entry whose Edit Judge is open has a draft (B52: live refreshes leave it alone).
	const [judgeAssignmentDrafts, setJudgeAssignmentDrafts] = useState<Record<string, string[]>>({})
	const [editingJudgeAssignmentForContestantId, setEditingJudgeAssignmentForContestantId] = useState<string | null>(null)
	const [savingJudgeAssignmentForContestantId, setSavingJudgeAssignmentForContestantId] = useState<string | null>(null)
	const [showEventEditor, setShowEventEditor] = useState(Boolean(initialOpenEditor && allowEventEditor))
	const [eventEditorDraft, setEventEditorDraft] = useState<AdminEventEditorInput>(() => synchronizeEventEditorDraft(buildAdminEventEditorSnapshot(initialEvent)))
	// The draft as last loaded from the event (or saved): an open editor whose draft differs from it has unsaved edits.
	const [editorBaseline, setEditorBaseline] = useState<AdminEventEditorInput>(eventEditorDraft)
	const [eventEditorError, setEventEditorError] = useState<string | null>(null)
	const [eventEditorNotice, setEventEditorNotice] = useState<string | null>(null)
	const [isSavingEventEditor, setIsSavingEventEditor] = useState(false)
	const [queuedAdminSaves, setQueuedAdminSaves] = useState<QueuedAdminSaveAction[]>([])
	const [isAutoSyncingAdminSaves, setIsAutoSyncingAdminSaves] = useState(false)
	const [adminQueueNotice, setAdminQueueNotice] = useState<string | null>(null)
	const [pendingQueueFilter, setPendingQueueFilter] = useState<PendingQueueFilter>('all')
	// The matrix's search, filters and page (kept when another tab is shown), and the entry whose Breakdown is open.
	const [matrixView, setMatrixView] = useState<MatrixView>(INITIAL_MATRIX_VIEW)
	const [breakdownId, setBreakdownId] = useState<string | null>(null)
	const [isProgramPasswordModalOpen, setIsProgramPasswordModalOpen] = useState(false)
	const [programPassword, setProgramPassword] = useState('')
	const [programPasswordError, setProgramPasswordError] = useState('')
	const [isVerifyingProgramPassword, setIsVerifyingProgramPassword] = useState(false)
	const [pendingProgramTarget, setPendingProgramTarget] = useState<ProgramLabel | null>(null)
	// B54 (R49): the entries the matrix filter showed when "Set every entry's program" was chosen; only they stay in view.
	const [pendingProgramShownIds, setPendingProgramShownIds] = useState<string[]>([])

	const refreshInFlight = useRef(false)
	// A refresh asked for while one runs is run right after it, so no update is lost.
	const refreshAgain = useRef(false)
	// Phase 3 Task 13 (S5, S6): whether this browser has the update password, the write waiting for
	// it (retried once after the unlock), and whether the queue waits for a sign-in.
	const [judgeLinksLocked, setJudgeLinksLocked] = useState(initialJudgeLinksLocked)
	const [unlockRequest, setUnlockRequest] = useState<{ reason: string; retries: UnlockRetry[] } | null>(null)
	// A second refusal while the prompt is open adds its write; it never replaces the first.
	const askToUnlock = useCallback((reason: string, retry?: UnlockRetry) => {
		setUnlockRequest((current) => (current ? { reason: current.reason, retries: retry ? [...current.retries, retry] : current.retries } : { reason, retries: retry ? [retry] : [] }))
	}, [])
	const signInNeeded = useRef(false)
	const adminAutoSyncInFlight = useRef(false)

	const useWeightedScores = Boolean(compiled.hasWeightedScores)
	const isDirectRatingEvent = Boolean(event.directRatingConfig)
	const useDirectFinalRating = useMemo(() => compiled.rankings.some((result) => typeof result.finalRating === 'number' && Number.isFinite(result.finalRating)), [compiled.rankings])
	const normalizedRubricLegend = useMemo(() => normalizeRubricLegend(event.rubricLegend), [event.rubricLegend])
	const contestantsById = useMemo(() => new Map(event.contestants.map((contestant) => [contestant.id, contestant])), [event.contestants])
	// The most one judge can give an entry: its own member rows, as the judge page counts them (B65).
	const entryMaxOf = (contestantId: string) => entryMaxScore(event.criteria, contestantsById.get(contestantId))
	const judgesById = useMemo(() => new Map(event.judges.map((judge) => [judge.id, judge])), [event.judges])
	const resolvedProgramByContestantId = useMemo(() => {
		const map = new Map<string, ProgramLabel | null>()

		for (const result of compiled.rankings) {
			const manual = manualAssignments[result.contestantId]
			const contestant = contestantsById.get(result.contestantId)
			const currentProgram = resolveProgramLabel(result.contestantName, contestant, manual)
			map.set(result.contestantId, currentProgram)
		}

		return map
	}, [compiled.rankings, contestantsById, manualAssignments])
	const allContestantsBSINT = useMemo(() => compiled.rankings.length > 0 && compiled.rankings.every((result) => resolvedProgramByContestantId.get(result.contestantId) === 'BSINT'), [compiled.rankings, resolvedProgramByContestantId])
	const allContestantsBSCS = useMemo(() => compiled.rankings.length > 0 && compiled.rankings.every((result) => resolvedProgramByContestantId.get(result.contestantId) === 'BSCS'), [compiled.rankings, resolvedProgramByContestantId])
	const analyticsByProgram = useMemo(() => teamsByProgram(compiled.rankings, contestantsById, manualAssignments, useWeightedScores), [compiled.rankings, contestantsById, manualAssignments, useWeightedScores])
	const participantAnalyticsByProgram = useMemo(() => participantRankingsByProgram(compiled.rankings, contestantsById, manualAssignments), [compiled.rankings, contestantsById, manualAssignments])
	const sectionAnalytics = useMemo(() => rankingsBySection(compiled.rankings, contestantsById, manualAssignments, useWeightedScores), [compiled.rankings, contestantsById, manualAssignments, useWeightedScores])
	const subCriteriaAnalyticsByProgram = useMemo(() => subCriteriaRankingsByProgram(event, manualAssignments), [event, manualAssignments])
	const filterOptions = useMemo(() => {
		const strands = new Set<string>()
		const remarks = new Set<string>()
		for (const result of compiled.rankings) {
			if (result.directDetails?.strand) {
				const s = result.directDetails.strand
					.split(' / ')
					.map((v) => v.trim())
					.filter((v) => v)
				s.forEach((val) => strands.add(val))
			}
			if (result.directDetails?.remark) {
				const r = result.directDetails.remark
					.split(' / ')
					.map((v) => v.trim())
					.filter((v) => v)
				r.forEach((val) => remarks.add(val))
			}
		}
		return {
			strands: Array.from(strands).sort(),
			remarks: Array.from(remarks).sort(),
		}
	}, [compiled.rankings])
	const eventEditorRubricTotalScore = useMemo(() => eventEditorDraft.criteria.reduce((sum, criterion) => sum + criterionTotalScoreForEditor(criterion), 0), [eventEditorDraft.criteria])
	const pendingQueueRows = useMemo(
		() =>
			queuedAdminSaves.map((action) => {
				if (isProgramAssignmentQueuedAction(action)) {
					const contestantName = contestantsById.get(action.requestBody.contestantId)?.name ?? action.requestBody.contestantId
					return {
						id: action.id,
						kind: action.kind,
						kindLabel: queuedAdminSaveKindLabel(action.kind),
						summary: action.summary,
						targetLabel: contestantName,
						detail: `Program tag: ${action.requestBody.programTag ?? 'Cleared'}`,
						queuedAt: action.queuedAt,
					}
				}

				if (isJudgeAssignmentQueuedAction(action)) {
					const contestantName = contestantsById.get(action.requestBody.contestantId)?.name ?? action.requestBody.contestantId
					const judgeNames = action.requestBody.judgeIds.map((judgeId) => judgesById.get(judgeId)?.name ?? judgeId)
					return {
						id: action.id,
						kind: action.kind,
						kindLabel: queuedAdminSaveKindLabel(action.kind),
						summary: action.summary,
						targetLabel: contestantName,
						detail: `Assigned judges: ${judgeNames.join(', ')}`,
						queuedAt: action.queuedAt,
					}
				}

				const editorDraft = 'eventEditor' in action.requestBody ? action.requestBody.eventEditor : undefined
				const contestantCount = Array.isArray(editorDraft?.contestants) ? editorDraft.contestants.length : 0
				const judgeCount = Array.isArray(editorDraft?.judges) ? editorDraft.judges.length : 0
				const criterionCount = Array.isArray(editorDraft?.criteria) ? editorDraft.criteria.length : 0

				return {
					id: action.id,
					kind: action.kind,
					kindLabel: queuedAdminSaveKindLabel(action.kind),
					summary: action.summary,
					targetLabel: event.title,
					detail: `Event editor payload: ${contestantCount} contestants, ${judgeCount} judges, ${criterionCount} criteria.`,
					queuedAt: action.queuedAt,
				}
			}),
		[event.title, contestantsById, judgesById, queuedAdminSaves],
	)
	const filteredPendingQueueRows = useMemo(() => {
		if (pendingQueueFilter === 'all') {
			return pendingQueueRows
		}

		return pendingQueueRows.filter((row) => row.kind === pendingQueueFilter)
	}, [pendingQueueFilter, pendingQueueRows])

	useEffect(() => {
		if (showEventEditor || judgeLinksLocked) {
			return
		}

		setEventEditorDraft(synchronizeEventEditorDraft(buildAdminEventEditorSnapshot(event)))
	}, [event, judgeLinksLocked, showEventEditor])

	const updateEventEditorDraft = useCallback((updater: (previous: AdminEventEditorInput) => AdminEventEditorInput) => {
		setEventEditorDraft((previous) => synchronizeEventEditorDraft(updater(previous)))
		setEventEditorError(null)
		setEventEditorNotice(null)
	}, [])

	const copyLink = useCallback(async (value: string) => {
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
			setCopiedLink(value)
			window.setTimeout(() => {
				setCopiedLink((currentValue) => (currentValue === value ? null : currentValue))
			}, 1800)
		} catch (err) {
			console.error('Clipboard copy failed:', err)
			setCopiedLink(null)
		}
	}, [])

	const refreshDashboard = useCallback(async (): Promise<void> => {
		if (refreshInFlight.current) {
			refreshAgain.current = true
			return
		}

		refreshInFlight.current = true
		setIsRefreshing(true)

		try {
			do {
				refreshAgain.current = false
				setRefreshError(null)

				try {
					const response = await fetch(`/api/eventscorer/admin/events/${event.id}`, {
						cache: 'no-store',
					})

					const responseBody = (await response.json()) as AdminEventResponse

					if (!response.ok) {
						throw new Error(responseBody.error ?? 'Unable to refresh results.')
					}

					setEvent(responseBody.event)
					setCompiled(responseBody.compiled)
					setJudgeLinksLocked(responseBody.judgeLinksLocked === true)
				} catch (error) {
					setRefreshError(error instanceof Error ? error.message : 'Unable to refresh results.')
				}
			} while (refreshAgain.current)
		} finally {
			refreshInFlight.current = false
			setIsRefreshing(false)
		}
	}, [event.id])

	const patchAdminEvent = useCallback(
		async (requestBody: AdminSaveRequestBody, targetEventId = event.id): Promise<AdminEventResponse> => {
			const response = await fetch(`/api/eventscorer/admin/events/${targetEventId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody),
			})

			let responseBody: unknown = null
			try {
				responseBody = await response.json()
			} catch {
				responseBody = null
			}

			if (!response.ok) {
				const message = isRecord(responseBody) && typeof responseBody.error === 'string' ? responseBody.error : 'Unable to save admin changes.'
				throw new AdminSaveError(message, response.status)
			}

			if (!isRecord(responseBody) || !isRecord(responseBody.event) || !isRecord(responseBody.compiled)) {
				throw new AdminSaveError('Unexpected response while saving admin changes.', 502)
			}

			return responseBody as unknown as AdminEventResponse
		},
		[event.id],
	)

	const refreshQueuedAdminSaves = useCallback(() => {
		const queued = listQueuedAdminSaveActionsForEvent(event.id)
		setQueuedAdminSaves(queued)

		if (queued.length === 0) {
			return
		}

		const queuedProgramActions = queued.filter(isProgramAssignmentQueuedAction)
		if (queuedProgramActions.length > 0) {
			setManualAssignments((previous) => {
				const next = { ...previous }

				for (const action of queuedProgramActions) {
					next[action.requestBody.contestantId] = action.requestBody.programTag
				}

				return next
			})
		}

		const queuedJudgeActions = queued.filter(isJudgeAssignmentQueuedAction)
		if (queuedJudgeActions.length > 0) {
			setJudgeAssignmentDrafts((previous) => {
				const next = { ...previous }

				for (const action of queuedJudgeActions) {
					next[action.requestBody.contestantId] = [...action.requestBody.judgeIds]
				}

				return next
			})
		}
	}, [event.id])

	const syncQueuedAdminSaves = useCallback(
		async (showNotice = false): Promise<void> => {
			if (adminAutoSyncInFlight.current) {
				return
			}

			// Waiting for a sign-in: only an explicit try (Sync Queue Now, back online) goes on.
			if (!showNotice && signInNeeded.current) {
				return
			}

			if (typeof navigator !== 'undefined' && !navigator.onLine) {
				return
			}

			const pendingSaves = listQueuedAdminSaveActionsForEvent(event.id)
			if (pendingSaves.length === 0) {
				setQueuedAdminSaves([])
				return
			}

			adminAutoSyncInFlight.current = true
			setIsAutoSyncingAdminSaves(true)

			let syncedCount = 0
			let permanentErrorMessage: string | null = null
			let needsSignIn = false

			try {
				for (const pendingSave of pendingSaves) {
					try {
						const responseBody = await patchAdminEvent(pendingSave.requestBody, pendingSave.eventId)
						removeQueuedAdminSaveAction(pendingSave.id)
						syncedCount += 1

						setEvent(responseBody.event)
						setCompiled(responseBody.compiled)
						setJudgeLinksLocked(false)

						if (pendingSave.kind === 'event-editor') {
							setManualAssignments(buildProgramAssignmentsFromEvent(responseBody.event))
							setEditingJudgeAssignmentForContestantId(null)
							const uploaded = synchronizeEventEditorDraft(buildAdminEventEditorSnapshot(responseBody.event))
							setEventEditorDraft(uploaded)
							setEditorBaseline(uploaded)
							setShowEventEditor(false)
							setEventEditorError(null)
							setEventEditorNotice("Queued published event changes uploaded. Judges' scores were kept.")
						}
					} catch (syncError) {
						// Phase 3 Task 13: a refusal that can pass later stays queued and stops the loop (the
						// order is kept); a missing sign-in (401, 403) asks for the update password.
						if (syncError instanceof AdminSaveError && typeof syncError.status === 'number' && syncError.status < 500 && shouldKeepQueued(syncError.status, false)) {
							needsSignIn = syncError.status === 401 || syncError.status === 403
							break
						}

						if (syncError instanceof AdminSaveError && typeof syncError.status === 'number' && syncError.status >= 400 && syncError.status < 500) {
							removeQueuedAdminSaveAction(pendingSave.id)

							if (!permanentErrorMessage) {
								permanentErrorMessage = `Auto-upload skipped ${pendingSave.summary}: ${syncError.message}`
							}

							continue
						}

						break
					}
				}
			} finally {
				refreshQueuedAdminSaves()
				setIsAutoSyncingAdminSaves(false)
				adminAutoSyncInFlight.current = false
			}

			if (syncedCount > 0) {
				setRefreshError(null)

				if (showNotice) {
					setAdminQueueNotice(`Auto-uploaded ${syncedCount} pending admin ${syncedCount === 1 ? 'save' : 'saves'}.`)
				}
			}

			if (permanentErrorMessage) {
				setRefreshError(permanentErrorMessage)
			}

			signInNeeded.current = needsSignIn
			if (needsSignIn) {
				setAdminQueueNotice('Sign-in needed: unlock to upload queued changes.')
				askToUnlock('Uploading the queued changes needs the update password.', { kind: 'queue' })
			}
		},
		[askToUnlock, event.id, patchAdminEvent, refreshQueuedAdminSaves],
	)

	useEffect(() => {
		refreshQueuedAdminSaves()
		void syncQueuedAdminSaves(false)
	}, [refreshQueuedAdminSaves, syncQueuedAdminSaves])

	useEffect(() => {
		const handleOnline = () => {
			void syncQueuedAdminSaves(true)
		}

		window.addEventListener('online', handleOnline)

		return () => {
			window.removeEventListener('online', handleOnline)
		}
	}, [syncQueuedAdminSaves])

	useEffect(() => {
		if (queuedAdminSaves.length === 0) {
			return
		}

		const intervalId = window.setInterval(() => {
			void syncQueuedAdminSaves(false)
		}, ADMIN_SAVE_AUTO_SYNC_INTERVAL_MS)

		return () => {
			window.clearInterval(intervalId)
		}
	}, [queuedAdminSaves.length, syncQueuedAdminSaves])

	useEffect(() => {
		if (queuedAdminSaves.length === 0) return

		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault()
			e.returnValue = ''
		}

		window.addEventListener('beforeunload', handleBeforeUnload)
		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload)
		}
	}, [queuedAdminSaves.length])

	// B41: a program change that was not saved (refused, or its unlock cancelled) is taken back:
	// dropping the local override shows what the server holds again.
	const takeBackProgramChanges = useCallback((assignments: Array<{ contestantId: string }>) => {
		setManualAssignments((previous) => {
			const next = { ...previous }
			for (const assignment of assignments) {
				delete next[assignment.contestantId]
			}
			return next
		})
	}, [])

	const saveProgramAssignments = useCallback(
		async (assignments: Array<{ contestantId: string; programTag: ProgramLabel | null }>) => {
			if (assignments.length === 0) {
				return
			}

			setIsSavingProgramAssignments(true)
			setRefreshError(null)

			try {
				const responseBody = await patchAdminEvent({ programAssignments: assignments })

				setEvent(responseBody.event)
				setCompiled(responseBody.compiled)
				setJudgeLinksLocked(false)
				setAdminQueueNotice(null)
			} catch (error) {
				if (error instanceof AdminSaveError && error.status === 401) {
					askToUnlock('Changing a program needs the update password.', { kind: 'program', assignments })
				} else if (shouldQueueAdminSave(error)) {
					for (const assignment of assignments) {
						const contestantName = contestantsById.get(assignment.contestantId)?.name ?? assignment.contestantId

						upsertQueuedAdminSaveAction({
							id: queuedAdminSaveActionId(event.id, 'program-assignment', assignment.contestantId),
							eventId: event.id,
							kind: 'program-assignment',
							requestBody: {
								contestantId: assignment.contestantId,
								programTag: assignment.programTag,
							},
							queuedAt: new Date().toISOString(),
							summary: `program assignment for ${contestantName}`,
						})
					}

					refreshQueuedAdminSaves()
					setRefreshError(null)
					setAdminQueueNotice('Program assignment changes were saved locally and queued for auto-upload.')
					void syncQueuedAdminSaves(false)
				} else {
					setRefreshError(error instanceof Error ? error.message : 'Unable to update program tag assignments.')
					takeBackProgramChanges(assignments)
				}
			} finally {
				setIsSavingProgramAssignments(false)
			}
		},
		[askToUnlock, contestantsById, event.id, patchAdminEvent, refreshQueuedAdminSaves, syncQueuedAdminSaves, takeBackProgramChanges],
	)

	const setProgramForAllContestants = useCallback(
		(program: ProgramLabel | null) => {
			const assignments = compiled.rankings.map((result) => ({ contestantId: result.contestantId, programTag: program }))

			setManualAssignments((previous) => {
				const next = { ...previous }

				for (const result of compiled.rankings) {
					next[result.contestantId] = program
				}

				return next
			})

			void saveProgramAssignments(assignments)
		},
		[compiled.rankings, saveProgramAssignments],
	)

	const programPasswordRef = useRef<HTMLInputElement>(null)
	const programPasswordFormId = useId()
	const cancelProgramPassword = () => {
		setIsProgramPasswordModalOpen(false)
		setProgramPassword('')
		setProgramPasswordError('')
		setPendingProgramTarget(null)
	}
	const handleProgramPasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		if (!programPassword.trim()) {
			setProgramPasswordError('Password is required.')
			return
		}
		setIsVerifyingProgramPassword(true)
		setProgramPasswordError('')
		try {
			const response = await fetch('/api/admin/update-auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: programPassword }),
			})
			if (!response.ok) {
				const responseBody = (await response.json().catch(() => null)) as { error?: string } | null
				setProgramPasswordError(responseBody?.error || 'Incorrect password.')
				return
			}
			setProgramForAllContestants(pendingProgramTarget)
			// B54 (R49): only the rows the filter showed stay in view; the others keep filtering as before.
			keepMatrixRows(pendingProgramShownIds)
			setIsProgramPasswordModalOpen(false)
			setProgramPassword('')
			setProgramPasswordError('')
			setPendingProgramTarget(null)
		} catch (error) {
			console.error('Password verification error:', error)
			setProgramPasswordError('Unable to verify password. Try again.')
		} finally {
			setIsVerifyingProgramPassword(false)
		}
	}

	const changeMatrixFilter = useCallback((patch: MatrixFilterPatch) => {
		setMatrixView((previous) => ({ ...previous, ...patch, page: 1, keep: [] }))
	}, [])
	const keepMatrixRows = useCallback((contestantIds: string[]) => {
		setMatrixView((previous) => ({ ...previous, keep: Array.from(new Set([...previous.keep, ...contestantIds])) }))
	}, [])

	const toggleContestantProgram = useCallback(
		(contestantId: string, selectedProgram: ProgramLabel) => {
			const currentProgram = resolvedProgramByContestantId.get(contestantId) ?? null
			const nextProgram = currentProgram === selectedProgram ? null : selectedProgram

			setManualAssignments((previous) => ({
				...previous,
				[contestantId]: nextProgram,
			}))
			keepMatrixRows([contestantId])

			void saveProgramAssignments([{ contestantId, programTag: nextProgram }])
		},
		[keepMatrixRows, resolvedProgramByContestantId, saveProgramAssignments],
	)

	const openJudgeSwap = useCallback(
		(contestantId: string) => {
			setEditingJudgeAssignmentForContestantId(contestantId)
			setJudgeAssignmentDrafts({ [contestantId]: assignedJudgeIdsForContestant(event, contestantId) })
		},
		[event],
	)
	const closeJudgeSwap = useCallback(() => {
		setEditingJudgeAssignmentForContestantId(null)
		setJudgeAssignmentDrafts({})
	}, [])

	const toggleJudgeAssignment = useCallback(
		(contestantId: string, judgeId: string) => {
			setJudgeAssignmentDrafts((previous) => {
				const currentJudgeIds = previous[contestantId] ?? assignedJudgeIdsForContestant(event, contestantId)
				const nextJudgeIds = new Set(currentJudgeIds)

				if (nextJudgeIds.has(judgeId)) {
					if (nextJudgeIds.size === 1) {
						return previous
					}

					nextJudgeIds.delete(judgeId)
				} else {
					nextJudgeIds.add(judgeId)
				}

				return {
					...previous,
					[contestantId]: Array.from(nextJudgeIds),
				}
			})
		},
		[event],
	)

	const saveJudgeAssignment = useCallback(
		async (contestantId: string, retryJudgeIds?: string[]) => {
			const judgeIds = retryJudgeIds ?? judgeAssignmentDrafts[contestantId] ?? assignedJudgeIdsForContestant(event, contestantId)

			if (judgeIds.length === 0) {
				setRefreshError('At least 1 judge must be assigned to each participant.')
				return
			}

			setSavingJudgeAssignmentForContestantId(contestantId)
			setRefreshError(null)

			try {
				const responseBody = await patchAdminEvent({ contestantId, judgeIds })

				setEvent(responseBody.event)
				setCompiled(responseBody.compiled)
				setJudgeLinksLocked(false)
				closeJudgeSwap()
				setAdminQueueNotice(null)
			} catch (error) {
				if (error instanceof AdminSaveError && error.status === 401) {
					askToUnlock('Changing who judges an entry needs the update password.', { kind: 'judge', contestantId, judgeIds: [...judgeIds] })
				} else if (shouldQueueAdminSave(error)) {
					const contestantName = contestantsById.get(contestantId)?.name ?? contestantId

					upsertQueuedAdminSaveAction({
						id: queuedAdminSaveActionId(event.id, 'judge-assignment', contestantId),
						eventId: event.id,
						kind: 'judge-assignment',
						requestBody: {
							contestantId,
							judgeIds: [...judgeIds],
						},
						queuedAt: new Date().toISOString(),
						summary: `judge assignment for ${contestantName}`,
					})

					refreshQueuedAdminSaves()
					setRefreshError(null)
					setAdminQueueNotice(`Judge assignment for ${contestantName} was saved locally and queued for auto-upload.`)
					closeJudgeSwap()
					void syncQueuedAdminSaves(false)
				} else {
					setRefreshError(error instanceof Error ? error.message : 'Unable to update judge assignment.')
				}
			} finally {
				setSavingJudgeAssignmentForContestantId(null)
			}
		},
		[askToUnlock, closeJudgeSwap, contestantsById, event, judgeAssignmentDrafts, patchAdminEvent, refreshQueuedAdminSaves, syncQueuedAdminSaves],
	)

	const loadEventEditorFromCurrentEvent = useCallback(() => {
		const loaded = synchronizeEventEditorDraft(buildAdminEventEditorSnapshot(event))
		setEventEditorDraft(loaded)
		setEditorBaseline(loaded)
		setEventEditorError(null)
		setEventEditorNotice(null)
	}, [event])

	const openEditorUnlocked = useCallback(async () => {
		try {
			const response = await fetch(`/api/eventscorer/admin/events/${event.id}`, { cache: 'no-store' })
			const responseBody = (await response.json()) as AdminEventResponse
			if (!response.ok) throw new Error(responseBody.error ?? 'Unable to load the event.')
			setEvent(responseBody.event)
			setCompiled(responseBody.compiled)
			setJudgeLinksLocked(responseBody.judgeLinksLocked === true)
			// The editor saves every judge with its link and email, so it opens only on the unlocked event (S5).
			if (responseBody.judgeLinksLocked === true) throw new Error('This browser is still locked; unlock it to edit the event.')
			const loaded = synchronizeEventEditorDraft(buildAdminEventEditorSnapshot(responseBody.event))
			setEventEditorDraft(loaded)
			setEditorBaseline(loaded)
			setEventEditorError(null)
			setEventEditorNotice(null)
			setShowEventEditor(true)
			setEditorAllowed(true)
			setEditorView(true)
		} catch (error) {
			setRefreshError(error instanceof Error ? error.message : 'Unable to load the event.')
		}
	}, [event.id])
	// B57, B67: open the editor if this browser is unlocked (here or in another tab); otherwise ask for the password
	// and open it after the unlock.
	const requestEditor = useCallback(async () => {
		try {
			const response = await fetch(`/api/eventscorer/admin/events/${event.id}`, { cache: 'no-store' })
			const responseBody = (await response.json()) as AdminEventResponse
			if (response.ok && responseBody.judgeLinksLocked !== true) {
				await openEditorUnlocked()
				return
			}
		} catch {
			// Asking for the password below is the safe answer to any failure.
		}
		askToUnlock('Editing the published event needs the update password.', { kind: 'open-editor' })
	}, [event.id, openEditorUnlocked, askToUnlock])

	const saveEventEditor = useCallback(async () => {
		setEventEditorError(null)
		setEventEditorNotice(null)
		setRefreshError(null)

		const preparedEditor = prepareEventEditorPayloadForSubmit(eventEditorDraft, event)
		setEventEditorDraft(preparedEditor)

		setIsSavingEventEditor(true)

		try {
			const responseBody = await patchAdminEvent({ eventEditor: preparedEditor })

			setEvent(responseBody.event)
			setCompiled(responseBody.compiled)
			setJudgeLinksLocked(false)
			setManualAssignments(buildProgramAssignmentsFromEvent(responseBody.event))
			setEditingJudgeAssignmentForContestantId(null)
			const saved = synchronizeEventEditorDraft(buildAdminEventEditorSnapshot(responseBody.event))
			setEventEditorDraft(saved)
			setEditorBaseline(saved)
			setEventEditorNotice("Published event updated. Judges' scores were kept.")
			setAdminQueueNotice(null)
			setShowEventEditor(false)
		} catch (error) {
			if (error instanceof AdminSaveError && error.status === 401) {
				askToUnlock('Saving the event needs the update password.', { kind: 'editor' })
			} else if (shouldQueueAdminSave(error)) {
				upsertQueuedAdminSaveAction({
					id: queuedAdminSaveActionId(event.id, 'event-editor'),
					eventId: event.id,
					kind: 'event-editor',
					requestBody: {
						eventEditor: preparedEditor,
					},
					queuedAt: new Date().toISOString(),
					summary: 'published event changes',
				})

				refreshQueuedAdminSaves()
				setEditorBaseline(preparedEditor)
				setEventEditorError(null)
				setEventEditorNotice('Published event changes were saved locally and queued for auto-upload. They will sync automatically when internet/service is available.')
				setAdminQueueNotice('Published event changes are queued for auto-upload.')
				void syncQueuedAdminSaves(false)
			} else {
				setEventEditorError(error instanceof Error ? error.message : 'Unable to update published event.')
			}
		} finally {
			setIsSavingEventEditor(false)
		}
	}, [askToUnlock, event, eventEditorDraft, patchAdminEvent, refreshQueuedAdminSaves, syncQueuedAdminSaves])

	useEffect(() => {
		const eventId = event.id
		let socket: WebSocket | null = null
		let reconnectTimer: number | null = null
		let isDisposed = false

		const parsePort = (value: string | undefined, fallback: number) => {
			const parsed = Number.parseInt(value || '', 10)
			return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
		}

		const backendPort = parsePort(process.env.NEXT_PUBLIC_BACKEND_PORT, 3007)
		const backendHttpPort = parsePort(process.env.NEXT_PUBLIC_BACKEND_HTTP_PORT, backendPort)

		function buildSocketCandidates(): string[] {
			const host = window.location.hostname
			const isSecurePage = window.location.protocol === 'https:'
			const queryParams = new URLSearchParams({ eventId })
			if (wsAuthToken) {
				queryParams.set('auth', wsAuthToken)
			}
			const query = `?${queryParams.toString()}`
			const path = `/ws/admin-scores${query}`

			const candidates: string[] = []
			const pushUnique = (url: string) => {
				if (!candidates.includes(url)) candidates.push(url)
			}

			if (isSecurePage) {
				pushUnique(`wss://${host}:${backendPort}${path}`)
				return candidates
			}

			const portCandidates = Array.from(new Set([backendHttpPort, backendPort]))

			// On HTTP pages, prefer the backend's plain HTTP listener first.
			for (const port of portCandidates) {
				pushUnique(`ws://${host}:${port}${path}`)
			}

			return candidates
		}

		function connectSocket() {
			if (isDisposed) {
				return
			}

			setConnectionState((current) => (current === 'connected' ? 'reconnecting' : 'connecting'))
			const candidates = buildSocketCandidates()

			const openCandidate = (index: number) => {
				if (isDisposed) {
					return
				}

				if (index >= candidates.length) {
					setConnectionState('reconnecting')
					reconnectTimer = window.setTimeout(connectSocket, 1700)
					return
				}

				const socketUrl = candidates[index]
				let opened = false
				let advanced = false

				const advance = () => {
					if (advanced || isDisposed) {
						return
					}
					advanced = true
					openCandidate(index + 1)
				}

				try {
					const currentSocket = new WebSocket(socketUrl)
					socket = currentSocket

					currentSocket.onopen = () => {
						if (isDisposed) {
							return
						}

						opened = true
						setConnectionState('connected')
					}

					currentSocket.onmessage = async (messageEvent) => {
						try {
							const decoded = JSON.parse(String(messageEvent.data)) as {
								type?: string
								data?: AdminScoreRealtimeUpdate
							}

							if (decoded.type !== 'score:update' || !decoded.data) {
								return
							}

							setLastSignalAt(decoded.data.submittedAt ?? new Date().toISOString())
							await refreshDashboard()
						} catch {
							// Ignore malformed websocket frames and keep session alive.
						}
					}

					currentSocket.onerror = () => {
						if (!opened) {
							try {
								currentSocket.close()
							} catch {
								// ignore close failures
							}
							advance()
							return
						}

						currentSocket.close()
					}

					currentSocket.onclose = () => {
						if (isDisposed) {
							return
						}

						if (!opened) {
							advance()
							return
						}

						setConnectionState('reconnecting')
						reconnectTimer = window.setTimeout(connectSocket, 1700)
					}
				} catch {
					advance()
				}
			}

			openCandidate(0)
		}

		connectSocket()

		return () => {
			isDisposed = true
			setConnectionState('disconnected')

			if (reconnectTimer !== null) {
				window.clearTimeout(reconnectTimer)
			}

			if (socket) {
				if (socket.readyState === WebSocket.CONNECTING) {
					socket.onopen = () => {
						if (socket) {
							socket.close()
						}
					}
				} else {
					socket.close()
				}
			}
		}
	}, [event.id, refreshDashboard, wsAuthToken])

	// The program each entry shows (a manual choice, the stored tag, else its name), as the matrix resolves it.
	const programOf = (contestantId: string) => {
		const contestant = contestantsById.get(contestantId)
		return resolveProgramLabel(contestant?.name ?? '', contestant, manualAssignments[contestantId])
	}
	const scoring = scoringKind(compiled)
	const judgesWithSaves = new Set(compiled.judgeBreakdown.filter((judge) => Object.keys(judge.totalsByContestant).length > 0).map((judge) => judge.judgeId))

	// Leaving the editor view with unsaved edits asks first (owner, 2026-11-22); without edits it leaves at once.
	// A save in flight is not "unsaved" either: it completes whatever the person does next (finding 3).
	const editorHasUnsavedEdits = showEventEditor && !isSavingEventEditor && JSON.stringify(eventEditorDraft) !== JSON.stringify(editorBaseline)
	const requestTab = (value: string) => {
		if (editorView && editorHasUnsavedEdits) setPendingLeave(parseAdminTabParam(value))
		else showTab(value)
	}
	const leaveEditor = () => {
		const target = pendingLeave ?? activeTab
		setPendingLeave(null)
		loadEventEditorFromCurrentEvent()
		if (target === 'hub') router.push('/')
		else {
			showTab(target)
			// B59: the button that asked (Back, or a tab) may be gone; the focus goes to the tab now shown.
			requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="admin-tab"][data-tab="${target}"]`)?.focus())
		}
	}
	// Admin Hub leaves the page by a Next navigation (no beforeunload): it asks the same question (finding 2).
	const guardLeavePage = (clickEvent: React.MouseEvent<HTMLAnchorElement>) => {
		if (!(editorView && editorHasUnsavedEdits)) return
		clickEvent.preventDefault()
		setPendingLeave('hub')
	}

	const editorLeaveGuard = editorView && editorHasUnsavedEdits
	useEffect(() => {
		if (!editorLeaveGuard) return
		const onBeforeUnload = (beforeUnload: BeforeUnloadEvent) => {
			beforeUnload.preventDefault()
			beforeUnload.returnValue = ''
		}
		window.addEventListener('beforeunload', onBeforeUnload)
		return () => window.removeEventListener('beforeunload', onBeforeUnload)
	}, [editorLeaveGuard])

	// One matrix row per ranking: its filter fields, status (R47) and assigned judges' chips (R50).
	const splitValues = (value: string | undefined) => (value ?? '').split(' / ').map((part) => part.trim()).filter(Boolean)
	const matrixRows: MatrixRow[] = compiled.rankings.map((result) => {
		const contestant = contestantsById.get(result.contestantId)
		const assigned = assignedJudgeIdsForContestant(event, result.contestantId)
		const status = entryStatus(result.contestantId, assigned, compiled.judgeBreakdown)
		return {
			result,
			status,
			section: contestant?.section?.trim() || undefined,
			isIndividual: contestant?.entryType === 'individual',
			entry: {
				contestantId: result.contestantId,
				name: result.contestantName,
				section: contestant?.section,
				participants: contestant?.participants ?? [],
				program: resolvedProgramByContestantId.get(result.contestantId) ?? null,
				status: status.kind,
				strands: splitValues(result.directDetails?.strand),
				remarks: splitValues(result.directDetails?.remark),
			},
			judges: event.judges
				.filter((judge) => assigned.includes(judge.id))
				.map((judge) => {
					const totals = compiled.judgeBreakdown.find((item) => item.judgeId === judge.id)?.totalsByContestant ?? {}
					const scored = Object.prototype.hasOwnProperty.call(totals, result.contestantId)
					return { id: judge.id, name: judge.name, scored, total: scored ? totals[result.contestantId] : null }
				}),
		}
	})
	const breakdownResult = breakdownId ? (compiled.rankings.find((result) => result.contestantId === breakdownId) ?? null) : null

	const rankOf = (contestantId: string) => compiled.rankings.find((result) => result.contestantId === contestantId)?.rank
	// "{title} - Observations Log.txt": every remark the judges saved, newest submission first.
	const exportObservations = () => {
		saveAs(new Blob([observationsLog(event.title, remarkItems(event, rankOf, scoring === 'direct'))], { type: 'text/plain;charset=utf-8' }), `${event.title} - Observations Log.txt`)
	}

	// Every entry, in rank order, whatever the matrix filters (R52).
	const exportCsv = () => {
		const statusOf = (contestantId: string) => entryStatus(contestantId, assignedJudgeIdsForContestant(event, contestantId), compiled.judgeBreakdown)
		saveAs(new Blob([toCsv(scoreMatrixRows(event, compiled, programOf, statusOf))], { type: 'text/csv;charset=utf-8' }), `${event.title} - Score Matrix.csv`)
	}

	return (
		<div className='theme-admin min-h-screen bg-slate-50 font-body-md text-body-md text-slate-900 antialiased'>
			<Tabs variant='admin' value={editorView ? 'editor' : activeTab} onChange={requestTab}>
				<AdminHeader title={event.title} connectionState={connectionState} onPrint={() => window.print()} onExportExcel={() => exportAsExcel(event, compiled)} onExportCsv={exportCsv} onLeavePage={guardLeavePage} />
				{/* SCREEN VIEW */}
				{/* pb-24: the end of the page (the matrix pager) stays clear of the round scroll button (B73). */}
				<main className='w-full pt-28 pb-24 print:hidden'>
					<EventBand
						event={event}
						formula={adminFormulaSentence(event, compiled)}
						connectionState={connectionState}
						lastSignalAt={lastSignalAt}
						pendingCount={queuedAdminSaves.length}
						autoSyncing={isAutoSyncingAdminSaves}
						refreshing={isRefreshing}
						onForceSync={() => void refreshDashboard()}
					/>
				<div className='w-full px-gutter-desktop py-space-xl flex flex-col gap-space-xl'>

					{refreshError ? <section data-testid='admin-error' role='alert' className='rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800'>{refreshError}</section> : null}
					{adminQueueNotice ? <section data-testid='admin-queue-notice' className='rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800'>{adminQueueNotice}</section> : null}
					{queuedAdminSaves.length > 0 ? (
						<section data-testid='pending-queue' className='rounded-xl border border-amber-300 bg-amber-50/80 px-4 py-4'>
							<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
								<div>
									<h2 className='text-sm font-semibold uppercase tracking-wide text-amber-900'>Pending Queue</h2>
									<p className='mt-1 text-xs text-amber-800'>These local admin changes are waiting to sync.</p>
									<div className='mt-2 flex flex-wrap items-center gap-2'>
										{(
											[
												{ id: 'all', label: 'All' },
												{ id: 'program-assignment', label: 'Program' },
												{ id: 'judge-assignment', label: 'Judge' },
												{ id: 'event-editor', label: 'Event Editor' },
											] as Array<{ id: PendingQueueFilter; label: string }>
										).map((option) => {
											const isActive = pendingQueueFilter === option.id

											return (
												<button key={option.id} type='button' data-testid='pending-filter' data-filter={option.id} aria-pressed={isActive} onClick={() => setPendingQueueFilter(option.id)} className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${isActive ? 'border-amber-700 bg-amber-900 text-white' : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100'}`}>
													{option.label}
												</button>
											)
										})}
									</div>
								</div>
								<button
									type='button' data-testid='sync-queue'
									onClick={() => {
										void syncQueuedAdminSaves(true)
									}}
									disabled={isAutoSyncingAdminSaves}
									className='rounded-full border border-amber-400 bg-white px-4 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60'>
									{isAutoSyncingAdminSaves ? 'Syncing Queue...' : 'Sync Queue Now'}
								</button>
							</div>

							<div className='mt-3 space-y-2'>
								{filteredPendingQueueRows.length > 0 ? (
									filteredPendingQueueRows.map((row) => (
										<article key={row.id} data-testid='pending-row' data-kind={row.kind} className='rounded-xl border border-amber-200 bg-white/90 px-3 py-2'>
											<div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'>
												<p className='text-[11px] font-semibold uppercase tracking-wide text-amber-900'>{row.kindLabel}</p>
												<p className='text-[11px] text-amber-800'>Queued {formatDate(row.queuedAt)}</p>
											</div>
											<p className='mt-1 text-sm font-medium text-amber-950'>{row.targetLabel}</p>
											<p className='mt-1 text-xs text-amber-900'>{row.detail}</p>
											<p className='mt-1 text-[11px] text-amber-800/90'>Change: {row.summary}</p>
										</article>
									))
								) : (
									<p className='rounded-xl border border-amber-200 bg-white/80 px-3 py-2 text-xs text-amber-800'>No queued items for this filter.</p>
								)}
							</div>
						</section>
					) : null}

					{editorLinkOpen && !editorView ? (
						<section aria-label='Edit the event' className='rounded-xl border border-slate-200 bg-white p-space-lg shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-space-md'>
							<div>
								<h2 className='font-headline-sm text-headline-sm text-slate-900 font-bold'>Edit the published event</h2>
								<p className='font-body-sm text-body-sm text-slate-600 mt-0.5'>This link opens the event editor. Editing needs the update password.</p>
							</div>
							<Button variant='admin-primary' icon='lock' data-testid='unlock-to-edit' className='self-start sm:self-auto' onClick={() => void requestEditor()}>
								Unlock to edit
							</Button>
						</section>
					) : null}

					{editorView ? (
						<section data-testid='event-editor' className='bg-white rounded-xl p-space-lg border border-slate-200 shadow-xs'>
							<div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
								<div>
									<h2 className='font-headline-md text-headline-md text-slate-900 font-bold'>Edit After Publish</h2>
									<p className='mt-1 font-body-sm text-body-sm text-slate-600'>Edit judges, rubric criteria, contestants/participants, presentation slots{isDirectRatingEvent ? '' : ', and rubric legend'} directly from this dashboard.</p>
									<p className='mt-2 flex items-start gap-space-xs font-body-sm text-body-sm text-slate-600'>
										<Icon name='info' className='text-[16px] text-sky-600 mt-0.5' />
										<span>Saving keeps judges&apos; scores for entries and criteria that remain; scores for removed ones are deleted.</span>
									</p>
								</div>
								<div className='flex flex-wrap items-center gap-2'>
									<Button variant='admin-outline' icon='arrow_back' data-testid='editor-back' onClick={() => requestTab(activeTab)}>
										Back to {ADMIN_TAB_LABELS[activeTab]}
									</Button>
									<button
										type='button' data-testid='editor-toggle'
										onClick={() => {
											setShowEventEditor((current) => !current)
											if (!showEventEditor) {
												loadEventEditorFromCurrentEvent()
											}
										}}
										className={buttonClassName('admin-outline')}>
										{showEventEditor ? 'Hide Editor' : 'Open Editor Fields'}
									</button>
									<button type='button' onClick={loadEventEditorFromCurrentEvent} className={buttonClassName('admin-outline')}>
										Reload Snapshot
									</button>
								</div>
							</div>

							{eventEditorError ? <p data-testid='editor-error' className='mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 font-body-sm text-body-sm text-rose-800'>{eventEditorError}</p> : null}
							{eventEditorNotice ? <p data-testid='editor-notice' className='mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-body-sm text-body-sm text-emerald-800'>{eventEditorNotice}</p> : null}

							{showEventEditor ? (
								<div className='mt-4 space-y-6'>
									<section className='bg-slate-50 border border-slate-200 p-space-md rounded-lg'>
										<h3 className='font-label-sm text-label-sm text-slate-500 uppercase font-bold tracking-wider'>Event Details</h3>
										<div className='mt-3 grid gap-3 sm:grid-cols-2'>
											<label className='font-body-sm text-body-sm text-slate-500'>
												Title
												<input
													type='text'
													value={eventEditorDraft.title}
													onChange={(event) => {
														const value = event.target.value
														updateEventEditorDraft((previous) => ({ ...previous, title: value }))
													}}
													className='mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
												/>
											</label>

											<label className='font-body-sm text-body-sm text-slate-500'>
												Created By
												<input
													type='text'
													value={eventEditorDraft.createdBy ?? ''}
													onChange={(event) => {
														const value = event.target.value
														updateEventEditorDraft((previous) => ({ ...previous, createdBy: value }))
													}}
													className='mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
												/>
											</label>

											<label className='font-body-sm text-body-sm text-slate-500'>
												Scoring Type
												<select
													value={eventEditorDraft.eventScoringType ?? 'standard'}
													onChange={(event) => {
														const value = event.target.value === 'final-oral-defense' ? 'final-oral-defense' : 'standard'
														updateEventEditorDraft((previous) => ({ ...previous, eventScoringType: value }))
													}}
													className='mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'>
													<option value='standard'>Standard</option>
													<option value='final-oral-defense'>Final Oral Defense</option>
												</select>
											</label>

											<label className='sm:col-span-2 font-body-sm text-body-sm text-slate-500'>
												Description
												<textarea
													value={eventEditorDraft.description ?? ''}
													onChange={(event) => {
														const value = event.target.value
														updateEventEditorDraft((previous) => ({ ...previous, description: value }))
													}}
													rows={3}
													className='mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
												/>
											</label>
										</div>
									</section>

									{!isDirectRatingEvent ? (
										<section className='bg-slate-50 border border-slate-200 p-space-md rounded-lg'>
											<div className='flex items-center justify-between gap-2'>
												<h3 className='font-label-sm text-label-sm text-slate-500 uppercase font-bold tracking-wider'>Rubric Legend</h3>
												<div className='flex gap-2'>
													<button
														type='button'
														onClick={() => {
															updateEventEditorDraft((previous) => ({
																...previous,
																rubricLegend: [...normalizeRubricLegend(previous.rubricLegend), { score: 0, label: '' }],
															}))
														}}
														className={buttonClassName('admin-outline', 'xs')}>
														Add Legend Row
													</button>
													<button
														type='button'
														onClick={() => {
															updateEventEditorDraft((previous) => ({ ...previous, rubricLegend: normalizeRubricLegend(undefined) }))
														}}
														className={buttonClassName('admin-outline', 'xs')}>
														Reset Default
													</button>
												</div>
											</div>

											<div className='mt-3 space-y-2'>
												{normalizeRubricLegend(eventEditorDraft.rubricLegend).map((legendItem, legendIndex) => (
													<div key={`legend-${legendIndex}`} className='grid gap-2 sm:grid-cols-[120px_1fr_auto]'>
														<input
															type='number'
															aria-label={`Legend score ${legendIndex + 1}`}
															step='1'
															value={legendItem.score}
															onChange={(event) => {
																const numericScore = Number(event.target.value)
																updateEventEditorDraft((previous) => ({
																	...previous,
																	rubricLegend: normalizeRubricLegend(previous.rubricLegend).map((item, itemIndex) => (itemIndex === legendIndex ? { ...item, score: Number.isFinite(numericScore) ? numericScore : 0 } : item)),
																}))
															}}
															className='rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
														/>
														<input
															type='text'
															aria-label={`Legend meaning ${legendIndex + 1}`}
															value={legendItem.label}
															onChange={(event) => {
																const value = event.target.value
																updateEventEditorDraft((previous) => ({
																	...previous,
																	rubricLegend: normalizeRubricLegend(previous.rubricLegend).map((item, itemIndex) => (itemIndex === legendIndex ? { ...item, label: value } : item)),
																}))
															}}
															className='rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
														/>
														<button
															type='button'
															onClick={() => {
																updateEventEditorDraft((previous) => ({
																	...previous,
																	rubricLegend: normalizeRubricLegend(previous.rubricLegend).filter((_, itemIndex) => itemIndex !== legendIndex),
																}))
															}}
															className={REMOVE_BUTTON}>
															Remove
														</button>
													</div>
												))}
											</div>
										</section>
									) : null}

									<section className='bg-slate-50 border border-slate-200 p-space-md rounded-lg'>
										<div className='flex items-center justify-between gap-2'>
											<h3 className='font-label-sm text-label-sm text-slate-500 uppercase font-bold tracking-wider'>Judges</h3>
											<button
												type='button'
												onClick={() => {
													updateEventEditorDraft((previous) => ({
														...previous,
														judges: [...previous.judges, { id: createEditorId(), name: '', email: '' }],
													}))
												}}
												className={buttonClassName('admin-outline', 'xs')}>
												Add Judge
											</button>
										</div>

										<div className='mt-3 space-y-2'>
											{eventEditorDraft.judges.map((judge, judgeIndex) => (
												<div key={judge.id ?? `judge-${judgeIndex}`} className='grid gap-2 sm:grid-cols-[1fr_1fr_auto]'>
													<input
														type='text'
														placeholder='Judge name'
														value={judge.name}
														onChange={(event) => {
															const value = event.target.value
															updateEventEditorDraft((previous) => ({
																...previous,
																judges: previous.judges.map((item, itemIndex) => (itemIndex === judgeIndex ? { ...item, name: value } : item)),
															}))
														}}
														className='rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
													/>
													<input
														type='text'
														placeholder='Email (optional)'
														value={judge.email ?? ''}
														onChange={(event) => {
															const value = event.target.value
															updateEventEditorDraft((previous) => ({
																...previous,
																judges: previous.judges.map((item, itemIndex) => (itemIndex === judgeIndex ? { ...item, email: value } : item)),
															}))
														}}
														className='rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
													/>
													<button
														type='button'
														onClick={() => {
															updateEventEditorDraft((previous) => ({
																...previous,
																judges: previous.judges.filter((_, itemIndex) => itemIndex !== judgeIndex),
															}))
														}}
														className={REMOVE_BUTTON}>
														Remove
													</button>
												</div>
											))}
										</div>
									</section>

									<section className='bg-slate-50 border border-slate-200 p-space-md rounded-lg'>
										<div className='flex items-center justify-between gap-2'>
											<h3 className='font-label-sm text-label-sm text-slate-500 uppercase font-bold tracking-wider'>Contestants / Entries</h3>
											<button
												type='button'
												onClick={() => {
													updateEventEditorDraft((previous) => ({
														...previous,
														contestants: [...previous.contestants, { id: createEditorId(), name: '', entryType: 'group', participants: [], programTag: null, noatScore: null }],
													}))
												}}
												className={buttonClassName('admin-outline', 'xs')}>
												Add Entry
											</button>
										</div>

										<div className='mt-3 space-y-3'>
											{eventEditorDraft.contestants.map((contestant, contestantIndex) => (
												<div key={contestant.id ?? `contestant-${contestantIndex}`} className='rounded-lg border border-slate-200 bg-white p-space-sm space-y-2'>
													<div className='grid gap-2 sm:grid-cols-[1fr_120px_120px_1fr_1fr_100px_auto]'>
														<input
															type='text'
															placeholder='Contestant or team name'
															value={contestant.name}
															onChange={(event) => {
																const value = event.target.value
																updateEventEditorDraft((previous) => ({
																	...previous,
																	contestants: previous.contestants.map((item, itemIndex) => (itemIndex === contestantIndex ? { ...item, name: value } : item)),
																}))
															}}
															className='rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
														/>
														<select
															aria-label={`Entry type of ${contestant.name || `entry ${contestantIndex + 1}`}`}
															value={contestant.entryType === 'individual' ? 'individual' : 'group'}
															onChange={(event) => {
																const value = event.target.value === 'individual' ? 'individual' : 'group'
																updateEventEditorDraft((previous) => ({
																	...previous,
																	contestants: previous.contestants.map((item, itemIndex) =>
																		itemIndex === contestantIndex
																			? {
																					...item,
																					entryType: value,
																					participants: value === 'individual' ? [] : item.participants,
																				}
																			: item,
																	),
																}))
															}}
															className='rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'>
															<option value='group'>Group</option>
															<option value='individual'>Individual</option>
														</select>
														<select
															aria-label={`Program of ${contestant.name || `entry ${contestantIndex + 1}`}`}
															value={contestant.programTag ?? ''}
															onChange={(event) => {
																const value = event.target.value === 'BSINT' || event.target.value === 'BSCS' ? event.target.value : null
																updateEventEditorDraft((previous) => ({
																	...previous,
																	contestants: previous.contestants.map((item, itemIndex) => (itemIndex === contestantIndex ? { ...item, programTag: value } : item)),
																}))
															}}
															className='rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'>
															<option value=''>Program</option>
															<option value='BSINT'>BSINT</option>
															<option value='BSCS'>BSCS</option>
														</select>
														<input
															type='text'
															placeholder='Section (e.g. A, B)'
															value={contestant.section ?? ''}
															onChange={(event) => {
																const value = event.target.value
																updateEventEditorDraft((previous) => ({
																	...previous,
																	contestants: previous.contestants.map((item, itemIndex) => (itemIndex === contestantIndex ? { ...item, section: value } : item)),
																}))
															}}
															list='editor-section-options'
															className='rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
														/>
														<input
															type='text'
															placeholder='Academic Track'
															value={contestant.academicTrack ?? ''}
															onChange={(event) => {
																const value = event.target.value
																updateEventEditorDraft((previous) => ({
																	...previous,
																	contestants: previous.contestants.map((item, itemIndex) => (itemIndex === contestantIndex ? { ...item, academicTrack: value } : item)),
																}))
															}}
															className='rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
														/>
														<input
															type='text'
															placeholder='Laptop / Remark'
															value={contestant.laptopAvailable ?? ''}
															onChange={(event) => {
																const value = event.target.value
																updateEventEditorDraft((previous) => ({
																	...previous,
																	contestants: previous.contestants.map((item, itemIndex) => (itemIndex === contestantIndex ? { ...item, laptopAvailable: value } : item)),
																}))
															}}
															className='rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
														/>
														<input
															type='number'
															min={0}
															step='0.01'
															placeholder='NOAT'
															value={contestant.noatScore ?? ''}
															onChange={(event) => {
																const rawValue = event.target.value
																const numericValue = Number.parseFloat(rawValue)
																const nextNoatScore = rawValue.trim() === '' || !Number.isFinite(numericValue) || numericValue < 0 ? null : Math.round(numericValue * 1000) / 1000
																updateEventEditorDraft((previous) => ({
																	...previous,
																	contestants: previous.contestants.map((item, itemIndex) => (itemIndex === contestantIndex ? { ...item, noatScore: nextNoatScore } : item)),
																}))
															}}
															className='text-right rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
														/>
														<button
															type='button'
															onClick={() => {
																updateEventEditorDraft((previous) => ({
																	...previous,
																	contestants: previous.contestants.filter((_, itemIndex) => itemIndex !== contestantIndex),
																}))
															}}
															className={REMOVE_BUTTON}>
															Remove
														</button>
													</div>

													{contestant.entryType !== 'individual' ? (
														<label className='block font-label-sm text-label-sm text-slate-500'>
															Participants (comma or new line separated)
															<textarea
																value={Array.isArray(contestant.participants) ? contestant.participants.join('\n') : ''}
																onChange={(event) => {
																	const value = event.target.value
																	updateEventEditorDraft((previous) => ({
																		...previous,
																		contestants: previous.contestants.map((item, itemIndex) => (itemIndex === contestantIndex ? { ...item, participants: uniqueTrimmedNames(value) } : item)),
																	}))
																}}
																rows={2}
																className='mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
															/>
														</label>
													) : null}
												</div>
											))}
										</div>
										<datalist id='editor-section-options'>
											{Array.from(new Set(eventEditorDraft.contestants.map((c) => c.section?.trim()).filter(Boolean))).sort().map((section) => (
												<option key={section} value={section} />
											))}
										</datalist>
									</section>

									<section className='bg-slate-50 border border-slate-200 p-space-md rounded-lg'>
										<div className='flex items-center justify-between gap-2'>
											<h3 className='font-label-sm text-label-sm text-slate-500 uppercase font-bold tracking-wider'>Rubric Criteria</h3>
											<button
												type='button'
												onClick={() => {
													updateEventEditorDraft((previous) => ({
														...previous,
														criteria: [
															...previous.criteria,
															{
																id: createEditorId(),
																name: '',
																subCriteria: [{ id: createEditorId(), name: '', maxScore: 0 }],
															},
														],
													}))
												}}
												className={buttonClassName('admin-outline', 'xs')}>
												Add Criterion
											</button>
										</div>
										<p className='mt-2 font-body-sm text-body-sm text-slate-500'>Subcriteria here are shared. Updates are applied automatically to all students/members.</p>
										<p className='mt-1 font-body-sm text-body-sm text-slate-500'>
											Total Rubric Score: <span className='font-semibold text-slate-900'>{formatScore(eventEditorRubricTotalScore)}</span>
										</p>
										<p className='mt-1 font-label-sm text-label-sm text-slate-500'>Totals shown here are based on the visible shared subcriteria values.</p>

										<div className='mt-3 space-y-3'>
											{eventEditorDraft.criteria.map((criterion, criterionIndex) => {
												const criterionTotalScore = criterionTotalScoreForEditor(criterion)

												return (
													<div key={criterion.id ?? `criterion-${criterionIndex}`} className='rounded-lg border border-slate-200 bg-white p-space-sm space-y-2'>
														<div className='grid gap-2 sm:grid-cols-[1fr_auto_auto]'>
															<input
																type='text'
																placeholder='Criterion name'
																value={criterion.name}
																onChange={(event) => {
																	const value = event.target.value
																	updateEventEditorDraft((previous) => ({
																		...previous,
																		criteria: previous.criteria.map((item, itemIndex) => (itemIndex === criterionIndex ? { ...item, name: value } : item)),
																	}))
																}}
																className='rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
															/>
															<p className='inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-label-sm text-label-sm font-semibold text-slate-800'>Total Score: {formatScore(criterionTotalScore)}</p>
															<button
																type='button'
																onClick={() => {
																	updateEventEditorDraft((previous) => ({
																		...previous,
																		criteria: previous.criteria.filter((_, itemIndex) => itemIndex !== criterionIndex),
																	}))
																}}
																className={REMOVE_BUTTON}>
																Remove Criterion
															</button>
														</div>

														<div className='space-y-2'>
															{criterion.subCriteria.map((subCriterion, subCriterionIndex) => (
																<div key={subCriterion.id ?? `sub-${criterionIndex}-${subCriterionIndex}`} className='grid gap-2 sm:grid-cols-[1fr_160px_auto]'>
																	<input
																		type='text'
																		placeholder='Subcriterion name'
																		value={subCriterion.name}
																		onChange={(event) => {
																			const value = event.target.value
																			updateEventEditorDraft((previous) => ({
																				...previous,
																				criteria: previous.criteria.map((criterionItem, criterionItemIndex) =>
																					criterionItemIndex !== criterionIndex
																						? criterionItem
																						: {
																								...criterionItem,
																								subCriteria: criterionItem.subCriteria.map((subItem, subItemIndex) => (subItemIndex === subCriterionIndex ? { ...subItem, name: value } : subItem)),
																							},
																				),
																			}))
																		}}
																		className='rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
																	/>
																	<input
																		type='number'
																		aria-label={`Maximum score of ${subCriterion.name || `sub-criterion ${subCriterionIndex + 1}`}`}
																		step='0.01'
																		min='0'
																		value={subCriterion.maxScore}
																		onChange={(event) => {
																			const numericValue = Number(event.target.value)
																			updateEventEditorDraft((previous) => ({
																				...previous,
																				criteria: previous.criteria.map((criterionItem, criterionItemIndex) =>
																					criterionItemIndex !== criterionIndex
																						? criterionItem
																						: {
																								...criterionItem,
																								subCriteria: criterionItem.subCriteria.map((subItem, subItemIndex) => (subItemIndex === subCriterionIndex ? { ...subItem, maxScore: Number.isFinite(numericValue) ? numericValue : 0 } : subItem)),
																							},
																				),
																			}))
																		}}
																		className='rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
																	/>
																	<button
																		type='button'
																		onClick={() => {
																			updateEventEditorDraft((previous) => ({
																				...previous,
																				criteria: previous.criteria.map((criterionItem, criterionItemIndex) =>
																					criterionItemIndex !== criterionIndex
																						? criterionItem
																						: {
																								...criterionItem,
																								subCriteria: criterionItem.subCriteria.filter((_, subItemIndex) => subItemIndex !== subCriterionIndex),
																							},
																				),
																			}))
																		}}
																		className={REMOVE_BUTTON}>
																		Remove
																	</button>
																</div>
															))}

															<button
																type='button'
																onClick={() => {
																	updateEventEditorDraft((previous) => ({
																		...previous,
																		criteria: previous.criteria.map((criterionItem, criterionItemIndex) =>
																			criterionItemIndex === criterionIndex
																				? {
																						...criterionItem,
																						subCriteria: [...criterionItem.subCriteria, { id: createEditorId(), name: '', maxScore: 0 }],
																					}
																				: criterionItem,
																		),
																	}))
																}}
																className={buttonClassName('admin-outline', 'xs')}>
																Add Subcriterion
															</button>
														</div>
													</div>
												)
											})}
										</div>
									</section>

									<section className='bg-slate-50 border border-slate-200 p-space-md rounded-lg'>
										<h3 className='font-label-sm text-label-sm text-slate-500 uppercase font-bold tracking-wider'>Presentation Assignments</h3>
										<p className='mt-1 font-body-sm text-body-sm text-slate-500'>Slots are auto-synced with entries. Edit slot labels and assigned judges below.</p>
										<div className='mt-3 space-y-3'>
											{(eventEditorDraft.presentationSlots ?? []).map((slot, slotIndex) => {
												const contestantName = eventEditorDraft.contestants.find((contestant) => contestant.id === slot.contestantId)?.name || `Entry ${slotIndex + 1}`

												return (
													<div key={slot.id ?? `slot-${slotIndex}`} className='rounded-lg border border-slate-200 bg-white p-space-sm space-y-2'>
														<p className='font-body-sm text-body-sm text-slate-500'>
															Entry: <span className='font-semibold text-slate-900'>{contestantName}</span>
														</p>
														<input
															type='text'
															placeholder='Slot label'
															value={slot.label}
															onChange={(event) => {
																const value = event.target.value
																updateEventEditorDraft((previous) => ({
																	...previous,
																	presentationSlots: (previous.presentationSlots ?? []).map((item, itemIndex) => (itemIndex === slotIndex ? { ...item, label: value } : item)),
																}))
															}}
															className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-body-sm text-body-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
														/>

														<div className='flex flex-wrap gap-2'>
															{eventEditorDraft.judges.map((judge, judgeIndex) => {
																const judgeId = String(judge.id ?? '').trim()
																if (!judgeId) {
																	return null
																}

																const isChecked = (slot.judgeIds ?? []).includes(judgeId)

																return (
																	<label key={`${judgeId}-${judgeIndex}`} className='inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1 font-label-sm text-label-sm text-slate-800'>
																		<input
																			type='checkbox'
																			checked={isChecked}
																			onChange={(event) => {
																				const checked = event.target.checked
																				updateEventEditorDraft((previous) => ({
																					...previous,
																					presentationSlots: (previous.presentationSlots ?? []).map((item, itemIndex) => {
																						if (itemIndex !== slotIndex) {
																							return item
																						}

																						const judgeIdSet = new Set(item.judgeIds ?? [])
																						if (checked) {
																							judgeIdSet.add(judgeId)
																						} else {
																							judgeIdSet.delete(judgeId)
																						}

																						return {
																							...item,
																							judgeIds: Array.from(judgeIdSet),
																						}
																					}),
																				}))
																			}}
																		/>
																		{judge.name || `Judge ${judgeIndex + 1}`}
																	</label>
																)
															})}
														</div>
													</div>
												)
											})}
										</div>
									</section>

									<div className='flex flex-wrap items-center gap-2'>
										<button
											type='button' data-testid='editor-save'
											onClick={() => {
												void saveEventEditor()
											}}
											disabled={isSavingEventEditor}
											className={buttonClassName('admin-primary')}>
											{isSavingEventEditor ? 'Saving Published Event...' : 'Save Published Event Changes'}
										</button>
										<button
											type='button'
											onClick={() => {
												setShowEventEditor(false)
												setEventEditorError(null)
											}}
											disabled={isSavingEventEditor}
											className={buttonClassName('admin-tonal')}>
											Cancel
										</button>
									</div>
								</div>
							) : null}
						</section>
					) : (
					<TabPanel className='flex flex-col gap-space-xl'>
					{activeTab === 'dashboard' ? (
						<DashboardTab
							kpis={adminKpis(event, compiled, programOf, (contestantId) => assignedJudgeIdsForContestant(event, contestantId))}
							judges={event.judges.map((judge) => ({ id: judge.id, name: judge.name, saved: judgesWithSaves.has(judge.id) }))}
							kind={scoring}
							groupMaxScore={compiled.groupMaxScore}
							individualMaxScore={compiled.individualMaxScore}
							places={podiumPlaces(compiled.rankings, scoring === 'weighted')}
							programOf={programOf}
							isIndividual={(contestantId) => contestantsById.get(contestantId)?.entryType === 'individual'}
							entryMaxOf={entryMaxOf}
							cohorts={programCohorts(event, compiled, programOf)}
							topTeams={analyticsByProgram}
							onShowRankings={() => showTab('rankings')}
						/>
					) : null}

					{activeTab === 'rankings' ? (
						<RankingsTab
							kind={scoring}
							places={podiumPlaces(compiled.rankings, scoring === 'weighted')}
							isIndividual={(contestantId) => contestantsById.get(contestantId)?.entryType === 'individual'}
							teams={analyticsByProgram}
							participants={participantAnalyticsByProgram}
							subCriteria={subCriteriaAnalyticsByProgram}
							sections={sectionAnalytics}
							individualEntryIds={new Set(event.contestants.filter((contestant) => contestant.entryType === 'individual').map((contestant) => contestant.id))}
							onExportSections={() => exportSectionAnalyticsAsExcel(event, sectionAnalytics)}
						/>
					) : null}

					{activeTab === 'matrix' ? (
						<MatrixTab
							kind={scoring}
							rows={matrixRows}
							view={matrixView}
							onFilterChange={changeMatrixFilter}
							onPageChange={(page) => setMatrixView((previous) => ({ ...previous, page }))}
							onShowAllChange={(showAll) => setMatrixView((previous) => ({ ...previous, showAll, page: 1 }))}
							strandOptions={filterOptions.strands}
							remarkOptions={filterOptions.remarks}
							entryMaxOf={entryMaxOf}
							everyProgram={{ BSINT: allContestantsBSINT, BSCS: allContestantsBSCS }}
							savingPrograms={isSavingProgramAssignments}
							onToggleProgram={toggleContestantProgram}
							onSetEveryProgram={(program, shownIds) => {
								setPendingProgramTarget(program)
								setPendingProgramShownIds(shownIds)
								setIsProgramPasswordModalOpen(true)
							}}
							judges={event.judges.map((judge) => ({ id: judge.id, name: judge.name }))}
							swapOpenId={editingJudgeAssignmentForContestantId}
							swapDraft={editingJudgeAssignmentForContestantId ? (judgeAssignmentDrafts[editingJudgeAssignmentForContestantId] ?? null) : null}
							swapSavingId={savingJudgeAssignmentForContestantId}
							onOpenSwap={openJudgeSwap}
							onCancelSwap={closeJudgeSwap}
							onToggleSwapJudge={toggleJudgeAssignment}
							onSaveSwap={(contestantId) => void saveJudgeAssignment(contestantId)}
							onBreakdown={setBreakdownId}
						/>
					) : null}

					{activeTab === 'telemetry' ? (
						<TelemetryTab
							judges={event.judges.map((judge) => {
								const judgeResult = compiled.judgeBreakdown.find((item) => item.judgeId === judge.id)
								return {
									id: judge.id,
									name: judge.name,
									token: judge.token || undefined,
									saved: judgesWithSaves.has(judge.id),
									submittedAt: judgeResult?.submitted ? judgeResult.submittedAt : undefined,
									progress: judgeProgress(judge.id, event.contestants.map((contestant) => contestant.id), (contestantId) => assignedJudgeIdsForContestant(event, contestantId), compiled.judgeBreakdown),
								}
							})}
							locked={judgeLinksLocked}
							baseUrl={baseUrl}
							copiedLink={copiedLink}
							onCopy={(value) => void copyLink(value)}
							onUnlock={() => askToUnlock('Judge links are shown only with the update password.')}
							isDirect={scoring === 'direct'}
							legend={normalizedRubricLegend}
							criteria={event.criteria}
							contestants={event.contestants}
							remarks={remarkItems(event, rankOf, scoring === 'direct')}
							programOf={programOf}
							onExportObservations={exportObservations}
						/>
					) : null}
					</TabPanel>
					)}
				</div>
				</main>
			</Tabs>

			{/* PRINT VIEW (TABULATION SHEET) */}
			<style>{`
				@media print {
					@page {
						margin: 0;
					}
				}
			`}</style>
			<div data-testid='print-sheet' className='hidden w-full bg-white p-12 text-black print:block min-h-screen'>
				<div className='text-center font-serif leading-tight'>
					<h1 className='text-xl font-bold uppercase'>{event.title}</h1>
					<p>Date: {formatDate(event.createdAt)}</p>
					<br />
					<h2 className='text-2xl font-bold uppercase tracking-widest'>Tabulation Sheet</h2>
					<div className='mx-auto mb-6 mt-2 w-1/2 border-b-2 border-black'></div>
				</div>

				<table className='mt-8 w-full border-collapse border border-black text-center text-sm'>
					<thead>
						<tr>
							<th className='border border-black p-2 font-bold uppercase'>Contestant No. / Name</th>
							{event.judges.map((j) => (
								<th key={j.id} className='whitespace-nowrap border border-black p-2 font-bold uppercase'>
									{j.name}
								</th>
							))}
							<th className='border border-black p-2 font-bold uppercase'>{useDirectFinalRating ? 'Final Rating' : 'Final Score'}</th>
							<th className='border border-black p-2 font-bold uppercase'>Rank</th>
						</tr>
					</thead>
					<tbody>
						{compiled.rankings.map((result) => (
							<tr key={result.contestantId} data-testid='print-row' data-contestant-id={result.contestantId}>
								<td data-col='name' className='border border-black p-2 text-left font-semibold uppercase'>{result.contestantName}</td>
								{event.judges.map((j) => (
									<td key={j.id} data-col='judge' data-judge-id={j.id} className='border border-black p-2'>
										{result.perJudgeTotals[j.id] !== undefined ? formatScore(result.perJudgeTotals[j.id]) : ''}
									</td>
								))}
								<td data-col='final' className='border border-black p-2 font-bold'>{formatScore(useWeightedScores ? (result.weightedScore ?? result.averageScore) : useDirectFinalRating ? (result.finalRating ?? result.averageScore) : result.averageScore)}</td>
								<td data-col='rank' className='border border-black p-2 font-bold'>{result.rank}</td>
							</tr>
						))}
					</tbody>
				</table>

				<div className='mt-24 flex flex-wrap justify-around gap-y-16'>
					{event.judges.map((j) => (
						<div key={j.id} className='text-center'>
							<div className='mb-1 w-48 border-b border-black'></div>
							<p className='font-bold uppercase'>{j.name}</p>
							<p className='text-sm'>Judge</p>
						</div>
					))}
				</div>
			</div>

			<div className='print:hidden'>
				<Dialog
					open={pendingLeave !== null}
					onClose={() => setPendingLeave(null)}
					data-testid='editor-leave-confirm'
					eyebrow='Unsaved changes'
					title='Leave the editor?'
					className='max-w-md'
					actions={
						<>
							<Button variant='admin-tonal' data-testid='editor-leave-stay' onClick={() => setPendingLeave(null)}>
								Stay in the editor
							</Button>
							<Button variant='admin-confirm' data-testid='editor-leave-go' onClick={leaveEditor}>
								Leave without saving
							</Button>
						</>
					}
				>
					<p className='font-body-sm text-body-sm text-slate-700'>Your changes to the event are not saved. Leaving the editor drops them.</p>
				</Dialog>
				<BreakdownDialog
					result={breakdownResult}
					kind={scoring}
					program={breakdownResult ? programOf(breakdownResult.contestantId) : null}
					status={breakdownResult ? entryStatus(breakdownResult.contestantId, assignedJudgeIdsForContestant(event, breakdownResult.contestantId), compiled.judgeBreakdown) : null}
					rows={breakdownResult ? breakdownRows(event, breakdownResult, assignedJudgeIdsForContestant(event, breakdownResult.contestantId)) : []}
					entryMax={breakdownResult ? entryMaxOf(breakdownResult.contestantId) : 0}
					onClose={() => setBreakdownId(null)}
				/>
				<UnlockDialog
					open={unlockRequest !== null}
					reason={unlockRequest?.reason}
					onCancel={() => {
						const retries = unlockRequest?.retries ?? []
						setUnlockRequest(null)
						for (const retry of retries) {
							if (retry.kind === 'program') takeBackProgramChanges(retry.assignments)
						}
					}}
					onUnlocked={() => {
						const retries = [...(unlockRequest?.retries ?? [])]
						setUnlockRequest(null)
						// A queue that waited for the sign-in is uploaded too, whichever prompt unlocked.
						if (signInNeeded.current && !retries.some((retry) => retry.kind === 'queue')) retries.push({ kind: 'queue' })
						signInNeeded.current = false
						void (async () => {
							let queueSynced = false
							for (const retry of retries) {
								if (retry.kind === 'program') {
									await saveProgramAssignments(retry.assignments)
								} else if (retry.kind === 'judge') {
									setJudgeAssignmentDrafts((previous) => ({ ...previous, [retry.contestantId]: retry.judgeIds }))
									await saveJudgeAssignment(retry.contestantId, retry.judgeIds)
								} else if (retry.kind === 'open-editor') {
									await openEditorUnlocked()
								} else if (retry.kind === 'editor') {
									await saveEventEditor()
								} else if (!queueSynced) {
									queueSynced = true
									await syncQueuedAdminSaves(true)
								}
							}
							// Read the event again after the writes: the links and the lock state are then the server's.
							await refreshDashboard()
						})()
					}}
				/>
			</div>

			{/* B68: the shared Dialog (a named dialog, a labelled field, Escape, a focus trap and focus return). */}
			<Dialog
				open={isProgramPasswordModalOpen}
				onClose={cancelProgramPassword}
				title='Authentication Required'
				initialFocusRef={programPasswordRef}
				className='max-w-md'
				overlayClassName='print:hidden'
				data-testid='password-dialog'
				actions={
					<>
						<Button variant='admin-tonal' data-testid='password-cancel' onClick={cancelProgramPassword}>
							Cancel
						</Button>
						<Button variant='admin-confirm' type='submit' form={programPasswordFormId} data-testid='password-submit' disabled={isVerifyingProgramPassword}>
							{isVerifyingProgramPassword ? 'Verifying...' : 'Verify'}
						</Button>
					</>
				}
			>
				<form id={programPasswordFormId} className='flex flex-col gap-space-sm' onSubmit={(e) => void handleProgramPasswordSubmit(e)}>
					<p className='font-body-sm text-body-sm text-slate-600'>Enter the update password to apply changes to all contestants. This sets the program of every entry, including those hidden by the filters or on other pages.</p>
					<label className='flex flex-col gap-space-xs font-label-md text-label-md text-slate-700'>
						Password
						<input
							ref={programPasswordRef}
							type='password'
							data-testid='password-input'
							autoComplete='current-password'
							value={programPassword}
							onChange={(e) => {
								setProgramPassword(e.target.value)
								if (programPasswordError) setProgramPasswordError('')
							}}
							className='w-full px-space-md py-2 rounded-lg bg-white border border-slate-200 text-slate-900 font-body-md text-body-md focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
							required
						/>
					</label>
					{programPasswordError ? (
						<p data-testid='password-error' role='alert' className='font-body-sm text-body-sm text-rose-600'>
							{programPasswordError}
						</p>
					) : null}
				</form>
			</Dialog>
		</div>
	)
}
