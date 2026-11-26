'use server';

import { prisma } from '@/lib/prisma';
import * as excel from 'xlsx';
import { revalidatePath } from 'next/cache';
import sitelistData from '@/data/sitelist.json';
import {
  calculateClusterProgress,
  DEFAULT_BOQ_WORK_ITEMS,
  DEFAULT_MAIN_FEEDER_WORK_ITEMS,
} from '@/lib/progressCalculator';
import { cleanupLegacyRawBoqItems } from '@/actions/importBoq';
import {
  backupDatabaseToNextcloud,
  ensureDatabaseRestoredFromNextcloud,
  formatCanonicalReportDate,
  parseReportDateMs,
} from '@/lib/dbSync';
import { getCurrentUser } from '@/lib/auth';
import { canAccessCity } from '@/lib/permissions';

export interface SitelistEntry {
  key: string;
  dbClusterId: string | null;
  isProvisioned: boolean;
  emrSiteCode: string;
  subfeederId: string;
  clusterId: string;
  clusterName: string;
  shortName: string;
  oltName: string;
  kecamatan: string;
  kabupaten: string;
  startImpleDate: string;
  homePasses: number;
  projectType: 'CLUSTER_SF' | 'MAIN_FEEDER';
  percentage: number;
  clrPercentage: number;
  sfPercentage: number;
  status: 'NOT_PROVISIONED' | 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  poleInstalled: number;
  poleBoq: number;
  cableInstalled: number;
  cableBoq: number;
  fatInstalled: number;
  fatBoq: number;
  fdtInstalled: number;
  fdtBoq: number;
}

export interface RegionSummaryItem {
  regionName: string;
  regionType: 'KECAMATAN' | 'KABUPATEN';
  parentKabupaten?: string;
  totalSites: number;
  activeClusters: number;
  completedClusters: number;
  inProgressClusters: number;
  notStartedClusters: number;
  totalHomePasses: number;
  avgActiveProgress: number;
  avgAllSitesProgress: number;
  avgClrProgress: number;
  avgSfProgress: number;
  poleInstalled: number;
  poleBoq: number;
  cableInstalled: number;
  cableBoq: number;
  fatInstalled: number;
  fatBoq: number;
  fdtInstalled: number;
  fdtBoq: number;
}

const DEFAULT_WORK_ITEMS = DEFAULT_BOQ_WORK_ITEMS;

