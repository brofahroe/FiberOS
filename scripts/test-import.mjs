import * as xlsx from 'xlsx';
import fs from 'fs';

const excel = xlsx.default || xlsx;

function testParse(filename) {
  console.log(`\nTesting parse for: ${filename}`);
  const buffer = fs.readFileSync(filename);
  const wb = excel.read(buffer, { type: 'buffer' });
  
  const isSubfeeder = filename.toLowerCase().includes('subfeeder') || filename.toLowerCase().includes('sf-');
  let targetSheetName = '';
  if (isSubfeeder) {
    targetSheetName = wb.SheetNames.find(
      (s) => s.toLowerCase().includes('all feeder') || s.toLowerCase().includes('feeder')
    ) || '';
  }
  if (!targetSheetName) {
    targetSheetName = wb.SheetNames.find(
      (s) => s.toLowerCase().includes('cluster')
    ) || wb.SheetNames.find(
      (s) => s.toLowerCase().includes('boq')
    ) || wb.SheetNames[0];
  }

  console.log('Selected target sheet:', targetSheetName);

  const sheet = wb.Sheets[targetSheetName];
  const rows = excel.utils.sheet_to_json(sheet, { header: 1 });

  let clusterName = '';
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').trim();
      if (val.toLowerCase() === 'cluster' || val.toLowerCase() === 'main/hub/sub feeder') {
        const nextVal = String(row[c + 1] || '').trim();
        if (nextVal && nextVal.length > 2) {
          clusterName = nextVal;
          break;
        }
      }
    }
    if (clusterName) break;
  }
  if (isSubfeeder && !clusterName.toLowerCase().startsWith('sf-')) {
    clusterName = `SF-${clusterName}`;
  }
  console.log('Extracted cluster/feeder name:', clusterName);

  let itemCount = 0;
  for (let r = 6; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 3) continue;

    const desc = String(row[1] || row[14] || '').trim();
    const matQty = parseFloat(row[3]);
    const servQty = parseFloat(row[4]);

    let qty = 0;
    if (!isNaN(matQty) && matQty > 0) qty = matQty;
    else if (!isNaN(servQty) && servQty > 0) qty = servQty;

    if (desc && qty > 0) {
      if (!desc.toLowerCase().startsWith('sub total') && !desc.toLowerCase().startsWith('total') && !desc.toLowerCase().startsWith('pengamanan')) {
        itemCount++;
        if (itemCount <= 5) {
          console.log(` - Item: ${desc} | Qty: ${qty}`);
        }
      }
    }
  }
  console.log(`Total valid BOQ items extracted: ${itemCount}`);
}

testParse('BLA000190 KELURAHAN NGRAHO BLORA_BOQ_APD(CLUSTER).xlsx');
testParse('BLA000190 SF-KELURAHAN NGRAHO BLORA_BOQ_APD(SUBFEEDER).xlsx');
