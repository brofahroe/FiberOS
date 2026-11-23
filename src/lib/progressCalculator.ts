export type ProjectType = 'CLUSTER_SF' | 'MAIN_FEEDER';

export interface WorkItemCalculationInput {
  id: string;
  scope?: string | null;      // 'CLUSTER' | 'SUBFEEDER' | 'MAIN_FEEDER'
  workType?: string | null;   // 'CW' | 'EL'
  category?: string | null;   // 'POLE', 'CABLE', 'FAT', 'FDT', 'ACCESSORY', 'JC', 'OTHER'
  subCategory?: string | null;// 'POLE', 'CABLE', 'ACC', 'FAT', 'FDT', 'JC'
  itemName: string;
  boq: number;
  installed: number;
  status: string;             // 'DONE' | 'ONGOING' | 'HOLD'
}

export interface SubCategoryProgress {
  subCategory: string;
  label: string;
  weight: number;           // Persentase bobot terhadap scope (misal 40 untuk Pole di CLR)
  totalBoq: number;
  totalInstalled: number;
  percentage: number;       // 0 - 100%
  weightedContribution: number; // percentage * weight / 100
  itemCount: number;
  isDone: boolean;
}

export interface ScopeProgressBreakdown {
  scope: 'CLUSTER' | 'SUBFEEDER' | 'MAIN_FEEDER';
  label: string;
  overallWeight: number;    // 70 untuk CLR, 30 untuk SF, 100 untuk MAIN_FEEDER
  cwPercentage: number;     // 0 - 100%
  elPercentage: number;     // 0 - 100%
  scopePercentage: number;  // 0 - 100%
  totalContribution: number;// scopePercentage * overallWeight / 100
  subCategories: Record<string, SubCategoryProgress>;
}

export interface ClusterProgressSummary {
  clusterId?: string;
  clusterName?: string;
  projectType: ProjectType;
  clr: ScopeProgressBreakdown;
  sf: ScopeProgressBreakdown;
  totalWeightedPercentage: number; // 0 - 100% (CLR * 0.7 + SF * 0.3, or 100% MF)
}

const SUBFEEDER_ONLY_ITEM_NAMES = new Set(['kabel 96c', 'kabel 144c', 'kabel 288c']);

export function isSubfeederOnlyBoqItem(itemName: string): boolean {
  return SUBFEEDER_ONLY_ITEM_NAMES.has((itemName || '').trim().toLowerCase());
}

/**
 * Normalisasi subCategory dan workType jika belum diset di database
 */
export function normalizeItemClassification(item: WorkItemCalculationInput): {
  scope: 'CLUSTER' | 'SUBFEEDER' | 'MAIN_FEEDER';
  workType: 'CW' | 'EL';
  subCategory: 'POLE' | 'CABLE' | 'ACC' | 'FAT' | 'FDT' | 'JC' | 'OTHER';
} {
  const scope: 'CLUSTER' | 'SUBFEEDER' | 'MAIN_FEEDER' =
    item.scope === 'MAIN_FEEDER'
      ? 'MAIN_FEEDER'
      : item.scope === 'SUBFEEDER' ||
        isSubfeederOnlyBoqItem(item.itemName || '') ||
        (item.itemName && item.itemName.toLowerCase().includes('feeder')) ||
        (item.itemName && item.itemName.toLowerCase().includes('sf-'))
      ? 'SUBFEEDER'
      : 'CLUSTER';

  const name = (item.itemName || '').toLowerCase();
  const cat = (item.category || '').toUpperCase();
  const sub = (item.subCategory || '').toUpperCase();

  let subCategory: 'POLE' | 'CABLE' | 'ACC' | 'FAT' | 'FDT' | 'JC' | 'OTHER' = 'OTHER';

  if (sub === 'POLE' || cat === 'POLE' || name.includes('pole') || name.includes('tiang')) {
    subCategory = 'POLE';
  } else if (sub === 'CABLE' || cat === 'CABLE' || name.includes('kabel') || name.includes('cable') || name.includes('fo type') || name.includes('fo core')) {
    subCategory = 'CABLE';
  } else if (sub === 'FAT' || cat === 'FAT' || name.includes('fat') || name.includes('terminal box')) {
    subCategory = 'FAT';
  } else if (sub === 'FDT' || cat === 'FDT' || name.includes('fdt')) {
    subCategory = 'FDT';
  } else if (sub === 'JC' || cat === 'JC' || name.includes('joint closure') || name.includes('closure') || name.includes('jc')) {
    subCategory = 'JC';
  } else if (
    sub === 'ACC' ||
    cat === 'ACCESSORY' ||
    cat === 'SELING' ||
    name.includes('seling') ||
    name.includes('sling') ||
    name.includes('strand wire') ||
    name.includes('acc') ||
    name.includes('perapihan') ||
    name.includes('clamp') ||
    name.includes('fixture') ||
    name.includes('hanger')
  ) {
    subCategory = 'ACC';
  }

  const workType: 'CW' | 'EL' =
    subCategory === 'FAT' || subCategory === 'FDT' || subCategory === 'JC' ? 'EL' : 'CW';

  return { scope, workType, subCategory };
}

