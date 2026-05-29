const { loadEventById } = require('./lib/storage-db');
const { compileEventResults } = require('./lib/scoring');
const { getPool } = require('./lib/db');

async function run() {
  const pool = await getPool();
  const connection = await pool.getConnection();
  const event = await loadEventById(connection, '46caee26-eb44-4d90-8583-06f961abe387');
  const compiled = compileEventResults(event);
  
  const abejero = compiled.finalResults.find(r => r.contestantName.includes('Abejero'));
  console.log(JSON.stringify(abejero, null, 2));
  
  process.exit(0);
}

run().catch(console.error);
