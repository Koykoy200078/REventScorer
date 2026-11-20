import { clearContestantDraft, isDraftCurrent, saveContestantDraft } from '@/lib/judge/draft-store'
import type { ContestantDraft, ContestantDraftInput, DraftSaveResult, DraftStorage } from '@/lib/judge/draft-store'
import { migrateLegacyDirectRating } from '@/lib/judge/legacy-direct'
import type { InputContestantDetailsMap } from '@/lib/judge/matrix'
import { applicableSubCriteriaForContestant } from '@/lib/judge/members'
import { normalizeScoreInput, parseAndClampScore, round } from '@/lib/judge/score-input'
import type { QueuedScoreUpload } from '@/lib/judge/score-queue'
import type { DirectRatingConfig, EventContestant, EventCriterion, JudgeContestantDetails, JudgeContestantDetailsMap, ScoreMatrix } from '@/lib/types'

/**
 * D30: what the judge form treats as unsaved, per contestant.
 *
 * The form keeps a baseline per contestant: the saved row as last known from the server (from the
 * page load, then from each save the server confirmed). A contestant the judge changed has unsaved
 * changes while its inputs, as a save would send them, differ from that baseline; only those get a
 * draft (lib/judge/draft-store.ts) and the leave-page warning.
 */

export type ContestantDetailsInput = InputContestantDetailsMap[string]

export type DraftStatus = 'none' | 'kept' | 'failed'

/** One contestant's draft on this device: kept, or failed (the browser refused its last write). */
export type DraftOutcome = 'kept' | 'failed'

/** How long the form waits after the last change before it writes the draft. */
export const DRAFT_WRITE_DELAY_MS = 400

const DETAIL_FIELDS = ['strand', 'remark', 'additionalInfo'] as const

export interface ContestantBaseline {
	/** The saved row in the shape the page loads it (after the legacy migration). A draft keeps it,
	 * so loadDraft can tell when the server has moved on. */
	scores: Record<string, number>
	/** What the form held when that row was saved (or loaded), as a save sends it. Unsaved changes
	 * are measured against this; it differs from `scores` only on a legacy 3-field event, where the
	 * server keeps one interview score and a reload splits it again. */
	inputs: Record<string, number>
	details: ContestantDetailsInput
}

function emptyDetails(): ContestantDetailsInput {
	return { strand: '', remark: '', additionalInfo: '' }
}

export function initialBaselines(contestants: EventContestant[], existingScores: ScoreMatrix | undefined, details: InputContestantDetailsMap): Record<string, ContestantBaseline> {
	const baselines: Record<string, ContestantBaseline> = {}
	for (const contestant of contestants) {
		const saved = existingScores?.[contestant.id] ?? {}
		baselines[contestant.id] = { scores: { ...saved }, inputs: { ...saved }, details: { ...emptyDetails(), ...details[contestant.id] } }
	}
	return baselines
}

/** A score as the save sends and the server keeps it: clamped, 3 decimals, 0 and below as 0. */
function sentScore(value: number): number {
	return Number.isFinite(value) && value > 0 ? round(value) : 0
}

/**
 * Whether a contestant's inputs differ from its baseline. Only the cells the contestant shows are
 * compared (a save sends 0 for the others), and not the admin-provided NOAT cell, which the judge
 * cannot change. Details are compared trimmed, as the save trims them, and not at all when all
 * three are empty: the save then sends none for the contestant and the server keeps the old ones
 * (F6), so no save could make them equal.
 */
export function hasUnsavedChanges(criteria: EventCriterion[], contestant: EventContestant, values: Record<string, string> | undefined, details: ContestantDetailsInput | undefined, baseline: ContestantBaseline | undefined, lockedSubCriterionIds: ReadonlySet<string> = new Set()): boolean {
	for (const criterion of criteria) {
		for (const subCriterion of applicableSubCriteriaForContestant(criterion, contestant)) {
			if (lockedSubCriterionIds.has(subCriterion.id)) continue
			const current = sentScore(parseAndClampScore(values?.[subCriterion.id] ?? '0', subCriterion.maxScore))
			const saved = sentScore(Number(baseline?.inputs[subCriterion.id] ?? 0))
			if (current !== saved) return true
		}
	}

	if (DETAIL_FIELDS.every((field) => (details?.[field] ?? '').trim() === '')) return false
	for (const field of DETAIL_FIELDS) {
		if ((details?.[field] ?? '').trim() !== (baseline?.details[field] ?? '').trim()) return true
	}

	return false
}

/** A save of a contestant still queued on this device: the baseline it leaves once it uploads, and
 * its queue entry's queuedAt, which tells it from the contestant's earlier queued saves (the queue
 * renews it on every save, and two saves can leave the same scores). */
