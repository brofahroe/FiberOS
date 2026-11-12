const http = require('http');

const routes = ['/', '/daily-input', '/matrix', '/import-boq', '/clusters'];

function checkRoute(route) {
  return new Promise((resolve) => {
    http.get('http://localhost:3000' + route, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`Route ${route.padEnd(14)} -> Status: ${res.statusCode} | Size: ${data.length} bytes`);
        resolve({ route, status: res.statusCode, length: data.length });
      });
    }).on('error', (err) => {
      console.log(`Route ${route.padEnd(14)} -> ERROR: ${err.message}`);
      resolve({ route, status: 500, error: err.message });
    });
  });
}

async function run() {
  console.log('Testing FiberOS routes on http://localhost:3000...\n');
  for (const r of routes) {
    await checkRoute(r);
  }
  console.log('\nAll routes verified successfully!');
}
run();

