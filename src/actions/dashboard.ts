'use server';

import { prisma } from '@/lib/prisma';
import { ProjectSummary, CategoryProgress, ClusterWithProgress } from '@/types';
import { runInitialSeed } from '@/actions/seed';

export async function getDashboardData() {
  try {
    let project = await prisma.project.findFirst({
      include: {
        clusters: {
          include: {
            workItems: {
              include: {
                progressList: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      // Auto-seed if database is empty
      await runInitialSeed();
      project = await prisma.project.findFirst({
        include: {
          clusters: {
            include: {
              workItems: {
                include: {
                  progressList: true,
                },
              },
            },
          },
        },
      });
    }

    if (!project) {
      return {
        project: null,
        categories: [],
        clusters: [],
        recentReports: [],
        dailyTrends: [],
      };
    }

  let totalBoq = 0;
  let totalInstalled = 0;
  let totalHomePasses = 0;

  // Category aggregators
  const catMap = new Map<string, { boq: number; installed: number; unit: string }>();
  const defaultCats = [
    { key: 'POLE', label: 'Tiang (Poles)', unit: 'Btg' },
    { key: 'CABLE', label: 'Penarikan Kabel', unit: 'Meter' },
    { key: 'FAT', label: 'Terminasi FAT', unit: 'Unit' },
    { key: 'FDT', label: 'Terminasi FDT', unit: 'Unit' },
    { key: 'ACCESSORY', label: 'Aksesoris & Fixture', unit: 'Pcs' },
  ];

  for (const c of defaultCats) {
    catMap.set(c.key, { boq: 0, installed: 0, unit: c.unit });
  }

  const clustersWithProgress: ClusterWithProgress[] = [];

  for (const cluster of project.clusters) {
    totalHomePasses += cluster.homePasses;
    let clusterBoq = 0;
    let clusterInstalled = 0;

    const itemsSummary = cluster.workItems.map((item) => {
      const installed = item.progressList.reduce((sum, p) => sum + p.quantity, 0);
      clusterBoq += item.boq;
      clusterInstalled += installed;

      const remaining = Math.max(0, item.boq - installed);
      const percentage = item.boq > 0 ? Math.min(100, Math.round((installed / item.boq) * 100)) : (installed > 0 ? 100 : 0);

      // Aggregate into categories
      const catKey = item.category || 'OTHER';
      const existingCat = catMap.get(catKey) || { boq: 0, installed: 0, unit: item.unit };
      existingCat.boq += item.boq;
      existingCat.installed += installed;
      catMap.set(catKey, existingCat);

      return {
        id: item.id,
        category: item.category,
        itemName: item.itemName,
        unit: item.unit,
        boq: item.boq,
        installed: installed,
        remaining: remaining,
        percentage: percentage,
      };
    });

    totalBoq += clusterBoq;
    totalInstalled += clusterInstalled;

    const clusterPercent = clusterBoq > 0 ? Math.min(100, Math.round((clusterInstalled / clusterBoq) * 100)) : 0;
    const status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' =
      clusterPercent >= 100 ? 'COMPLETED' : clusterPercent > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';

    clustersWithProgress.push({
      id: cluster.id,
      name: cluster.name,
      code: cluster.code,
      homePasses: cluster.homePasses,
      totalBoq: Math.round(clusterBoq * 10) / 10,
      totalInstalled: Math.round(clusterInstalled * 10) / 10,
      percentage: clusterPercent,
      status: status,
      workItems: itemsSummary,
    });
  }

  // Categories array
  const categories: CategoryProgress[] = defaultCats.map((cat) => {
    const data = catMap.get(cat.key) || { boq: 0, installed: 0, unit: cat.unit };
    const pct = data.boq > 0 ? Math.min(100, Math.round((data.installed / data.boq) * 100)) : 0;
    return {
      category: cat.key,
      displayName: cat.label,
      boq: Math.round(data.boq * 10) / 10,
      installed: Math.round(data.installed * 10) / 10,
      unit: data.unit,
      percentage: pct,
    };
  });

  const overallProgress = totalBoq > 0 ? Math.min(100, Math.round((totalInstalled / totalBoq) * 100)) : 0;

  const projectSummary: ProjectSummary = {
    id: project.id,
    name: project.name,
    code: project.code,
    totalClusters: project.clusters.length,
    totalHomePasses: totalHomePasses,
    overallProgress: overallProgress,
    totalBoq: Math.round(totalBoq),
    totalInstalled: Math.round(totalInstalled),
  };

  // Recent daily reports
  const recentReports = await prisma.dailyReport.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
      cluster: true,
      items: {
        include: {
          workItem: true,
        },
      },
    },
  });

  // Calculate daily installation trends (poles and cables per date)
  const allDailyReports = await prisma.dailyReport.findMany({
    include: {
      items: {
        include: {
          workItem: true,
        },
      },
    },
    orderBy: { reportDate: 'asc' },
  });

  const dateMap = new Map<string, { date: string; pole: number; cable: number; fat: number }>();
  for (const rep of allDailyReports) {
    const entry = dateMap.get(rep.reportDate) || { date: rep.reportDate, pole: 0, cable: 0, fat: 0 };
    for (const it of rep.items) {
      if (it.workItem.category === 'POLE') entry.pole += it.quantity;
      if (it.workItem.category === 'CABLE') entry.cable += it.quantity;
      if (it.workItem.category === 'FAT') entry.fat += it.quantity;
    }
    dateMap.set(rep.reportDate, entry);
  }

  const dailyTrends = Array.from(dateMap.values());

    return {
      project: projectSummary,
      categories,
      clusters: clustersWithProgress,
      recentReports,
      dailyTrends,
    };
  } catch (err: any) {
    console.error('Error fetching dashboard data:', err);
    return {
      project: null,
      categories: [],
      clusters: [],
      recentReports: [],
      dailyTrends: [],
    };
  }
}

