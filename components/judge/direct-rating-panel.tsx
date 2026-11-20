import Select from 'react-select'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatScore } from '@/components/ui/preset-rail'
import { ScoreInput } from '@/components/ui/score-input'
import { selectStyles } from '@/components/ui/select'
import { DIRECT_RATING_STRAND_SELECT_GROUPS } from '@/lib/direct-rating-config'
import type { DirectScoreField } from '@/lib/judge/legacy-direct'
import { DIRECT_REMARK_OPTIONS, isTVLAcademicTrack, TVL_LEAF_STRAND_OPTIONS } from '@/lib/judge/strand'
import { directFieldReadouts } from '@/lib/judge/summary'
import type { EventContestant } from '@/lib/types'

type Detail = 'strand' | 'remark'

const STYLES = { ...selectStyles('field'), menuPortal: (base: object) => ({ ...base, zIndex: 50 }) }
const TVL_GROUPS = Array.from(new Set(TVL_LEAF_STRAND_OPTIONS.map((option) => option.group))).map((groupName) => ({
	label: groupName,
	options: TVL_LEAF_STRAND_OPTIONS.filter((option) => option.group === groupName).map((option) => ({ value: option.value, label: option.label })),
}))
const STRAND_GROUPS = DIRECT_RATING_STRAND_SELECT_GROUPS.map((group) => ({ label: group.label, options: group.options.map((option) => ({ value: option.value, label: option.label })) }))
const ALL_STRANDS = DIRECT_RATING_STRAND_SELECT_GROUPS.flatMap((group) => group.options)
const REMARKS = DIRECT_REMARK_OPTIONS.map((option) => ({ value: option, label: option }))

function percentText(weight: number): string {
	return `${Number(weight.toFixed(3))}%`
}

/**
 * The direct-rating view (Stage 5 Task 5, spec §2.5, §4.6; rulings R13, B36 display only): the
 * Individual-only look with today's fields and no presets or batch (owner). AVE/GPA and NOAT (read
 * only when admin-provided), the five interview parts, then the strand and remark selects (today's
 * options, TVL list and instanceIds; the menus open over the dock). Each field shows "Entered ·
 * Normalized" as before. The formula line states the configured weights, which is how the admin
 * ranks (the old line said thirds).
 */
