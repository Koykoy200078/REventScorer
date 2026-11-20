import type { JudgeContestantDetails, ScoreMatrix } from '../types'

/**
 * D30: unsaved judge scores kept on this device, one draft per contestant, per judge link.
 *
 * A draft remembers the saved scores it started from (`baseline`). It is restored only while the
 * server still holds that baseline: if the contestant was saved since (on this or another device),
 * the draft is stale and dropped, so it can never paste old values over a newer save. Saving one
 * contestant never touches another contestant's draft. While a save of the contestant waits in
 * this device's queue, the draft also remembers the row that save leaves (`pendingBaseline`): the
 * server can hold it before the page hears back (a lost answer, an upload by another tab), and
 * that is no newer save; nor is any row the server holds while that save still waits to replace it.
 * It also remembers which queued save that is (`pendingQueuedAt`, the queue entry's queuedAt):
 * two queued saves can leave the same scores, and only a draft written after the save still queued
 * follows it (isDraftCurrent).
 *
 * Storage is passed in (window.localStorage in the browser) so the module runs in tests too.
 */

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface ContestantDraft {
	/** The raw input strings, keyed by sub-criterion id, exactly as the judge typed them. */
	values: Record<string, string>
	details?: JudgeContestantDetails
	/** The saved scores for this contestant when the draft began (from the judge's submission). */
	baseline: Record<string, number>
	/** The saved scores a save of this contestant, queued on this device when the draft was written,
	 * leaves once it uploads. */
	pendingBaseline?: Record<string, number>
	/** That queued save's queuedAt (lib/judge/score-queue.ts renews it on every save of the
	 * contestant), so the draft names the save it was written after, not only the scores it leaves. */
	pendingQueuedAt?: string
	updatedAt: string
}

export type ContestantDraftInput = Omit<ContestantDraft, 'updatedAt'>

/** A save of a contestant still queued on this device (or one just uploaded from it: `uploaded`): the
 * saved row it leaves on the server, and its queue entry's queuedAt. */
export interface QueuedSaveRow {
	row: Record<string, number>
	queuedAt: string
	uploaded?: boolean
}

interface StoredDraft {
	version: 1
	contestants: Record<string, ContestantDraft>
}

export type DraftSaveResult = { ok: true } | { ok: false; error: string }

const PREFIX = 'eventscorer:judge-draft:v1:'

export function draftKey(token: string): string {
	return PREFIX + token
}

function isRecordOf(value: unknown, check: (v: unknown) => boolean): value is Record<string, never> {
	return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every(check)
}

function isContestantDraft(value: unknown): value is ContestantDraft {
	if (typeof value !== 'object' || value === null) return false
	const draft = value as Partial<ContestantDraft>
	return (
		isRecordOf(draft.values, (v) => typeof v === 'string') &&
		isRecordOf(draft.baseline, (v) => typeof v === 'number') &&
		(draft.pendingBaseline === undefined || isRecordOf(draft.pendingBaseline, (v) => typeof v === 'number')) &&
		(draft.pendingQueuedAt === undefined || typeof draft.pendingQueuedAt === 'string') &&
		typeof draft.updatedAt === 'string' &&
		(draft.details === undefined || isRecordOf(draft.details, (v) => v === undefined || typeof v === 'string'))
	)
}

function read(storage: DraftStorage, token: string): StoredDraft {
	try {
		const raw = storage.getItem(draftKey(token))
		if (!raw) return { version: 1, contestants: {} }
		const parsed = JSON.parse(raw) as Partial<StoredDraft>
		if (parsed.version !== 1 || typeof parsed.contestants !== 'object' || parsed.contestants === null) {
			return { version: 1, contestants: {} }
		}
		const contestants: Record<string, ContestantDraft> = {}
		for (const [id, draft] of Object.entries(parsed.contestants)) {
			if (isContestantDraft(draft)) contestants[id] = draft
		}
		return { version: 1, contestants }
	} catch {
		return { version: 1, contestants: {} }
	}
}

function write(storage: DraftStorage, token: string, stored: StoredDraft): DraftSaveResult {
	try {
		if (Object.keys(stored.contestants).length === 0) storage.removeItem(draftKey(token))
		else storage.setItem(draftKey(token), JSON.stringify(stored))
		return { ok: true }
	} catch (error) {
		return { ok: false, error: error instanceof Error ? `${error.name}: ${error.message}` : 'Unable to keep the draft on this device.' }
	}
}

/** Scores the server keeps: it drops 0 and below, so a baseline is compared without them. With
 * `ids`, only those cells count. */
function storedScores(row: Record<string, number> | undefined, ids: ReadonlySet<string> | undefined): Map<string, number> {
	const out = new Map<string, number>()
	for (const [id, value] of Object.entries(row ?? {})) {
		if (ids && !ids.has(id)) continue
		if (typeof value === 'number' && Number.isFinite(value) && value > 0) out.set(id, Math.round(value * 1000) / 1000)
	}
	return out
}

