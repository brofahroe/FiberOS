import { PrismaClient } from '@prisma/client';
import xlsx from 'xlsx';

const prisma = new PrismaClient();

function detectCategory(itemName) {
  const lower = itemName.toLowerCase();
  if (lower.includes('pole') || lower.includes('tiang')) return 'POLE';
  if (lower.includes('kabel') || lower.includes('cable') || lower.includes('feeder')) return 'CABLE';
  if (lower.includes('fat')) return 'FAT';
  if (lower.includes('fdt')) return 'FDT';
  if (lower.includes('sling') || lower.includes('clamp') || lower.includes('hanger') || lower.includes('belt') || lower.includes('grip') || lower.includes('stoplink')) return 'ACCESSORY';
  return 'OTHER';
}

function detectUnit(itemName, category) {
  if (category === 'POLE') return 'Btg';
  if (category === 'CABLE') return 'Meter';
  if (category === 'FAT' || category === 'FDT') return 'Unit';
  return 'Pcs';
}

async function main() {
  console.log('--- Cleaning and Re-seeding from sheet_sample.csv ---');

  // Clean existing data
  await prisma.dailyProgressItem.deleteMany();
  await prisma.dailyReport.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.cluster.deleteMany();
  await prisma.project.deleteMany();

  const wb = xlsx.readFile('sheet_sample.csv', { raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true });

  const dateRow = rows[1];
  const dateColumns = [];
  for (let c = 3; c < dateRow.length; c++) {
    const val = String(dateRow[c] || '').trim();
    if (val && (val.includes('-Oct') || val.includes('-Nov') || val.includes('-Dec') || val.includes('-Jan') || val.includes('-Feb') || val.includes('-Mar') || val.includes('-Apr') || val.includes('-May') || val.includes('-Jun') || val.includes('-Jul') || val.includes('-Aug') || val.includes('-Sep'))) {
      dateColumns.push({ index: c, date: val });
    }
  }

  console.log(`Found ${dateColumns.length} date columns (${dateColumns[0]?.date} to ${dateColumns[dateColumns.length - 1]?.date})`);

  const project = await prisma.project.create({
    data: {
      code: 'BLA-KEDUNGTUBAN',
      name: 'ALL CL KEDUNGTUBAN BLORA',
      description: 'Proyek FTTH Rollout Kedungtuban Blora',
    },
  });

  let currentCluster = null;
  let workItemOrder = 0;

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const clusterCell = row[0] ? String(row[0]).trim() : null;
    const hpCell = row[1];
    const itemCell = row[2] ? String(row[2]).trim() : null;

    if (clusterCell) {
      const cleanClusterName = clusterCell.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
      const hp = parseInt(hpCell) || 0;

      currentCluster = await prisma.cluster.create({
        data: {
          projectId: project.id,
          name: cleanClusterName,
          homePasses: hp,
        },
      });
      workItemOrder = 0;
      console.log(`Created Cluster: ${cleanClusterName} (HP: ${hp})`);
    }

    if (!currentCluster || !itemCell) continue;

    // BOQ value
    const boqVal = row[row.length - 1];
    const boq = typeof boqVal === 'number' ? boqVal : parseFloat(boqVal) || 0;

    // Check if this item already exists in currentCluster (to avoid duplicates from template rows)
    const existingItem = await prisma.workItem.findUnique({
      where: {
        clusterId_itemName: {
          clusterId: currentCluster.id,
          itemName: itemCell,
        },
      },
    });

    if (existingItem) {
      // If template row without cluster label, continue
      continue;
    }

    const category = detectCategory(itemCell);
    const unit = detectUnit(itemCell, category);

    const workItem = await prisma.workItem.create({
      data: {
        clusterId: currentCluster.id,
        category,
        itemName: itemCell,
        unit,
        boq,
        sortOrder: workItemOrder++,
      },
    });

    // Check daily values
    for (const col of dateColumns) {
      const rawVal = row[col.index];
      const qty = typeof rawVal === 'number' ? rawVal : parseFloat(rawVal);

      if (!isNaN(qty) && qty > 0) {
        let dailyReport = await prisma.dailyReport.findFirst({
          where: {
            clusterId: currentCluster.id,
            reportDate: col.date,
          },
        });

        if (!dailyReport) {
          dailyReport = await prisma.dailyReport.create({
            data: {
              clusterId: currentCluster.id,
              reportDate: col.date,
              reporterName: 'Supervisor Lapangan',
              teamName: 'Tim FTTH Blora',
              notes: 'Migrasi progres riil dari Google Spreadsheet',
            },
          });
        }

        await prisma.dailyProgressItem.create({
          data: {
            dailyReportId: dailyReport.id,
            workItemId: workItem.id,
            quantity: qty,
          },
        });
      }
    }
  }

  const clusterCount = await prisma.cluster.count();
  const workItemCount = await prisma.workItem.count();
  const reportCount = await prisma.dailyReport.count();
  const progressCount = await prisma.dailyProgressItem.count();

  console.log(`\n========================================`);
  console.log(`✅ SEED BERHASIL LENGKAP!`);
  console.log(`Clusters: ${clusterCount}`);
  console.log(`WorkItems: ${workItemCount}`);
  console.log(`Daily Reports: ${reportCount}`);
  console.log(`Daily Progress Items: ${progressCount}`);
  console.log(`========================================\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
