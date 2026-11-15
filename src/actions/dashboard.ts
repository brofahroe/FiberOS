'use server';

import { prisma } from '@/lib/prisma';
import { ProjectSummary, CategoryProgress, ClusterWithProgress } from '@/types';
import { runInitialSeed } from '@/actions/seed';
import { cleanupLegacyRawBoqItems } from '@/actions/importBoq';
import {
  ensureDatabaseRestoredFromNextcloud,
  normalizeDatabaseReportDates,
  formatCanonicalReportDate,
  parseReportDateMs,
} from '@/lib/dbSync';
import { calculateClusterProgress } from '@/lib/progressCalculator';
import sitelistData from '@/data/sitelist.json';

export async function getDashboardData() {
  try {
    await ensureDatabaseRestoredFromNextcloud();
    await normalizeDatabaseReportDates();
    await cleanupLegacyRawBoqItems();

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

    if (project.name.includes('ALL CL KEDUNGTUBAN') || project.name === 'ROLLOUT GCI-MTI BLORA') {
      const updatedName = 'GCI-MTI BLORA';
      await prisma.project.update({
        where: { id: project.id },
        data: { name: updatedName },
      });
      project.name = updatedName;
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

    const calcInput = cluster.workItems.map((item) => {
      const installed = item.progressList.reduce((sum, p) => sum + p.quantity, 0);
      return {
        id: item.id,
        scope: item.scope,
        workType: item.workType,
        category: item.category,
        subCategory: item.subCategory,
        itemName: item.itemName,
        boq: item.boq,
        installed,
        status: item.status,
      };
    });

    const clusterCalc = calculateClusterProgress(calcInput);

    const itemsSummary = cluster.workItems.map((item) => {
      const installed = item.progressList.reduce((sum, p) => sum + p.quantity, 0);
      const isDone = item.status === 'DONE';
      const remaining = isDone ? 0 : Math.max(0, item.boq - installed);
      const percentage = isDone
        ? 100
        : (item.boq > 0 ? Math.min(100, Math.round((installed / item.boq) * 100)) : (installed > 0 ? 100 : 0));
      const effectiveInstalled = isDone ? Math.max(installed, item.boq) : installed;

      clusterBoq += item.boq;
      clusterInstalled += effectiveInstalled;

      // Aggregate into categories
      const catKey = item.category || 'OTHER';
      const existingCat = catMap.get(catKey) || { boq: 0, installed: 0, unit: item.unit };
      existingCat.boq += item.boq;
      existingCat.installed += effectiveInstalled;
      catMap.set(catKey, existingCat);

      return {
        id: item.id,
        scope: item.scope,
        workType: item.workType,
        category: item.category,
        subCategory: item.subCategory,
        weight: item.weight,
        itemName: item.itemName,
        unit: item.unit,
        boq: item.boq,
        installed: installed,
        remaining: remaining,
        percentage: percentage,
        status: item.status || (percentage >= 100 ? 'DONE' : 'ONGOING'),
      };
    });

    totalBoq += clusterBoq;
    totalInstalled += clusterInstalled;

    const status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' =
      clusterCalc.totalWeightedPercentage >= 100
        ? 'COMPLETED'
        : clusterCalc.totalWeightedPercentage > 0
        ? 'IN_PROGRESS'
        : 'NOT_STARTED';

    const lowerClusterName = cluster.name.trim().toLowerCase();
    const matchedSite = sitelistData.sites.find(
      (s) =>
        s.shortName.toLowerCase() === lowerClusterName ||
        s.clusterName.toLowerCase() === lowerClusterName ||
        s.clusterId.toLowerCase() === lowerClusterName
    );

    clustersWithProgress.push({
      id: cluster.id,
      name: cluster.name,
      code: cluster.code || matchedSite?.clusterId || null,
      emrSiteCode: cluster.emrSiteCode || matchedSite?.emrSiteCode || null,
      subfeederId: cluster.subfeederId || matchedSite?.subfeederId || null,
      clusterName: cluster.clusterName || matchedSite?.clusterName || null,
      oltName: cluster.oltName || matchedSite?.oltName || null,
      kecamatan: cluster.kecamatan || matchedSite?.kecamatan || 'Kedungtuban',
      kabupaten: cluster.kabupaten || matchedSite?.kabupaten || 'Blora',
      homePasses: cluster.homePasses,
      totalBoq: Math.round(clusterBoq * 10) / 10,
      totalInstalled: Math.round(clusterInstalled * 10) / 10,
      percentage: clusterCalc.totalWeightedPercentage,
      clrPercentage: clusterCalc.clr.scopePercentage,
      sfPercentage: clusterCalc.sf.scopePercentage,
      clrContribution: clusterCalc.clr.totalContribution,
      sfContribution: clusterCalc.sf.totalContribution,
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

  const overallProgress =
    clustersWithProgress.length > 0
      ? Math.round(clustersWithProgress.reduce((sum, c) => sum + c.percentage, 0) / clustersWithProgress.length)
      : (totalBoq > 0 ? Math.min(100, Math.round((totalInstalled / totalBoq) * 100)) : 0);

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

  // Calculate daily installation trends (poles and cables per date)
  const allDailyReports = await prisma.dailyReport.findMany({
    include: {
      cluster: {
        select: { id: true, name: true },
      },
      items: {
        include: {
          workItem: true,
        },
      },
    },
    orderBy: { reportDate: 'asc' },
  });

  const parseReportDate = (d: string) => parseReportDateMs(d);

  const activityByClusterDate = new Map<
    string,
    {
      clusterId: string;
      cluster: { id: string; name: string };
      reportDate: string;
      createdAt: Date;
      updatedAt: Date;
      teams: Set<string>;
      itemIds: Set<string>;
    }
  >();

  for (const report of allDailyReports) {
    const canonicalDate = formatCanonicalReportDate(report.reportDate);
    const key = `${report.clusterId}:${canonicalDate}`;
    const reportLatestTime =
      report.updatedAt && report.updatedAt > report.createdAt
        ? report.updatedAt
        : report.createdAt;

    let activity = activityByClusterDate.get(key);
    if (!activity) {
      activity = {
        clusterId: report.clusterId,
        cluster: report.cluster,
        reportDate: canonicalDate,
        createdAt: report.createdAt,
        updatedAt: reportLatestTime,
        teams: new Set<string>(),
        itemIds: new Set<string>(),
      };
      activityByClusterDate.set(key, activity);
    } else {
      if (report.createdAt > activity.createdAt) {
        activity.createdAt = report.createdAt;
      }
      if (reportLatestTime > activity.updatedAt) {
        activity.updatedAt = reportLatestTime;
      }
    }

    if (report.teamName?.trim()) {
      activity.teams.add(report.teamName.trim());
    }

    for (const item of report.items) {
      activity.itemIds.add(item.workItemId);
      if (item.updatedAt && item.updatedAt > activity.updatedAt) {
        activity.updatedAt = item.updatedAt;
      }
    }
  }

  const recentReports = Array.from(activityByClusterDate.values())
    .sort((a, b) => {
      const timeDiff = b.updatedAt.getTime() - a.updatedAt.getTime();
      // If two reports were seeded within 60 seconds of each other, sort by reportDate descending
      if (Math.abs(timeDiff) < 60_000) {
        const dateDiff = parseReportDate(b.reportDate) - parseReportDate(a.reportDate);
        if (dateDiff !== 0) return dateDiff;
      }
      return timeDiff;
    })
    .slice(0, 15)
    .map((activity) => ({
      id: `${activity.clusterId}-${activity.reportDate}`,
      clusterId: activity.clusterId,
      cluster: activity.cluster,
      reportDate: activity.reportDate,
      teamName: Array.from(activity.teams).join(', '),
      items: Array.from(activity.itemIds, (workItemId) => ({ workItemId })),
    }));

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

  const dailyTrends = Array.from(dateMap.values()).sort(
    (a, b) => parseReportDate(a.date) - parseReportDate(b.date)
  );

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

