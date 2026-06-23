const https = require('https');

https.get('https://firestore.googleapis.com/v1/projects/coway-upload-sys/databases/(default)/documents/app_config/system_settings', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(data);
  });
}).on('error', (err) => {
  console.error('HTTP Error:', err.message);
});
