'use server';

import { prisma } from '@/lib/prisma';
import * as excel from 'xlsx';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';
import boqListFallback from '@/data/boq-list.json';
import sitelistData from '@/data/sitelist.json';

export interface BoqReferenceRule {
  itemPekerjaan: string;
  aliases?: string[];
  boq: string;
  kategori: string;
  satuan: string;
}

export interface ParsedBoqItem {
  sourceItemName: string; // Kolom "Item Pekerjaan" dari BOQ-list.xlsx / Excel APD
  boqName: string;        // Kolom "BOQ" dari BOQ-list.xlsx (nama pendek standar di aplikasi)
  itemName: string;       // Disimpan ke WorkItem.itemName (sama dengan boqName)
  category: string;       // Kolom "Kategori" dari BOQ-list.xlsx (FAT, FDT, JC, CABLE, POLE)
  unit: string;           // Kolom "Satuan" dari BOQ-list.xlsx (Unit, Meter)
  quantity: number;       // Volume BOQ dari file Excel APD
}

export interface ParsedSheetScopeData {
  sheetName: string;
  clusterName: string;
  homePasses: number;
  totalItems: number;
  hasActiveVolume: boolean;
  items: ParsedBoqItem[];
  allReferenceItems: ParsedBoqItem[];
}

export interface ParsedBoqResult {
  clusterName: string;
  scope: 'CLUSTER' | 'SUBFEEDER';
  homePasses?: number;
  projectCode?: string;
  sheetName: string;
  totalItems: number;
  items: ParsedBoqItem[];
  allReferenceItems: ParsedBoqItem[];
  clusterSheet?: ParsedSheetScopeData;
  subfeederSheet?: ParsedSheetScopeData;
}

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getBoqReferenceRules(): Promise<BoqReferenceRule[]> {
  try {
    const filePath = path.join(process.cwd(), 'BOQ-list.xlsx');
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      const wb = excel.read(buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = excel.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
      const rules: BoqReferenceRule[] = [];

      for (const r of rows) {
        const itemPekerjaan = String(r['Item Pekerjaan'] || '').trim();
        const boq = String(r['BOQ'] || '').trim();
        const kategori = String(r['Kategori'] || '').trim().toUpperCase();
        const satuan = String(r['Satuan'] || '').trim();
        if (itemPekerjaan && boq) {
          const fallbackMatch = boqListFallback.find(
            (f) => normalizeText(f.itemPekerjaan) === normalizeText(itemPekerjaan)
          );
          rules.push({
            itemPekerjaan,
            aliases: fallbackMatch?.aliases || [
              itemPekerjaan,
              itemPekerjaan.replace(/\s+pole$/i, '').trim(),
            ],
            boq,
            kategori: kategori || fallbackMatch?.kategori || 'OTHER',
            satuan: satuan || fallbackMatch?.satuan || 'Unit',
          });
        }
      }

      if (rules.length > 0) {
        return rules;
      }
    }
  } catch (err) {
    console.warn('Fallback to bundled boq-list.json:', err);
  }
  return boqListFallback;
}

function matchBoqRule(desc: string, rules: BoqReferenceRule[]): BoqReferenceRule | null {
  const normDesc = normalizeText(desc);
  if (!normDesc) return null;

  for (const rule of rules) {
    const candidates = [
      rule.itemPekerjaan,
      rule.itemPekerjaan.replace(/\s+pole$/i, '').trim(),
      ...(rule.aliases || []),
    ];
    for (const cand of candidates) {
      if (normalizeText(cand) === normDesc) {
        return rule;
      }
    }
  }
  return null;
}

function cleanClusterName(rawName: string): string {
  let name = rawName.toUpperCase().trim();
  name = name
    .replace(/^SF-/, '')
    .replace(/^KEL(URAHAN)?\.?\s+/, '')
    .replace(/\s+BLORA$/, '')
    .trim();

  // Check if it matches an official shortName in Sitelist
  const matchedSite = sitelistData.sites.find(
    (s) =>
      s.shortName.toLowerCase() === name.toLowerCase() ||
      s.clusterName.toLowerCase() === rawName.trim().toLowerCase() ||
      s.clusterId.toLowerCase() === rawName.trim().toLowerCase()
  );
  if (matchedSite) {
    return matchedSite.shortName.toUpperCase();
  }
  return name;
}

