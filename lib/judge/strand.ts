import { DIRECT_RATING_TRACK_STRAND_TREE } from '@/lib/direct-rating-config'

export const DIRECT_REMARK_OPTIONS = ['Nihangyo + off-track', 'ON TRACK', 'ON TRACK with HIGH POTENTIAL', 'Transferee', 'OFF-TRACK with HIGH GRADES (STEM)', 'OFF-TRACK with POTENTIAL', 'OFF-TRACK']

export const TVL_TRACK_NAME = 'Technical-Vocational-Livelihood (TVL) Track'

export function getTVLLeafStrandOptions(): Array<{ value: string; label: string; group: string }> {
	const tvlTree = DIRECT_RATING_TRACK_STRAND_TREE.find((t) => t.track === TVL_TRACK_NAME)
	if (!tvlTree) return []
	const result: Array<{ value: string; label: string; group: string }> = []
	for (const node of tvlTree.nodes) {
		if (node.children && node.children.length > 0) {
			for (const child of node.children) {
				result.push({ value: child.value, label: child.label, group: node.label })
			}
		} else {
			result.push({ value: node.value, label: node.label, group: TVL_TRACK_NAME })
		}
	}
	return result
}

export const TVL_LEAF_STRAND_OPTIONS = getTVLLeafStrandOptions()

export function isTVLAcademicTrack(academicTrack: string | undefined): boolean {
	if (!academicTrack) return false
	const upper = academicTrack.toUpperCase()
	return upper.includes('TVL') || upper.includes('TECHNICAL-VOCATIONAL') || upper.includes('TECHNICAL') || upper.includes('VOCATIONAL')
}

export function autoResolveStrand(academicTrack: string | undefined): string | null {
	if (!academicTrack) return null
	const lower = academicTrack.toLowerCase()
	if (lower.includes('science') || lower.includes('stem')) return 'Science, Technology, Engineering, and Mathematics (STEM)'
	if (lower.includes('accountancy') || lower.includes('abm')) return 'Accountancy, Business and Management (ABM)'
	if (lower.includes('humanities') || lower.includes('humss')) return 'Humanities and Social Sciences (HUMSS)'
	if (lower.includes('general academic') || lower.includes('gas')) return 'General Academic Strand (GAS)'
	if (lower.includes('sports')) return 'Sports Track'
	if (lower.includes('arts') || lower.includes('design')) return 'Arts and Design Track'
	return null
}
