const http = require('http');
const fs = require('fs');

const url = 'http://localhost:3000/api/gdrive/proxy?fileId=1Zc0bKaCiHoYh8W9T71d5HKsyJkP1wfTi';

http.get(url, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);

  let bodyChunks = [];
  res.on('data', (chunk) => {
    bodyChunks.push(chunk);
  });

  res.on('end', () => {
    const buffer = Buffer.concat(bodyChunks);
    console.log('Response length:', buffer.length);
    // Print first 500 characters as text to see if it's HTML or PDF header
    console.log('First 500 chars as text:');
    console.log(buffer.toString('utf8', 0, Math.min(buffer.length, 500)));
  });
}).on('error', (err) => {
  console.error('Error requesting proxy:', err);
});
