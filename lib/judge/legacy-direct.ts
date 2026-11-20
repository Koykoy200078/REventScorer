import { DIRECT_SCORE_FIELD_LABELS, DIRECT_SCORE_FIELD_ORDER, normalizeDirectRatingConfig } from '@/lib/direct-rating-config'
import type { detectDirectRatingScoreFields } from '@/lib/direct-rating-config'
import { round } from '@/lib/judge/score-input'
import type { DirectRatingConfig, EventCriterion, ScoreMatrix } from '@/lib/types'

export type DirectScoreField = ReturnType<typeof detectDirectRatingScoreFields>[number]

export function migrateLegacyDirectRating(
	rawCriteria: EventCriterion[],
	rawScores: ScoreMatrix | undefined,
	directRatingConfig: DirectRatingConfig | undefined
): { criteria: EventCriterion[]; scores: ScoreMatrix | undefined } {
	const subCriteriaList = rawCriteria.flatMap((c) => c.subCriteria)
	const oldAveId = subCriteriaList.find((sc) => sc.name.toLowerCase().includes('ave') || sc.name.toLowerCase().includes('gpa'))?.id
	const oldNoatId = subCriteriaList.find((sc) => sc.name.toLowerCase() === 'noat')?.id
	const oldInterviewSubCriterion = subCriteriaList.find((sc) => !sc.name.toLowerCase().includes('ave') && !sc.name.toLowerCase().includes('gpa') && sc.name.toLowerCase() !== 'noat')

	if (!oldInterviewSubCriterion || !oldAveId || !oldNoatId) {
		return { criteria: rawCriteria, scores: rawScores }
	}

	const hasNewFields = subCriteriaList.some((sc) => sc.name.toLowerCase().includes('communication') || sc.name.toLowerCase().includes('personality'))
	if (hasNewFields) {
		if (!rawScores) {
			return { criteria: rawCriteria, scores: undefined }
		}

		const newInterviewContentId = subCriteriaList.find((sc) => sc.name.toLowerCase().includes('content') || sc.name.toLowerCase().includes('course'))?.id
		const newInterviewCommId = subCriteriaList.find((sc) => sc.name.toLowerCase().includes('communication'))?.id
		const newInterviewPersId = subCriteriaList.find((sc) => sc.name.toLowerCase().includes('personality'))?.id
		const newInterviewInterestId = subCriteriaList.find((sc) => sc.name.toLowerCase().includes('interest') || sc.name.toLowerCase().includes('commitment'))?.id
		const newInterviewSpecialId = subCriteriaList.find((sc) => sc.name.toLowerCase().includes('special') || sc.name.toLowerCase().includes('talents'))?.id
		
		const aveGpaId = subCriteriaList.find((sc) => sc.name.toLowerCase().includes('ave') || sc.name.toLowerCase().includes('gpa'))?.id
		const noatId = subCriteriaList.find((sc) => sc.name.toLowerCase() === 'noat')?.id

		const knownIds = new Set([newInterviewContentId, newInterviewCommId, newInterviewPersId, newInterviewInterestId, newInterviewSpecialId, aveGpaId, noatId].filter(Boolean))

		const migratedScores: ScoreMatrix = {}
		
		for (const [contestantId, contestantScores] of Object.entries(rawScores)) {
			migratedScores[contestantId] = { ...contestantScores }

			// Find old interview score ID (explicit legacy key, or fallback to first unknown key)
			let oldInterviewId: string | undefined = 'legacy-interview'
			if (contestantScores[oldInterviewId] === undefined) {
				oldInterviewId = Object.keys(contestantScores).find((key) => !knownIds.has(key) && key !== 'legacy-aveGpa' && key !== 'legacy-noat')
			}
			const oldScore = oldInterviewId ? Number(contestantScores[oldInterviewId]) : NaN

			const alreadyMigrated = newInterviewCommId ? contestantScores[newInterviewCommId] !== undefined : false

			if (!alreadyMigrated && Number.isFinite(oldScore) && oldScore > 0) {
				const contentMax = directRatingConfig?.maxScores?.interviewContent ?? 40
				const commMax = directRatingConfig?.maxScores?.interviewComm ?? 20
				const persMax = directRatingConfig?.maxScores?.interviewPers ?? 20
				const interestMax = directRatingConfig?.maxScores?.interviewInterest ?? 10
				const specialMax = directRatingConfig?.maxScores?.interviewSpecial ?? 10
				const totalMax = contentMax + commMax + persMax + interestMax + specialMax

				if (totalMax > 0 && newInterviewContentId && newInterviewCommId && newInterviewPersId && newInterviewInterestId && newInterviewSpecialId) {
					const contentScore = round((oldScore * contentMax) / totalMax)
					const commScore = round((oldScore * commMax) / totalMax)
					const persScore = round((oldScore * persMax) / totalMax)
					const interestScore = round((oldScore * interestMax) / totalMax)
					const specialScore = round(oldScore - (contentScore + commScore + persScore + interestScore))

					migratedScores[contestantId][newInterviewContentId] = contentScore
					migratedScores[contestantId][newInterviewCommId] = commScore
					migratedScores[contestantId][newInterviewPersId] = persScore
					migratedScores[contestantId][newInterviewInterestId] = interestScore
					migratedScores[contestantId][newInterviewSpecialId] = specialScore
				}
			}

			// Map old AVE/GPA and NOAT to new UUIDs
			if (aveGpaId && contestantScores['legacy-aveGpa'] !== undefined && contestantScores[aveGpaId] === undefined) {
				migratedScores[contestantId][aveGpaId] = contestantScores['legacy-aveGpa']
			}
			if (noatId && contestantScores['legacy-noat'] !== undefined && contestantScores[noatId] === undefined) {
				migratedScores[contestantId][noatId] = contestantScores['legacy-noat']
			}
		}

		return { criteria: rawCriteria, scores: migratedScores }
	}

	// Calculate the split manually from the old subcriterion if config doesn't exist, otherwise use config
	const interviewContentMax = directRatingConfig?.maxScores?.interviewContent ?? round((oldInterviewSubCriterion.maxScore * 8) / 20)
	const interviewCommMax = directRatingConfig?.maxScores?.interviewComm ?? round((oldInterviewSubCriterion.maxScore * 4) / 20)
	const interviewPersMax = directRatingConfig?.maxScores?.interviewPers ?? round((oldInterviewSubCriterion.maxScore * 4) / 20)
	const interviewInterestMax = directRatingConfig?.maxScores?.interviewInterest ?? round((oldInterviewSubCriterion.maxScore * 2) / 20)
	const interviewSpecialMax = directRatingConfig?.maxScores?.interviewSpecial ?? round(oldInterviewSubCriterion.maxScore - (interviewContentMax + interviewCommMax + interviewPersMax + interviewInterestMax))

	const normalizedConfig = normalizeDirectRatingConfig({
		...(directRatingConfig ?? {}),
		maxScores: {
			...(directRatingConfig?.maxScores ?? {}),
			aveGpa: directRatingConfig?.maxScores?.aveGpa ?? subCriteriaList.find((sc) => sc.id === oldAveId)?.maxScore ?? 100,
			noat: directRatingConfig?.maxScores?.noat ?? subCriteriaList.find((sc) => sc.id === oldNoatId)?.maxScore ?? 100,
			interviewContent: interviewContentMax,
			interviewComm: interviewCommMax,
			interviewPers: interviewPersMax,
			interviewInterest: interviewInterestMax,
			interviewSpecial: interviewSpecialMax,
		}
	})

	const migratedCriteria: EventCriterion[] = [
		{
			id: 'legacy-migrated-criterion',
			name: 'Direct Rating',
			maxScore: Object.values(normalizedConfig.maxScores).reduce((sum, score) => sum + score, 0),
			subCriteria: DIRECT_SCORE_FIELD_ORDER.map((fieldKey) => ({
				id: `legacy-migrated-${fieldKey}`,
				name: DIRECT_SCORE_FIELD_LABELS[fieldKey],
				maxScore: normalizedConfig.maxScores[fieldKey],
			})),
		},
	]

	if (!rawScores) {
		return { criteria: migratedCriteria, scores: undefined }
	}

	const migratedScores: ScoreMatrix = {}

	for (const [contestantId, contestantScores] of Object.entries(rawScores)) {
		migratedScores[contestantId] = { ...contestantScores }

		const alreadyMigrated = contestantScores['legacy-migrated-interviewComm'] !== undefined
		const oldScore = Number(contestantScores[oldInterviewSubCriterion.id])

		if (!alreadyMigrated && Number.isFinite(oldScore) && oldScore > 0) {
			const contentMax = normalizedConfig.maxScores.interviewContent
			const commMax = normalizedConfig.maxScores.interviewComm
			const persMax = normalizedConfig.maxScores.interviewPers
			const interestMax = normalizedConfig.maxScores.interviewInterest
			const specialMax = normalizedConfig.maxScores.interviewSpecial
			const totalMax = contentMax + commMax + persMax + interestMax + specialMax

			if (totalMax > 0) {
				const contentScore = round((oldScore * contentMax) / totalMax)
				const commScore = round((oldScore * commMax) / totalMax)
				const persScore = round((oldScore * persMax) / totalMax)
				const interestScore = round((oldScore * interestMax) / totalMax)
				const specialScore = round(oldScore - (contentScore + commScore + persScore + interestScore))

				migratedScores[contestantId]['legacy-migrated-interviewContent'] = contentScore
				migratedScores[contestantId]['legacy-migrated-interviewComm'] = commScore
				migratedScores[contestantId]['legacy-migrated-interviewPers'] = persScore
				migratedScores[contestantId]['legacy-migrated-interviewInterest'] = interestScore
				migratedScores[contestantId]['legacy-migrated-interviewSpecial'] = specialScore
			}
		}

		if (oldAveId && contestantScores[oldAveId] !== undefined && contestantScores['legacy-migrated-aveGpa'] === undefined) {
			migratedScores[contestantId]['legacy-migrated-aveGpa'] = contestantScores[oldAveId]
		}
		if (oldNoatId && contestantScores[oldNoatId] !== undefined && contestantScores['legacy-migrated-noat'] === undefined) {
			migratedScores[contestantId]['legacy-migrated-noat'] = contestantScores[oldNoatId]
		}
	}

	return { criteria: migratedCriteria, scores: migratedScores }
}