function parseSingleSheet(
  workbook: excel.WorkBook,
  sheetName: string,
  rules: BoqReferenceRule[],
  isSubfeeder: boolean,
  originalFilename?: string
): ParsedSheetScopeData {
  const sheet = workbook.Sheets[sheetName];
  const rows = sheet ? (excel.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]) : [];

  let clusterName = '';
  let detectedHp = 0;

  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').trim();
      const lowerVal = val.toLowerCase();
      if (lowerVal === 'cluster' || lowerVal === 'main/hub/sub feeder') {
        const nextVal = String(row[c + 1] || '').trim();
        if (nextVal && nextVal.length > 2) {
          clusterName = nextVal;
        }
      } else if (lowerVal === 'hp' || lowerVal === 'homepass' || lowerVal === 'home passes') {
        const hpVal = parseInt(String(row[c + 1] || '0'), 10);
        if (!isNaN(hpVal) && hpVal > 0) {
          detectedHp = hpVal;
        }
      }
    }
  }

  if (!clusterName && originalFilename) {
    const match = originalFilename.match(/(?:KELURAHAN\s+)?([A-Za-z0-9_\-\s]+?)(?:_BOQ|\.xlsx)/i);
    if (match && match[1]) {
      clusterName = match[1].trim();
    }
  }

  const cleanedName = cleanClusterName(
    clusterName || (isSubfeeder ? 'SUBFEEDER BARU' : 'CLUSTER BARU')
  );

  const ruleQuantities = new Map<number, { qty: number; matchedDesc: string }>();

  for (let r = 5; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 2) continue;

    const desc = String(row[1] || '').trim();
    if (!desc) continue;

    const matchedRuleIdx = rules.findIndex((rule) => matchBoqRule(desc, [rule]) !== null);
    if (matchedRuleIdx === -1) continue;

    const matQty = parseFloat(String(row[3] ?? ''));
    const servQty = parseFloat(String(row[4] ?? ''));

    // Prioritize Service Qty for Instal/Pemasangan rows, fallback to Material Qty
    let qty = 0;
    if (!isNaN(servQty) && servQty > 0) {
      qty = servQty;
    } else if (!isNaN(matQty) && matQty > 0) {
      qty = matQty;
    } else if (r > 5 && rows[r - 1]) {
      // Fallback: check if the row immediately above is the paired material row with Material Qty > 0
      const prevRow = rows[r - 1];
      const prevDesc = normalizeText(String(prevRow?.[1] || ''));
      const currNorm = normalizeText(desc).replace(/^(instal(asi)?|pemasangan)\s+/i, '').trim();
      if (prevDesc && currNorm && (prevDesc.includes(currNorm) || currNorm.includes(prevDesc))) {
        const prevMatQty = parseFloat(String(prevRow?.[3] ?? ''));
        if (!isNaN(prevMatQty) && prevMatQty > 0) {
          qty = prevMatQty;
        }
      }
    }

    const roundedQty = Math.round(qty * 10) / 10;
    const prev = ruleQuantities.get(matchedRuleIdx);
    if (!prev || roundedQty > prev.qty) {
      ruleQuantities.set(matchedRuleIdx, {
        qty: roundedQty,
        matchedDesc: desc.replace(/\s+Pole$/i, ''),
      });
    }
  }

  const allReferenceItems: ParsedBoqItem[] = rules.map((rule, idx) => {
    const found = ruleQuantities.get(idx);
    const displaySource = rule.itemPekerjaan.replace(/\s+Pole$/i, '');
    return {
      sourceItemName: found?.matchedDesc || displaySource,
      boqName: rule.boq,
      itemName: rule.boq,
      category: rule.kategori,
      unit: rule.satuan,
      quantity: found ? found.qty : 0,
    };
  });

  const activeItems = allReferenceItems.filter((item) => item.quantity > 0);
  const parsedItems = activeItems.length > 0 ? activeItems : allReferenceItems;

  return {
    sheetName,
    clusterName: cleanedName,
    homePasses: detectedHp,
    totalItems: parsedItems.length,
    hasActiveVolume: activeItems.length > 0,
    items: parsedItems,
    allReferenceItems,
  };
}

