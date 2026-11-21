// Which formula an event's results follow, and the sentence the admin console shows for it (spec R46, Stage 5 Task 7
// step 2). Decided from the compiled results, not from eventScoringType: scoring detects direct rating from the criteria,
// and a "final-oral-defense" event without a group criterion compiles as standard.

import { DEFAULT_DIRECT_RATING_CONFIG, directScoreWeightsFromConfig, normalizeDirectRatingConfig } from '@/lib/direct-rating-config'
import type { EventCompiledResults, EventScorer } from '@/lib/types'

export type ScoringKind = 'standard' | 'weighted' | 'direct'

export function scoringKind(compiled: Pick<EventCompiledResults, 'hasWeightedScores' | 'rankings'>): ScoringKind {
	if (compiled.hasWeightedScores) {
		return 'weighted'
	}

	return compiled.rankings.some((result) => typeof result.finalRating === 'number' && Number.isFinite(result.finalRating)) ? 'direct' : 'standard'
}

// Up to two decimals, without trailing zeros: 50, 44.44, 2.5.
function plainNumber(value: number): string {
	return String(Math.round(value * 100) / 100)
}

function positive(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : 0
}

function strandBonusSentence(single: number, multi: number): string | null {
	if (single <= 0 && multi <= 0) {
		return null
	}

	let points: string
	if (single === multi) {
		points = `+${plainNumber(single)} Interview points`
	} else if (multi <= 0) {
		points = `+${plainNumber(single)} Interview points for a single-aligned strand`
	} else if (single <= 0) {
		points = `+${plainNumber(multi)} Interview points for a multi-aligned strand`
	} else {
		points = `+${plainNumber(single)} Interview points for a single-aligned strand, +${plainNumber(multi)} for a multi-aligned strand`
	}

	return `Aligned strand bonus: ${points}, up to the Interview maximum.`
}

export function adminFormulaSentence(event: Pick<EventScorer, 'directRatingConfig'>, compiled: Pick<EventCompiledResults, 'hasWeightedScores' | 'rankings'>): string[] {
	const kind = scoringKind(compiled)

	if (kind === 'weighted') {
		return ['Final score = Group rating × 60% + Individual rating × 40%.']
	}

	if (kind === 'standard') {
		return ["Final score = the average of the judges' totals, over the judges who saved the entry."]
	}

	const config = normalizeDirectRatingConfig(event.directRatingConfig ?? DEFAULT_DIRECT_RATING_CONFIG)
	const weights = directScoreWeightsFromConfig(config)
	const aveGpa = positive(weights.aveGpa)
	const noat = positive(weights.noat)
	const interview = positive(weights.interviewContent) + positive(weights.interviewComm) + positive(weights.interviewPers) + positive(weights.interviewInterest) + positive(weights.interviewSpecial)
	const sum = aveGpa + noat + interview
	const share = (weight: number) => plainNumber(sum > 0 ? (weight * 100) / sum : 0)

	const sentences = [`Final rating = AVE/GPA ${share(aveGpa)}% + NOAT ${share(noat)}% + Interview ${share(interview)}%, each part as a share of its maximum, averaged over the judges who saved.`]
	// A bonus applies only to the strands on its list: with no strand listed it never applies and is not mentioned.
	const { strandBonus } = config
	const bonus = strandBonusSentence(
		strandBonus.singleAlignedStrands.length > 0 ? positive(strandBonus.singleAlignedBonusPoints) : 0,
		strandBonus.multiAlignedStrands.length > 0 ? positive(strandBonus.multiAlignedBonusPoints) : 0,
	)
	if (bonus) {
		sentences.push(bonus)
	}

	return sentences
}