/**
 * Hitung weighted progress cluster berdasarkan proporsi resmi:
 * CLR (70%):
 *   CW (70%): Pole 40%, Cable 20%, Acc 10%
 *   EL (30%): FAT 25%, FDT 5%
 * SF (30%):
 *   CW (80%): Pole 50%, Cable 20%, Acc 10%
 *   EL (20%): JC 20%
 */
export function calculateClusterProgress(
  items: WorkItemCalculationInput[],
  options?: { projectType?: string | null }
): ClusterProgressSummary {
  const isMainFeeder =
    options?.projectType === 'MAIN_FEEDER' ||
    (items.length > 0 && items.every((it) => it.scope === 'MAIN_FEEDER'));

  // Pengelompokan item
  const clrItems: Record<string, WorkItemCalculationInput[]> = {
    POLE: [],
    CABLE: [],
    ACC: [],
    FAT: [],
    FDT: [],
  };

  const sfItems: Record<string, WorkItemCalculationInput[]> = {
    POLE: [],
    CABLE: [],
    ACC: [],
    JC: [],
  };

  for (const item of items) {
    const { scope, subCategory } = normalizeItemClassification(item);
    if (isMainFeeder || scope === 'MAIN_FEEDER' || scope === 'SUBFEEDER') {
      if (sfItems[subCategory]) {
        sfItems[subCategory].push(item);
      }
    } else {
      if (clrItems[subCategory]) {
        clrItems[subCategory].push(item);
      }
    }
  }

  const calcSubCategory = (
    itemList: WorkItemCalculationInput[],
    subCatKey: string,
    label: string,
    weight: number
  ): SubCategoryProgress => {
    if (!itemList || itemList.length === 0) {
      return {
        subCategory: subCatKey,
        label,
        weight,
        totalBoq: 0,
        totalInstalled: 0,
        percentage: 0,
        weightedContribution: 0,
        itemCount: 0,
        isDone: false,
      };
    }

    let totalBoq = 0;
    let totalInstalled = 0;
    let activeCount = 0;
    let doneCount = 0;

    for (const it of itemList) {
      totalBoq += it.boq;
      const isDone = it.status === 'DONE';
      const effectiveInstalled = isDone ? Math.max(it.installed, it.boq > 0 ? it.boq : it.installed) : it.installed;
      totalInstalled += effectiveInstalled;

      // Item dihitung aktif jika memiliki BOQ > 0, ada progres terpasang, atau sudah ditandai DONE
      if (it.boq > 0 || it.installed > 0 || isDone) {
        activeCount++;
        if (isDone || (it.boq > 0 && it.installed >= it.boq)) {
          doneCount++;
        }
      }
    }

    const allDone = activeCount > 0 && doneCount >= activeCount;

    let percentage = 0;
    if (allDone) {
      percentage = 100;
    } else if (totalBoq > 0) {
      percentage = Math.min(100, Math.round((totalInstalled / totalBoq) * 100));
    } else if (totalInstalled > 0) {
      percentage = 100;
    }

    const weightedContribution = Math.round((percentage * weight) / 100 * 10) / 10;

    return {
      subCategory: subCatKey,
      label,
      weight,
      totalBoq,
      totalInstalled,
      percentage,
      weightedContribution,
      itemCount: itemList.length,
      isDone: allDone || percentage >= 100,
    };
  };

  // CLR Sub-Categories
  const clrPole = calcSubCategory(clrItems.POLE, 'POLE', 'Tiang (Poles)', 40);
  const clrCable = calcSubCategory(clrItems.CABLE, 'CABLE', 'Penarikan Kabel', 20);
  const clrAcc = calcSubCategory(clrItems.ACC, 'ACC', 'Aksesoris & Perapihan', 10);
  const clrFat = calcSubCategory(clrItems.FAT, 'FAT', 'Terminasi FAT', 25);
  const clrFdt = calcSubCategory(clrItems.FDT, 'FDT', 'Terminasi FDT', 5);

  const clrCwContribution = clrPole.weightedContribution + clrCable.weightedContribution + clrAcc.weightedContribution; // maks 70
  const clrElContribution = clrFat.weightedContribution + clrFdt.weightedContribution; // maks 30
  const clrScopePercentage = Math.min(100, Math.round(clrCwContribution + clrElContribution));
  const clrTotalContribution = Math.round(clrScopePercentage * 0.70 * 10) / 10; // maks 70% thdp total

  const clrCwPercentage = Math.min(100, Math.round((clrCwContribution / 70) * 100));
  const clrElPercentage = Math.min(100, Math.round((clrElContribution / 30) * 100));

  // SF Sub-Categories
  const sfPole = calcSubCategory(sfItems.POLE, 'POLE', 'Tiang Feeder (Poles SF)', 50);
  const sfCable = calcSubCategory(sfItems.CABLE, 'CABLE', 'Kabel Feeder', 20);
  const sfAcc = calcSubCategory(sfItems.ACC, 'ACC', 'Aksesoris & Perapihan SF', 10);
  const sfJc = calcSubCategory(sfItems.JC, 'JC', 'Joint Closure (JC)', 20);

  const sfCwContribution = sfPole.weightedContribution + sfCable.weightedContribution + sfAcc.weightedContribution; // maks 80
  const sfElContribution = sfJc.weightedContribution; // maks 20
  const sfScopePercentage = Math.min(100, Math.round(sfCwContribution + sfElContribution));
  const sfTotalContribution = Math.round(sfScopePercentage * 0.30 * 10) / 10; // maks 30% thdp total

  const sfCwPercentage = Math.min(100, Math.round((sfCwContribution / 80) * 100));
  const sfElPercentage = Math.min(100, Math.round((sfElContribution / 20) * 100));

  // Total bobot tertimbang: Main Feeder = 100% Feeder tanpa Cluster; Standar = CLR 70% + SF 30%
  if (isMainFeeder) {
    const mfCategories = [sfPole, sfCable, sfAcc, sfJc];
    const activeMfCats = mfCategories.filter((c) => c.itemCount > 0);
    const totalApplicableWeight = activeMfCats.reduce((sum, c) => sum + c.weight, 0);
    const weightedPctSum = activeMfCats.reduce((sum, c) => sum + c.percentage * c.weight, 0);
    const mfScopePercentage =
      totalApplicableWeight > 0
        ? Math.min(100, Math.round(weightedPctSum / totalApplicableWeight))
        : 0;

    const mfCwCats = [sfPole, sfCable, sfAcc].filter((c) => c.itemCount > 0);
    const mfCwWeight = mfCwCats.reduce((sum, c) => sum + c.weight, 0);
    const mfCwPct =
      mfCwWeight > 0
        ? Math.min(
            100,
            Math.round(mfCwCats.reduce((sum, c) => sum + c.percentage * c.weight, 0) / mfCwWeight)
          )
        : 0;

    return {
      projectType: 'MAIN_FEEDER',
      clr: {
        scope: 'CLUSTER',
        label: 'Cluster / Distribusi (Tidak Ada)',
        overallWeight: 0,
        cwPercentage: 0,
        elPercentage: 0,
        scopePercentage: 0,
        totalContribution: 0,
        subCategories: {
          POLE: clrPole,
          CABLE: clrCable,
          ACC: clrAcc,
          FAT: clrFat,
          FDT: clrFdt,
        },
      },
      sf: {
        scope: 'MAIN_FEEDER',
        label: 'Main Feeder (100%)',
        overallWeight: 100,
        cwPercentage: mfCwPct,
        elPercentage: sfJc.percentage,
        scopePercentage: mfScopePercentage,
        totalContribution: mfScopePercentage,
        subCategories: {
          POLE: sfPole,
          CABLE: sfCable,
          ACC: sfAcc,
          JC: sfJc,
        },
      },
      totalWeightedPercentage: mfScopePercentage,
    };
  }

  const totalWeightedPercentage = Math.min(100, Math.round(clrTotalContribution + sfTotalContribution));

  return {
    projectType: 'CLUSTER_SF',
    clr: {
      scope: 'CLUSTER',
      label: 'Cluster / Distribusi (70%)',
      overallWeight: 70,
      cwPercentage: clrCwPercentage,
      elPercentage: clrElPercentage,
      scopePercentage: clrScopePercentage,
      totalContribution: clrTotalContribution,
      subCategories: {
        POLE: clrPole,
        CABLE: clrCable,
        ACC: clrAcc,
        FAT: clrFat,
        FDT: clrFdt,
      },
    },
    sf: {
      scope: 'SUBFEEDER',
      label: 'Subfeeder / Feeder (30%)',
      overallWeight: 30,
      cwPercentage: sfCwPercentage,
      elPercentage: sfElPercentage,
      scopePercentage: sfScopePercentage,
      totalContribution: sfTotalContribution,
      subCategories: {
        POLE: sfPole,
        CABLE: sfCable,
        ACC: sfAcc,
        JC: sfJc,
      },
    },
    totalWeightedPercentage,
  };
}

