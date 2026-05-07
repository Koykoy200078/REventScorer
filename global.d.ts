import type { AdminScoreRealtimeUpdate } from '@/lib/types'

declare global {
	var __eventScorerRealtimeBroadcast: ((payload: AdminScoreRealtimeUpdate) => void) | undefined
}

export {}