export async function getSitelistData() {
  try {
    const currentUser = await getCurrentUser();
    if (
      !currentUser ||
      (!currentUser.permissions.sitelistView && !currentUser.permissions.sitelistManage)
    ) {
      return {
        entries: [],
        kecamatanSummaries: [],
        kabupatenSummaries: [],
        kecamatanList: [],
        kabupatenList: [],
        oltList: [],
      };
    }

    await ensureDatabaseRestoredFromNextcloud();
    await cleanupLegacyRawBoqItems();

    const dbClusters = await prisma.cluster.findMany({
      include: {
        workItems: {
          include: {
            progressList: true,
          },
        },
        dailyReports: {
          select: {
            reportDate: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const resolveStartImpleDate = (c: (typeof dbClusters)[number], fallbackSiteDate?: string): string => {
      if (c.startImpleDate && c.startImpleDate.trim()) {
        return formatCanonicalReportDate(c.startImpleDate.trim());
      }
      if (c.dailyReports && c.dailyReports.length > 0) {
        const sorted = [...c.dailyReports].sort(
          (a, b) => parseReportDateMs(a.reportDate) - parseReportDateMs(b.reportDate)
        );
        const earliest = sorted[0]?.reportDate;
        if (earliest) return formatCanonicalReportDate(earliest);
      }
      return fallbackSiteDate ? formatCanonicalReportDate(fallbackSiteDate) : '';
    };

    // Backfill any existing DB cluster that doesn't have kecamatan/kabupaten yet
    for (const c of dbClusters) {
      const lower = c.name.trim().toLowerCase();
      const stripped = lower.replace(/^kel(urahan)?\.?\s+/i, '').replace(/\s+blora$/i, '').trim();
      const matched = sitelistData.sites.find(
        (s) =>
          s.shortName.toLowerCase() === lower ||
          s.shortName.toLowerCase() === stripped ||
          s.clusterName.toLowerCase() === lower ||
          s.clusterId.toLowerCase() === lower ||
          s.clusterId.toLowerCase() === (c.code || '').toLowerCase()
      );
      if (matched && (!c.kecamatan || !c.emrSiteCode || !c.clusterName)) {
        await prisma.cluster.update({
          where: { id: c.id },
          data: {
            code: c.code || matched.clusterId,
            emrSiteCode: c.emrSiteCode || matched.emrSiteCode,
            subfeederId: c.subfeederId || matched.subfeederId,
            clusterName: c.clusterName || matched.clusterName,
            oltName: c.oltName || matched.oltName,
            kecamatan: c.kecamatan || matched.kecamatan,
            kabupaten: c.kabupaten || matched.kabupaten,
          },
        });
        c.code = c.code || matched.clusterId;
        c.emrSiteCode = c.emrSiteCode || matched.emrSiteCode;
        c.subfeederId = c.subfeederId || matched.subfeederId;
        c.clusterName = c.clusterName || matched.clusterName;
        c.oltName = c.oltName || matched.oltName;
        c.kecamatan = c.kecamatan || matched.kecamatan;
        c.kabupaten = c.kabupaten || matched.kabupaten;
      }
    }

    const matchedDbIds = new Set<string>();
    const entries: SitelistEntry[] = [];

    const computeClusterStats = (cluster: (typeof dbClusters)[number]) => {
      let poleInstalled = 0;
      let poleBoq = 0;
      let cableInstalled = 0;
      let cableBoq = 0;
      let fatInstalled = 0;
      let fatBoq = 0;
      let fdtInstalled = 0;
      let fdtBoq = 0;

      const calcInput = cluster.workItems.map((it) => {
        const installed = it.progressList.reduce((sum, p) => sum + p.quantity, 0);
        const effectiveInstalled = it.status === 'DONE' ? Math.max(installed, it.boq) : installed;

        if (it.category === 'POLE') {
          poleBoq += it.boq;
          poleInstalled += effectiveInstalled;
        } else if (it.category === 'CABLE') {
          cableBoq += it.boq;
          cableInstalled += effectiveInstalled;
        } else if (it.category === 'FAT') {
          fatBoq += it.boq;
          fatInstalled += effectiveInstalled;
        } else if (it.category === 'FDT') {
          fdtBoq += it.boq;
          fdtInstalled += effectiveInstalled;
        }

        return {
          id: it.id,
          scope: it.scope,
          workType: it.workType,
          category: it.category,
          subCategory: it.subCategory,
          itemName: it.itemName,
          boq: it.boq,
          installed,
          status: it.status,
        };
      });

      const calc = calculateClusterProgress(calcInput, {
        projectType: cluster.projectType,
      });
      const status: SitelistEntry['status'] =
        calc.totalWeightedPercentage >= 100
          ? 'COMPLETED'
          : calc.totalWeightedPercentage > 0
          ? 'IN_PROGRESS'
          : 'NOT_STARTED';

      return {
        projectType: (cluster.projectType === 'MAIN_FEEDER' ? 'MAIN_FEEDER' : 'CLUSTER_SF') as
          | 'CLUSTER_SF'
          | 'MAIN_FEEDER',
        percentage: calc.totalWeightedPercentage,
        clrPercentage: calc.clr.scopePercentage,
        sfPercentage: calc.sf.scopePercentage,
        status,
        poleInstalled: Math.round(poleInstalled),
        poleBoq: Math.round(poleBoq),
        cableInstalled: Math.round(cableInstalled),
        cableBoq: Math.round(cableBoq),
        fatInstalled: Math.round(fatInstalled),
        fatBoq: Math.round(fatBoq),
        fdtInstalled: Math.round(fdtInstalled),
        fdtBoq: Math.round(fdtBoq),
      };
    };

    // 1. Process all 34 reference sites from sitelist.json
    for (const site of sitelistData.sites) {
      const dbMatch = dbClusters.find((c) => {
        const cName = c.name.trim().toLowerCase();
        const cStripped = cName.replace(/^kel(urahan)?\.?\s+/i, '').replace(/\s+blora$/i, '').trim();
        const cCode = (c.code || '').trim().toLowerCase();
        const cEmr = (c.emrSiteCode || '').trim().toLowerCase();
        return (
          cName === site.shortName.toLowerCase() ||
          cStripped === site.shortName.toLowerCase() ||
          cName === site.clusterName.toLowerCase() ||
          cCode === site.clusterId.toLowerCase() ||
          cEmr === site.emrSiteCode.toLowerCase()
        );
      });

      if (dbMatch) {
        matchedDbIds.add(dbMatch.id);
        const stats = computeClusterStats(dbMatch);
        const siteDefaultDate = (site as { startImpleDate?: string }).startImpleDate;
        entries.push({
          key: site.clusterId,
          dbClusterId: dbMatch.id,
          isProvisioned: true,
          emrSiteCode: dbMatch.emrSiteCode || site.emrSiteCode,
          subfeederId: dbMatch.subfeederId || site.subfeederId,
          clusterId: dbMatch.code || site.clusterId,
          clusterName: dbMatch.clusterName || site.clusterName,
          shortName: dbMatch.name || site.shortName,
          oltName: dbMatch.oltName || site.oltName,
          kecamatan: dbMatch.kecamatan || site.kecamatan || 'Kedungtuban',
          kabupaten: dbMatch.kabupaten || site.kabupaten || 'Blora',
          startImpleDate: resolveStartImpleDate(dbMatch, siteDefaultDate),
          homePasses: dbMatch.homePasses || 0,
          ...stats,
        });
      } else {
        const siteDefaultDate = (site as { startImpleDate?: string }).startImpleDate;
        entries.push({
          key: site.clusterId,
          dbClusterId: null,
          isProvisioned: false,
          emrSiteCode: site.emrSiteCode,
          subfeederId: site.subfeederId,
          clusterId: site.clusterId,
          clusterName: site.clusterName,
          shortName: site.shortName,
          oltName: site.oltName,
          kecamatan: site.kecamatan || 'Kedungtuban',
          kabupaten: site.kabupaten || 'Blora',
          startImpleDate: siteDefaultDate ? formatCanonicalReportDate(siteDefaultDate) : '',
          homePasses: 0,
          projectType: 'CLUSTER_SF',
          percentage: 0,
          clrPercentage: 0,
          sfPercentage: 0,
          status: 'NOT_PROVISIONED',
          poleInstalled: 0,
          poleBoq: 0,
          cableInstalled: 0,
          cableBoq: 0,
          fatInstalled: 0,
          fatBoq: 0,
          fdtInstalled: 0,
          fdtBoq: 0,
        });
      }
    }

    // 2. Append any custom DB clusters added by the user that are not in sitelist.json
    for (const c of dbClusters) {
      if (matchedDbIds.has(c.id)) continue;
      const stats = computeClusterStats(c);
      entries.push({
        key: c.id,
        dbClusterId: c.id,
        isProvisioned: true,
        emrSiteCode: c.emrSiteCode || '-',
        subfeederId: c.subfeederId || `SF-${c.name.toUpperCase()}`,
        clusterId: c.code || `CLR-${c.name.toUpperCase()}`,
        clusterName: c.clusterName || c.name.toUpperCase(),
        shortName: c.name.toUpperCase(),
        oltName: c.oltName || 'OLT Balun',
        kecamatan: c.kecamatan || '-',
        kabupaten: c.kabupaten || 'Blora',
        startImpleDate: resolveStartImpleDate(c),
        homePasses: c.homePasses || 0,
        ...stats,
      });
    }

    // Filter entries by user's allowed Kota scope
    const scopedEntries = entries.filter((e) => canAccessCity(currentUser, e.kabupaten));

    // 3. Build Summaries per Kecamatan and per Kabupaten
    const buildSummaryGroup = (
      groupType: 'KECAMATAN' | 'KABUPATEN'
    ): RegionSummaryItem[] => {
      const map = new Map<string, SitelistEntry[]>();
      for (const e of scopedEntries) {
        const key = groupType === 'KECAMATAN' ? e.kecamatan : e.kabupaten;
        const list = map.get(key) || [];
        list.push(e);
        map.set(key, list);
      }

      const summaries: RegionSummaryItem[] = [];
      map.forEach((groupEntries, regionName) => {
        const activeList = groupEntries.filter((x) => x.isProvisioned);
        const completedClusters = activeList.filter((x) => x.status === 'COMPLETED').length;
        const inProgressClusters = activeList.filter((x) => x.status === 'IN_PROGRESS').length;
        const notStartedClusters = activeList.filter((x) => x.status === 'NOT_STARTED').length;

        const totalHomePasses = groupEntries.reduce((sum, x) => sum + x.homePasses, 0);
        const sumProgress = activeList.reduce((sum, x) => sum + x.percentage, 0);
        const sumClr = activeList.reduce((sum, x) => sum + x.clrPercentage, 0);
        const sumSf = activeList.reduce((sum, x) => sum + x.sfPercentage, 0);

        const avgActiveProgress =
          activeList.length > 0 ? Math.round((sumProgress / activeList.length) * 10) / 10 : 0;
        const avgAllSitesProgress =
          groupEntries.length > 0 ? Math.round((sumProgress / groupEntries.length) * 10) / 10 : 0;
        const avgClrProgress =
          activeList.length > 0 ? Math.round((sumClr / activeList.length) * 10) / 10 : 0;
        const avgSfProgress =
          activeList.length > 0 ? Math.round((sumSf / activeList.length) * 10) / 10 : 0;

        summaries.push({
          regionName,
          regionType: groupType,
          parentKabupaten: groupType === 'KECAMATAN' ? groupEntries[0]?.kabupaten || 'Blora' : undefined,
          totalSites: groupEntries.length,
          activeClusters: activeList.length,
          completedClusters,
          inProgressClusters,
          notStartedClusters,
          totalHomePasses,
          avgActiveProgress,
          avgAllSitesProgress,
          avgClrProgress,
          avgSfProgress,
          poleInstalled: groupEntries.reduce((s, x) => s + x.poleInstalled, 0),
          poleBoq: groupEntries.reduce((s, x) => s + x.poleBoq, 0),
          cableInstalled: groupEntries.reduce((s, x) => s + x.cableInstalled, 0),
          cableBoq: groupEntries.reduce((s, x) => s + x.cableBoq, 0),
          fatInstalled: groupEntries.reduce((s, x) => s + x.fatInstalled, 0),
          fatBoq: groupEntries.reduce((s, x) => s + x.fatBoq, 0),
          fdtInstalled: groupEntries.reduce((s, x) => s + x.fdtInstalled, 0),
          fdtBoq: groupEntries.reduce((s, x) => s + x.fdtBoq, 0),
        });
      });

      return summaries.sort((a, b) => a.regionName.localeCompare(b.regionName));
    };

    const kecamatanSummaries = buildSummaryGroup('KECAMATAN');
    const kabupatenSummaries = buildSummaryGroup('KABUPATEN');

    return {
      entries: scopedEntries,
      kecamatanSummaries,
      kabupatenSummaries,
      kecamatanList: Array.from(new Set(scopedEntries.map((e) => e.kecamatan))).sort(),
      kabupatenList: Array.from(new Set(scopedEntries.map((e) => e.kabupaten))).sort(),
      oltList: Array.from(new Set(scopedEntries.map((e) => e.oltName))).sort(),
    };
  } catch (error) {
    console.error('Error in getSitelistData:', error);
    return {
      entries: [],
      kecamatanSummaries: [],
      kabupatenSummaries: [],
      kecamatanList: [],
      kabupatenList: [],
      oltList: [],
    };
  }
}

export async function createOrActivateSitelistCluster(input: {
  dbClusterId?: string | null;
  emrSiteCode: string;
  subfeederId: string;
  clusterId: string;
  clusterName: string;
  shortName: string;
  oltName: string;
  kecamatan: string;
  kabupaten: string;
  startImpleDate?: string;
  homePasses?: number;
  projectType?: 'CLUSTER_SF' | 'MAIN_FEEDER';
  isActive?: boolean;
}) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !currentUser.permissions.sitelistManage) {
      return { success: false, error: 'Akses ditolak: Anda tidak memiliki izin mengelola Sitelist.' };
    }

    const shortName = input.shortName.trim().toUpperCase();
    if (!shortName) {
      return { success: false, error: 'Short Name / Nama Cluster wajib diisi.' };
    }
    if (!canAccessCity(currentUser, input.kabupaten)) {
      return {
        success: false,
        error: `Akses ditolak: Anda tidak memiliki akses untuk Kota "${input.kabupaten || 'Blora'}".`,
      };
    }

    let project = await prisma.project.findFirst();
    if (!project) {
      project = await prisma.project.create({
        data: {
          code: 'BLA-KEDUNGTUBAN',
          name: 'GCI',
          description: 'Proyek FTTH Rollout GCI',
        },
      });
    }

    // Check if cluster already exists by dbClusterId or by name
    const existing = input.dbClusterId
      ? await prisma.cluster.findUnique({
          where: { id: input.dbClusterId },
          include: { workItems: true },
        })
      : await prisma.cluster.findFirst({
          where: {
            projectId: project.id,
            name: shortName,
          },
          include: { workItems: true },
        });

    // If user chose "Belum Aktif" (isActive === false), deactivate/delete the cluster from active DB
    if (input.isActive === false) {
      if (existing) {
        await prisma.cluster.delete({
          where: { id: existing.id },
        });
        await backupDatabaseToNextcloud();
      }

      revalidatePath('/');
      revalidatePath('/sitelist');
      revalidatePath('/clusters');
      revalidatePath('/daily-input');
      revalidatePath('/matrix');

      return {
        success: true,
        clusterId: null,
        message: `Status cluster "${shortName}" berhasil diubah menjadi Belum Aktif!`,
      };
    }

    const formattedStartDate =
      input.startImpleDate && input.startImpleDate.trim()
        ? formatCanonicalReportDate(input.startImpleDate.trim())
        : null;
    const normalizedProjectType =
      input.projectType === 'MAIN_FEEDER' ? 'MAIN_FEEDER' : 'CLUSTER_SF';

    if (existing) {
      // Update metadata if already exists
      const updated = await prisma.cluster.update({
        where: { id: existing.id },
        data: {
          name: shortName,
          code: input.clusterId.trim() || existing.code,
          emrSiteCode: input.emrSiteCode.trim() || existing.emrSiteCode,
          subfeederId: input.subfeederId.trim() || existing.subfeederId,
          clusterName: input.clusterName.trim().toUpperCase() || existing.clusterName,
          oltName: input.oltName.trim() || existing.oltName,
          kecamatan: input.kecamatan.trim() || existing.kecamatan || 'Kedungtuban',
          kabupaten: input.kabupaten.trim() || existing.kabupaten || 'Blora',
          startImpleDate: input.startImpleDate !== undefined ? formattedStartDate : existing.startImpleDate,
          homePasses: input.homePasses !== undefined ? input.homePasses : existing.homePasses,
          projectType: input.projectType !== undefined ? normalizedProjectType : existing.projectType,
        },
      });

      await backupDatabaseToNextcloud();

      revalidatePath('/');
      revalidatePath('/sitelist');
      revalidatePath('/clusters');
      revalidatePath('/daily-input');
      revalidatePath('/matrix');

      return {
        success: true,
        clusterId: updated.id,
        message: `Cluster "${shortName}" berhasil diperbarui di proyek aktif!`,
      };
    }

    // Create new cluster
    const created = await prisma.cluster.create({
      data: {
        projectId: project.id,
        name: shortName,
        code: input.clusterId.trim() || `CLRM07-99-${shortName}`,
        emrSiteCode: input.emrSiteCode.trim() || '-',
        subfeederId: input.subfeederId.trim() || `SFM07-99-${shortName}`,
        clusterName: input.clusterName.trim().toUpperCase() || shortName,
        oltName: input.oltName.trim() || 'OLT Balun',
        kecamatan: input.kecamatan.trim() || 'Kedungtuban',
        kabupaten: input.kabupaten.trim() || 'Blora',
        startImpleDate: formattedStartDate,
        homePasses: input.homePasses || 0,
        projectType: normalizedProjectType,
      },
    });

    const defaultItemsForNewCluster =
      normalizedProjectType === 'MAIN_FEEDER'
        ? DEFAULT_MAIN_FEEDER_WORK_ITEMS
        : DEFAULT_WORK_ITEMS;

    // Create default weighted work items
    for (const wi of defaultItemsForNewCluster) {
      await prisma.workItem.create({
        data: {
          clusterId: created.id,
          scope: wi.scope,
          workType: wi.workType,
          category: wi.category,
          subCategory: wi.subCategory,
          weight: wi.weight,
          itemName: wi.itemName,
          unit: wi.unit,
          boq: 0,
          status: 'ONGOING',
          sortOrder: wi.sortOrder,
        },
      });
    }

    await backupDatabaseToNextcloud();

    revalidatePath('/');
    revalidatePath('/sitelist');
    revalidatePath('/clusters');
    revalidatePath('/daily-input');
    revalidatePath('/matrix');

    return {
      success: true,
      clusterId: created.id,
      message: `Cluster baru "${shortName}" (${input.kecamatan}, ${input.kabupaten}) berhasil ditambahkan dengan template BOQ 70:30!`,
    };
  } catch (error: unknown) {
    console.error('Error creating/activating cluster from sitelist:', error);
    const errMsg = error instanceof Error ? error.message : 'Gagal menambahkan cluster baru.';
    return { success: false, error: errMsg };
  }
}

export async function deactivateSitelistCluster(input: {
  dbClusterId?: string | null;
  shortName: string;
}) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !currentUser.permissions.sitelistManage) {
      return { success: false, error: 'Akses ditolak: Anda tidak memiliki izin menonaktifkan Sitelist.' };
    }

    const shortName = input.shortName.trim().toUpperCase();
    const target = input.dbClusterId
      ? await prisma.cluster.findUnique({ where: { id: input.dbClusterId } })
      : await prisma.cluster.findFirst({ where: { name: shortName } });

    if (!target) {
      return {
        success: false,
        error: `Cluster "${shortName}" sudah berstatus Belum Aktif.`,
      };
    }
    if (!canAccessCity(currentUser, target.kabupaten)) {
      return { success: false, error: 'Akses wilayah Kota ditolak.' };
    }

    await prisma.cluster.delete({
      where: { id: target.id },
    });

    await backupDatabaseToNextcloud();

    revalidatePath('/');
    revalidatePath('/sitelist');
    revalidatePath('/clusters');
    revalidatePath('/daily-input');
    revalidatePath('/matrix');

    return {
      success: true,
      message: `Status cluster "${target.name}" berhasil diubah dari Aktif menjadi Belum Aktif!`,
    };
  } catch (error: unknown) {
    console.error('Error deactivating sitelist cluster:', error);
    const errMsg = error instanceof Error ? error.message : 'Gagal menonaktifkan cluster.';
    return { success: false, error: errMsg };
  }
}