/**
 * Daftar item BOQ standar mengacu pada BOQ-list.xlsx
 */
export const DEFAULT_BOQ_WORK_ITEMS = [
  { scope: 'CLUSTER', workType: 'CW', category: 'POLE', subCategory: 'POLE', weight: 40, itemName: 'Pole 7m "2.5"', unit: 'Btg', sortOrder: 1 },
  { scope: 'CLUSTER', workType: 'CW', category: 'POLE', subCategory: 'POLE', weight: 40, itemName: 'Pole 7m "3"', unit: 'Btg', sortOrder: 2 },
  { scope: 'CLUSTER', workType: 'CW', category: 'POLE', subCategory: 'POLE', weight: 40, itemName: 'Pole 7m "4"', unit: 'Btg', sortOrder: 3 },
  { scope: 'CLUSTER', workType: 'CW', category: 'POLE', subCategory: 'POLE', weight: 40, itemName: 'Pole 9m "4"', unit: 'Btg', sortOrder: 4 },
  { scope: 'CLUSTER', workType: 'CW', category: 'CABLE', subCategory: 'CABLE', weight: 20, itemName: 'Kabel 24c', unit: 'Meter', sortOrder: 1024 },
  { scope: 'CLUSTER', workType: 'CW', category: 'CABLE', subCategory: 'CABLE', weight: 20, itemName: 'Kabel 36c', unit: 'Meter', sortOrder: 1036 },
  { scope: 'CLUSTER', workType: 'CW', category: 'CABLE', subCategory: 'CABLE', weight: 20, itemName: 'Kabel 48c', unit: 'Meter', sortOrder: 1048 },
  { scope: 'CLUSTER', workType: 'EL', category: 'FAT', subCategory: 'FAT', weight: 25, itemName: 'FAT', unit: 'Pcs', sortOrder: 2001 },
  { scope: 'CLUSTER', workType: 'EL', category: 'FDT', subCategory: 'FDT', weight: 5, itemName: 'FDT48', unit: 'Pcs', sortOrder: 3048 },
  { scope: 'CLUSTER', workType: 'EL', category: 'FDT', subCategory: 'FDT', weight: 5, itemName: 'FDT72', unit: 'Pcs', sortOrder: 3072 },
  { scope: 'CLUSTER', workType: 'CW', category: 'SELING', subCategory: 'ACC', weight: 10, itemName: 'Seling', unit: 'Meter', sortOrder: 5001 },
  { scope: 'SUBFEEDER', workType: 'CW', category: 'POLE', subCategory: 'POLE', weight: 50, itemName: 'Pole 7m "4"', unit: 'Btg', sortOrder: 10003 },
  { scope: 'SUBFEEDER', workType: 'CW', category: 'CABLE', subCategory: 'CABLE', weight: 20, itemName: 'Kabel 48c', unit: 'Meter', sortOrder: 11048 },
  { scope: 'SUBFEEDER', workType: 'CW', category: 'CABLE', subCategory: 'CABLE', weight: 20, itemName: 'Kabel 96c', unit: 'Meter', sortOrder: 11096 },
  { scope: 'SUBFEEDER', workType: 'CW', category: 'CABLE', subCategory: 'CABLE', weight: 20, itemName: 'Kabel 144c', unit: 'Meter', sortOrder: 11144 },
  { scope: 'SUBFEEDER', workType: 'CW', category: 'CABLE', subCategory: 'CABLE', weight: 20, itemName: 'Kabel 288c', unit: 'Meter', sortOrder: 11288 },
  { scope: 'SUBFEEDER', workType: 'EL', category: 'JC', subCategory: 'JC', weight: 20, itemName: 'Joint Closure (JC)', unit: 'Pcs', sortOrder: 14001 },
] as const;

