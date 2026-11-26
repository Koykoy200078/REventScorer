// The EventScorer database schema as SQL text, and the steps that create or update it (Stage 1 Task 5,
// moved verbatim from storage-db.ts). A leaf module with no imports, so a test can run the app's own
// schema: tests/eventscorer-api/schema-parity.test.js. storage-db.ts's ensureSchema calls applySchema.

export const TABLE_EVENTS = 'es_events'
export const TABLE_CONTESTANTS = 'es_contestants'
export const TABLE_CONTESTANT_PARTICIPANTS = 'es_contestant_participants'
export const TABLE_JUDGES = 'es_judges'
export const TABLE_CRITERIA = 'es_criteria'
export const TABLE_SUBCRITERIA = 'es_subcriteria'
export const TABLE_PRESENTATION_SLOTS = 'es_presentation_slots'
export const TABLE_PRESENTATION_SLOT_JUDGES = 'es_presentation_slot_judges'
export const TABLE_SUBMISSIONS = 'es_submissions'
export const TABLE_SUBMISSION_SAVED_CONTESTANTS = 'es_submission_saved_contestants'
export const TABLE_SUBMISSION_SCORES = 'es_submission_scores'
export const TABLE_SUBMISSION_CONTESTANT_DETAILS = 'es_submission_contestant_details'

// Raised whenever the schema below changes, so a running server applies it again.
export const EVENTSCORER_SCHEMA_VERSION = 7

