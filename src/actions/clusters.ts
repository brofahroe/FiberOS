'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import {
  getCanonicalWorkItemSortOrder,
  isSubfeederOnlyBoqItem,
  normalizeItemClassification,
} from '@/lib/progressCalculator';
import { backupDatabaseToNextcloud } from '@/lib/dbSync';

export type WorkItemScope = 'CLUSTER' | 'SUBFEEDER' | 'MAIN_FEEDER';

interface StandardBoqCatalogDef {
  itemName: string;
  category: string;
  subCategory: 'POLE' | 'CABLE' | 'ACC' | 'FAT' | 'FDT' | 'JC';
  workType: 'CW' | 'EL';
  unit: string;
}

const STANDARD_BOQ_CATALOG: StandardBoqCatalogDef[] = [
  { itemName: 'Pole 7m "2.5"', category: 'POLE', subCategory: 'POLE', workType: 'CW', unit: 'Btg' },
  { itemName: 'Pole 7m "3"', category: 'POLE', subCategory: 'POLE', workType: 'CW', unit: 'Btg' },
  { itemName: 'Pole 7m "4"', category: 'POLE', subCategory: 'POLE', workType: 'CW', unit: 'Btg' },
  { itemName: 'Pole 9m "4"', category: 'POLE', subCategory: 'POLE', workType: 'CW', unit: 'Btg' },
  { itemName: 'Kabel 24c', category: 'CABLE', subCategory: 'CABLE', workType: 'CW', unit: 'Meter' },
  { itemName: 'Kabel 36c', category: 'CABLE', subCategory: 'CABLE', workType: 'CW', unit: 'Meter' },
  { itemName: 'Kabel 48c', category: 'CABLE', subCategory: 'CABLE', workType: 'CW', unit: 'Meter' },
  { itemName: 'Kabel 96c', category: 'CABLE', subCategory: 'CABLE', workType: 'CW', unit: 'Meter' },
  { itemName: 'Kabel 144c', category: 'CABLE', subCategory: 'CABLE', workType: 'CW', unit: 'Meter' },
  { itemName: 'Kabel 288c', category: 'CABLE', subCategory: 'CABLE', workType: 'CW', unit: 'Meter' },
  { itemName: 'FAT', category: 'FAT', subCategory: 'FAT', workType: 'EL', unit: 'Pcs' },
  { itemName: 'FDT48', category: 'FDT', subCategory: 'FDT', workType: 'EL', unit: 'Pcs' },
  { itemName: 'FDT72', category: 'FDT', subCategory: 'FDT', workType: 'EL', unit: 'Pcs' },
  { itemName: 'FDT', category: 'FDT', subCategory: 'FDT', workType: 'EL', unit: 'Pcs' },
  { itemName: 'Joint Closure (JC)', category: 'JC', subCategory: 'JC', workType: 'EL', unit: 'Pcs' },
  { itemName: 'Seling', category: 'SELING', subCategory: 'ACC', workType: 'CW', unit: 'Meter' },
];

function resolveWorkItemMetadata(params: {
  rawItemName: string;
  requestedScope: WorkItemScope;
  clusterProjectType?: string | null;
  fallbackCategory?: string | null;
  fallbackUnit?: string | null;
}) {
  const trimmedName = params.rawItemName.trim();
  const catalogMatch = STANDARD_BOQ_CATALOG.find(
    (entry) => entry.itemName.toLowerCase() === trimmedName.toLowerCase()
  );

  const canonicalName = catalogMatch ? catalogMatch.itemName : trimmedName;
  let effectiveScope: WorkItemScope = params.requestedScope;
  if (params.clusterProjectType === 'MAIN_FEEDER') {
    effectiveScope = 'MAIN_FEEDER';
  } else if (effectiveScope === 'CLUSTER' && isSubfeederOnlyBoqItem(canonicalName)) {
    effectiveScope = 'SUBFEEDER';
  }

  let category = catalogMatch?.category || (params.fallbackCategory || 'OTHER').toUpperCase();
  let subCategory = catalogMatch?.subCategory;
  let workType = catalogMatch?.workType;
  let unit = catalogMatch?.unit || params.fallbackUnit || 'Pcs';

  if (!catalogMatch) {
    const normalized = normalizeItemClassification({
      id: '',
      scope: effectiveScope,
      category: params.fallbackCategory,
      subCategory: undefined,
      itemName: canonicalName,
      boq: 0,
      installed: 0,
      status: 'ONGOING',
    });
    workType = normalized.workType;
    if (normalized.subCategory === 'POLE') {
      category = 'POLE';
      subCategory = 'POLE';
      unit = 'Btg';
    } else if (normalized.subCategory === 'CABLE') {
      category = 'CABLE';
      subCategory = 'CABLE';
      unit = 'Meter';
    } else if (normalized.subCategory === 'FAT') {
      category = 'FAT';
      subCategory = 'FAT';
      unit = 'Pcs';
    } else if (normalized.subCategory === 'FDT') {
      category = 'FDT';
      subCategory = 'FDT';
      unit = 'Pcs';
    } else if (normalized.subCategory === 'JC') {
      category = 'JC';
      subCategory = 'JC';
      unit = 'Pcs';
    } else if (normalized.subCategory === 'ACC') {
      category = canonicalName.toLowerCase().includes('seling') ? 'SELING' : 'ACCESSORY';
      subCategory = 'ACC';
      unit = canonicalName.toLowerCase().includes('seling') ? 'Meter' : unit;
    }
  }

  let weight = 10;
  if (subCategory === 'POLE') {
    weight = effectiveScope === 'SUBFEEDER' || effectiveScope === 'MAIN_FEEDER' ? 50 : 40;
  } else if (subCategory === 'CABLE' || subCategory === 'JC') {
    weight = 20;
  } else if (subCategory === 'FAT') {
    weight = 25;
  } else if (subCategory === 'FDT') {
    weight = 5;
  }

  const sortOrder = getCanonicalWorkItemSortOrder({
    scope: effectiveScope,
    category,
    subCategory,
    itemName: canonicalName,
  });

  return {
    itemName: canonicalName,
    scope: effectiveScope,
    category,
    subCategory: subCategory || 'ACC',
    workType: workType || 'CW',
    weight,
    unit,
    sortOrder,
  };
}

