'use server';

import { prisma } from '@/lib/prisma';
import * as excel from 'xlsx';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';
import boqListFallback from '@/data/boq-list.json';
import sitelistData from '@/data/sitelist.json';
import { getCanonicalWorkItemSortOrder, isSubfeederOnlyBoqItem } from '@/lib/progressCalculator';
import { backupDatabaseToNextcloud, ensureDatabaseRestoredFromNextcloud } from '@/lib/dbSync';
import { getCurrentUser } from '@/lib/auth';
import { canAccessCity } from '@/lib/permissions';

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
  category: string;       // Kolom "Kategori" dari BOQ-list.xlsx (FAT, FDT, JC, CABLE, POLE, SELING)
  unit: string;           // Kolom "Satuan" dari BOQ-list.xlsx (Btg, Pcs, Meter)
  quantity: number;       // Volume BOQ dari file Excel APD
}

export interface ParsedSheetScopeData {
  sheetName: string;
  clusterName: string;
  oltName: string;
  homePasses: number;
  totalItems: number;
  hasActiveVolume: boolean;
  items: ParsedBoqItem[];
  allReferenceItems: ParsedBoqItem[];
}

export type BoqImportScope = 'CLUSTER' | 'SUBFEEDER' | 'MAIN_FEEDER';

export interface ParsedBoqResult {
  clusterName: string;
  clusterId?: string;
  subfeederId?: string;
  mainFeederId?: string;
  emrSiteCode?: string;
  oltName?: string;
  scope: BoqImportScope;
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
        const satuanRaw = String(r['Satuan'] || '').trim();
        if (itemPekerjaan && boq) {
          const fallbackMatch = boqListFallback.find(
            (f) => normalizeText(f.itemPekerjaan) === normalizeText(itemPekerjaan)
          );
          const resolvedKategori = kategori || fallbackMatch?.kategori || 'OTHER';
          let resolvedSatuan = satuanRaw || fallbackMatch?.satuan || 'Pcs';
          if (resolvedKategori === 'POLE') {
            resolvedSatuan = 'Btg';
          } else if (resolvedSatuan.toLowerCase() === 'unit') {
            resolvedSatuan = 'Pcs';
          }
          rules.push({
            itemPekerjaan,
            aliases: fallbackMatch?.aliases || [
              itemPekerjaan,
              itemPekerjaan.replace(/\s+pole$/i, '').trim(),
            ],
            boq,
            kategori: resolvedKategori,
            satuan: resolvedSatuan,
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

function extractIdsFromFilename(filename?: string): {
  clusterId?: string;
  subfeederId?: string;
  mainFeederId?: string;
  emrSiteCode?: string;
} {
  if (!filename) return {};
  const baseName = path.basename(filename).replace(/\.[^.]+$/, '').trim();

  // Match CLR ID: e.g. CLR29-99-957, CLRM07-99-015, CLR-07-99-015
  const clrMatch = baseName.match(/(?:^|[^A-Z0-9])(CLR[A-Z0-9]*(?:-\d[A-Z0-9]*)+)(?=$|[^A-Z0-9])/i);
  // Match SF ID: e.g. SF29-99-957, SFM07-99-015, SF-07-99-015 (avoids "SF-KELURAHAN")
  const sfMatch = baseName.match(/(?:^|[^A-Z0-9])(SF[A-Z0-9]*(?:-\d[A-Z0-9]*)+)(?=$|[^A-Z0-9])/i);
  // Match MF ID: e.g. MFM07-32, MF29-99-001
  const mfMatch = baseName.match(/(?:^|[^A-Z0-9])(MF[A-Z0-9]*(?:-\d[A-Z0-9]*)+)(?=$|[^A-Z0-9])/i);
  // Match EMR Site Code: e.g. BLA000190
  const emrMatch = baseName.match(/(?:^|[^A-Z0-9])([A-Z]{2,4}\d{5,})(?=$|[^A-Z0-9])/i);

  return {
    clusterId: clrMatch ? clrMatch[1].toUpperCase() : undefined,
    subfeederId: sfMatch ? sfMatch[1].toUpperCase() : undefined,
    mainFeederId: mfMatch ? mfMatch[1].toUpperCase() : undefined,
    emrSiteCode: emrMatch ? emrMatch[1].toUpperCase() : undefined,
  };
}

function getNextNonEmptyCell(row: unknown[], colIdx: number): string {
  for (let offset = 1; offset <= 3; offset++) {
    const candidate = String(row[colIdx + offset] ?? '').trim();
    if (candidate && candidate !== ':') return candidate;
  }
  return '';
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
  let detectedOltName = '';
  let detectedHp = 0;

  for (let r = 0; r < Math.min(12, rows.length); r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').trim();
      if (!val) continue;
      const lowerVal = val.toLowerCase();
      const normLabel = lowerVal.replace(/:+$/, '').trim();

      if (normLabel === 'cluster' || normLabel === 'main/hub/sub feeder') {
        const nextVal = getNextNonEmptyCell(row, c);
        if (nextVal && nextVal.length > 2) {
          clusterName = nextVal;
        }
      } else if (
        normLabel === 'olt name' ||
        normLabel === 'nama olt' ||
        normLabel === 'olt' ||
        normLabel === 'olt id'
      ) {
        const nextVal = getNextNonEmptyCell(row, c);
        if (nextVal && nextVal !== '-' && nextVal.length >= 2) {
          detectedOltName = nextVal;
        }
      } else if (!detectedOltName && /^(?:olt(?:\s+name)?|nama\s+olt)\s*[:=]\s*(.+)$/i.test(val)) {
        const inlineOlt = val.replace(/^(?:olt(?:\s+name)?|nama\s+olt)\s*[:=]\s*/i, '').trim();
        if (inlineOlt && inlineOlt !== '-' && inlineOlt.length >= 2) {
          detectedOltName = inlineOlt;
        }
      } else if (normLabel === 'hp' || normLabel === 'homepass' || normLabel === 'home passes') {
        const hpVal = parseInt(getNextNonEmptyCell(row, c) || '0', 10);
        if (!isNaN(hpVal) && hpVal > 0) {
          detectedHp = hpVal;
        }
      }
    }
  }

  if (!clusterName && originalFilename) {
    const baseNoExt = path.basename(originalFilename).replace(/\.[^.]+$/, '').trim();
    const strippedId = baseNoExt
      .replace(/^(?:APD[\s_-]+)?(?:(?:CLR|SF|MF)[A-Z0-9]*(?:-\d[A-Z0-9]*)+|[A-Z]{2,4}\d{5,})[\s_-]+/i, '')
      .replace(/[\s_-]*BOQ.*$/i, '')
      .replace(/^SF-/i, '')
      .replace(/^KEL(URAHAN)?\.?\s+/i, '')
      .trim();
    if (strippedId) {
      clusterName = strippedId;
    } else {
      const match = originalFilename.match(/(?:KELURAHAN\s+)?([A-Za-z0-9_\-\s]+?)(?:_BOQ|\.xlsx)/i);
      if (match && match[1]) {
        clusterName = match[1].trim();
      }
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
    oltName: detectedOltName,
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
  preferredScope?: BoqImportScope
): Promise<ParsedBoqResult> {
  const rules = await getBoqReferenceRules();
  const extractedIds = extractIdsFromFilename(originalFilename);

  // Find "BoQ NRO Cluster" sheet for CLUSTER
  const clusterSheetName =
    workbook.SheetNames.find((s) => s.trim().toLowerCase() === 'boq nro cluster') ||
    workbook.SheetNames.find((s) => s.toLowerCase().includes('cluster')) ||
    workbook.SheetNames.find((s) => s.toLowerCase().includes('boq')) ||
    workbook.SheetNames[0];

  // Find "BoQ NRO All Feeder" sheet for SUBFEEDER / MAIN_FEEDER
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

  const lowerFilename = (originalFilename || '').toLowerCase();
  const lowerSfName = (subfeederSheet.clusterName || '').toLowerCase();
  const filenameIndicatesSubfeeder =
    lowerFilename.includes('subfeeder') ||
    lowerFilename.includes('sf-') ||
    Boolean(extractedIds.subfeederId);
  const indicatesMainFeeder =
    lowerFilename.includes('main feeder') ||
    lowerFilename.includes('mainfeeder') ||
    lowerFilename.includes('uplink') ||
    lowerFilename.includes('backbone') ||
    Boolean(extractedIds.mainFeederId) ||
    lowerSfName.includes('main feeder') ||
    lowerSfName.includes('mainfeeder') ||
    lowerSfName.includes('uplink') ||
    lowerSfName.includes('backbone');

  // Determine initial scope:
  // 1. If preferredScope is explicitly provided by user in UI, use it
  // 2. If filename/sheet name indicates Main Feeder / Uplink without Cluster BOQ, use MAIN_FEEDER (100% Feeder)
  // 3. Otherwise if filename indicates subfeeder (and subfeeder sheet has volume or cluster sheet doesn't), use SUBFEEDER
  // 4. Otherwise if "BoQ NRO All Feeder" has active items (>0) and "BoQ NRO Cluster" has 0 active items, use SUBFEEDER
  let activeScope: BoqImportScope = 'CLUSTER';
  if (preferredScope) {
    activeScope = preferredScope;
  } else if (indicatesMainFeeder && !clusterSheet.hasActiveVolume) {
    activeScope = 'MAIN_FEEDER';
  } else if (filenameIndicatesSubfeeder && (subfeederSheet.hasActiveVolume || !clusterSheet.hasActiveVolume)) {
    activeScope = 'SUBFEEDER';
  } else if (subfeederSheet.hasActiveVolume && !clusterSheet.hasActiveVolume) {
    activeScope = 'SUBFEEDER';
  }

  const chosen =
    activeScope === 'SUBFEEDER' || activeScope === 'MAIN_FEEDER' ? subfeederSheet : clusterSheet;

  const resolvedClusterName = chosen.clusterName || clusterSheet.clusterName;

  // Fallback IDs & OLT from sitelist if filename didn't contain CLR/SF ID
  const matchedSite = sitelistData.sites.find(
    (s) =>
      (extractedIds.clusterId && s.clusterId.toLowerCase() === extractedIds.clusterId.toLowerCase()) ||
      (extractedIds.subfeederId && s.subfeederId.toLowerCase() === extractedIds.subfeederId.toLowerCase()) ||
      (extractedIds.emrSiteCode && s.emrSiteCode.toLowerCase() === extractedIds.emrSiteCode.toLowerCase()) ||
      s.shortName.toLowerCase() === resolvedClusterName.toLowerCase()
  );

  const detectedOltName =
    chosen.oltName || clusterSheet.oltName || subfeederSheet.oltName || matchedSite?.oltName || '';

  return {
    clusterName: resolvedClusterName,
    clusterId: extractedIds.clusterId || matchedSite?.clusterId,
    subfeederId: extractedIds.subfeederId || matchedSite?.subfeederId,
    mainFeederId: extractedIds.mainFeederId,
    emrSiteCode: extractedIds.emrSiteCode || matchedSite?.emrSiteCode,
    oltName: detectedOltName,
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
  preferredScope?: BoqImportScope
): Promise<{ success: boolean; data?: ParsedBoqResult; error?: string }> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !currentUser.permissions.importBoq) {
      return { success: false, error: 'Akses ditolak: Anda tidak memiliki izin Impor BOQ.' };
    }

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
  preferredScope?: BoqImportScope
): Promise<{ success: boolean; data?: ParsedBoqResult; error?: string }> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !currentUser.permissions.importBoq) {
      return { success: false, error: 'Akses ditolak: Anda tidak memiliki izin Impor BOQ.' };
    }

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

function getWorkItemWeightAndType(category: string, scope: BoqImportScope) {
  const cat = category.toUpperCase();
  if (cat === 'POLE') {
    return {
      workType: 'CW',
      subCategory: 'POLE',
      weight: scope === 'SUBFEEDER' || scope === 'MAIN_FEEDER' ? 50 : 40,
    };
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

export interface BoqTargetCheckResult {
  exists: boolean;
  clusterId?: string;
  clusterName?: string;
  code?: string | null;
  projectType?: string;
  itemCountInScope?: number;
  totalItemsCount?: number;
  existingSummary?: string;
}

export async function checkBoqTargetCluster(
  rawClusterName: string,
  scope: BoqImportScope
): Promise<BoqTargetCheckResult> {
  try {
    const trimmed = (rawClusterName || '').trim();
    if (!trimmed) return { exists: false };

    const project =
      (await prisma.project.findFirst({ where: { code: 'BLA-KEDUNGTUBAN' } })) ||
      (await prisma.project.findFirst());
    if (!project) return { exists: false };

    const isMainFeeder = scope === 'MAIN_FEEDER';
    const cleanedName = isMainFeeder ? trimmed.toUpperCase() : cleanClusterName(trimmed);

    const existing = await prisma.cluster.findFirst({
      where: {
        projectId: project.id,
        OR: [{ name: cleanedName }, { name: trimmed }, { name: trimmed.toUpperCase() }],
      },
      include: {
        workItems: {
          select: {
            itemName: true,
            scope: true,
            boq: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!existing) {
      return { exists: false };
    }

    const itemsInScope = existing.workItems.filter((w) =>
      isMainFeeder ? w.scope === 'MAIN_FEEDER' : w.scope === scope
    );
    const activeInScope = itemsInScope.filter((w) => w.boq > 0);
    const allActiveItems = existing.workItems.filter((w) => w.boq > 0);
    const previewSource = activeInScope.length > 0 ? activeInScope : allActiveItems;
    const existingSummary = previewSource
      .slice(0, 4)
      .map((w) => `${w.itemName}: ${w.boq.toLocaleString('en-US')}`)
      .join(', ');

    return {
      exists: true,
      clusterId: existing.id,
      clusterName: existing.name,
      code: existing.code,
      projectType: existing.projectType,
      // Hitung hanya item yang benar-benar sudah memiliki BOQ > 0 pada scope target
      itemCountInScope: activeInScope.length,
      totalItemsCount: allActiveItems.length,
      existingSummary:
        existingSummary || `Template awal (${existing.workItems.length} item, BOQ 0)`,
    };
  } catch (err) {
    console.warn('Error checking BOQ target cluster:', err);
    return { exists: false };
  }
}

export async function commitBoqImport(data: {
  clusterName: string;
  clusterId?: string;
  subfeederId?: string;
  emrSiteCode?: string;
  oltName?: string;
  scope?: BoqImportScope;
  homePasses?: number;
  items: ParsedBoqItem[];
  conflictMode?: 'OVERWRITE' | 'CREATE_NEW_ONLY';
}) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !currentUser.permissions.importBoq) {
      return { success: false, error: 'Akses ditolak: Anda tidak memiliki izin menyimpan Impor BOQ.' };
    }

    await ensureDatabaseRestoredFromNextcloud();

    let project = await prisma.project.findFirst({
      where: { code: 'BLA-KEDUNGTUBAN' },
    });

    if (!project) {
      project = await prisma.project.create({
        data: {
          code: 'BLA-KEDUNGTUBAN',
          name: 'GCI',
        },
      });
    }

    const scope: BoqImportScope =
      data.scope || (data.clusterName.toUpperCase().includes('SF') ? 'SUBFEEDER' : 'CLUSTER');
    const isMainFeeder = scope === 'MAIN_FEEDER';
    const cleanedName = isMainFeeder
      ? data.clusterName.trim().toUpperCase()
      : cleanClusterName(data.clusterName);

    const inputClusterId = (data.clusterId || '').trim().toUpperCase();
    const inputSubfeederId = (data.subfeederId || '').trim().toUpperCase();
    const inputEmrCode = (data.emrSiteCode || '').trim().toUpperCase();
    const inputOltName = (data.oltName || '').trim();

    const matchedSite = isMainFeeder
      ? undefined
      : sitelistData.sites.find(
          (s) =>
            (inputClusterId && s.clusterId.toLowerCase() === inputClusterId.toLowerCase()) ||
            (inputSubfeederId && s.subfeederId.toLowerCase() === inputSubfeederId.toLowerCase()) ||
            (inputEmrCode && s.emrSiteCode.toLowerCase() === inputEmrCode.toLowerCase()) ||
            s.shortName.toLowerCase() === cleanedName.toLowerCase() ||
            s.clusterName.toLowerCase() === data.clusterName.trim().toLowerCase()
        );

    const lookupOr: Array<{ name?: string; code?: string; subfeederId?: string }> = [
      { name: cleanedName },
      { name: data.clusterName.trim() },
      { name: data.clusterName.trim().toUpperCase() },
    ];
    if (inputClusterId) lookupOr.push({ code: inputClusterId });
    if (scope === 'SUBFEEDER' && inputSubfeederId) lookupOr.push({ subfeederId: inputSubfeederId });

    let cluster = await prisma.cluster.findFirst({
      where: {
        projectId: project.id,
        OR: lookupOr,
      },
    });

    const targetKota = cluster?.kabupaten || matchedSite?.kabupaten || 'Blora';
    if (!canAccessCity(currentUser, targetKota)) {
      return {
        success: false,
        error: `Akses ditolak: Anda tidak memiliki izin untuk Kota "${targetKota}".`,
      };
    }

    if (cluster && data.conflictMode === 'CREATE_NEW_ONLY') {
      return {
        success: false,
        error: `Data dengan nama "${cluster.name}" (${cluster.code || '-'}) sudah ada di database. Ubah "Nama Cluster Target" agar tidak menimpa data yang sudah ada, atau centang konfirmasi timpa BOQ.`,
      };
    }

    const resolvedCode = isMainFeeder
      ? inputClusterId || `MF-${cleanedName.slice(0, 24)}`
      : inputClusterId || matchedSite?.clusterId || `CLRM07-99-${cleanedName}`;
    const resolvedSubfeederId = isMainFeeder
      ? inputClusterId || cleanedName
      : inputSubfeederId || matchedSite?.subfeederId || undefined;
    const resolvedOltName = inputOltName || matchedSite?.oltName || 'OLT Kedungtuban';

    if (!cluster) {
      cluster = await prisma.cluster.create({
        data: {
          projectId: project.id,
          name: cleanedName,
          code: resolvedCode,
          emrSiteCode: inputEmrCode || matchedSite?.emrSiteCode || undefined,
          subfeederId: resolvedSubfeederId,
          clusterName: isMainFeeder
            ? cleanedName
            : matchedSite?.clusterName || cleanedName,
          oltName: resolvedOltName,
          kecamatan: matchedSite?.kecamatan || 'Kedungtuban',
          kabupaten: matchedSite?.kabupaten || 'Blora',
          projectType: isMainFeeder ? 'MAIN_FEEDER' : 'CLUSTER_SF',
          homePasses: data.homePasses || 0,
        },
      });
    } else {
      const updateData: {
        homePasses?: number;
        projectType?: string;
        code?: string;
        subfeederId?: string;
        oltName?: string;
        emrSiteCode?: string;
      } = {};
      if (data.homePasses && data.homePasses > 0) {
        updateData.homePasses = data.homePasses;
      }
      if (isMainFeeder && cluster.projectType !== 'MAIN_FEEDER') {
        updateData.projectType = 'MAIN_FEEDER';
      }
      if ((scope === 'CLUSTER' || isMainFeeder) && inputClusterId) {
        updateData.code = inputClusterId;
      }
      if (scope === 'SUBFEEDER' && inputSubfeederId) {
        updateData.subfeederId = inputSubfeederId;
      } else if (isMainFeeder && inputClusterId) {
        updateData.subfeederId = inputClusterId;
      } else if (inputSubfeederId && !cluster.subfeederId) {
        updateData.subfeederId = inputSubfeederId;
      }
      if (inputOltName) {
        updateData.oltName = inputOltName;
      }
      if (inputEmrCode && !cluster.emrSiteCode) {
        updateData.emrSiteCode = inputEmrCode;
      }
      if (Object.keys(updateData).length > 0) {
        await prisma.cluster.update({
          where: { id: cluster.id },
          data: updateData,
        });
      }
    }

    // Aggregate items that map to the same BOQ target name (e.g. JC 48c + JC 144c -> Joint Closure (JC))
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
    const savedNamesForCurrentScope = new Set(
      itemsToSave
        .filter((i) => {
          const itemScope: BoqImportScope = isMainFeeder
            ? 'MAIN_FEEDER'
            : isSubfeederOnlyBoqItem(i.boqName)
            ? 'SUBFEEDER'
            : scope;
          return itemScope === scope;
        })
        .map((i) => i.boqName.toLowerCase())
    );

    // Remove legacy/unmapped or 0-progress placeholder items in this cluster+scope that are not in the new BOQ import
    const legacySfTargetMap: Record<string, string> = {
      'tiang feeder (pole sf)': 'Pole 7m "4"',
      'kabel feeder (cable sf)': 'Kabel 48c',
    };

    const existingWorkItems = await prisma.workItem.findMany({
      where: isMainFeeder
        ? { clusterId: cluster.id }
        : { clusterId: cluster.id, scope },
      include: {
        progressList: true,
      },
    });

    for (const oldItem of existingWorkItems) {
      const oldLower = oldItem.itemName.trim().toLowerCase();
      const legacyTargetName =
        scope === 'SUBFEEDER' || scope === 'MAIN_FEEDER' ? legacySfTargetMap[oldLower] : undefined;
      if (legacyTargetName) {
        const targetItemDef = itemsToSave.find(
          (it) => it.boqName.trim().toLowerCase() === legacyTargetName.toLowerCase()
        );
        if (targetItemDef) {
          const targetLegacyScope: BoqImportScope = isMainFeeder ? 'MAIN_FEEDER' : 'SUBFEEDER';
          const { workType, subCategory, weight } = getWorkItemWeightAndType(
            targetItemDef.category,
            targetLegacyScope
          );
          const targetWorkItem = await prisma.workItem.upsert({
            where: {
              clusterId_scope_itemName: {
                clusterId: cluster.id,
                scope: targetLegacyScope,
                itemName: targetItemDef.boqName,
              },
            },
            update: {},
            create: {
              clusterId: cluster.id,
              scope: targetLegacyScope,
              workType,
              category: targetItemDef.category,
              subCategory,
              weight,
              itemName: targetItemDef.boqName,
              unit: targetItemDef.unit,
              boq: targetItemDef.quantity,
              sortOrder: getCanonicalWorkItemSortOrder({
                scope: targetLegacyScope,
                category: targetItemDef.category,
                subCategory,
                itemName: targetItemDef.boqName,
              }),
            },
          });

          for (const prog of oldItem.progressList) {
            const existingTargetProg = await prisma.dailyProgressItem.findUnique({
              where: {
                dailyReportId_workItemId: {
                  dailyReportId: prog.dailyReportId,
                  workItemId: targetWorkItem.id,
                },
              },
            });
            if (existingTargetProg) {
              await prisma.dailyProgressItem.update({
                where: { id: existingTargetProg.id },
                data: { quantity: existingTargetProg.quantity + prog.quantity },
              });
              await prisma.dailyProgressItem.delete({ where: { id: prog.id } });
            } else {
              await prisma.dailyProgressItem.update({
                where: { id: prog.id },
                data: { workItemId: targetWorkItem.id },
              });
            }
          }

          await prisma.workItem.delete({ where: { id: oldItem.id } });
          continue;
        }
      }

      const shouldNotExistInMainFeeder = isMainFeeder && oldItem.scope !== 'MAIN_FEEDER';
      const shouldNotExistInCluster = scope === 'CLUSTER' && isSubfeederOnlyBoqItem(oldItem.itemName);
      // Replace penuh: hapus semua item pada scope target yang tidak ada di BOQ baru
      // (termasuk item lama yang sebelumnya salah masuk atau sudah tidak dipakai di BOQ baru)
      if (
        !savedNamesForCurrentScope.has(oldLower) ||
        shouldNotExistInCluster ||
        shouldNotExistInMainFeeder
      ) {
        await prisma.workItem.delete({ where: { id: oldItem.id } });
      }
    }

    for (const it of itemsToSave) {
      const targetScope: BoqImportScope = isMainFeeder
        ? 'MAIN_FEEDER'
        : isSubfeederOnlyBoqItem(it.boqName)
        ? 'SUBFEEDER'
        : scope;
      const { workType, subCategory, weight } = getWorkItemWeightAndType(it.category, targetScope);
      const sortOrder = getCanonicalWorkItemSortOrder({
        scope: targetScope,
        category: it.category,
        subCategory,
        itemName: it.boqName,
      });

      await prisma.workItem.upsert({
        where: {
          clusterId_scope_itemName: {
            clusterId: cluster.id,
            scope: targetScope,
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
          sortOrder,
        },
        create: {
          clusterId: cluster.id,
          scope: targetScope,
          workType,
          category: it.category,
          subCategory,
          weight,
          itemName: it.boqName,
          unit: it.unit,
          boq: it.quantity,
          sortOrder,
        },
      });
    }

    await backupDatabaseToNextcloud();

    revalidatePath('/');
    revalidatePath('/matrix');
    revalidatePath('/clusters');
    revalidatePath('/daily-input');
    revalidatePath('/sitelist');

    const scopeLabel =
      scope === 'MAIN_FEEDER'
        ? 'Main Feeder 100% - BoQ NRO All Feeder'
        : scope === 'SUBFEEDER'
        ? 'Subfeeder 30% - BoQ NRO All Feeder'
        : 'Cluster 70% - BoQ NRO Cluster';

    return {
      success: true,
      message: `Berhasil mengimpor BOQ (${scopeLabel}) untuk "${cluster.name}" dengan ${itemsToSave.length} item BOQ standar!`,
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