const CREATE_TABLES = [
		`CREATE TABLE IF NOT EXISTS ${TABLE_EVENTS} (
			id VARCHAR(36) NOT NULL,
			title VARCHAR(255) NOT NULL,
			description TEXT NULL,
			created_by VARCHAR(255) NULL,
			event_scoring_type VARCHAR(32) NOT NULL DEFAULT 'standard',
			rubric_legend_json LONGTEXT NULL,
			show_rubric_legend TINYINT(1) NOT NULL DEFAULT 0,
			direct_rating_config_json LONGTEXT NULL,
			created_at DATETIME(3) NOT NULL,
			PRIMARY KEY (id),
			INDEX idx_${TABLE_EVENTS}_created_at (created_at)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_CONTESTANTS} (
			id VARCHAR(36) NOT NULL,
			event_id VARCHAR(36) NOT NULL,
			name VARCHAR(255) NOT NULL,
			entry_type VARCHAR(32) NOT NULL DEFAULT 'group',
			program_tag VARCHAR(16) NULL,
			section VARCHAR(64) NULL,
			noat_score DECIMAL(10,3) NULL,
			academic_track VARCHAR(512) NULL,
			laptop_available VARCHAR(512) NULL,
			sort_order INT NOT NULL,
			PRIMARY KEY (id),
			INDEX idx_${TABLE_CONTESTANTS}_event_order (event_id, sort_order),
			CONSTRAINT fk_${TABLE_CONTESTANTS}_event FOREIGN KEY (event_id) REFERENCES ${TABLE_EVENTS}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_CONTESTANT_PARTICIPANTS} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			contestant_id VARCHAR(36) NOT NULL,
			participant_name VARCHAR(255) NOT NULL,
			sort_order INT NOT NULL,
			PRIMARY KEY (id),
			INDEX idx_${TABLE_CONTESTANT_PARTICIPANTS}_contestant_order (contestant_id, sort_order),
			CONSTRAINT fk_${TABLE_CONTESTANT_PARTICIPANTS}_contestant FOREIGN KEY (contestant_id) REFERENCES ${TABLE_CONTESTANTS}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_JUDGES} (
			id VARCHAR(36) NOT NULL,
			event_id VARCHAR(36) NOT NULL,
			name VARCHAR(255) NOT NULL,
			email VARCHAR(255) NULL,
			token VARCHAR(128) NOT NULL,
			sort_order INT NOT NULL,
			PRIMARY KEY (id),
			UNIQUE KEY uq_${TABLE_JUDGES}_token (token),
			INDEX idx_${TABLE_JUDGES}_event_order (event_id, sort_order),
			CONSTRAINT fk_${TABLE_JUDGES}_event FOREIGN KEY (event_id) REFERENCES ${TABLE_EVENTS}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_CRITERIA} (
			id VARCHAR(36) NOT NULL,
			event_id VARCHAR(36) NOT NULL,
			name VARCHAR(255) NOT NULL,
			max_score DECIMAL(10,3) NOT NULL,
			sort_order INT NOT NULL,
			PRIMARY KEY (id),
			INDEX idx_${TABLE_CRITERIA}_event_order (event_id, sort_order),
			CONSTRAINT fk_${TABLE_CRITERIA}_event FOREIGN KEY (event_id) REFERENCES ${TABLE_EVENTS}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_SUBCRITERIA} (
			id VARCHAR(36) NOT NULL,
			criterion_id VARCHAR(36) NOT NULL,
			name VARCHAR(255) NOT NULL,
			max_score DECIMAL(10,3) NOT NULL,
			sort_order INT NOT NULL,
			PRIMARY KEY (id),
			INDEX idx_${TABLE_SUBCRITERIA}_criterion_order (criterion_id, sort_order),
			CONSTRAINT fk_${TABLE_SUBCRITERIA}_criterion FOREIGN KEY (criterion_id) REFERENCES ${TABLE_CRITERIA}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_PRESENTATION_SLOTS} (
			id VARCHAR(36) NOT NULL,
			event_id VARCHAR(36) NOT NULL,
			label VARCHAR(255) NOT NULL,
			contestant_id VARCHAR(36) NOT NULL,
			sort_order INT NOT NULL,
			PRIMARY KEY (id),
			UNIQUE KEY uq_${TABLE_PRESENTATION_SLOTS}_event_contestant (event_id, contestant_id),
			INDEX idx_${TABLE_PRESENTATION_SLOTS}_event_order (event_id, sort_order),
			CONSTRAINT fk_${TABLE_PRESENTATION_SLOTS}_event FOREIGN KEY (event_id) REFERENCES ${TABLE_EVENTS}(id) ON DELETE CASCADE,
			CONSTRAINT fk_${TABLE_PRESENTATION_SLOTS}_contestant FOREIGN KEY (contestant_id) REFERENCES ${TABLE_CONTESTANTS}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_PRESENTATION_SLOT_JUDGES} (
			slot_id VARCHAR(36) NOT NULL,
			judge_id VARCHAR(36) NOT NULL,
			sort_order INT NOT NULL,
			PRIMARY KEY (slot_id, judge_id),
			INDEX idx_${TABLE_PRESENTATION_SLOT_JUDGES}_judge (judge_id),
			CONSTRAINT fk_${TABLE_PRESENTATION_SLOT_JUDGES}_slot FOREIGN KEY (slot_id) REFERENCES ${TABLE_PRESENTATION_SLOTS}(id) ON DELETE CASCADE,
			CONSTRAINT fk_${TABLE_PRESENTATION_SLOT_JUDGES}_judge FOREIGN KEY (judge_id) REFERENCES ${TABLE_JUDGES}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_SUBMISSIONS} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			event_id VARCHAR(36) NOT NULL,
			judge_id VARCHAR(36) NOT NULL,
			submitted_at DATETIME(3) NOT NULL,
			PRIMARY KEY (id),
			UNIQUE KEY uq_${TABLE_SUBMISSIONS}_event_judge (event_id, judge_id),
			INDEX idx_${TABLE_SUBMISSIONS}_event (event_id),
			CONSTRAINT fk_${TABLE_SUBMISSIONS}_event FOREIGN KEY (event_id) REFERENCES ${TABLE_EVENTS}(id) ON DELETE CASCADE,
			CONSTRAINT fk_${TABLE_SUBMISSIONS}_judge FOREIGN KEY (judge_id) REFERENCES ${TABLE_JUDGES}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_SUBMISSION_SAVED_CONTESTANTS} (
			submission_id BIGINT UNSIGNED NOT NULL,
			contestant_id VARCHAR(36) NOT NULL,
			PRIMARY KEY (submission_id, contestant_id),
			INDEX idx_${TABLE_SUBMISSION_SAVED_CONTESTANTS}_contestant (contestant_id),
			CONSTRAINT fk_${TABLE_SUBMISSION_SAVED_CONTESTANTS}_submission FOREIGN KEY (submission_id) REFERENCES ${TABLE_SUBMISSIONS}(id) ON DELETE CASCADE,
			CONSTRAINT fk_${TABLE_SUBMISSION_SAVED_CONTESTANTS}_contestant FOREIGN KEY (contestant_id) REFERENCES ${TABLE_CONTESTANTS}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_SUBMISSION_SCORES} (
			submission_id BIGINT UNSIGNED NOT NULL,
			contestant_id VARCHAR(36) NOT NULL,
			subcriterion_id VARCHAR(36) NOT NULL,
			score DECIMAL(10,3) NOT NULL,
			PRIMARY KEY (submission_id, contestant_id, subcriterion_id),
			INDEX idx_${TABLE_SUBMISSION_SCORES}_contestant (contestant_id),
			INDEX idx_${TABLE_SUBMISSION_SCORES}_subcriterion (subcriterion_id),
			CONSTRAINT fk_${TABLE_SUBMISSION_SCORES}_submission FOREIGN KEY (submission_id) REFERENCES ${TABLE_SUBMISSIONS}(id) ON DELETE CASCADE,
			CONSTRAINT fk_${TABLE_SUBMISSION_SCORES}_contestant FOREIGN KEY (contestant_id) REFERENCES ${TABLE_CONTESTANTS}(id) ON DELETE CASCADE,
			CONSTRAINT fk_${TABLE_SUBMISSION_SCORES}_subcriterion FOREIGN KEY (subcriterion_id) REFERENCES ${TABLE_SUBCRITERIA}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_SUBMISSION_CONTESTANT_DETAILS} (
			submission_id BIGINT UNSIGNED NOT NULL,
			contestant_id VARCHAR(36) NOT NULL,
			strand VARCHAR(255) NULL,
			remark VARCHAR(255) NULL,
			additional_info TEXT NULL,
			PRIMARY KEY (submission_id, contestant_id),
			INDEX idx_${TABLE_SUBMISSION_CONTESTANT_DETAILS}_contestant (contestant_id),
			CONSTRAINT fk_${TABLE_SUBMISSION_CONTESTANT_DETAILS}_submission FOREIGN KEY (submission_id) REFERENCES ${TABLE_SUBMISSIONS}(id) ON DELETE CASCADE,
			CONSTRAINT fk_${TABLE_SUBMISSION_CONTESTANT_DETAILS}_contestant FOREIGN KEY (contestant_id) REFERENCES ${TABLE_CONTESTANTS}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]

// Columns added after the tables were first created: an older database gets each one it lacks.
const ADDED_COLUMNS: ReadonlyArray<{ table: string; column: string; add: string }> = [
	{ table: TABLE_EVENTS, column: 'rubric_legend_json', add: `ALTER TABLE ${TABLE_EVENTS} ADD COLUMN rubric_legend_json LONGTEXT NULL AFTER event_scoring_type` },
	// Schema 7 (B13, Stage 1 Task 5): the office database and the migration SQL have it, so a HeidiSQL dump's
	// INSERT names it; without it the load stops at es_events. The app does not read or write it yet.
	{ table: TABLE_EVENTS, column: 'show_rubric_legend', add: `ALTER TABLE ${TABLE_EVENTS} ADD COLUMN show_rubric_legend TINYINT(1) NOT NULL DEFAULT 0 AFTER rubric_legend_json` },
	{ table: TABLE_EVENTS, column: 'direct_rating_config_json', add: `ALTER TABLE ${TABLE_EVENTS} ADD COLUMN direct_rating_config_json LONGTEXT NULL AFTER rubric_legend_json` },
	{ table: TABLE_CONTESTANTS, column: 'noat_score', add: `ALTER TABLE ${TABLE_CONTESTANTS} ADD COLUMN noat_score DECIMAL(10,3) NULL AFTER program_tag` },
	{ table: TABLE_CONTESTANTS, column: 'section', add: `ALTER TABLE ${TABLE_CONTESTANTS} ADD COLUMN section VARCHAR(64) NULL AFTER program_tag` },
	{ table: TABLE_CONTESTANTS, column: 'academic_track', add: `ALTER TABLE ${TABLE_CONTESTANTS} ADD COLUMN academic_track VARCHAR(512) NULL AFTER noat_score` },
	{ table: TABLE_CONTESTANTS, column: 'laptop_available', add: `ALTER TABLE ${TABLE_CONTESTANTS} ADD COLUMN laptop_available VARCHAR(512) NULL AFTER academic_track` },
]

// Runs one statement with optional parameters and resolves to [rows, ...], as mysql2's execute does.
export type SchemaRun = (sql: string, params?: string[]) => Promise<readonly [unknown, ...unknown[]]>

// Creates every table that is missing, then adds every column an older table lacks.
export async function applySchema(run: SchemaRun): Promise<void> {
	for (const statement of CREATE_TABLES) {
		await run(statement)
	}

	for (const { table, column, add } of ADDED_COLUMNS) {
		const [rows] = await run(
			`SELECT COUNT(*) AS total
			 FROM information_schema.columns
			 WHERE table_schema = DATABASE()
			   AND table_name = ?
			   AND column_name = ?`,
			[table, column],
		)
		if (Number((rows as Array<{ total?: unknown }>)[0]?.total ?? 0) === 0) {
			await run(add)
		}
	}
}
