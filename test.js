const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 3001,
  path: '/api/eventscorer/admin/events/5e9e854f-7fa2-495c-9470-6b5fd13b9049',
  method: 'GET'
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log(JSON.stringify(JSON.parse(data).event.presentationSlots, null, 2)));
});

req.end();