function revalidateAllViews() {
  revalidatePath('/');
  revalidatePath('/clusters');
  revalidatePath('/matrix');
  revalidatePath('/daily-input');
  revalidatePath('/sitelist');
}

export async function updateClusterWorkItem(input: {
  workItemId: string;
  itemName: string;
  scope: WorkItemScope;
  boq: number;
}) {
  try {
    const boqNum = Number(input.boq);
    if (!Number.isFinite(boqNum) || boqNum < 0) {
      return { success: false, error: 'Target BOQ harus berupa angka >= 0.' };
    }
    if (!input.itemName || !input.itemName.trim()) {
      return { success: false, error: 'Nama item pekerjaan wajib diisi.' };
    }

    const current = await prisma.workItem.findUnique({
      where: { id: input.workItemId },
      include: {
        cluster: { select: { id: true, name: true, projectType: true } },
        progressList: true,
      },
    });

    if (!current) {
      return { success: false, error: 'Item pekerjaan tidak ditemukan.' };
    }

    const meta = resolveWorkItemMetadata({
      rawItemName: input.itemName,
      requestedScope: input.scope,
      clusterProjectType: current.cluster.projectType,
      fallbackCategory: current.category,
      fallbackUnit: current.unit,
    });
    const roundedBoq = Math.round(boqNum * 10) / 10;

    // Check if another WorkItem with the target (clusterId, scope, itemName) already exists
    const conflictingTarget = await prisma.workItem.findUnique({
      where: {
        clusterId_scope_itemName: {
          clusterId: current.clusterId,
          scope: meta.scope,
          itemName: meta.itemName,
        },
      },
      include: {
        progressList: true,
      },
    });

    let mergedInfo = '';

    if (conflictingTarget && conflictingTarget.id !== current.id) {
      // Merge progressList from current -> conflictingTarget, update target BOQ, delete current
      await prisma.$transaction(async (tx) => {
        for (const prog of current.progressList) {
          const existingTargetProg = await tx.dailyProgressItem.findUnique({
            where: {
              dailyReportId_workItemId: {
                dailyReportId: prog.dailyReportId,
                workItemId: conflictingTarget.id,
              },
            },
          });

          if (existingTargetProg) {
            await tx.dailyProgressItem.update({
              where: { id: existingTargetProg.id },
              data: { quantity: Math.round((existingTargetProg.quantity + prog.quantity) * 10) / 10 },
            });
            await tx.dailyProgressItem.delete({ where: { id: prog.id } });
          } else {
            await tx.dailyProgressItem.update({
              where: { id: prog.id },
              data: { workItemId: conflictingTarget.id },
            });
          }
        }

        await tx.workItem.update({
          where: { id: conflictingTarget.id },
          data: {
            boq: roundedBoq,
            category: meta.category,
            subCategory: meta.subCategory,
            workType: meta.workType,
            weight: meta.weight,
            unit: meta.unit,
            sortOrder: meta.sortOrder,
          },
        });

        await tx.workItem.delete({ where: { id: current.id } });
      });

      mergedInfo = `Item "${current.itemName}" digabungkan ke "${meta.itemName}" (termasuk seluruh riwayat terpasang) dengan Target BOQ ${roundedBoq.toLocaleString('en-US')}.`;
    } else {
      await prisma.workItem.update({
        where: { id: current.id },
        data: {
          itemName: meta.itemName,
          scope: meta.scope,
          category: meta.category,
          subCategory: meta.subCategory,
          workType: meta.workType,
          weight: meta.weight,
          unit: meta.unit,
          boq: roundedBoq,
          sortOrder: meta.sortOrder,
        },
      });

      mergedInfo =
        current.itemName !== meta.itemName || current.scope !== meta.scope
          ? `Item "${current.itemName}" diperbarui menjadi "${meta.itemName}" (${meta.scope}) dengan Target BOQ ${roundedBoq.toLocaleString('en-US')}.`
          : `Target BOQ "${meta.itemName}" pada ${current.cluster.name} berhasil diperbarui menjadi ${roundedBoq.toLocaleString('en-US')}.`;
    }

    await backupDatabaseToNextcloud();
    revalidateAllViews();

    return { success: true, message: mergedInfo };
  } catch (err: unknown) {
    console.error('Error updating cluster work item:', err);
    const errMsg = err instanceof Error ? err.message : 'Gagal memperbarui item BOQ.';
    return { success: false, error: errMsg };
  }
}

