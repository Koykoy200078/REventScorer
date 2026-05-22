const http = require('http');
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3001,
      path: path,
      method: method,
      headers: {}
    };
    if (body) {
      options.headers['Content-Type'] = 'application/json';
    }
    const req = http.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({status: res.statusCode, body: data}));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  const eventId = '5e9e854f-7fa2-495c-9470-6b5fd13b9049';
  console.log('GET 1');
  const r1 = await request('GET', '/api/admin/events/' + eventId);
  let e1 = JSON.parse(r1.body).event;
  console.log('Slots:', JSON.stringify(e1.presentationSlots, null, 2));

  console.log('PATCH');
  const slot = e1.presentationSlots[0];
  const body = {
    contestantId: slot.contestantId,
    judgeIds: slot.judgeIds.slice(0, 1) // Remove one judge
  };
  const r2 = await request('PATCH', '/api/admin/events/' + eventId, body);
  console.log('PATCH Status:', r2.status);

  console.log('GET 2');
  const r3 = await request('GET', '/api/admin/events/' + eventId);
  let e3 = JSON.parse(r3.body).event;
  console.log('Slots:', JSON.stringify(e3.presentationSlots, null, 2));
}
test();
