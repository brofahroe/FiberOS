'use server';

import { prisma } from '@/lib/prisma';

export interface WaReportItemMetrics {
  boq: number;
  actual: number;
  today: number;
  isDone: boolean;
}

export interface WaReportData {
  clusterId: string;
  clusterName: string;
  siteId: string;
  reportDate: string;
  formattedDate: string;
  startImDate: string;
  reporterName: string;
  teamName: string;
  availableClusters: Array<{ id: string; name: string; code?: string | null }>;
  availableDates: string[];
  distribusi: {
    pole: WaReportItemMetrics;
    cable: WaReportItemMetrics;
    fdt: WaReportItemMetrics;
    fat: WaReportItemMetrics;
    wireSling: WaReportItemMetrics;
  };
  subfeeder: {
    pole: WaReportItemMetrics;
    cable: WaReportItemMetrics;
    jc: WaReportItemMetrics;
  };
}

function normalizeDateStr(d: string): string {
  if (!d) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // If YYYY-MM-DD
  if (d.includes('-') && d.split('-')[0].length === 4) {
    const [yyyy, mm, dd] = d.split('-');
    const mIdx = parseInt(mm, 10) - 1;
    const day = parseInt(dd, 10);
    return `${day}-${months[mIdx]}-${yyyy.slice(-2)}`.toLowerCase();
  }
  return d.trim().toLowerCase();
}

function formatIndoDate(d: string): string {
  const monthsMap: Record<string, string> = {
    Jan: 'Januari', Feb: 'Februari', Mar: 'Maret', Apr: 'April', May: 'Mei', Jun: 'Juni',
    Jul: 'Juli', Aug: 'Agustus', Sep: 'September', Oct: 'Oktober', Nov: 'November', Dec: 'Desember'
  };
  const parts = d.split('-');
  if (parts.length === 3 && isNaN(Number(parts[1]))) {
    const day = parts[0];
    const month = monthsMap[parts[1]] || parts[1];
    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return `${day} ${month} ${year}`;
  }
  return d;
}

