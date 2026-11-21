// The admin console's local queue of saves that could not reach the server (offline, 5xx), and
// the save error type. Moved verbatim from components/admin-live-dashboard.tsx (Stage 5 Task 7 step 1).

import type { ProgramLabel } from '@/lib/admin/program'
import type { AdminEventEditorInput } from '@/lib/types'

export type QueuedAdminSaveKind = 'program-assignment' | 'judge-assignment' | 'event-editor'

export interface ProgramAssignmentSaveBody {
	contestantId: string
	programTag: ProgramLabel | null
}

export interface JudgeAssignmentSaveBody {
	contestantId: string
	judgeIds: string[]
}

export interface EventEditorSaveBody {
	eventEditor: AdminEventEditorInput
}

export type AdminSaveRequestBody = ProgramAssignmentSaveBody | JudgeAssignmentSaveBody | EventEditorSaveBody | { programAssignments: Array<{ contestantId: string; programTag: ProgramLabel | null }> }

export interface QueuedAdminSaveAction {
	id: string
	eventId: string
	kind: QueuedAdminSaveKind
	requestBody: ProgramAssignmentSaveBody | JudgeAssignmentSaveBody | EventEditorSaveBody
	queuedAt: string
	summary: string
}

export const QUEUED_ADMIN_SAVES_STORAGE_KEY = 'eventscorer:queued-admin-saves:v1'

export const ADMIN_SAVE_AUTO_SYNC_INTERVAL_MS = 15_000

export class AdminSaveError extends Error {
	status?: number

	constructor(message: string, status?: number) {
		super(message)
		this.name = 'AdminSaveError'
		this.status = status
	}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object'
}

export function normalizeProgramTag(value: unknown): ProgramLabel | null {
	if (value === 'BSINT' || value === 'BSCS') {
		return value
	}

	return null
}

export function queuedAdminSaveActionId(eventId: string, kind: QueuedAdminSaveKind, contestantId?: string): string {
	if (kind === 'event-editor') {
		return `${eventId}:event-editor`
	}

	if (kind === 'program-assignment') {
		return `${eventId}:program:${contestantId ?? ''}`
	}

	return `${eventId}:judge:${contestantId ?? ''}`
}

export function isProgramAssignmentQueuedAction(action: QueuedAdminSaveAction): action is QueuedAdminSaveAction & { requestBody: ProgramAssignmentSaveBody } {
	return action.kind === 'program-assignment'
}

export function isJudgeAssignmentQueuedAction(action: QueuedAdminSaveAction): action is QueuedAdminSaveAction & { requestBody: JudgeAssignmentSaveBody } {
	return action.kind === 'judge-assignment'
}

export function readQueuedAdminSaveActions(): QueuedAdminSaveAction[] {
	if (typeof window === 'undefined') {
		return []
	}

	try {
		const raw = window.localStorage.getItem(QUEUED_ADMIN_SAVES_STORAGE_KEY)
		if (!raw) {
			return []
		}

		const parsed = JSON.parse(raw) as unknown
		if (!Array.isArray(parsed)) {
			return []
		}

		const normalized: QueuedAdminSaveAction[] = []

		for (const item of parsed) {
			if (!isRecord(item)) {
				continue
			}

			const eventId = typeof item.eventId === 'string' ? item.eventId.trim() : ''
			const kind = item.kind === 'program-assignment' || item.kind === 'judge-assignment' || item.kind === 'event-editor' ? item.kind : null
			const queuedAt = typeof item.queuedAt === 'string' ? item.queuedAt : new Date().toISOString()
			const summary = typeof item.summary === 'string' && item.summary.trim().length > 0 ? item.summary.trim() : 'admin save action'

			if (!eventId || !kind) {
				continue
			}

			const requestBody = item.requestBody
			if (!isRecord(requestBody)) {
				continue
			}

			let normalizedRequestBody: ProgramAssignmentSaveBody | JudgeAssignmentSaveBody | EventEditorSaveBody | null = null

			if (kind === 'program-assignment') {
				const contestantId = typeof requestBody.contestantId === 'string' ? requestBody.contestantId.trim() : ''
				if (!contestantId || !Object.prototype.hasOwnProperty.call(requestBody, 'programTag')) {
					continue
				}

				normalizedRequestBody = {
					contestantId,
					programTag: normalizeProgramTag(requestBody.programTag),
				}
			} else if (kind === 'judge-assignment') {
				const contestantId = typeof requestBody.contestantId === 'string' ? requestBody.contestantId.trim() : ''
				const judgeIds = Array.isArray(requestBody.judgeIds) ? requestBody.judgeIds.map((judgeId) => (typeof judgeId === 'string' ? judgeId.trim() : '')).filter((judgeId) => judgeId.length > 0) : []

				if (!contestantId || judgeIds.length === 0) {
					continue
				}

				normalizedRequestBody = {
					contestantId,
					judgeIds,
				}
			} else {
				const eventEditor = requestBody.eventEditor
				if (!isRecord(eventEditor)) {
					continue
				}

				normalizedRequestBody = {
					eventEditor: eventEditor as unknown as AdminEventEditorInput,
				}
			}

			normalized.push({
				id: typeof item.id === 'string' && item.id.trim().length > 0 ? item.id : queuedAdminSaveActionId(eventId, kind, 'contestantId' in normalizedRequestBody ? normalizedRequestBody.contestantId : undefined),
				eventId,
				kind,
				requestBody: normalizedRequestBody,
				queuedAt,
				summary,
			})
		}

		return normalized
	} catch {
		return []
	}
}

export function writeQueuedAdminSaveActions(queue: QueuedAdminSaveAction[]): void {
	if (typeof window === 'undefined') {
		return
	}

	if (queue.length === 0) {
		window.localStorage.removeItem(QUEUED_ADMIN_SAVES_STORAGE_KEY)
		return
	}

	window.localStorage.setItem(QUEUED_ADMIN_SAVES_STORAGE_KEY, JSON.stringify(queue))
}

export function listQueuedAdminSaveActionsForEvent(eventId: string): QueuedAdminSaveAction[] {
	const normalizedEventId = eventId.trim()
	if (!normalizedEventId) {
		return []
	}

	return readQueuedAdminSaveActions()
		.filter((action) => action.eventId === normalizedEventId)
		.sort((left, right) => new Date(left.queuedAt).getTime() - new Date(right.queuedAt).getTime())
}

export function upsertQueuedAdminSaveAction(action: QueuedAdminSaveAction): void {
	const queue = readQueuedAdminSaveActions()
	const existingIndex = queue.findIndex((entry) => entry.id === action.id)

	if (existingIndex >= 0) {
		queue[existingIndex] = action
	} else {
		queue.push(action)
	}

	writeQueuedAdminSaveActions(queue)
}

export function removeQueuedAdminSaveAction(actionId: string): void {
	const queue = readQueuedAdminSaveActions()
	const nextQueue = queue.filter((entry) => entry.id !== actionId)

	if (nextQueue.length === queue.length) {
		return
	}

	writeQueuedAdminSaveActions(nextQueue)
}

export function shouldQueueAdminSave(error: unknown): boolean {
	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		return true
	}

	if (error instanceof TypeError) {
		return true
	}

	if (error instanceof AdminSaveError && typeof error.status === 'number' && error.status >= 500) {
		return true
	}

	return false
}

export function queuedAdminSaveKindLabel(kind: QueuedAdminSaveKind): string {
	if (kind === 'program-assignment') {
		return 'Program Assignment'
	}

	if (kind === 'judge-assignment') {
		return 'Judge Assignment'
	}

	return 'Published Event Changes'
}