export async function addClusterWorkItem(input: {
  clusterId: string;
  itemName: string;
  scope: WorkItemScope;
  boq: number;
}) {
  try {
    const boqNum = Number(input.boq);
    if (!Number.isFinite(boqNum) || boqNum < 0) {
      return { success: false, error: 'Target BOQ harus berupa angka >= 0.' };
    }
    if (!input.itemName || !input.itemName.trim()) {
      return { success: false, error: 'Nama item pekerjaan wajib diisi.' };
    }

    const cluster = await prisma.cluster.findUnique({
      where: { id: input.clusterId },
      select: { id: true, name: true, projectType: true },
    });

    if (!cluster) {
      return { success: false, error: 'Cluster tidak ditemukan.' };
    }

    const meta = resolveWorkItemMetadata({
      rawItemName: input.itemName,
      requestedScope: input.scope,
      clusterProjectType: cluster.projectType,
    });
    const roundedBoq = Math.round(boqNum * 10) / 10;

    await prisma.workItem.upsert({
      where: {
        clusterId_scope_itemName: {
          clusterId: cluster.id,
          scope: meta.scope,
          itemName: meta.itemName,
        },
      },
      update: {
        boq: roundedBoq,
        category: meta.category,
        subCategory: meta.subCategory,
        workType: meta.workType,
        weight: meta.weight,
        unit: meta.unit,
        sortOrder: meta.sortOrder,
      },
      create: {
        clusterId: cluster.id,
        scope: meta.scope,
        workType: meta.workType,
        category: meta.category,
        subCategory: meta.subCategory,
        weight: meta.weight,
        itemName: meta.itemName,
        unit: meta.unit,
        boq: roundedBoq,
        status: 'ONGOING',
        sortOrder: meta.sortOrder,
      },
    });

    await backupDatabaseToNextcloud();
    revalidateAllViews();

    return {
      success: true,
      message: `Item "${meta.itemName}" (${meta.scope}) dengan BOQ ${roundedBoq.toLocaleString('en-US')} ${meta.unit} berhasil disimpan untuk "${cluster.name}".`,
    };
  } catch (err: unknown) {
    console.error('Error adding cluster work item:', err);
    const errMsg = err instanceof Error ? err.message : 'Gagal menambahkan item BOQ.';
    return { success: false, error: errMsg };
  }
}

export async function deleteClusterWorkItem(input: { workItemId: string; force?: boolean }) {
  try {
    const item = await prisma.workItem.findUnique({
      where: { id: input.workItemId },
      include: {
        cluster: { select: { name: true } },
        progressList: true,
      },
    });

    if (!item) {
      return { success: false, error: 'Item pekerjaan tidak ditemukan.' };
    }

    const totalInstalled = item.progressList.reduce((sum, p) => sum + p.quantity, 0);
    if ((item.progressList.length > 0 || totalInstalled > 0) && !input.force) {
      return {
        success: false,
        requiresForce: true,
        error: `Item "${item.itemName}" memiliki realisasi terpasang (${totalInstalled.toLocaleString('en-US')}). Gunakan Edit untuk memindahkan jenis item tanpa menghapus realisasi, atau konfirmasi hapus paksa.`,
      };
    }

    await prisma.workItem.delete({
      where: { id: item.id },
    });

    await backupDatabaseToNextcloud();
    revalidateAllViews();

    return {
      success: true,
      message: `Item "${item.itemName}" dari "${item.cluster.name}" berhasil dihapus.`,
    };
  } catch (err: unknown) {
    console.error('Error deleting cluster work item:', err);
    const errMsg = err instanceof Error ? err.message : 'Gagal menghapus item BOQ.';
    return { success: false, error: errMsg };
  }
}