function sameScores(a: Record<string, number> | undefined, b: Record<string, number> | undefined, ids: ReadonlySet<string> | undefined): boolean {
	const left = storedScores(a, ids)
	const right = storedScores(b, ids)
	if (left.size !== right.size) return false
	for (const [id, value] of left) if (right.get(id) !== value) return false
	return true
}

/** Keeps (or replaces) one contestant's draft. Never throws: a full or blocked storage is reported. */
export function saveContestantDraft(storage: DraftStorage, token: string, contestantId: string, draft: ContestantDraftInput, now: Date): DraftSaveResult {
	const stored = read(storage, token)
	stored.contestants[contestantId] = { ...draft, updatedAt: now.toISOString() }
	return write(storage, token, stored)
}

/** One contestant's draft as stored, or null. It is not checked against the server's row. */
export function readContestantDraft(storage: DraftStorage, token: string, contestantId: string): ContestantDraft | null {
	return read(storage, token).contestants[contestantId] ?? null
}

/** Forgets one contestant's draft, after its scores were saved. */
export function clearContestantDraft(storage: DraftStorage, token: string, contestantId: string): DraftSaveResult {
	const stored = read(storage, token)
	if (!(contestantId in stored.contestants)) return { ok: true }
	delete stored.contestants[contestantId]
	return write(storage, token, stored)
}

/**
 * Whether a stored draft is current: the one rule for loadDraft and for every flush that keeps or
 * rebases a stored draft (lib/judge/draft-state.ts storedDraftToKeep). `savedRow` is the
 * contestant's saved row as last known from the server. `queued` is the save of the contestant
 * still queued on this device, or, right after this page uploaded one, that save.
 *
 * Such a save replaces whatever the server holds, so only a draft written after that very save is
 * current: it names the save's queue time and the row it leaves (review F2: an earlier save reached
 * the server, its answer was lost, and a later one is still queued). A draft that names no queued
 * save, or another one, was written before it (its later writes were refused) and must not win over
 * it, even with the same scores (only a detail changed, or a score was typed back to an earlier
 * value). With no such save, a draft is current while the server still holds the row it began from,
 * or the row of the queued save it was written after (the server can hold it before the page hears
 * back: a lost answer, an upload by another tab). `subCriterionIds` are the event's own cells today:
 * a cell deleted from the event since, or one the page derives from them (the legacy 3-field
 * split), is no newer save.
 *
 * Right after this page uploaded a save (`queued.uploaded`), a draft that names a save queued later
 * than that one is current too: it was written after a save the upload never carried (D29: the
 * upload of an older queue entry removes a newer one of the same contestant with it), so it is newer
 * than the upload, and the device's last copy of that later save.
 */
export function isDraftCurrent(draft: Pick<ContestantDraft, 'baseline' | 'pendingBaseline' | 'pendingQueuedAt'>, savedRow: Record<string, number> | undefined, queued: QueuedSaveRow | undefined, subCriterionIds?: ReadonlySet<string>): boolean {
	const pending = draft.pendingBaseline
	if (queued !== undefined) {
		if (draft.pendingQueuedAt === queued.queuedAt) return pending !== undefined && sameScores(pending, queued.row, subCriterionIds)
		return queued.uploaded === true && pending !== undefined && draft.pendingQueuedAt !== undefined && queuedLater(draft.pendingQueuedAt, queued.queuedAt)
	}
	return sameScores(draft.baseline, savedRow, subCriterionIds) || (pending !== undefined && sameScores(pending, savedRow, subCriterionIds))
}

/** Whether queue time `a` is later than `b`; never for one that is no time. */
function queuedLater(a: string, b: string): boolean {
	const at = Date.parse(a)
	const bt = Date.parse(b)
	return Number.isFinite(at) && Number.isFinite(bt) && at > bt
}

/**
 * The drafts worth restoring for a judge link, given the judge's saved scores and the saves still
 * queued on this device (`queued`, by contestant): the current ones (isDraftCurrent). The others
 * are stale; they are dropped and removed from storage.
 */
export function loadDraft(storage: DraftStorage, token: string, saved: ScoreMatrix | undefined, subCriterionIds?: ReadonlySet<string>, queued?: Readonly<Record<string, QueuedSaveRow>>): Record<string, ContestantDraft> {
	const stored = read(storage, token)
	const kept: Record<string, ContestantDraft> = {}
	let dropped = false
	for (const [id, draft] of Object.entries(stored.contestants)) {
		if (isDraftCurrent(draft, saved?.[id], queued?.[id], subCriterionIds)) kept[id] = draft
		else dropped = true
	}
	if (dropped) write(storage, token, { version: 1, contestants: kept })
	return kept
}
