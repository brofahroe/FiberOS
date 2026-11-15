'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import sitelistData from '@/data/sitelist.json';
import { calculateClusterProgress, DEFAULT_BOQ_WORK_ITEMS } from '@/lib/progressCalculator';
import { cleanupLegacyRawBoqItems } from '@/actions/importBoq';
import {
  backupDatabaseToNextcloud,
  ensureDatabaseRestoredFromNextcloud,
  formatCanonicalReportDate,
  parseReportDateMs,
} from '@/lib/dbSync';

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

      const calc = calculateClusterProgress(calcInput);
      const status: SitelistEntry['status'] =
        calc.totalWeightedPercentage >= 100
          ? 'COMPLETED'
          : calc.totalWeightedPercentage > 0
          ? 'IN_PROGRESS'
          : 'NOT_STARTED';

      return {
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
        clusterName: c.clusterName || `KELURAHAN ${c.name.toUpperCase()} BLORA`,
        shortName: c.name.toUpperCase(),
        oltName: c.oltName || 'OLT Balun',
        kecamatan: c.kecamatan || 'Kedungtuban',
        kabupaten: c.kabupaten || 'Blora',
        startImpleDate: resolveStartImpleDate(c),
        homePasses: c.homePasses || 0,
        ...stats,
      });
    }

    // 3. Build Summaries per Kecamatan and per Kabupaten
    const buildSummaryGroup = (
      groupType: 'KECAMATAN' | 'KABUPATEN'
    ): RegionSummaryItem[] => {
      const map = new Map<string, SitelistEntry[]>();
      for (const e of entries) {
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
      entries,
      kecamatanSummaries,
      kabupatenSummaries,
      kecamatanList: Array.from(new Set(entries.map((e) => e.kecamatan))).sort(),
      kabupatenList: Array.from(new Set(entries.map((e) => e.kabupaten))).sort(),
      oltList: Array.from(new Set(entries.map((e) => e.oltName))).sort(),
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
  isActive?: boolean;
}) {
  try {
    const shortName = input.shortName.trim().toUpperCase();
    if (!shortName) {
      return { success: false, error: 'Short Name / Nama Cluster wajib diisi.' };
    }

    let project = await prisma.project.findFirst();
    if (!project) {
      project = await prisma.project.create({
        data: {
          code: 'BLA-KEDUNGTUBAN',
          name: 'GCI-MTI BLORA',
          description: 'Proyek FTTH Rollout Kedungtuban & Cepu Blora',
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
        clusterName: input.clusterName.trim().toUpperCase() || `KELURAHAN ${shortName} BLORA`,
        oltName: input.oltName.trim() || 'OLT Balun',
        kecamatan: input.kecamatan.trim() || 'Kedungtuban',
        kabupaten: input.kabupaten.trim() || 'Blora',
        startImpleDate: formattedStartDate,
        homePasses: input.homePasses || 0,
      },
    });

    // Create default weighted work items (Cluster 70% + Subfeeder 30%)
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
    let project = await prisma.project.findFirst();
    if (!project) {
      project = await prisma.project.create({
        data: {
          code: 'BLA-KEDUNGTUBAN',
          name: 'GCI-MTI BLORA',
          description: 'Proyek FTTH Rollout Kedungtuban & Cepu Blora',
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
