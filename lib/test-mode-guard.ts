// Test-safety guard (review item T2): while the test stack runs (SHAREME_TEST=1),
// EventScorer must never open, create, export or import a database whose name
// does not end in `_test`. Kept free of imports so tests can load it directly.
export function assertTestModeDatabase(database: string): void {
	if (process.env.SHAREME_TEST === '1' && !database.endsWith('_test')) {
		throw new Error('Refusing to use a non-test database while SHAREME_TEST=1')
	}
}