export async function activateAllSitelistClusters(kecamatanFilter?: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !currentUser.permissions.sitelistManage) {
      return { success: false, error: 'Akses ditolak: Anda tidak memiliki izin mengaktifkan Sitelist.' };
    }

    let project = await prisma.project.findFirst();
    if (!project) {
      project = await prisma.project.create({
        data: {
          code: 'BLA-KEDUNGTUBAN',
          name: 'GCI',
          description: 'Proyek FTTH Rollout GCI',
        },
      });
    }

    const existingClusters = await prisma.cluster.findMany({
      where: { projectId: project.id },
      select: { name: true, code: true },
    });
    const existingNames = new Set(
      existingClusters.flatMap((c) => {
        const n = c.name.trim().toLowerCase();
        const stripped = n.replace(/^kel(urahan)?\.?\s+/i, '').replace(/\s+blora$/i, '').trim();
        return [n, stripped];
      })
    );
    const existingCodes = new Set(existingClusters.map((c) => (c.code || '').trim().toLowerCase()));

    let addedCount = 0;

    for (const site of sitelistData.sites) {
      if (!canAccessCity(currentUser, site.kabupaten)) {
        continue;
      }
      if (
        kecamatanFilter &&
        kecamatanFilter !== 'ALL' &&
        site.kecamatan.toLowerCase() !== kecamatanFilter.toLowerCase()
      ) {
        continue;
      }

      if (
        existingNames.has(site.shortName.toLowerCase()) ||
        existingNames.has(site.clusterName.toLowerCase()) ||
        existingCodes.has(site.clusterId.toLowerCase())
      ) {
        continue;
      }

      const created = await prisma.cluster.create({
        data: {
          projectId: project.id,
          name: site.shortName.toUpperCase(),
          code: site.clusterId,
          emrSiteCode: site.emrSiteCode,
          subfeederId: site.subfeederId,
          clusterName: site.clusterName,
          oltName: site.oltName,
          kecamatan: site.kecamatan || 'Kedungtuban',
          kabupaten: site.kabupaten || 'Blora',
          homePasses: 0,
        },
      });

      for (const wi of DEFAULT_WORK_ITEMS) {
        await prisma.workItem.create({
          data: {
            clusterId: created.id,
            scope: wi.scope,
            workType: wi.workType,
            category: wi.category,
            subCategory: wi.subCategory,
            weight: wi.weight,
            itemName: wi.itemName,
            unit: wi.unit,
            boq: 0,
            status: 'ONGOING',
            sortOrder: wi.sortOrder,
          },
        });
      }

      existingNames.add(site.shortName.toLowerCase());
      addedCount++;
    }

    await backupDatabaseToNextcloud();

    revalidatePath('/');
    revalidatePath('/sitelist');
    revalidatePath('/clusters');
    revalidatePath('/daily-input');
    revalidatePath('/matrix');

    return {
      success: true,
      addedCount,
      message:
        addedCount > 0
          ? `Berhasil mengaktifkan ${addedCount} cluster dari Sitelist ke dalam proyek!`
          : 'Seluruh cluster pada filter ini sudah aktif di database.',
    };
  } catch (error: unknown) {
    console.error('Error activating all sitelist clusters:', error);
    const errMsg = error instanceof Error ? error.message : 'Gagal mengaktifkan sitelist.';
    return { success: false, error: errMsg };
  }
}

