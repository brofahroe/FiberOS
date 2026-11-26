'use server';

import { prisma } from '@/lib/prisma';
import * as excel from 'xlsx';
import { cleanupLegacyRawBoqItems } from '@/actions/importBoq';
import { sortWorkItems } from '@/lib/progressCalculator';
import { getCurrentUser } from '@/lib/auth';
import { canAccessCity } from '@/lib/permissions';
import {
  backupDatabaseToNextcloud,
  ensureDatabaseRestoredFromNextcloud,
  normalizeDatabaseReportDates,
  formatCanonicalReportDate,
  parseReportDateMs,
} from '@/lib/dbSync';

export async function getMatrixData(filterClusterId?: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !currentUser.permissions.matrixView) {
      return {
        dates: [],
        matrixRows: [],
        clustersList: [],
      };
    }

    await ensureDatabaseRestoredFromNextcloud();
    await normalizeDatabaseReportDates();
    await cleanupLegacyRawBoqItems();

    const whereClause = filterClusterId && filterClusterId !== 'ALL' ? { id: filterClusterId } : {};

    const rawClusters = await prisma.cluster.findMany({
      where: whereClause,
      include: {
        workItems: {
          include: {
            progressList: {
              include: {
                dailyReport: true,
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const clusters = rawClusters.filter((c) => canAccessCity(currentUser, c.kabupaten));
    const allowedClusterIds = clusters.map((c) => c.id);

  const reportSummaries =
    allowedClusterIds.length === 0
      ? []
      : await prisma.dailyReport.findMany({
          where: { clusterId: { in: allowedClusterIds } },
          select: { clusterId: true, reportDate: true, teamName: true },
        });

  const dates = Array.from(
    new Set(reportSummaries.map((report) => formatCanonicalReportDate(report.reportDate)))
  ).sort((a, b) => parseReportDateMs(a) - parseReportDateMs(b));

  const teamsByClusterDate = new Map<string, Set<string>>();
  for (const report of reportSummaries) {
    const team = report.teamName?.trim() || '';
    if (!team) continue;

    const key = `${report.clusterId}:${report.reportDate}`;
    const teams = teamsByClusterDate.get(key) || new Set<string>();
    teams.add(team);
    teamsByClusterDate.set(key, teams);
  }

  const multiTeamDatesByCluster = new Map<string, string[]>();
  teamsByClusterDate.forEach((teams, key) => {
    if (teams.size < 2) return;

    const [clusterId, reportDate] = key.split(':');
    const clusterDates = multiTeamDatesByCluster.get(clusterId) || [];
    clusterDates.push(reportDate);
    multiTeamDatesByCluster.set(clusterId, clusterDates);
  });

  const matrixRows: Array<{
    workItemId: string;
    clusterId: string;
    clusterName: string;
    homePasses: number;
    scope: string;
    workType: string;
    category: string;
    subCategory?: string | null;
    weight: number;
    itemName: string;
    unit: string;
    boq: number;
    totalInstalled: number;
    remaining: number;
    percentage: number;
    status: string;
    dailyValues: { [dateStr: string]: number };
    multiTeamDates: string[];
  }> = [];

  for (const cluster of clusters) {
    let isFirstClusterRow = true;
    const sortedWorkItems = sortWorkItems(cluster.workItems);
    for (const item of sortedWorkItems) {
      const dailyValues: { [dateStr: string]: number } = {};
      let totalInstalled = 0;

      for (const prog of item.progressList) {
        const d = formatCanonicalReportDate(prog.dailyReport.reportDate);
        dailyValues[d] = (dailyValues[d] || 0) + prog.quantity;
        totalInstalled += prog.quantity;
      }

      const isDone = item.status === 'DONE';
      const remaining = isDone ? 0 : Math.max(0, item.boq - totalInstalled);
      const percentage = isDone
        ? 100
        : (item.boq > 0 ? Math.min(100, Math.round((totalInstalled / item.boq) * 100)) : (totalInstalled > 0 ? 100 : 0));
      const itemStatus = item.status || (percentage >= 100 ? 'DONE' : 'ONGOING');

      matrixRows.push({
        workItemId: item.id,
        clusterId: cluster.id,
        clusterName: isFirstClusterRow ? cluster.name : '',
        homePasses: isFirstClusterRow ? cluster.homePasses : 0,
        scope: item.scope || 'CLUSTER',
        workType: item.workType || 'CW',
        category: item.category,
        subCategory: item.subCategory,
        weight: item.weight || 0,
        itemName: item.itemName,
        unit: item.unit,
        boq: item.boq,
        totalInstalled: Math.round(totalInstalled * 10) / 10,
        remaining: Math.round(remaining * 10) / 10,
        percentage,
        status: itemStatus,
        dailyValues,
        multiTeamDates: multiTeamDatesByCluster.get(cluster.id) || [],
      });

      isFirstClusterRow = false;
    }
  }

  const allClustersRaw = await prisma.cluster.findMany({
    select: { id: true, name: true, kabupaten: true },
    orderBy: { name: 'asc' },
  });
  const allClustersList = allClustersRaw
    .filter((c) => canAccessCity(currentUser, c.kabupaten))
    .map(({ id, name }) => ({ id, name }));

    return {
      dates,
      matrixRows,
      clustersList: allClustersList,
    };
  } catch (err: any) {
    console.error('Error fetching matrix data:', err);
    return {
      dates: [],
      matrixRows: [],
      clustersList: [],
    };
  }
}

export async function exportMatrixToExcel(filterClusterId?: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !currentUser.permissions.matrixExport) {
    return {
      filename: '',
      base64: '',
      error: 'Akses ditolak: Anda tidak memiliki izin ekspor Excel.',
    };
  }

  const { dates, matrixRows } = await getMatrixData(filterClusterId);

  const headerRow1 = ['Cluster', 'HP', 'Scope', 'Tipe', 'Item Pekerjaan', 'Satuan', ...dates, 'TOTAL', 'BOQ', 'SISA', 'PROGRESS %', 'STATUS'];

  const rowsData = matrixRows.map((r) => {
    const dailyCells = dates.map((d) => r.dailyValues[d] || '');
    return [
      r.clusterName,
      r.homePasses || '',
      r.scope === 'SUBFEEDER' ? 'SF (30%)' : 'CLR (70%)',
      r.workType || 'CW',
      r.itemName,
      r.unit,
      ...dailyCells,
      r.totalInstalled,
      r.boq,
      r.remaining,
      `${r.percentage}%`,
      r.status,
    ];
  });

  const wsData = [headerRow1, ...rowsData];
  const ws = excel.utils.aoa_to_sheet(wsData);

  const colWidths = [
    { wch: 22 },
    { wch: 8 },
    { wch: 12 },
    { wch: 8 },
    { wch: 28 },
    { wch: 8 },
    ...dates.map(() => ({ wch: 10 })),
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
  ];
  ws['!cols'] = colWidths;

  const wb = excel.utils.book_new();
  excel.utils.book_append_sheet(wb, ws, 'PROGRES HARIAN FTTH');

  const base64 = excel.write(wb, { type: 'base64', bookType: 'xlsx' });
  return {
    filename: `FiberOS_Progres_Harian_${new Date().toISOString().split('T')[0]}.xlsx`,
    base64,
  };
}

export async function updateWorkItemStatus(workItemId: string, status: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !currentUser.permissions.matrixEditStatus) {
      return { success: false, error: 'Akses ditolak: Anda tidak memiliki izin mengubah status final.' };
    }

    const existingItem = await prisma.workItem.findUnique({
      where: { id: workItemId },
      include: { cluster: { select: { kabupaten: true } } },
    });
    if (!existingItem) {
      return { success: false, error: 'Item pekerjaan tidak ditemukan.' };
    }
    if (!canAccessCity(currentUser, existingItem.cluster.kabupaten)) {
      return { success: false, error: 'Akses ditolak untuk wilayah Kota cluster ini.' };
    }

    const updated = await prisma.workItem.update({
      where: { id: workItemId },
      data: { status },
    });
    await backupDatabaseToNextcloud();
    return { success: true, status: updated.status };
  } catch (err: any) {
    console.error('Error updating status:', err);
    return { success: false, error: err.message || 'Gagal mengubah status' };
  }
}
