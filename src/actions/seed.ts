'use server';

import { prisma } from '@/lib/prisma';
import * as xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import { revalidatePath } from 'next/cache';

const excel = (xlsx as any).default || xlsx;

function detectCategory(itemName: string) {
  const lower = itemName.toLowerCase();
  if (lower.includes('pole') || lower.includes('tiang')) return 'POLE';
  if (lower.includes('kabel') || lower.includes('cable') || lower.includes('feeder')) return 'CABLE';
  if (lower.includes('fat')) return 'FAT';
  if (lower.includes('fdt')) return 'FDT';
  if (lower.includes('sling') || lower.includes('clamp') || lower.includes('hanger') || lower.includes('belt') || lower.includes('grip') || lower.includes('stoplink')) return 'ACCESSORY';
  return 'OTHER';
}

function detectUnit(itemName: string, category: string) {
  if (category === 'POLE') return 'Btg';
  if (category === 'CABLE') return 'Meter';
  if (category === 'FAT' || category === 'FDT') return 'Unit';
  return 'Pcs';
}

export async function runInitialSeed() {
  try {
    const projectCount = await prisma.project.count();
    if (projectCount > 0) {
      return { success: true, message: 'Database sudah memiliki data proyek.' };
    }

    const csvPath = path.join(process.cwd(), 'sheet_sample.csv');
    if (!fs.existsSync(csvPath)) {
      return { success: false, error: 'File sheet_sample.csv tidak ditemukan di server.' };
    }

    const wb = excel.readFile(csvPath, { raw: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = excel.utils.sheet_to_json(sheet, { header: 1, raw: true }) as any[][];

    const dateRow = rows[1];
    const dateColumns: Array<{ index: number; date: string }> = [];
    for (let c = 3; c < dateRow.length; c++) {
      const val = String(dateRow[c] || '').trim();
      if (val && (val.includes('-Oct') || val.includes('-Nov') || val.includes('-Dec') || val.includes('-Jan') || val.includes('-Feb') || val.includes('-Mar') || val.includes('-Apr') || val.includes('-May') || val.includes('-Jun') || val.includes('-Jul') || val.includes('-Aug') || val.includes('-Sep'))) {
        dateColumns.push({ index: c, date: val });
      }
    }

    const project = await prisma.project.create({
      data: {
        code: 'BLA-KEDUNGTUBAN',
        name: 'ALL CL KEDUNGTUBAN BLORA',
        description: 'Proyek FTTH Rollout Kedungtuban Blora',
      },
    });

    let currentCluster: any = null;
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
      }

      if (!currentCluster || !itemCell) continue;

      const boqVal = row[row.length - 1];
      const boq = typeof boqVal === 'number' ? boqVal : parseFloat(boqVal) || 0;

      const existingItem = await prisma.workItem.findUnique({
        where: {
          clusterId_itemName: {
            clusterId: currentCluster.id,
            itemName: itemCell,
          },
        },
      });

      if (existingItem) continue;

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

    revalidatePath('/');
    revalidatePath('/matrix');
    revalidatePath('/clusters');
    return { success: true, message: 'Berhasil memuat data 15 Cluster Proyek Blora!' };
  } catch (err: any) {
    console.error('Error running initial seed:', err);
    return { success: false, error: err.message || 'Gagal menjalankan seed data' };
  }
}