export interface ParsedSitelistImportRow {
  rowNumber: number;
  emrSiteCode: string;
  subfeederId: string;
  clusterId: string;
  clusterName: string;
  shortName: string;
  oltName: string;
  kota: string;
  startImpleDate: string;
  homePasses: number;
  projectType: 'CLUSTER_SF' | 'MAIN_FEEDER';
  existsInDb: boolean;
  existingClusterId: string | null;
}

function normalizeSitelistHeader(header: unknown): string {
  return String(header ?? '')
    .toLowerCase()
    .replace(/^\ufeff/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function formatExcelOrStringDate(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '';
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const yyyy = raw.getFullYear();
    const mm = String(raw.getMonth() + 1).padStart(2, '0');
    const dd = String(raw.getDate()).padStart(2, '0');
    return formatCanonicalReportDate(`${yyyy}-${mm}-${dd}`);
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 20000 && raw < 90000) {
    const parsed = excel.SSF.parse_date_code(raw);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const mm = String(parsed.m).padStart(2, '0');
      const dd = String(parsed.d).padStart(2, '0');
      return formatCanonicalReportDate(`${parsed.y}-${mm}-${dd}`);
    }
  }
  return formatCanonicalReportDate(String(raw).trim());
}

function deriveShortName(rawShort: string, rawClusterName: string, rawClusterId: string): string {
  if (rawShort.trim()) return rawShort.trim().toUpperCase();
  if (rawClusterName.trim()) {
    return rawClusterName
      .trim()
      .toUpperCase()
      .replace(/^KEL(URAHAN)?\.?\s+/i, '')
      .replace(/^DESA\.?\s+/i, '')
      .trim();
  }
  return rawClusterId.trim().toUpperCase();
}

