const xlsx = require('xlsx');
const fs = require('fs');

async function testExport() {
  console.log('Testing xlsx generation...');
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet([
    ['Cluster', 'HP', 'Item', 'BOQ', 'Real'],
    ['KALEN', 793, 'Pole 7m "3"', 63, 92]
  ]);
  xlsx.utils.book_append_sheet(wb, ws, 'Test');
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  console.log(`Generated buffer size: ${buffer.length} bytes`);
  fs.writeFileSync('test_output.xlsx', buffer);
  console.log('Successfully wrote test_output.xlsx!');
  fs.unlinkSync('test_output.xlsx');
}

testExport();

