const http = require('http');

const url = 'http://localhost:3000/api/gdrive/proxy?fileId=1lw96Yl-Gfrih3CnduEUQnCnwSFdL-caQ';

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
    console.log('First 500 chars as text:');
    console.log(buffer.toString('utf8', 0, Math.min(buffer.length, 500)));
  });
}).on('error', (err) => {
  console.error('Error requesting proxy:', err);
});