export async function parseSitelistFile(
  fileBase64: string,
  filename: string
): Promise<{
  success: boolean;
  sheetName?: string;
  rows?: ParsedSitelistImportRow[];
  skippedCount?: number;
  detectedColumns?: string[];
  error?: string;
}> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !currentUser.permissions.sitelistManage) {
      return { success: false, error: 'Akses ditolak: Anda tidak memiliki izin mengimpor Sitelist.' };
    }

    if (!fileBase64) {
      return { success: false, error: 'File kosong atau gagal dibaca.' };
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    const isCsv = filename.toLowerCase().endsWith('.csv');

    let wb = excel.read(buffer, { type: 'buffer', cellDates: true });
    let sheetName = wb.SheetNames[0];
    let sheet = wb.Sheets[sheetName];
    let matrix = excel.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

    // Support semicolon-delimited CSV commonly exported by Indonesian Excel
    if (isCsv && matrix.length > 0 && matrix[0].length === 1 && String(matrix[0][0] ?? '').includes(';')) {
      const text = buffer.toString('utf8').replace(/^\ufeff/, '');
      wb = excel.read(text, { type: 'string', FS: ';', cellDates: true });
      sheetName = wb.SheetNames[0];
      sheet = wb.Sheets[sheetName];
      matrix = excel.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
    }

    if (!matrix || matrix.length < 2) {
      return { success: false, error: 'File tidak memiliki baris data yang dapat diimpor.' };
    }

    const headerAliases = new Set([
      'short name',
      'shortname',
      'nama cluster',
      'cluster name',
      'clustername',
      'cluster id',
      'clusterid',
      'emr site code',
      'emr code',
      'subfeeder id',
    ]);

    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(10, matrix.length); i++) {
      const row = matrix[i] || [];
      const hasKnownHeader = row.some((cell) => headerAliases.has(normalizeSitelistHeader(cell)));
      if (hasKnownHeader) {
        headerRowIdx = i;
        break;
      }
    }

    const rawHeaders = (matrix[headerRowIdx] || []).map((c) => String(c ?? '').trim());
    const normalizedHeaders = rawHeaders.map((h) => normalizeSitelistHeader(h));

    const findColIndex = (candidates: string[]) =>
      normalizedHeaders.findIndex((h) => candidates.includes(h));

    const colIdx = {
      emrSiteCode: findColIndex(['emr site code', 'emr code', 'site code', 'emr']),
      subfeederId: findColIndex(['subfeeder id', 'subfeeder', 'sf id']),
      clusterId: findColIndex(['cluster id', 'clusterid', 'kode cluster', 'code']),
      clusterName: findColIndex(['cluster name', 'clustername', 'nama lengkap', 'site name']),
      shortName: findColIndex(['short name', 'shortname', 'nama cluster', 'nama pendek', 'cluster']),
      oltName: findColIndex(['olt name', 'olt', 'nama olt']),
      kota: findColIndex(['kota', 'kebupaten', 'kabupaten', 'kab kota', 'kabupaten kota', 'city', 'wilayah', 'area']),
      startImpleDate: findColIndex(['start imple date', 'start date', 'tanggal mulai', 'mulai imple', 'start imple']),
      homePasses: findColIndex(['home passes', 'home pass', 'homepasses', 'homepass', 'hp']),
      projectType: findColIndex(['project type', 'kategori', 'scope', 'tipe', 'type']),
    };

    if (colIdx.shortName === -1 && colIdx.clusterName === -1 && colIdx.clusterId === -1) {
      return {
        success: false,
        error:
          'Header kolom tidak dikenali. Pastikan file memiliki minimal kolom "Short Name" / "Cluster Name" / "Cluster ID".',
      };
    }

    const existingClusters = await prisma.cluster.findMany({
      select: { id: true, name: true, code: true, emrSiteCode: true },
    });

    const rowMap = new Map<string, ParsedSitelistImportRow>();
    let skippedCount = 0;

    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const cells = matrix[r] || [];
      const getVal = (idx: number) => (idx >= 0 ? cells[idx] : '');
      const getStr = (idx: number) => String(getVal(idx) ?? '').trim();

      const rawShort = getStr(colIdx.shortName);
      const rawClusterName = getStr(colIdx.clusterName);
      const rawClusterId = getStr(colIdx.clusterId);
      const shortName = deriveShortName(rawShort, rawClusterName, rawClusterId);

      if (!shortName) {
        skippedCount++;
        continue;
      }

      const emrSiteCode = getStr(colIdx.emrSiteCode) || '-';
      const subfeederId = getStr(colIdx.subfeederId) || `SF-${shortName}`;
      const clusterId = rawClusterId || `CLR-${shortName}`;
      const clusterName = (rawClusterName || shortName).toUpperCase();
      const oltName = getStr(colIdx.oltName) || 'OLT';
      const kota = getStr(colIdx.kota);
      const startImpleDate = formatExcelOrStringDate(getVal(colIdx.startImpleDate));
      const rawHp = Number(String(getVal(colIdx.homePasses) ?? '0').replace(/[^\d.-]/g, ''));
      const homePasses = Number.isFinite(rawHp) && rawHp > 0 ? Math.round(rawHp) : 0;

      const rawType = getStr(colIdx.projectType).toUpperCase();
      const projectType: 'CLUSTER_SF' | 'MAIN_FEEDER' =
        rawType.includes('MAIN') ||
        rawType === 'MF' ||
        shortName.startsWith('MF ') ||
        shortName.startsWith('MF-') ||
        shortName.startsWith('MF_')
          ? 'MAIN_FEEDER'
          : 'CLUSTER_SF';

      const matched = existingClusters.find((c) => {
        const cName = c.name.trim().toLowerCase();
        const cCode = (c.code || '').trim().toLowerCase();
        const cEmr = (c.emrSiteCode || '').trim().toLowerCase();
        return (
          cName === shortName.toLowerCase() ||
          (clusterId && cCode === clusterId.toLowerCase()) ||
          (emrSiteCode !== '-' && cEmr === emrSiteCode.toLowerCase())
        );
      });

      rowMap.set(shortName, {
        rowNumber: r + 1,
        emrSiteCode,
        subfeederId,
        clusterId,
        clusterName,
        shortName,
        oltName,
        kota,
        startImpleDate,
        homePasses,
        projectType,
        existsInDb: Boolean(matched),
        existingClusterId: matched?.id ?? null,
      });
    }

    const rows = Array.from(rowMap.values());
    if (rows.length === 0) {
      return { success: false, error: 'Tidak ada baris cluster valid yang ditemukan di file.' };
    }

    return {
      success: true,
      sheetName,
      rows,
      skippedCount,
      detectedColumns: rawHeaders.filter(Boolean),
    };
  } catch (error: unknown) {
    console.error('Error parsing sitelist file:', error);
    const errMsg = error instanceof Error ? error.message : 'Gagal membaca file Excel / CSV.';
    return { success: false, error: errMsg };
  }
}