export function DirectRatingPanel({
	contestant,
	index,
	count,
	fields,
	inputRow,
	noatLocked,
	details,
	finalRating,
	weights,
	onCell,
	onDetail,
}: {
	contestant: EventContestant
	index: number
	count: number
	fields: DirectScoreField[]
	inputRow: Record<string, string>
	noatLocked: boolean
	details: { strand: string; remark: string }
	finalRating: number | null
	weights: { aveGpa: number | null; noat: number | null; interview: number | null }
	onCell: (subCriterionId: string, raw: string, max: number) => void
	onDetail: (field: Detail, value: string) => void
}) {
	const readouts = new Map(directFieldReadouts(fields, inputRow).map((readout) => [readout.subCriterionId, readout]))
	const id = contestant.id
	const portal = typeof document === 'undefined' ? undefined : document.body
	const fieldCard = (field: DirectScoreField) => {
		const locked = field.key === 'noat' && noatLocked
		const readout = readouts.get(field.subCriterionId)
		const titleId = `direct-${field.subCriterionId}-title`
		return (
			<Card key={field.subCriterionId} variant='individual-rubric'>
				<div className='flex flex-col gap-1 min-w-0'>
					<div className='flex flex-wrap items-center gap-space-xs'>
						<h3 id={titleId} className='font-headline-sm text-headline-sm text-on-surface font-bold [overflow-wrap:anywhere]'>
							{field.label}
						</h3>
						{locked ? <Badge variant='individual-role'>Admin provided</Badge> : null}
					</div>
					<p className='font-body-sm text-body-sm text-slate-500'>
						Entered: {formatScore(readout?.entered ?? 0)} · Normalized: {formatScore(readout?.normalizedPercent ?? 0)}%
					</p>
				</div>
				<ScoreInput
					variant='individual'
					label='Score'
					data-testid='score-input'
					data-subcriterion-id={field.subCriterionId}
					suppressHydrationWarning
					aria-labelledby={titleId}
					value={inputRow[field.subCriterionId] ?? '0'}
					max={field.maxScore}
					readOnly={locked}
					onChange={(event) => {
						if (!locked) onCell(field.subCriterionId, event.target.value, field.maxScore)
					}}
				/>
			</Card>
		)
	}
	const base = fields.filter((field) => !field.key.startsWith('interview'))
	const interview = fields.filter((field) => field.key.startsWith('interview'))
	const formula = [weights.aveGpa !== null ? `AVE/GPA ${percentText(weights.aveGpa)}` : null, weights.noat !== null ? `NOAT ${percentText(weights.noat)}` : null, weights.interview !== null ? `Interview ${percentText(weights.interview)}` : null]
		.filter(Boolean)
		.join(' + ')
	const strandValue = details.strand
	const tvl = isTVLAcademicTrack(contestant.academicTrack)

	return (
		<>
			<Card variant='individual-header'>
				<div className='flex flex-col gap-space-xs min-w-0'>
					<div className='flex flex-wrap items-center gap-space-xs'>
						<Badge variant='individual-part'>
							Direct rating • Entry {index + 1} of {count}
						</Badge>
						<Badge variant='individual-subtotal'>Final rating: {finalRating === null ? '—' : formatScore(finalRating)} / 100</Badge>
					</div>
					<h2 className='font-headline-md text-headline-md text-on-surface font-bold [overflow-wrap:anywhere]'>{contestant.name}</h2>
					<p className='font-body-sm text-body-sm text-on-surface-variant'>Enter AVE/GPA, NOAT, and Interview directly. NOAT may be admin-provided and read-only. Strand bonus is applied to Interview only, and Final Rating stays on a 0-100 scale.</p>
				</div>
			</Card>
			<div className='flex flex-col gap-space-md'>{base.map(fieldCard)}</div>
			{interview.length > 0 ? (
				<section className='flex flex-col gap-space-md'>
					<h2 className='font-headline-sm text-headline-sm text-on-surface font-semibold'>Interview</h2>
					{interview.map(fieldCard)}
				</section>
			) : null}
			<Card variant='individual-rubric'>
				<div className='grid w-full gap-space-md md:grid-cols-2'>
					<label className='flex flex-col gap-space-xs min-w-0'>
						<span className='font-label-md text-label-md text-on-surface font-semibold'>Strand</span>
						{tvl ? <span className='font-body-sm text-body-sm text-slate-500'>TVL Track — select specific sub-strand</span> : null}
						<div data-testid='strand-select'>
							<Select
								instanceId={tvl ? `strand-tvl-select-${id}` : `strand-select-${id}`}
								options={tvl ? TVL_GROUPS : STRAND_GROUPS}
								value={strandValue ? { value: strandValue, label: (tvl ? TVL_LEAF_STRAND_OPTIONS.find((option) => option.value === strandValue)?.label : ALL_STRANDS.find((option) => option.value === strandValue)?.label) ?? strandValue } : null}
								onChange={(selected) => onDetail('strand', selected?.value ?? '')}
								isClearable
								placeholder='Search or select...'
								classNamePrefix='react-select'
								menuPortalTarget={portal}
								menuPlacement='auto'
								styles={STYLES}
							/>
						</div>
					</label>
					<label className='flex flex-col gap-space-xs min-w-0'>
						<span className='font-label-md text-label-md text-on-surface font-semibold'>Remark</span>
						<div data-testid='remark-select'>
							<Select
								instanceId={`remark-select-${id}`}
								options={REMARKS}
								value={details.remark ? { value: details.remark, label: details.remark } : null}
								onChange={(selected) => onDetail('remark', selected?.value ?? '')}
								isClearable
								placeholder='Search or select...'
								classNamePrefix='react-select'
								menuPortalTarget={portal}
								menuPlacement='auto'
								styles={STYLES}
							/>
						</div>
					</label>
				</div>
			</Card>
			<p className='font-body-sm text-body-sm text-slate-500'>Final rating = {formula}, each part as a share of its maximum; the strand bonus is added to Interview, capped at its maximum.</p>
		</>
	)
}