export interface QueuedSave extends ContestantBaseline {
	queuedAt: string
}

/** The save of this contestant still queued on this device, or undefined when none is queued. */
export function queuedSaveBaseline(rawCriteria: EventCriterion[], directRatingConfig: DirectRatingConfig | undefined, contestantId: string, uploads: readonly QueuedScoreUpload[], previous: ContestantBaseline | undefined): QueuedSave | undefined {
	const upload = uploads.find((entry) => entry.contestantId === contestantId)
	return upload ? { ...baselineAfterSave(rawCriteria, directRatingConfig, contestantId, upload.payload, previous), queuedAt: upload.queuedAt } : undefined
}

/**
 * The draft to keep for a contestant, or null when it holds nothing unsaved. `source` is the form's
 * inputs, or a draft read back from storage (a restored one, or another tab's: see
 * storedDraftToKeep). It is unsaved while it differs from the saved row, and also, while a save of
 * it is queued, from the row that save leaves: that save uploads later, so inputs back at the old
 * saved row would be lost to it. The draft carries the queued row as its pending baseline, and the
 * save's queue time, so it names the queued save it was written after (lib/judge/draft-store.ts).
 */
export function draftToKeep(criteria: EventCriterion[], contestant: EventContestant, source: Pick<ContestantDraft, 'values' | 'details'>, baseline: ContestantBaseline | undefined, queued: QueuedSave | undefined, lockedSubCriterionIds: ReadonlySet<string> = new Set()): ContestantDraftInput | null {
	const details = restoredDetails(undefined, source.details)
	const unsaved = hasUnsavedChanges(criteria, contestant, source.values, details, baseline, lockedSubCriterionIds) || (queued !== undefined && hasUnsavedChanges(criteria, contestant, source.values, details, queued, lockedSubCriterionIds))
	if (!unsaved) return null
	return {
		values: draftValues(criteria, source.values),
		...(source.details ? { details: source.details } : {}),
		baseline: baseline?.scores ?? {},
		...(queued ? { pendingBaseline: queued.scores, pendingQueuedAt: queued.queuedAt } : {}),
	}
}

/**
 * Review P1/P2: what to keep of a stored draft of a contestant this page never changed (another
 * tab's, of the same judge link) once this page's baseline for it changed: the draft rebased onto
 * that baseline (draftToKeep) while it is current, else null, to clear it. It is checked first
 * (lib/judge/draft-store.ts isDraftCurrent) against the baseline and the save of the contestant
 * still queued; when none is queued but the baseline came from this page's upload of a queued save
 * (`uploadedQueuedAt`, that save's queue time), against that save. So a draft written before the
 * save (its later writes refused), or after an earlier queued save with the same scores, is cleared,
 * never rebased into one a later load would trust; and a queued save is stamped only on a draft
 * that already follows it. A draft that names a save queued after the uploaded one (D29's race: that
 * later save left the queue with the upload) is newer than the upload: it is rebased, and keeps
 * naming its own save, so a later load keeps it whether the server holds that save or the upload.
 */
export function storedDraftToKeep(criteria: EventCriterion[], contestant: EventContestant, stored: ContestantDraft, baseline: ContestantBaseline | undefined, queued: QueuedSave | undefined, uploadedQueuedAt: string | undefined, lockedSubCriterionIds: ReadonlySet<string> = new Set(), subCriterionIds?: ReadonlySet<string>): ContestantDraftInput | null {
	const against = queued ? { row: queued.scores, queuedAt: queued.queuedAt } : uploadedQueuedAt !== undefined ? { row: baseline?.scores ?? {}, queuedAt: uploadedQueuedAt, uploaded: true } : undefined
	if (!isDraftCurrent(stored, baseline?.scores, against, subCriterionIds)) return null
	const rebased = draftToKeep(criteria, contestant, stored, baseline, queued, lockedSubCriterionIds)
	const followsLaterSave = !queued && uploadedQueuedAt !== undefined && stored.pendingBaseline !== undefined && stored.pendingQueuedAt !== undefined && stored.pendingQueuedAt !== uploadedQueuedAt
	return rebased && followsLaterSave ? { ...rebased, pendingBaseline: stored.pendingBaseline, pendingQueuedAt: stored.pendingQueuedAt } : rebased
}

/**
 * Review of the D30 fixes (other tabs of the judge link, or the admin edit tab, on one device):
 * whether this page's form row of a contestant follows a queued save. `formSince` is when the row
 * last took a value here: the judge's last change of it, this page's own queued save of it, or the
 * draft or queued row this page restored into it. A save queued after that (in another tab) is
 * newer than the form; a queue time that is no time is never followed.
 */
export function formFollowsSave(formSince: number | undefined, queuedAt: string): boolean {
	const at = Date.parse(queuedAt)
	return formSince !== undefined && Number.isFinite(at) && formSince >= at
}

