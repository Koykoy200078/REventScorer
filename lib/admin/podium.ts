// The Dashboard podium and the Rankings winners list (spec R48, Stage 5 Task 7 step 2).

import { rankingScore } from '@/lib/admin/analytics'
import type { EventCompiledResults } from '@/lib/types'

type Ranking = EventCompiledResults['rankings'][number]

export interface PodiumPlace {
	rank: number
	entries: Ranking[]
	score: number
	// The first place's score minus the next lower place's; only on the first place, and only when another place exists.
	margin?: number
}

// Scored entries only (judge count > 0), grouped by their competition rank; the ranks up to 3 that have entries are the
// places (with ranks 1, 1, 3 the places are first and third). The compiled ranks already share a rank on equal scores.
export function podiumPlaces(rankings: Ranking[], useWeighted: boolean): PodiumPlace[] {
	const byRank = new Map<number, Ranking[]>()
	for (const result of rankings) {
		if (!(result.judgeCount > 0) || !(result.rank >= 1 && result.rank <= 3)) {
			continue
		}
		byRank.set(result.rank, [...(byRank.get(result.rank) ?? []), result])
	}

	const places: PodiumPlace[] = [...byRank.entries()]
		.sort(([left], [right]) => left - right)
		.map(([rank, entries]) => ({ rank, entries, score: rankingScore(entries[0], useWeighted) }))

	if (places.length > 1) {
		places[0] = { ...places[0], margin: Math.round((places[0].score - places[1].score) * 100) / 100 }
	}

	return places
}