export const DEFAULT_MAIN_FEEDER_WORK_ITEMS = [
  { scope: 'MAIN_FEEDER', workType: 'CW', category: 'POLE', subCategory: 'POLE', weight: 50, itemName: 'Pole 7m "4"', unit: 'Btg', sortOrder: 20003 },
  { scope: 'MAIN_FEEDER', workType: 'CW', category: 'POLE', subCategory: 'POLE', weight: 50, itemName: 'Pole 9m "4"', unit: 'Btg', sortOrder: 20004 },
  { scope: 'MAIN_FEEDER', workType: 'CW', category: 'CABLE', subCategory: 'CABLE', weight: 20, itemName: 'Kabel 48c', unit: 'Meter', sortOrder: 21048 },
  { scope: 'MAIN_FEEDER', workType: 'CW', category: 'CABLE', subCategory: 'CABLE', weight: 20, itemName: 'Kabel 96c', unit: 'Meter', sortOrder: 21096 },
  { scope: 'MAIN_FEEDER', workType: 'CW', category: 'CABLE', subCategory: 'CABLE', weight: 20, itemName: 'Kabel 144c', unit: 'Meter', sortOrder: 21144 },
  { scope: 'MAIN_FEEDER', workType: 'CW', category: 'CABLE', subCategory: 'CABLE', weight: 20, itemName: 'Kabel 288c', unit: 'Meter', sortOrder: 21288 },
  { scope: 'MAIN_FEEDER', workType: 'EL', category: 'JC', subCategory: 'JC', weight: 20, itemName: 'Joint Closure (JC)', unit: 'Pcs', sortOrder: 24001 },
] as const;

