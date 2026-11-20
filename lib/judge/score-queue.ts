import type { JudgeContestantDetailsMap, ScoreMatrix } from '@/lib/types'

export interface SubmitScoresRequestBody {
	scores: ScoreMatrix
	contestantId: string
	contestantDetails?: JudgeContestantDetailsMap
}

export interface SubmitScoresResponseBody {
	error?: string
	submittedAt?: string
}

export interface QueuedScoreUpload {
	id: string
	token: string
	contestantId: string
	contestantName: string
	payload: SubmitScoresRequestBody
	queuedAt: string
}

export const QUEUED_SCORE_UPLOADS_STORAGE_KEY = 'eventscorer:queued-score-uploads:v1'
export const AUTO_SYNC_INTERVAL_MS = 15_000

export class SubmitScoresError extends Error {
	status?: number

	constructor(message: string, status?: number) {
		super(message)
		this.name = 'SubmitScoresError'
		this.status = status
	}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object'
}

export function queuedScoreUploadId(token: string, contestantId: string): string {
	return `${token}:${contestantId}`
}

export function readQueuedScoreUploads(): QueuedScoreUpload[] {
	if (typeof window === 'undefined') {
		return []
	}

	try {
		const raw = window.localStorage.getItem(QUEUED_SCORE_UPLOADS_STORAGE_KEY)
		if (!raw) {
			return []
		}

		const parsed = JSON.parse(raw) as unknown
		if (!Array.isArray(parsed)) {
			return []
		}

		const normalized: QueuedScoreUpload[] = []

		for (const entry of parsed) {
			if (!isRecord(entry)) {
				continue
			}

			const token = typeof entry.token === 'string' ? entry.token.trim() : ''
			const contestantId = typeof entry.contestantId === 'string' ? entry.contestantId.trim() : ''
			const contestantName = typeof entry.contestantName === 'string' ? entry.contestantName.trim() : ''
			const queuedAt = typeof entry.queuedAt === 'string' ? entry.queuedAt : new Date().toISOString()

			if (!token || !contestantId || !contestantName) {
				continue
			}

			const payload = entry.payload
			if (!isRecord(payload)) {
				continue
			}

			const payloadContestantId = typeof payload.contestantId === 'string' ? payload.contestantId.trim() : ''
			const payloadScores = payload.scores
			const payloadContestantDetails = payload.contestantDetails

			if (!payloadContestantId || !isRecord(payloadScores) || (payloadContestantDetails !== undefined && !isRecord(payloadContestantDetails))) {
				continue
			}

			normalized.push({
				id: typeof entry.id === 'string' && entry.id.trim().length > 0 ? entry.id : queuedScoreUploadId(token, contestantId),
				token,
				contestantId,
				contestantName,
				payload: {
					contestantId: payloadContestantId,
					scores: payloadScores as ScoreMatrix,
					...(payloadContestantDetails !== undefined ? { contestantDetails: payloadContestantDetails as JudgeContestantDetailsMap } : {}),
				},
				queuedAt,
			})
		}

		return normalized
	} catch {
		return []
	}
}

export function writeQueuedScoreUploads(queue: QueuedScoreUpload[]): void {
	if (typeof window === 'undefined') {
		return
	}

	if (queue.length === 0) {
		window.localStorage.removeItem(QUEUED_SCORE_UPLOADS_STORAGE_KEY)
		return
	}

	window.localStorage.setItem(QUEUED_SCORE_UPLOADS_STORAGE_KEY, JSON.stringify(queue))
}

export function listQueuedScoreUploadsForToken(token: string): QueuedScoreUpload[] {
	const normalizedToken = token.trim()
	if (!normalizedToken) {
		return []
	}

	return readQueuedScoreUploads()
		.filter((entry) => entry.token === normalizedToken)
		.sort((left, right) => new Date(left.queuedAt).getTime() - new Date(right.queuedAt).getTime())
}

export function upsertQueuedScoreUpload(upload: QueuedScoreUpload): void {
	const queue = readQueuedScoreUploads()
	const existingIndex = queue.findIndex((entry) => entry.id === upload.id)

	if (existingIndex >= 0) {
		queue[existingIndex] = upload
	} else {
		queue.push(upload)
	}

	writeQueuedScoreUploads(queue)
}

export function removeQueuedScoreUpload(uploadId: string): void {
	const queue = readQueuedScoreUploads()
	const nextQueue = queue.filter((entry) => entry.id !== uploadId)

	if (nextQueue.length === queue.length) {
		return
	}

	writeQueuedScoreUploads(nextQueue)
}

export function shouldQueueScoreUpload(error: unknown): boolean {
	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		return true
	}

	if (error instanceof TypeError) {
		return true
	}

	if (error instanceof SubmitScoresError && typeof error.status === 'number' && error.status >= 500) {
		return true
	}

	return false
}

export function isServerUnreachableScoreUploadError(error: unknown): boolean {
	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		return true
	}

	if (error instanceof TypeError) {
		return true
	}

	if (error instanceof SubmitScoresError && typeof error.status === 'number' && [502, 503, 504].includes(error.status)) {
		return true
	}

	if (error instanceof Error) {
		const normalizedMessage = error.message.toLowerCase()
		if (normalizedMessage.includes('upstream') || normalizedMessage.includes('unavailable') || normalizedMessage.includes('network')) {
			return true
		}
	}

	return false
}