async function parseWorkbook(
  workbook: excel.WorkBook,
  originalFilename?: string,
  preferredScope?: 'CLUSTER' | 'SUBFEEDER'
): Promise<ParsedBoqResult> {
  const rules = await getBoqReferenceRules();

  // Find "BoQ NRO Cluster" sheet for CLUSTER
  const clusterSheetName =
    workbook.SheetNames.find((s) => s.trim().toLowerCase() === 'boq nro cluster') ||
    workbook.SheetNames.find((s) => s.toLowerCase().includes('cluster')) ||
    workbook.SheetNames.find((s) => s.toLowerCase().includes('boq')) ||
    workbook.SheetNames[0];

  // Find "BoQ NRO All Feeder" sheet for SUBFEEDER
  const subfeederSheetName =
    workbook.SheetNames.find((s) => s.trim().toLowerCase() === 'boq nro all feeder') ||
    workbook.SheetNames.find((s) => s.toLowerCase().includes('all feeder')) ||
    workbook.SheetNames.find((s) => s.toLowerCase().includes('feeder')) ||
    clusterSheetName;

  const clusterSheet = parseSingleSheet(
    workbook,
    clusterSheetName,
    rules,
    false,
    originalFilename
  );

  const subfeederSheet = parseSingleSheet(
    workbook,
    subfeederSheetName,
    rules,
    true,
    originalFilename
  );

  const filenameIndicatesSubfeeder =
    (originalFilename || '').toLowerCase().includes('subfeeder') ||
    (originalFilename || '').toLowerCase().includes('sf-');

  // Determine initial scope:
  // 1. If preferredScope is explicitly provided by user in UI, use it
  // 2. Otherwise if filename indicates subfeeder, use SUBFEEDER ("BoQ NRO All Feeder")
  // 3. Otherwise if "BoQ NRO All Feeder" has active items (>0) and "BoQ NRO Cluster" has 0 active items, use SUBFEEDER
  let activeScope: 'CLUSTER' | 'SUBFEEDER' = 'CLUSTER';
  if (preferredScope) {
    activeScope = preferredScope;
  } else if (filenameIndicatesSubfeeder) {
    activeScope = 'SUBFEEDER';
  } else if (subfeederSheet.hasActiveVolume && !clusterSheet.hasActiveVolume) {
    activeScope = 'SUBFEEDER';
  }

  const chosen = activeScope === 'SUBFEEDER' ? subfeederSheet : clusterSheet;

  return {
    clusterName: chosen.clusterName || clusterSheet.clusterName,
    scope: activeScope,
    homePasses: chosen.homePasses || clusterSheet.homePasses,
    sheetName: chosen.sheetName,
    totalItems: chosen.totalItems,
    items: chosen.items,
    allReferenceItems: chosen.allReferenceItems,
    clusterSheet,
    subfeederSheet,
  };
}

export async function parseBoqExcel(
  base64Data: string,
  originalFilename?: string,
  preferredScope?: 'CLUSTER' | 'SUBFEEDER'
): Promise<{ success: boolean; data?: ParsedBoqResult; error?: string }> {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const workbook = excel.read(buffer, { type: 'buffer' });
    const result = await parseWorkbook(workbook, originalFilename, preferredScope);
    return { success: true, data: result };
  } catch (err: unknown) {
    console.error('Error parsing BOQ Excel:', err);
    const errMsg = err instanceof Error ? err.message : 'Gagal membaca file Excel.';
    return { success: false, error: errMsg };
  }
}

