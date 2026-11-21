import type { EventScorer } from '@/lib/types'

// S5: what a browser that has not given the update password may see of an event. Every judge's
// link token and email is blanked; nothing else changes.
export function redactJudgeSecrets(event: EventScorer): EventScorer {
	return { ...event, judges: event.judges.map((judge) => ({ ...judge, token: '', email: '' })) }
}
