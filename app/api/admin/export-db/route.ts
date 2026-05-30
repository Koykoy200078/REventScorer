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
	try {
		const body = await request.json().catch(() => ({}))
		if (!verifyUpdatePassword(body.password)) {
			return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
		}

		const config = getDbConfig()
		if (!config.database) {
			return NextResponse.json({ error: 'Database name is not configured.' }, { status: 500 })
		}

		const tempFilePath = path.join(os.tmpdir(), `eventscorer_dump_${randomUUID()}.sql`)
		
		// Use --add-drop-table and --routines for a complete dump, including schemas
		// Add --set-gtid-purged=OFF to prevent GTID conflict errors on import
		const command = `mysqldump -h "${config.host}" -P ${config.port} -u "${config.user}" --set-gtid-purged=OFF --add-drop-table --routines --databases "${config.database}" --result-file="${tempFilePath}"`

		try {
			await execAsync(command, {
				env: { ...process.env, MYSQL_PWD: config.password }
			})
			
			const sqlContent = await fs.readFile(tempFilePath, 'utf-8')
			await fs.unlink(tempFilePath).catch(() => {}) // Cleanup

			return new NextResponse(sqlContent, {
				status: 200,
				headers: {
					'Content-Type': 'application/sql',
					'Content-Disposition': `attachment; filename="backup-${new Date().toISOString().split('T')[0]}.sql"`,
				},
			})
		} catch (execError: any) {
			console.error('Database export failed:', execError)
			return NextResponse.json({ error: 'Database export failed. Please check server logs.' }, { status: 500 })
		}
	} catch (error) {
		console.error('Export error:', error)
		return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
	}
}
