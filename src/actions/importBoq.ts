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
  scope: 'CLUSTER' | 'SUBFEEDER';
  projectCode?: string;
  sheetName: string;
  totalItems: number;
  items: ParsedBoqItem[];
}

function cleanClusterName(rawName: string): string {
  let name = rawName.toUpperCase().trim();
  name = name.replace(/^SF-/, '').replace(/^KELURAHAN\s+/, '').replace(/\s+BLORA$/, '').trim();
  return name;
}

function detectCategory(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('pole') || lower.includes('tiang')) return 'POLE';
  if (lower.includes('kabel') || lower.includes('cable') || lower.includes('fo type') || lower.includes('fo core') || lower.includes('cores')) return 'CABLE';
  if (lower.includes('fat') || lower.includes('terminal box')) return 'FAT';
  if (lower.includes('fdt') || lower.includes('distribution terminal')) return 'FDT';
  if (lower.includes('joint closure') || lower.includes('closure') || lower.includes('jc')) return 'JC';
  if (lower.includes('clamp') || lower.includes('sling') || lower.includes('hanger') || lower.includes('tray') || lower.includes('belt') || lower.includes('grip') || lower.includes('stoplink') || lower.includes('dead') || lower.includes('perapihan') || lower.includes('acc')) return 'ACCESSORY';
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
  if (category === 'FAT' || category === 'FDT' || category === 'JC') return 'Unit';
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

  if (!clusterName && originalFilename) {
    const match = originalFilename.match(/(?:KELURAHAN\s+)?([A-Za-z0-9_\-\s]+?)(?:_BOQ|\.xlsx)/i);
    if (match && match[1]) {
      clusterName = match[1].trim();
    }
  }

  const cleanedName = cleanClusterName(clusterName || (isSubfeeder ? 'SUBFEEDER BARU' : 'CLUSTER BARU'));

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
    clusterName: cleanedName,
    scope: isSubfeeder ? 'SUBFEEDER' : 'CLUSTER',
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
  scope?: 'CLUSTER' | 'SUBFEEDER';
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

    const cleanedName = cleanClusterName(data.clusterName);
    const scope: 'CLUSTER' | 'SUBFEEDER' = data.scope || (data.clusterName.toUpperCase().includes('SF') ? 'SUBFEEDER' : 'CLUSTER');

    let cluster = await prisma.cluster.findFirst({
      where: {
        projectId: project.id,
        OR: [
          { name: cleanedName },
          { name: data.clusterName.trim() },
        ],
      },
    });

    if (!cluster) {
      cluster = await prisma.cluster.create({
        data: {
          projectId: project.id,
          name: cleanedName,
          homePasses: data.homePasses || 0,
        },
      });
    } else if (data.homePasses && data.homePasses > 0) {
      await prisma.cluster.update({
        where: { id: cluster.id },
        data: { homePasses: data.homePasses },
      });
    }

    let sortOrder = scope === 'SUBFEEDER' ? 100 : 0;
    for (const it of data.items) {
      let workType = 'CW';
      let subCategory = 'POLE';
      let weight = 40;

      if (it.category === 'POLE') {
        workType = 'CW';
        subCategory = 'POLE';
        weight = scope === 'SUBFEEDER' ? 50 : 40;
      } else if (it.category === 'CABLE') {
        workType = 'CW';
        subCategory = 'CABLE';
        weight = 20;
      } else if (it.category === 'FAT') {
        workType = 'EL';
        subCategory = 'FAT';
        weight = 25;
      } else if (it.category === 'FDT') {
        workType = 'EL';
        subCategory = 'FDT';
        weight = 5;
      } else if (it.category === 'JC') {
        workType = 'EL';
        subCategory = 'JC';
        weight = 20;
      } else if (it.category === 'ACCESSORY') {
        workType = 'CW';
        subCategory = 'ACC';
        weight = 10;
      }

      await prisma.workItem.upsert({
        where: {
          clusterId_scope_itemName: {
            clusterId: cluster.id,
            scope,
            itemName: it.itemName,
          },
        },
        update: {
          boq: it.quantity,
          category: it.category,
          subCategory,
          workType,
          weight,
          unit: it.unit,
        },
        create: {
          clusterId: cluster.id,
          scope,
          workType,
          category: it.category,
          subCategory,
          weight,
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
      message: `Berhasil mengimpor BOQ (${scope === 'SUBFEEDER' ? 'Subfeeder 30%' : 'Cluster 70%'}) untuk cluster "${cluster.name}" dengan ${data.items.length} item pekerjaan!`,
    };
  } catch (err: any) {
    console.error('Error committing BOQ import:', err);
    return { success: false, error: err.message || 'Gagal menyimpan data BOQ.' };
  }
}
