export interface WorkItemCalculationInput {
  id: string;
  scope?: string | null;      // 'CLUSTER' | 'SUBFEEDER'
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
  scope: 'CLUSTER' | 'SUBFEEDER';
  label: string;
  overallWeight: number;    // 70 untuk CLR, 30 untuk SF
  cwPercentage: number;     // 0 - 100%
  elPercentage: number;     // 0 - 100%
  scopePercentage: number;  // 0 - 100%
  totalContribution: number;// scopePercentage * overallWeight / 100
  subCategories: Record<string, SubCategoryProgress>;
}

export interface ClusterProgressSummary {
  clusterId?: string;
  clusterName?: string;
  clr: ScopeProgressBreakdown;
  sf: ScopeProgressBreakdown;
  totalWeightedPercentage: number; // 0 - 100% (CLR * 0.7 + SF * 0.3)
}

/**
 * Normalisasi subCategory dan workType jika belum diset di database
 */
export function normalizeItemClassification(item: WorkItemCalculationInput): {
  scope: 'CLUSTER' | 'SUBFEEDER';
  workType: 'CW' | 'EL';
  subCategory: 'POLE' | 'CABLE' | 'ACC' | 'FAT' | 'FDT' | 'JC' | 'OTHER';
} {
  const scope: 'CLUSTER' | 'SUBFEEDER' =
    item.scope === 'SUBFEEDER' ||
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
  } else if (sub === 'ACC' || cat === 'ACCESSORY' || name.includes('acc') || name.includes('perapihan') || name.includes('clamp') || name.includes('fixture') || name.includes('hanger')) {
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
export function calculateClusterProgress(items: WorkItemCalculationInput[]): ClusterProgressSummary {
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
    if (scope === 'SUBFEEDER') {
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
    let allDone = true;

    for (const it of itemList) {
      totalBoq += it.boq;
      const isDone = it.status === 'DONE';
      if (!isDone) allDone = false;
      const effectiveInstalled = isDone ? Math.max(it.installed, it.boq > 0 ? it.boq : it.installed) : it.installed;
      totalInstalled += effectiveInstalled;
    }

    let percentage = 0;
    if (allDone && itemList.length > 0) {
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

  // Total bobot tertimbang (CLR 70% + SF 30%)
  const totalWeightedPercentage = Math.min(100, Math.round(clrTotalContribution + sfTotalContribution));

  return {
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