export async function parseSampleBoqFile(
  filename: string,
  preferredScope?: 'CLUSTER' | 'SUBFEEDER'
): Promise<{ success: boolean; data?: ParsedBoqResult; error?: string }> {
  try {
    const filePath = path.resolve(filename);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File ${filename} tidak ditemukan.` };
    }
    const buffer = fs.readFileSync(filePath);
    const workbook = excel.read(buffer, { type: 'buffer' });
    const result = await parseWorkbook(workbook, filename, preferredScope);
    return { success: true, data: result };
  } catch (err: unknown) {
    console.error('Error reading sample BOQ file:', err);
    const errMsg = err instanceof Error ? err.message : 'Gagal membaca file contoh.';
    return { success: false, error: errMsg };
  }
}

function getWorkItemWeightAndType(category: string, scope: 'CLUSTER' | 'SUBFEEDER') {
  const cat = category.toUpperCase();
  if (cat === 'POLE') {
    return { workType: 'CW', subCategory: 'POLE', weight: scope === 'SUBFEEDER' ? 50 : 40 };
  }
  if (cat === 'CABLE') {
    return { workType: 'CW', subCategory: 'CABLE', weight: 20 };
  }
  if (cat === 'FAT') {
    return { workType: 'EL', subCategory: 'FAT', weight: 25 };
  }
  if (cat === 'FDT') {
    return { workType: 'EL', subCategory: 'FDT', weight: 5 };
  }
  if (cat === 'JC') {
    return { workType: 'EL', subCategory: 'JC', weight: 20 };
  }
  return { workType: 'CW', subCategory: 'ACC', weight: 10 };
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
          name: 'GCI-MTI BLORA',
        },
      });
    }

    const cleanedName = cleanClusterName(data.clusterName);
    const scope: 'CLUSTER' | 'SUBFEEDER' =
      data.scope || (data.clusterName.toUpperCase().includes('SF') ? 'SUBFEEDER' : 'CLUSTER');

    const matchedSite = sitelistData.sites.find(
      (s) =>
        s.shortName.toLowerCase() === cleanedName.toLowerCase() ||
        s.clusterName.toLowerCase() === data.clusterName.trim().toLowerCase()
    );

    let cluster = await prisma.cluster.findFirst({
      where: {
        projectId: project.id,
        OR: [{ name: cleanedName }, { name: data.clusterName.trim() }],
      },
    });

    if (!cluster) {
      cluster = await prisma.cluster.create({
        data: {
          projectId: project.id,
          name: cleanedName,
          code: matchedSite?.clusterId || `CLRM07-99-${cleanedName}`,
          emrSiteCode: matchedSite?.emrSiteCode || undefined,
          subfeederId: matchedSite?.subfeederId || undefined,
          clusterName: matchedSite?.clusterName || `KELURAHAN ${cleanedName} BLORA`,
          oltName: matchedSite?.oltName || 'OLT Balun',
          kecamatan: matchedSite?.kecamatan || 'Kedungtuban',
          kabupaten: matchedSite?.kabupaten || 'Blora',
          homePasses: data.homePasses || 0,
        },
      });
    } else if (data.homePasses && data.homePasses > 0) {
      await prisma.cluster.update({
        where: { id: cluster.id },
        data: { homePasses: data.homePasses },
      });
    }

    // Aggregate items that map to the same BOQ target name (e.g. JC 48c + JC 144c -> Joint Closure (JC), or Pole 7m "4" + 9m "4")
    const aggregatedMap = new Map<
      string,
      { boqName: string; category: string; unit: string; quantity: number }
    >();

    for (const it of data.items) {
      const targetName = (it.boqName || it.itemName).trim();
      if (!targetName) continue;
      const existing = aggregatedMap.get(targetName);
      if (existing) {
        existing.quantity = Math.round((existing.quantity + it.quantity) * 10) / 10;
      } else {
        aggregatedMap.set(targetName, {
          boqName: targetName,
          category: it.category,
          unit: it.unit,
          quantity: Math.round(it.quantity * 10) / 10,
        });
      }
    }

    // Filter to items with quantity > 0 (unless all are 0)
    const allAggregated = Array.from(aggregatedMap.values());
    const nonZeroAggregated = allAggregated.filter((i) => i.quantity > 0);
    const itemsToSave = nonZeroAggregated.length > 0 ? nonZeroAggregated : allAggregated;
    const savedNamesSet = new Set(itemsToSave.map((i) => i.boqName.toLowerCase()));

    // Remove legacy/unmapped or 0-progress placeholder items in this cluster+scope that are not in the new BOQ import
    const existingWorkItems = await prisma.workItem.findMany({
      where: {
        clusterId: cluster.id,
        scope,
      },
      include: {
        progressList: { select: { id: true } },
      },
    });

    for (const oldItem of existingWorkItems) {
      if (
        !savedNamesSet.has(oldItem.itemName.trim().toLowerCase()) &&
        oldItem.progressList.length === 0
      ) {
        await prisma.workItem.delete({ where: { id: oldItem.id } });
      }
    }

    let sortOrder = scope === 'SUBFEEDER' ? 100 : 1;
    for (const it of itemsToSave) {
      const { workType, subCategory, weight } = getWorkItemWeightAndType(it.category, scope);

      await prisma.workItem.upsert({
        where: {
          clusterId_scope_itemName: {
            clusterId: cluster.id,
            scope,
            itemName: it.boqName,
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
          itemName: it.boqName,
          unit: it.unit,
          boq: it.quantity,
          sortOrder: sortOrder++,
        },
      });
    }

    revalidatePath('/');
    revalidatePath('/matrix');
    revalidatePath('/clusters');
    revalidatePath('/daily-input');
    revalidatePath('/sitelist');

    return {
      success: true,
      message: `Berhasil mengimpor BOQ (${scope === 'SUBFEEDER' ? 'Subfeeder 30% - BoQ NRO All Feeder' : 'Cluster 70% - BoQ NRO Cluster'}) untuk cluster "${cluster.name}" dengan ${itemsToSave.length} item BOQ standar!`,
    };
  } catch (err: unknown) {
    console.error('Error committing BOQ import:', err);
    const errMsg = err instanceof Error ? err.message : 'Gagal menyimpan data BOQ.';
    return { success: false, error: errMsg };
  }
}

/**
 * Automatically cleans up any cluster in DB that previously imported raw 38-item APD descriptions
 * (e.g., "Transportasi, Mobilisasi & demobilisasi", "FO core type SM...", "Instal FO core type...")
 * and converts them into the standardized BOQ-list.xlsx items.
 */
export async function cleanupLegacyRawBoqItems() {
  try {
    const rules = await getBoqReferenceRules();
    const rawItems = await prisma.workItem.findMany({
      where: {
        OR: [
          { itemName: { contains: 'Transportasi, Mobilisasi' } },
          { itemName: { contains: 'FO core type SM' } },
          { itemName: { contains: 'cores capacity pole mounted FDT' } },
          { itemName: { contains: 'Pole mounted outdoor type' } },
          { itemName: { contains: 'STEL L-003' } },
          { itemName: { contains: 'Pemasangan Tiang' } },
          { itemName: { contains: 'Pemasangan Pole' } },
        ],
      },
      select: { clusterId: true, scope: true },
    });

    if (rawItems.length === 0) return;

    const affectedKeys = Array.from(new Set(rawItems.map((r) => `${r.clusterId}:::${r.scope}`)));

    for (const key of affectedKeys) {
      const [clusterId, scopeStr] = key.split(':::');
      const scope = (scopeStr === 'SUBFEEDER' ? 'SUBFEEDER' : 'CLUSTER') as 'CLUSTER' | 'SUBFEEDER';

      const clusterItems = await prisma.workItem.findMany({
        where: { clusterId, scope },
        include: { progressList: true },
      });

      const validBoqNames = new Set(rules.map((r) => r.boq.toLowerCase()));
      const mappedTotals = new Map<
        string,
        { boqName: string; category: string; unit: string; quantity: number }
      >();

      for (const item of clusterItems) {
        const matchedRule = matchBoqRule(item.itemName, rules);
        if (matchedRule) {
          const existing = mappedTotals.get(matchedRule.boq);
          if (existing) {
            existing.quantity = Math.round((existing.quantity + item.boq) * 10) / 10;
          } else {
            mappedTotals.set(matchedRule.boq, {
              boqName: matchedRule.boq,
              category: matchedRule.kategori,
              unit: matchedRule.satuan,
              quantity: Math.round(item.boq * 10) / 10,
            });
          }
        }
      }

      // Delete raw unmapped items that have no daily progress
      for (const item of clusterItems) {
        if (!validBoqNames.has(item.itemName.trim().toLowerCase()) && item.progressList.length === 0) {
          await prisma.workItem.delete({ where: { id: item.id } });
        }
      }

      // Upsert the standardized BOQ items
      let sortOrder = scope === 'SUBFEEDER' ? 100 : 1;
      for (const mapped of Array.from(mappedTotals.values())) {
        if (mapped.quantity <= 0) continue;
        const { workType, subCategory, weight } = getWorkItemWeightAndType(mapped.category, scope);
        await prisma.workItem.upsert({
          where: {
            clusterId_scope_itemName: {
              clusterId,
              scope,
              itemName: mapped.boqName,
            },
          },
          update: {
            boq: mapped.quantity,
            category: mapped.category,
            subCategory,
            workType,
            weight,
            unit: mapped.unit,
          },
          create: {
            clusterId,
            scope,
            workType,
            category: mapped.category,
            subCategory,
            weight,
            itemName: mapped.boqName,
            unit: mapped.unit,
            boq: mapped.quantity,
            sortOrder: sortOrder++,
          },
        });
      }
    }
  } catch (err) {
    console.warn('Error in cleanupLegacyRawBoqItems:', err);
  }
}