export async function getWhatsAppReportData(
  clusterId?: string,
  reportDate?: string
): Promise<{ success: boolean; data?: WaReportData; error?: string }> {
  try {
    // 1. Get all clusters for dropdown selection
    const allClusters = await prisma.cluster.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });

    if (allClusters.length === 0) {
      return { success: false, error: 'Belum ada cluster di sistem.' };
    }

    const targetClusterInfo = clusterId
      ? allClusters.find((c) => c.id === clusterId) || allClusters[0]
      : allClusters[0];
    const targetClusterId = targetClusterInfo.id;

    // 2. Get available dates from daily reports
    const clusterReports = await prisma.dailyReport.findMany({
      where: { clusterId: targetClusterId },
      select: { reportDate: true, reporterName: true, teamName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const allReports = await prisma.dailyReport.findMany({
      select: { reportDate: true },
      orderBy: { createdAt: 'desc' },
    });

    const clusterDates = Array.from(new Set(clusterReports.map((r) => r.reportDate)));
    const allUniqueDates = Array.from(new Set(allReports.map((r) => r.reportDate)));
    const availableDates = Array.from(new Set([...clusterDates, ...allUniqueDates]));

    let targetReportDate = reportDate;
    if (!targetReportDate || targetReportDate.trim() === '') {
      targetReportDate = clusterDates[0] || availableDates[0] || '12-Nov-26';
    }

    // 3. Fetch cluster with workItems and progress
    const cluster = await prisma.cluster.findUnique({
      where: { id: targetClusterId },
      include: {
        workItems: {
          include: {
            progressList: {
              include: {
                dailyReport: true,
              },
            },
          },
        },
      },
    });

    if (!cluster) {
      return { success: false, error: 'Cluster tidak ditemukan.' };
    }

    const report = await prisma.dailyReport.findFirst({
      where: {
        clusterId: targetClusterId,
        reportDate: targetReportDate,
      },
    });

    // Helper to calculate metric for items matching filter
    const calcMetrics = (
      scope: 'CLUSTER' | 'SUBFEEDER',
      categoryMatch: (name: string, cat: string, sub: string) => boolean
    ): WaReportItemMetrics => {
      let boq = 0;
      let actual = 0;
      let today = 0;
      let anyDone = false;

      for (const item of cluster.workItems) {
        const itemScope = item.scope || (item.itemName.toLowerCase().includes('feeder') ? 'SUBFEEDER' : 'CLUSTER');
        if (itemScope !== scope) continue;

        const name = item.itemName.toLowerCase();
        const cat = (item.category || '').toUpperCase();
        const sub = (item.subCategory || '').toUpperCase();

        if (categoryMatch(name, cat, sub)) {
          boq += item.boq;
          const isDone = item.status === 'DONE';
          if (isDone) anyDone = true;

          for (const prog of item.progressList) {
            actual += prog.quantity;
            const pDate = prog.dailyReport.reportDate;
            if (pDate === targetReportDate || normalizeDateStr(pDate) === normalizeDateStr(targetReportDate)) {
              today += prog.quantity;
            }
          }
        }
      }

      const isCompleted = anyDone || (boq > 0 && actual >= boq);

      return {
        boq: Math.round(boq * 10) / 10,
        actual: Math.round(actual * 10) / 10,
        today: Math.round(today * 10) / 10,
        isDone: isCompleted,
      };
    };

    // Distribusi items
    const clrPole = calcMetrics('CLUSTER', (name, cat, sub) => sub === 'POLE' || cat === 'POLE' || name.includes('pole') || name.includes('tiang'));
    const clrCable = calcMetrics('CLUSTER', (name, cat, sub) => sub === 'CABLE' || cat === 'CABLE' || name.includes('kabel') || name.includes('cable'));
    const clrFdt = calcMetrics('CLUSTER', (name, cat, sub) => sub === 'FDT' || cat === 'FDT' || name.includes('fdt'));
    const clrFat = calcMetrics('CLUSTER', (name, cat, sub) => sub === 'FAT' || cat === 'FAT' || name.includes('fat'));
    const clrWireSling = calcMetrics('CLUSTER', (name, cat, sub) => sub === 'ACC' || cat === 'ACCESSORY' || name.includes('wire') || name.includes('sling') || name.includes('acc') || name.includes('perapihan'));

    // Subfeeder items
    const sfPole = calcMetrics('SUBFEEDER', (name, cat, sub) => sub === 'POLE' || cat === 'POLE' || name.includes('pole') || name.includes('tiang'));
    const sfCable = calcMetrics('SUBFEEDER', (name, cat, sub) => sub === 'CABLE' || cat === 'CABLE' || name.includes('kabel') || name.includes('cable'));
    const sfJc = calcMetrics('SUBFEEDER', (name, cat, sub) => sub === 'JC' || cat === 'JC' || name.includes('jc') || name.includes('joint closure'));

    const siteId = cluster.code || `CLRMO7-99-${cluster.name.toUpperCase()}`;

    return {
      success: true,
      data: {
        clusterId: cluster.id,
        clusterName: cluster.name,
        siteId,
        reportDate: targetReportDate,
        formattedDate: formatIndoDate(targetReportDate),
        startImDate: '01/11/26',
        reporterName: report?.reporterName || '',
        teamName: report?.teamName || '',
        availableClusters: allClusters,
        availableDates: availableDates.length > 0 ? availableDates : [targetReportDate],
        distribusi: {
          pole: clrPole,
          cable: clrCable,
          fdt: clrFdt,
          fat: clrFat,
          wireSling: clrWireSling,
        },
        subfeeder: {
          pole: sfPole,
          cable: sfCable,
          jc: sfJc,
        },
      },
    };
  } catch (error: any) {
    console.error('Error fetching WA report data:', error);
    return { success: false, error: error.message || 'Gagal memuat data laporan WA.' };
  }
}

