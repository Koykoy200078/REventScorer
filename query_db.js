const mysql = require('mysql2/promise');

async function run() {
	const c = await mysql.createConnection({host:'127.0.0.1', user:'root', password:'Carvs@10072000', database:'shareme_db'});
	const [events] = await c.query('SELECT * FROM es_events');
	const event = events.find(r => r.title === 'A eaque proident do');
	if (!event) {
		console.log('Event not found');
		await c.end();
		return;
	}
	const [criteria] = await c.query('SELECT * FROM es_criteria WHERE event_id = ?', [event.id]);
	console.log('CRITERIA:');
	console.log(JSON.stringify(criteria, null, 2));

	const [subcriteria] = await c.query('SELECT * FROM es_subcriteria WHERE criterion_id IN (?)', [criteria.map(c => c.id)]);
	console.log('SUBCRITERIA:');
	console.log(JSON.stringify(subcriteria, null, 2));
	await c.end();
}
run();
