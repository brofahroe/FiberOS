const xlsx = require('xlsx');

function inspectFile(filePath) {
  console.log('====================================');
  console.log('Inspecting:', filePath);
  const workbook = xlsx.readFile(filePath);
  console.log('Sheet names:', workbook.SheetNames);
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    console.log(`\n--- Sheet: ${sheetName} (Total Rows: ${data.length}) ---`);
    console.log('Rows 1 to 25:');
    for (let i = 0; i < Math.min(25, data.length); i++) {
      if (data[i] && data[i].length > 0) {
        console.log(`Row ${i + 1}:`, JSON.stringify(data[i].slice(0, 10)));
      }
    }
  }
}

try {
  inspectFile('BLA000190 KELURAHAN NGRAHO BLORA_BOQ_APD(CLUSTER).xlsx');
  inspectFile('BLA000190 SF-KELURAHAN NGRAHO BLORA_BOQ_APD(SUBFEEDER).xlsx');
} catch (err) {
  console.error(err);
}

