import { NextResponse } from 'next/server'
import { verifyUpdatePassword } from '@/lib/update-auth'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { randomUUID } from 'node:crypto'

const execAsync = promisify(exec)

function getDbConfig() {
	const host = (process.env.EVENTSCORER_DB_HOST ?? process.env.MYSQL_HOST ?? process.env.DB_HOST ?? '127.0.0.1').trim()
	const portStr = process.env.EVENTSCORER_DB_PORT ?? process.env.MYSQL_PORT ?? process.env.DB_PORT
	const port = portStr ? parseInt(portStr, 10) : 3306
	const user = (process.env.EVENTSCORER_DB_USER ?? process.env.MYSQL_USER ?? process.env.DB_USER ?? '').trim()
	const password = process.env.EVENTSCORER_DB_PASSWORD ?? process.env.MYSQL_PASSWORD ?? process.env.DB_PASSWORD ?? ''
	let database = (process.env.EVENTSCORER_DB_NAME ?? process.env.MYSQL_DATABASE ?? process.env.DB_NAME ?? '').trim()
	
	// Normalize database name similar to storage-db.ts
	database = database.replace(/[^a-zA-Z0-9_$]/g, '')
	
	return { host, port, user, password, database }
}

export async function POST(request: Request) {
	let tempFilePath: string | null = null

	try {
		const formData = await request.formData().catch(() => null)
		if (!formData) {
			return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
		}

		const password = formData.get('password') as string
		if (!verifyUpdatePassword(password)) {
			return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
		}

		const file = formData.get('file') as File | null
		if (!file || !file.name.endsWith('.sql')) {
			return NextResponse.json({ error: 'Invalid or missing .sql file.' }, { status: 400 })
		}

		const config = getDbConfig()
		if (!config.database) {
			return NextResponse.json({ error: 'Database name is not configured.' }, { status: 500 })
		}

		// Save the uploaded file to a temporary location
		const arrayBuffer = await file.arrayBuffer()
		const buffer = Buffer.from(arrayBuffer)
		
		tempFilePath = path.join(os.tmpdir(), `eventscorer_import_${randomUUID()}.sql`)
		await fs.writeFile(tempFilePath, buffer)

		// On Windows, the < operator works in cmd.exe. 
		// We execute mysql and pipe the file into it.
		// Note: The file might contain CREATE DATABASE statements if exported with --databases. 
		// That is fine, it will drop and recreate it if --add-drop-table was used.
		const command = `mysql -h "${config.host}" -P ${config.port} -u "${config.user}" ${config.password ? `-p"${config.password}"` : ''} "${config.database}" < "${tempFilePath}"`

		try {
			await execAsync(command)
			return NextResponse.json({ success: true })
		} catch (execError: any) {
			console.error('Database import failed:', execError)
			return NextResponse.json({ error: 'Database import failed. Check the SQL syntax or server logs.' }, { status: 500 })
		}
	} catch (error) {
		console.error('Import error:', error)
		return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
	} finally {
		if (tempFilePath) {
			await fs.unlink(tempFilePath).catch(() => {}) // Cleanup
		}
	}
}
