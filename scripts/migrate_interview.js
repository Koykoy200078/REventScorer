const mysql = require('mysql2/promise');
const crypto = require('crypto');

function uuid() {
    return crypto.randomUUID();
}

async function migrate() {
    const connection = await mysql.createConnection({
        host: '127.0.0.1',
        user: 'root',
        password: 'Carvs@10072000',
        database: 'shareme_db'
    });

    console.log("Connected to database. Migrating direct_rating_config_json...");

    const [events] = await connection.execute("SELECT id, direct_rating_config_json FROM es_events WHERE direct_rating_config_json IS NOT NULL");
    
    for (const event of events) {
        if (!event.direct_rating_config_json) continue;
        try {
            const parsed = JSON.parse(event.direct_rating_config_json);
            let updated = false;

            if (parsed.maxScores && 'interview' in parsed.maxScores) {
                delete parsed.maxScores.interview;
                parsed.maxScores.interviewComm = 100;
                parsed.maxScores.interviewPers = 100;
                parsed.maxScores.interviewInterest = 100;
                parsed.maxScores.interviewSpecial = 100;
                updated = true;
            }

            if (parsed.scoreWeights && 'interview' in parsed.scoreWeights) {
                delete parsed.scoreWeights.interview;
                parsed.scoreWeights.interviewComm = 4;
                parsed.scoreWeights.interviewPers = 4;
                parsed.scoreWeights.interviewInterest = 8;
                parsed.scoreWeights.interviewSpecial = 4;
                updated = true;
            }

            if (updated) {
                await connection.execute("UPDATE es_events SET direct_rating_config_json = ? WHERE id = ?", [JSON.stringify(parsed), event.id]);
                console.log(`Updated config for event ${event.id}`);
            }
        } catch (e) {
            console.error("Error parsing config for event", event.id, e);
        }
    }

    console.log("Migrating es_subcriteria...");

    const [subcriteria] = await connection.execute("SELECT * FROM es_subcriteria WHERE name = 'Interview'");

    for (const sub of subcriteria) {
        console.log(`Replacing subcriterion 'Interview' (id: ${sub.id}) with 4 new ones...`);
        // Update the existing one to Communication Skills
        await connection.execute("UPDATE es_subcriteria SET name = 'Communication Skills' WHERE id = ?", [sub.id]);
        
        // Insert the other 3
        const nextOrder = Number(sub.sort_order) + 1;
        await connection.execute("INSERT INTO es_subcriteria (id, criterion_id, name, max_score, sort_order) VALUES (?, ?, ?, ?, ?)", [uuid(), sub.criterion_id, 'Personality (Bearing)', sub.max_score, nextOrder]);
        await connection.execute("INSERT INTO es_subcriteria (id, criterion_id, name, max_score, sort_order) VALUES (?, ?, ?, ?, ?)", [uuid(), sub.criterion_id, 'Interest in the Program', sub.max_score, nextOrder + 1]);
        await connection.execute("INSERT INTO es_subcriteria (id, criterion_id, name, max_score, sort_order) VALUES (?, ?, ?, ?, ?)", [uuid(), sub.criterion_id, 'Special Skills', sub.max_score, nextOrder + 2]);
    }

    console.log("Migration complete.");
    await connection.end();
}

migrate().catch(console.error);
