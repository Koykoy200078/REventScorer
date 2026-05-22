const { createPool } = require('mysql2/promise');
const fs = require('fs');

async function check() {
  const config = JSON.parse(fs.readFileSync('C:/Projects/ShareME/config.json'));
  const pool = createPool({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
  });
  
  const [slots] = await pool.query("SELECT * FROM es_presentation_slots WHERE event_id = '5e9e854f-7fa2-495c-9470-6b5fd13b9049'");
  console.log('slots:', slots.length);
  const [judges] = await pool.query("SELECT * FROM es_presentation_slot_judges WHERE slot_id IN (SELECT id FROM es_presentation_slots WHERE event_id = '5e9e854f-7fa2-495c-9470-6b5fd13b9049')");
  console.log('judges:', judges.length);
  process.exit(0);
}
check();
