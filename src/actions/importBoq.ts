'use server';

import { prisma } from '@/lib/prisma';
import * as xlsx from 'xlsx';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';

const excel = (xlsx as any).default || xlsx;

export interface ParsedBoqItem {
  itemName: string;
  category: string;
  unit: string;
  quantity: number;
}

export interface ParsedBoqResult {
  clusterName: string;
  projectCode?: string;
  sheetName: string;
  totalItems: number;
  items: ParsedBoqItem[];
}

function detectCategory(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('pole') || lower.includes('tiang')) return 'POLE';
  if (lower.includes('kabel') || lower.includes('cable') || lower.includes('fo type') || lower.includes('fo core') || lower.includes('cores')) return 'CABLE';
  if (lower.includes('fat') || lower.includes('terminal box')) return 'FAT';
  if (lower.includes('fdt') || lower.includes('distribution terminal')) return 'FDT';
  if (lower.includes('clamp') || lower.includes('sling') || lower.includes('hanger') || lower.includes('tray') || lower.includes('belt') || lower.includes('grip') || lower.includes('stoplink') || lower.includes('dead')) return 'ACCESSORY';
  return 'OTHER';
}

function detectUnit(name: string, category: string, rawUnit?: string): string {
  if (rawUnit && rawUnit.trim()) {
    const u = rawUnit.toLowerCase().trim();
    if (u === 'meter' || u === 'm') return 'Meter';
    if (u === 'set' || u === 'unit') return 'Unit';
    if (u === 'pcs' || u === 'btg' || u === 'batang') return 'Btg';
  }
  if (category === 'POLE') return 'Btg';
  if (category === 'CABLE') return 'Meter';
  if (category === 'FAT' || category === 'FDT') return 'Unit';
  return 'Pcs';
}

function parseWorkbook(workbook: any, originalFilename?: string): ParsedBoqResult {
  const isSubfeeder = (originalFilename || '').toLowerCase().includes('subfeeder') || (originalFilename || '').toLowerCase().includes('sf-');
  let targetSheetName = '';
  if (isSubfeeder) {
    targetSheetName = workbook.SheetNames.find(
      (s: string) => s.toLowerCase().includes('all feeder') || s.toLowerCase().includes('feeder')
    ) || '';
  }
  if (!targetSheetName) {
    targetSheetName = workbook.SheetNames.find(
      (s: string) => s.toLowerCase().includes('cluster')
    ) || workbook.SheetNames.find(
      (s: string) => s.toLowerCase().includes('boq')
    ) || workbook.SheetNames[0];
  }

  const sheet = workbook.Sheets[targetSheetName];
  const rows = excel.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

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

  if (isSubfeeder && clusterName && !clusterName.toLowerCase().startsWith('sf-')) {
    clusterName = `SF-${clusterName}`;
  }

  if (!clusterName && originalFilename) {
    const match = originalFilename.match(/(?:KELURAHAN\s+)?([A-Za-z0-9_\-\s]+?)(?:_BOQ|\.xlsx)/i);
    if (match && match[1]) {
      clusterName = match[1].trim();
    }
  }

  if (!clusterName) {
    clusterName = isSubfeeder ? 'SUBFEEDER BARU' : 'CLUSTER BARU';
  }

  const parsedItems: ParsedBoqItem[] = [];

  for (let r = 6; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 3) continue;

    const desc = String(row[1] || row[14] || '').trim();
    const rawUnit = String(row[2] || '').trim();
    const matQty = parseFloat(row[3]);
    const servQty = parseFloat(row[4]);

    let qty = 0;
    if (!isNaN(matQty) && matQty > 0) {
      qty = matQty;
    } else if (!isNaN(servQty) && servQty > 0) {
      qty = servQty;
    }

    if (desc && qty > 0) {
      if (desc.toLowerCase().startsWith('sub total') || desc.toLowerCase().startsWith('total') || desc.toLowerCase().startsWith('pengamanan')) {
        continue;
      }

      const category = detectCategory(desc);
      const unit = detectUnit(desc, category, rawUnit);

      parsedItems.push({
        itemName: desc,
        category,
        unit,
        quantity: Math.round(qty * 10) / 10,
      });
    }
  }

  return {
    clusterName,
    sheetName: targetSheetName,
    totalItems: parsedItems.length,
    items: parsedItems,
  };
}

export async function parseBoqExcel(base64Data: string, originalFilename?: string): Promise<{ success: boolean; data?: ParsedBoqResult; error?: string }> {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const workbook = excel.read(buffer, { type: 'buffer' });
    const result = parseWorkbook(workbook, originalFilename);
    return { success: true, data: result };
  } catch (err: any) {
    console.error('Error parsing BOQ Excel:', err);
    return { success: false, error: err.message || 'Gagal membaca file Excel.' };
  }
}

export async function parseSampleBoqFile(filename: string): Promise<{ success: boolean; data?: ParsedBoqResult; error?: string }> {
  try {
    const filePath = path.resolve(filename);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File ${filename} tidak ditemukan.` };
    }
    const buffer = fs.readFileSync(filePath);
    const workbook = excel.read(buffer, { type: 'buffer' });
    const result = parseWorkbook(workbook, filename);
    return { success: true, data: result };
  } catch (err: any) {
    console.error('Error reading sample BOQ file:', err);
    return { success: false, error: err.message || 'Gagal membaca file contoh.' };
  }
}

export async function commitBoqImport(data: {
  clusterName: string;
  homePasses?: number;
  items: ParsedBoqItem[];
}) {
  try {
    let project = await prisma.project.findFirst({
      where: { code: 'BLA-KEDUNGTUBAN' },
    });

    if (!project) {
      project = await prisma.project.create({
        data: {
          code: 'BLA-KEDUNGTUBAN',
          name: 'ALL CL KEDUNGTUBAN BLORA',
        },
      });
    }

    const cluster = await prisma.cluster.upsert({
      where: {
        projectId_name: {
          projectId: project.id,
          name: data.clusterName.trim(),
        },
      },
      update: {
        homePasses: data.homePasses && data.homePasses > 0 ? data.homePasses : undefined,
      },
      create: {
        projectId: project.id,
        name: data.clusterName.trim(),
        homePasses: data.homePasses || 0,
      },
    });

    let sortOrder = 0;
    for (const it of data.items) {
      await prisma.workItem.upsert({
        where: {
          clusterId_itemName: {
            clusterId: cluster.id,
            itemName: it.itemName,
          },
        },
        update: {
          boq: it.quantity,
          category: it.category,
          unit: it.unit,
        },
        create: {
          clusterId: cluster.id,
          category: it.category,
          itemName: it.itemName,
          unit: it.unit,
          boq: it.quantity,
          sortOrder: sortOrder++,
        },
      });
    }

    revalidatePath('/');
    revalidatePath('/matrix');
    revalidatePath('/clusters');

    return {
      success: true,
      message: `Berhasil mengimpor BOQ untuk cluster "${data.clusterName}" dengan ${data.items.length} item pekerjaan!`,
    };
  } catch (err: any) {
    console.error('Error committing BOQ import:', err);
    return { success: false, error: err.message || 'Gagal menyimpan data BOQ.' };
  }
}
