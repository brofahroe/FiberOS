'use server';

import { prisma } from '@/lib/prisma';
import * as xlsx from 'xlsx';

const excel = (xlsx as any).default || xlsx;

export async function getMatrixData(filterClusterId?: string) {
  try {
    const whereClause = filterClusterId && filterClusterId !== 'ALL' ? { id: filterClusterId } : {};

    const clusters = await prisma.cluster.findMany({
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

  const reports = await prisma.dailyReport.findMany({
    select: { reportDate: true },
    distinct: ['reportDate'],
  });

  const dates = reports.map((r) => r.reportDate).sort((a, b) => {
    const parseDate = (d: string) => {
      const parts = d.split('-');
      if (parts.length === 3 && isNaN(Number(parts[1]))) {
        const months: { [k: string]: number } = {
          Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
          Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
        };
        const day = parseInt(parts[0]);
        const month = months[parts[1]] ?? 0;
        const year = 2000 + parseInt(parts[2]);
        return new Date(year, month, day).getTime();
      }
      return new Date(d).getTime();
    };
    return parseDate(a) - parseDate(b);
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
  }> = [];

  for (const cluster of clusters) {
    let isFirstClusterRow = true;
    for (const item of cluster.workItems) {
      const dailyValues: { [dateStr: string]: number } = {};
      let totalInstalled = 0;

      for (const prog of item.progressList) {
        const d = prog.dailyReport.reportDate;
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
      });

      isFirstClusterRow = false;
    }
  }

  const allClustersList = await prisma.cluster.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

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
    const updated = await prisma.workItem.update({
      where: { id: workItemId },
      data: { status },
    });
    return { success: true, status: updated.status };
  } catch (err: any) {
    console.error('Error updating status:', err);
    return { success: false, error: err.message || 'Gagal mengubah status' };
  }
}