export async function commitSitelistImport(input: {
  rows: ParsedSitelistImportRow[];
  updateExisting: boolean;
  defaultKota?: string;
}) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !currentUser.permissions.sitelistManage) {
      return { success: false, error: 'Akses ditolak: Anda tidak memiliki izin menyimpan Impor Sitelist.' };
    }

    if (!input.rows || input.rows.length === 0) {
      return { success: false, error: 'Tidak ada data sitelist untuk diimpor.' };
    }

    const fallbackKotaCheck = input.defaultKota?.trim() || 'Blora';
    for (const r of input.rows) {
      const targetKota = r.kota.trim() || fallbackKotaCheck;
      if (!canAccessCity(currentUser, targetKota)) {
        return {
          success: false,
          error: `Akses ditolak: Anda tidak memiliki izin wilayah untuk Kota "${targetKota}".`,
        };
      }
    }

    await ensureDatabaseRestoredFromNextcloud();

    let project = await prisma.project.findFirst();
    if (!project) {
      project = await prisma.project.create({
        data: {
          code: 'BLA-KEDUNGTUBAN',
          name: 'GCI',
          description: 'Proyek FTTH Rollout GCI',
        },
      });
    }

    const existingClusters = await prisma.cluster.findMany({
      where: { projectId: project.id },
    });

    const fallbackKota = input.defaultKota?.trim() || 'Blora';
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const row of input.rows) {
      const shortName = row.shortName.trim().toUpperCase();
      if (!shortName) {
        skippedCount++;
        continue;
      }

      const existing = existingClusters.find((c) => {
        if (row.existingClusterId && c.id === row.existingClusterId) return true;
        return (
          c.name.trim().toLowerCase() === shortName.toLowerCase() ||
          (row.clusterId && (c.code || '').trim().toLowerCase() === row.clusterId.toLowerCase())
        );
      });

      const resolvedKota = row.kota.trim() || fallbackKota;
      const resolvedStartDate = row.startImpleDate.trim()
        ? formatCanonicalReportDate(row.startImpleDate.trim())
        : null;
      const normalizedProjectType =
        row.projectType === 'MAIN_FEEDER' ? 'MAIN_FEEDER' : 'CLUSTER_SF';

      if (existing) {
        if (!input.updateExisting) {
          skippedCount++;
          continue;
        }

        await prisma.cluster.update({
          where: { id: existing.id },
          data: {
            code: row.clusterId.trim() || existing.code,
            emrSiteCode: row.emrSiteCode.trim() && row.emrSiteCode !== '-' ? row.emrSiteCode.trim() : existing.emrSiteCode,
            subfeederId: row.subfeederId.trim() || existing.subfeederId,
            clusterName: row.clusterName.trim().toUpperCase() || existing.clusterName,
            oltName: row.oltName.trim() || existing.oltName,
            kabupaten: resolvedKota,
            startImpleDate: resolvedStartDate || existing.startImpleDate,
            homePasses: row.homePasses > 0 ? row.homePasses : existing.homePasses,
            projectType: normalizedProjectType,
          },
        });
        updatedCount++;
      } else {
        const created = await prisma.cluster.create({
          data: {
            projectId: project.id,
            name: shortName,
            code: row.clusterId.trim() || `CLR-${shortName}`,
            emrSiteCode: row.emrSiteCode.trim() || '-',
            subfeederId: row.subfeederId.trim() || `SF-${shortName}`,
            clusterName: row.clusterName.trim().toUpperCase() || shortName,
            oltName: row.oltName.trim() || 'OLT',
            kecamatan: '-',
            kabupaten: resolvedKota,
            startImpleDate: resolvedStartDate,
            homePasses: row.homePasses || 0,
            projectType: normalizedProjectType,
          },
        });

        const templateItems =
          normalizedProjectType === 'MAIN_FEEDER'
            ? DEFAULT_MAIN_FEEDER_WORK_ITEMS
            : DEFAULT_WORK_ITEMS;

        for (const wi of templateItems) {
          await prisma.workItem.create({
            data: {
              clusterId: created.id,
              scope: wi.scope,
              workType: wi.workType,
              category: wi.category,
              subCategory: wi.subCategory,
              weight: wi.weight,
              itemName: wi.itemName,
              unit: wi.unit,
              boq: 0,
              status: 'ONGOING',
              sortOrder: wi.sortOrder,
            },
          });
        }

        existingClusters.push(created);
        createdCount++;
      }
    }

    await backupDatabaseToNextcloud();

    revalidatePath('/');
    revalidatePath('/sitelist');
    revalidatePath('/clusters');
    revalidatePath('/daily-input');
    revalidatePath('/matrix');

    const parts: string[] = [];
    if (createdCount > 0) parts.push(`${createdCount} cluster baru ditambahkan`);
    if (updatedCount > 0) parts.push(`${updatedCount} cluster diperbarui`);
    if (skippedCount > 0) parts.push(`${skippedCount} dilewati`);

    return {
      success: true,
      createdCount,
      updatedCount,
      skippedCount,
      message: `Impor Sitelist selesai: ${parts.join(', ') || 'tidak ada perubahan'}.`,
    };
  } catch (error: unknown) {
    console.error('Error committing sitelist import:', error);
    const errMsg = error instanceof Error ? error.message : 'Gagal menyimpan impor sitelist.';
    return { success: false, error: errMsg };
  }
}
