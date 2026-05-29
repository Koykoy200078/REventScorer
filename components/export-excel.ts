import * as ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import type { EventScorer, EventCompiledResults } from '@/lib/types'
import { directScoreWeightsFromConfig, DEFAULT_DIRECT_RATING_CONFIG } from '@/lib/direct-rating-config'

export async function exportAsExcel(event: EventScorer, compiled: EventCompiledResults) {
	const workbook = new ExcelJS.Workbook()
	const worksheet = workbook.addWorksheet('Tabulation Sheet')

	// Set column widths
	worksheet.columns = [
		{ width: 5 },  // A: Number
		{ width: 25 }, // B: LAST NAME
		{ width: 25 }, // C: FIRST NAME
		{ width: 15 }, // D: AVE/GPA (40%)
		{ width: 15 }, // E: NOAT (40%)
		{ width: 15 }, // F: Interview (20%)
		{ width: 18 }, // G: Final Rating (100%)
		{ width: 18 }, // H: Strand
		{ width: 20 }, // I: Remark
		{ width: 15 }, // J: Program Tag
	]

	// 1. Title Row
	const titleRow = worksheet.addRow([event.title.toUpperCase()])
	titleRow.font = { bold: true, size: 24, name: 'Calibri' }
	titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
	worksheet.mergeCells('A1:J1')
	titleRow.height = 40

	// Get weights from config
	const config = event.directRatingConfig
	const weights = directScoreWeightsFromConfig(config || DEFAULT_DIRECT_RATING_CONFIG)
	const aveWeight = weights.aveGpa || 40
	const noatWeight = weights.noat || 40
	const interviewWeight = (weights.interviewContent || 8) + (weights.interviewComm || 4) + (weights.interviewPers || 4) + (weights.interviewInterest || 2) + (weights.interviewSpecial || 2)
	const totalWeight = aveWeight + noatWeight + interviewWeight

	// 2. Empty Row
	worksheet.addRow([])

	// 3. Headers (Row 3 & Row 4)
	const headerRow1 = worksheet.addRow([
		'',
		'Name of Student',
		'',
		`AVE/GPA (${aveWeight}%)`,
		`NOAT (${noatWeight}%)`,
		`Interview (${interviewWeight}%)`,
		`Final Rating (${totalWeight}%)`,
		'Strand',
		'Remark',
		'Program',
	])

	const headerRow2 = worksheet.addRow([
		'',
		'LAST NAME',
		'FIRST NAME',
		'', // merged with D3
		'', // merged with E3
		'', // merged with F3
		'', // merged with G3
		'', // merged with H3
		'', // merged with I3
		'', // merged with J3
	])

	// Merge Header Cells
	worksheet.mergeCells('B3:C3') // Name of Student
	worksheet.mergeCells('D3:D4') // AVE/GPA
	worksheet.mergeCells('E3:E4') // NOAT
	worksheet.mergeCells('F3:F4') // Interview
	worksheet.mergeCells('G3:G4') // Final Rating
	worksheet.mergeCells('H3:H4') // Strand
	worksheet.mergeCells('I3:I4') // Remark
	worksheet.mergeCells('J3:J4') // Program

	// Style Headers
	const headerStyle = {
		font: { bold: true, size: 11, name: 'Calibri', color: { argb: 'FFFFFFFF' } },
		alignment: { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true },
		fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF000000' } },
		border: {
			top: { style: 'thin' as const, color: { argb: 'FF000000' } },
			left: { style: 'thin' as const, color: { argb: 'FF000000' } },
			bottom: { style: 'thin' as const, color: { argb: 'FF000000' } },
			right: { style: 'thin' as const, color: { argb: 'FF000000' } },
		},
	}

	for (let i = 1; i <= 10; i++) {
		const cell1 = headerRow1.getCell(i)
		const cell2 = headerRow2.getCell(i)
		cell1.font = headerStyle.font
		cell1.alignment = headerStyle.alignment
		cell1.fill = headerStyle.fill
		cell1.border = headerStyle.border
		cell2.font = headerStyle.font
		cell2.alignment = headerStyle.alignment
		cell2.fill = headerStyle.fill
		cell2.border = headerStyle.border
	}
	
	// 4. Data Rows
	let currentRowNumber = 5

	for (let i = 0; i < compiled.rankings.length; i++) {
		const row = worksheet.addRow([])
		
		const result = compiled.rankings[i]
		
		// Split name into last name, first name
		const nameParts = result.contestantName.split(',')
		const contestant = event.contestants.find(c => c.id === result.contestantId)
		const tag = contestant?.programTag || ''
		
		const lastName = nameParts.length > 1 ? nameParts[0].trim() : ''
		const firstName = nameParts.length > 1 ? nameParts[1].trim() : result.contestantName
		
		// Use the direct details for average values, then weight them
		const details = result.directDetails
		
		// Calculate weighted scores
		let weightedAve = 0
		let weightedNoat = 0
		let weightedInterview = 0
		
		if (details) {
			const maxScores = config?.maxScores || DEFAULT_DIRECT_RATING_CONFIG.maxScores
			const aveMax = maxScores.aveGpa || 100
			const noatMax = maxScores.noat || 100
			const interviewMax = (maxScores.interviewContent || 40) + (maxScores.interviewComm || 20) + (maxScores.interviewPers || 20) + (maxScores.interviewInterest || 10) + (maxScores.interviewSpecial || 10)

			weightedAve = (details.aveGpa / aveMax) * aveWeight
			weightedNoat = (details.noat / noatMax) * noatWeight
			weightedInterview = (details.totalInterview / interviewMax) * interviewWeight
		}

		row.getCell(1).value = i + 1
		row.getCell(2).value = lastName
		row.getCell(3).value = firstName
		
		// Weighted Scores
		row.getCell(4).value = Number(weightedAve.toFixed(2))
		row.getCell(5).value = Number(weightedNoat.toFixed(2))
		row.getCell(6).value = Number(weightedInterview.toFixed(2))
		
		// Final Rating
		row.getCell(7).value = Number((result.finalRating ?? result.averageScore).toFixed(2))

		// Strand
		row.getCell(8).value = details?.strand || ''

		// Remark
		row.getCell(9).value = details?.remark || ''

		// Program Tag
		row.getCell(10).value = tag
		
		// Border style for data cells
		for (let col = 1; col <= 10; col++) {
			row.getCell(col).border = {
				top: { style: 'thin', color: { argb: 'FF000000' } },
				left: { style: 'thin', color: { argb: 'FF000000' } },
				bottom: { style: 'thin', color: { argb: 'FF000000' } },
				right: { style: 'thin', color: { argb: 'FF000000' } },
			}
			row.getCell(col).alignment = { horizontal: 'center', vertical: 'middle' }
		}
		row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' }
		row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' }

		currentRowNumber++
	}

	// Generate file and trigger download
	const buffer = await workbook.xlsx.writeBuffer()
	const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
	saveAs(blob, `${event.title} - Tabulation Sheet.xlsx`)
}