/**
 * What a flush writes for a contestant this page changed (or restored): draftToKeep of its form row,
 * naming `queued` (the save of it still queued on this device) or, once that left the queue, `seen`
 * (the latest queued save of it this page saw: another tab may have uploaded it without this page
 * hearing of it, or this page did). A later load keeps that draft whether the server then holds
 * that save or the row this page knows. Null (write nothing) while the form is older than that save
 * (formFollowsSave): another tab's draft of that save, or the save itself, must not lose to it.
 */
export function ownDraftToKeep(criteria: EventCriterion[], contestant: EventContestant, source: Pick<ContestantDraft, 'values' | 'details'>, formSince: number | undefined, baseline: ContestantBaseline | undefined, queued: QueuedSave | undefined, seen: QueuedSave | undefined, lockedSubCriterionIds: ReadonlySet<string> = new Set()): PlannedDraftWrite | null {
	const save = queued ?? seen
	if (save && !formFollowsSave(formSince, save.queuedAt)) return null
	return { draft: draftToKeep(criteria, contestant, source, baseline, save, lockedSubCriterionIds), own: true }
}

/** The form row a save leaves for a contestant (`saved`: its baseline): each of today's cells as the
 * save sent it, and the details the server keeps. A form older than an uploaded save shows it. */
export function savedFormRow(criteria: EventCriterion[], saved: ContestantBaseline): Pick<ContestantDraft, 'values' | 'details'> {
	const values: Record<string, string> = {}
	for (const criterion of criteria) {
		for (const subCriterion of criterion.subCriteria) {
			const value = saved.inputs[subCriterion.id]
			if (typeof value === 'number' && Number.isFinite(value)) values[subCriterion.id] = String(value)
		}
	}
	return { values, details: { ...saved.details } }
}

/**
 * Review F2: what the form shows for a contestant whose save still waits in this device's queue
 * while no current draft of it is kept under this page's key (its draft could not be written, the
 * site data went, or it is kept under the other key: admin edit mode keeps its own). That save
 * replaces the server's row once it uploads, so the form shows the save's row, unsaved, while it
 * differs from the server's: each of today's cells as the save sent it, and the details it sent
 * (all three, as the server replaces them), if it sent any. Null when nothing is queued for the
 * contestant or the server already holds the queued row.
 */
export function queuedRowToShow(criteria: EventCriterion[], contestant: EventContestant, uploads: readonly QueuedScoreUpload[], baseline: ContestantBaseline | undefined, lockedSubCriterionIds: ReadonlySet<string> = new Set()): Pick<ContestantDraft, 'values' | 'details'> | null {
	const upload = uploads.find((entry) => entry.contestantId === contestant.id)
	if (!upload) return null
	const sent = upload.payload.scores[contestant.id] ?? {}
	const values: Record<string, string> = {}
	for (const criterion of criteria) {
		for (const subCriterion of criterion.subCriteria) {
			const value = sent[subCriterion.id]
			if (typeof value === 'number' && Number.isFinite(value)) values[subCriterion.id] = String(value)
		}
	}
	const sentDetails = upload.payload.contestantDetails?.[contestant.id]
	const details = sentDetails ? restoredDetails(undefined, sentDetails) : undefined
	if (!hasUnsavedChanges(criteria, contestant, values, details ?? baseline?.details, baseline, lockedSubCriterionIds)) return null
	return details ? { values, details } : { values }
}

/** What a flush writes for one pending contestant: its draft, or null to clear it. `own` is set
 * for a contestant this page changed (or restored): its outcome makes the page's draft status. */
export interface PlannedDraftWrite {
	draft: ContestantDraftInput | null
	own: boolean
}

/** The form's draft bookkeeping, changed in place by writePendingDrafts. */
export interface DraftWriteBooks {
	/** The contestants whose draft is still to be written (or cleared). */
	pending: Set<string>
	/** This page's own drafts and how their last write went. */
	outcomes: Map<string, DraftOutcome>
}

export interface DraftWriteReport {
	/** Own contestants whose draft writes just began to fail, with the browser's error: the page
	 * warns once per run of failures. */
	failed: Array<{ contestantId: string; error: string }>
	/** Own contestants whose draft was cleared: they keep nothing on this device any more. */
	cleared: string[]
}

/**
 * D30: writes the draft of every pending contestant, or clears it, as `plan` says (null: nothing to
 * write). Review F3: a write the browser refuses (a full or blocked storage) leaves the contestant
 * pending, so the next flush tries again (the next change, the page hidden or unloading, a sync
 * that freed space), and leaves the older stored draft in place: it is the best copy this device
 * has, and loadDraft still drops it once the server holds a newer save.
 */