export interface WorkItemSortInput {
  scope?: string | null;
  category?: string | null;
  subCategory?: string | null;
  itemName: string;
}

function getCategoryOrderRank(item: WorkItemSortInput): number {
  const { subCategory } = normalizeItemClassification({
    id: '',
    scope: item.scope,
    category: item.category,
    subCategory: item.subCategory,
    itemName: item.itemName,
    boq: 0,
    installed: 0,
    status: 'ONGOING',
  });

  switch (subCategory) {
    case 'POLE':
      return 0;
    case 'CABLE':
      return 1;
    case 'FAT':
      return 2;
    case 'FDT':
      return 3;
    case 'JC':
      return 4;
    default:
      return 5;
  }
}

function getWithinCategoryRank(catRank: number, itemName: string): number {
  const lower = (itemName || '').trim().toLowerCase();

  if (catRank === 0) {
    if (lower.includes('7m') && lower.includes('2.5')) return 1;
    if (lower.includes('7m') && lower.includes('3')) return 2;
    if (lower.includes('7m') && lower.includes('4')) return 3;
    if (lower.includes('9m') && lower.includes('4')) return 4;
    return 50;
  }

  if (catRank === 1) {
    const coreMatch = lower.match(/(\d+)\s*c\b/);
    if (coreMatch) return parseInt(coreMatch[1], 10);
    return 500;
  }

  if (catRank === 3) {
    if (lower === 'fdt') return 1;
    const fdtMatch = lower.match(/(\d+)/);
    if (fdtMatch) return parseInt(fdtMatch[1], 10);
    return 900;
  }

  if (catRank === 5) {
    if (lower === 'seling') return 1;
    return 50;
  }

  return 1;
}

/**
 * Menghasilkan urutan canonical: Scope (CLR -> SF), lalu Pole -> Kabel -> FAT -> FDT -> JC -> Seling/Lainnya.
 */
export function getCanonicalWorkItemSortOrder(item: WorkItemSortInput): number {
  const scopeRank =
    item.scope === 'MAIN_FEEDER'
      ? 2
      : item.scope === 'SUBFEEDER' || isSubfeederOnlyBoqItem(item.itemName || '')
      ? 1
      : 0;
  const catRank = getCategoryOrderRank(item);
  const withinRank = getWithinCategoryRank(catRank, item.itemName);
  return scopeRank * 10000 + catRank * 1000 + withinRank;
}

export function sortWorkItems<T extends WorkItemSortInput>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const diff = getCanonicalWorkItemSortOrder(a) - getCanonicalWorkItemSortOrder(b);
    if (diff !== 0) return diff;
    return (a.itemName || '').localeCompare(b.itemName || '');
  });
}