export function writePendingDrafts(storage: DraftStorage | null, token: string, books: DraftWriteBooks, plan: (contestantId: string) => PlannedDraftWrite | null, now: Date): DraftWriteReport {
	const report: DraftWriteReport = { failed: [], cleared: [] }
	const contestantIds = [...books.pending]
	books.pending.clear()
	for (const contestantId of contestantIds) {
		const planned = plan(contestantId)
		if (!planned) continue

		let result: DraftSaveResult
		if (!storage) result = planned.draft ? { ok: false, error: 'this browser keeps no data for the page' } : { ok: true }
		else if (planned.draft) result = saveContestantDraft(storage, token, contestantId, planned.draft, now)
		else result = clearContestantDraft(storage, token, contestantId)

		if (!result.ok) books.pending.add(contestantId)
		if (!planned.own) continue
		if (!result.ok) {
			if (books.outcomes.get(contestantId) !== 'failed') report.failed.push({ contestantId, error: result.error })
			books.outcomes.set(contestantId, 'failed')
		} else if (planned.draft) {
			books.outcomes.set(contestantId, 'kept')
		} else {
			books.outcomes.delete(contestantId)
			report.cleared.push(contestantId)
		}
	}
	return report
}

/** A draft's values: the raw input text of every sub-criterion, '0' where the form has none. */
export function draftValues(criteria: EventCriterion[], values: Record<string, string> | undefined): Record<string, string> {
	const out: Record<string, string> = {}
	for (const criterion of criteria) {
		for (const subCriterion of criterion.subCriteria) out[subCriterion.id] = values?.[subCriterion.id] ?? '0'
	}
	return out
}

/**
 * The baseline after the server confirmed a save of one contestant. The server keeps that
 * contestant's row only: the event's own cells (rawCriteria, before the legacy migration), rounded
 * to 3 decimals, above 0. The page then loads it through the legacy migration, so the result is
 * migrated the same way. The server replaces the contestant's details only when the save carried
 * some; otherwise it keeps the old ones.
 */
export function baselineAfterSave(rawCriteria: EventCriterion[], directRatingConfig: DirectRatingConfig | undefined, contestantId: string, payload: { scores: ScoreMatrix; contestantDetails?: JudgeContestantDetailsMap }, previous: ContestantBaseline | undefined): ContestantBaseline {
	const sent = payload.scores[contestantId] ?? {}
	const kept: Record<string, number> = {}
	for (const criterion of rawCriteria) {
		for (const subCriterion of criterion.subCriteria) {
			const value = sentScore(Number(sent[subCriterion.id] ?? 0))
			if (value > 0) kept[subCriterion.id] = value
		}
	}

	const sentDetails = payload.contestantDetails?.[contestantId]
	return {
		scores: migrateLegacyDirectRating(rawCriteria, { [contestantId]: kept }, directRatingConfig).scores?.[contestantId] ?? kept,
		inputs: { ...sent },
		details: sentDetails ? restoredDetails(undefined, sentDetails) : { ...emptyDetails(), ...previous?.details },
	}
}

/** A contestant's input row with a kept draft put back: only cells that still exist, each clamped
 * to its maximum today, and never the locked NOAT cell (the admin's value stands). */
export function restoredRow(criteria: EventCriterion[], row: Record<string, string> | undefined, values: Record<string, string>, lockedSubCriterionIds: ReadonlySet<string> = new Set()): Record<string, string> {
	const next = { ...row }
	for (const criterion of criteria) {
		for (const subCriterion of criterion.subCriteria) {
			const value = values[subCriterion.id]
			if (typeof value !== 'string' || lockedSubCriterionIds.has(subCriterion.id)) continue
			next[subCriterion.id] = normalizeScoreInput(value, subCriterion.maxScore)
		}
	}
	return next
}

/** The three detail fields with a draft's (or a save's) details put over the current ones. */
export function restoredDetails(current: ContestantDetailsInput | undefined, details: JudgeContestantDetails | undefined): ContestantDetailsInput {
	const next = { ...emptyDetails(), ...current }
	for (const field of DETAIL_FIELDS) {
		const value = details?.[field]
		if (typeof value === 'string') next[field] = value
	}
	return next
}

/** This browser's localStorage, or null where the page may not use it (blocked site data). */
export function browserDraftStorage(): DraftStorage | null {
	try {
		return typeof window === 'undefined' ? null : window.localStorage
	} catch {
		return null
	}
}

/** The draft state the page reports: failed when any contestant's draft could not be written. */
export function summarizeDraftStatus(outcomes: ReadonlyMap<string, DraftOutcome>): DraftStatus {
	let status: DraftStatus = 'none'
	for (const outcome of outcomes.values()) {
		if (outcome === 'failed') return 'failed'
		status = 'kept'
	}
	return status
}
