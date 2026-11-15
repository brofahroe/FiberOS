'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { uploadFileToNextcloud } from '@/lib/nextcloud';
import { backupDatabaseToNextcloud, ensureDatabaseRestoredFromNextcloud } from '@/lib/dbSync';
import sitelistData from '@/data/sitelist.json';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function normalizeToDdMmmYy(dateStr: string): string {
  const trimmed = (dateStr || '').trim();
  const parts = trimmed.split('-');
  if (parts.length === 3 && isNaN(Number(parts[1]))) {
    const dayNum = parseInt(parts[0], 10);
    const monthMatch = MONTHS_SHORT.find((m) => m.toLowerCase() === parts[1].toLowerCase());
    const yr = parts[2].slice(-2);
    if (!isNaN(dayNum) && monthMatch) {
      return `${String(dayNum).padStart(2, '0')}-${monthMatch}-${yr}`;
    }
  }
  if (parts.length === 3 && parts[0].length === 4) {
    const year = parts[0].slice(-2);
    const mIdx = parseInt(parts[1], 10) - 1;
    const dayNum = parseInt(parts[2], 10);
    if (!isNaN(dayNum) && mIdx >= 0 && mIdx < 12) {
      return `${String(dayNum).padStart(2, '0')}-${MONTHS_SHORT[mIdx]}-${year}`;
    }
  }
  return trimmed;
}

function getDateVariants(dateStr: string): string[] {
  const canonical = normalizeToDdMmmYy(dateStr);
  const parts = canonical.split('-');
  if (parts.length === 3) {
    const dayNum = parseInt(parts[0], 10);
    if (!isNaN(dayNum)) {
      const padded = `${String(dayNum).padStart(2, '0')}-${parts[1]}-${parts[2]}`;
      const unpadded = `${dayNum}-${parts[1]}-${parts[2]}`;
      return Array.from(new Set([dateStr.trim(), canonical, padded, unpadded]));
    }
  }
  return Array.from(new Set([dateStr.trim(), canonical]));
}

async function resolveOrProvisionCluster(clusterIdOrCode: string) {
  if (!clusterIdOrCode) return null;

  // 1. Try direct ID lookup
  let cluster = await prisma.cluster.findUnique({
    where: { id: clusterIdOrCode },
    include: {
      workItems: {
        include: { progressList: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (cluster) return cluster;

  // 2. Match against sitelist.json or existing clusters by name/code
  const lower = clusterIdOrCode.trim().toLowerCase();
  const matchedSite = sitelistData.sites.find(
    (s) =>
      s.clusterId.toLowerCase() === lower ||
      s.shortName.toLowerCase() === lower ||
      s.clusterName.toLowerCase() === lower ||
      s.emrSiteCode.toLowerCase() === lower
  );

  const allClusters = await prisma.cluster.findMany({
    include: {
      workItems: {
        include: { progressList: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  cluster =
    allClusters.find((c) => {
      const cName = c.name.trim().toLowerCase();
      const cStripped = cName.replace(/^kel(urahan)?\.?\s+/i, '').replace(/\s+blora$/i, '').trim();
      const cCode = (c.code || '').trim().toLowerCase();
      if (cName === lower || cStripped === lower || cCode === lower) return true;
      if (matchedSite) {
        return (
          cName === matchedSite.shortName.toLowerCase() ||
          cStripped === matchedSite.shortName.toLowerCase() ||
          cName === matchedSite.clusterName.toLowerCase() ||
          cCode === matchedSite.clusterId.toLowerCase()
        );
      }
      return false;
    }) || null;

  if (cluster) return cluster;

  // 3. Auto-provision if found in sitelist.json but not yet in DB
  if (matchedSite) {
    let project = await prisma.project.findFirst();
    if (!project) {
      project = await prisma.project.create({
        data: {
          code: 'BLA-KEDUNGTUBAN',
          name: 'GCI-MTI BLORA',
          description: 'Proyek FTTH Rollout Kedungtuban Blora',
        },
      });
    }

    const newCluster = await prisma.cluster.create({
      data: {
        projectId: project.id,
        name: matchedSite.shortName,
        code: matchedSite.clusterId,
        homePasses: 0,
      },
    });

    const defaultWorkItems = [
      { scope: 'CLUSTER', workType: 'CW', category: 'POLE', subCategory: 'POLE', weight: 40, itemName: 'Pole 7m "2.5"', unit: 'Unit', sortOrder: 1 },
      { scope: 'CLUSTER', workType: 'CW', category: 'POLE', subCategory: 'POLE', weight: 40, itemName: 'Pole 7m "3"', unit: 'Unit', sortOrder: 2 },
      { scope: 'CLUSTER', workType: 'CW', category: 'POLE', subCategory: 'POLE', weight: 40, itemName: 'Pole 7m "4"', unit: 'Unit', sortOrder: 3 },
      { scope: 'CLUSTER', workType: 'CW', category: 'CABLE', subCategory: 'CABLE', weight: 20, itemName: 'Kabel 24c', unit: 'Meter', sortOrder: 4 },
      { scope: 'CLUSTER', workType: 'CW', category: 'CABLE', subCategory: 'CABLE', weight: 20, itemName: 'Kabel 36c', unit: 'Meter', sortOrder: 5 },
      { scope: 'CLUSTER', workType: 'CW', category: 'CABLE', subCategory: 'CABLE', weight: 20, itemName: 'Kabel 48c', unit: 'Meter', sortOrder: 6 },
      { scope: 'CLUSTER', workType: 'CW', category: 'CABLE', subCategory: 'CABLE', weight: 20, itemName: 'Kabel 96c', unit: 'Meter', sortOrder: 7 },
      { scope: 'CLUSTER', workType: 'CW', category: 'CABLE', subCategory: 'CABLE', weight: 20, itemName: 'Kabel 144c', unit: 'Meter', sortOrder: 8 },
      { scope: 'CLUSTER', workType: 'EL', category: 'FAT', subCategory: 'FAT', weight: 25, itemName: 'FAT', unit: 'Unit', sortOrder: 9 },
      { scope: 'CLUSTER', workType: 'EL', category: 'FDT', subCategory: 'FDT', weight: 5, itemName: 'FDT48', unit: 'Unit', sortOrder: 10 },
      { scope: 'CLUSTER', workType: 'EL', category: 'FDT', subCategory: 'FDT', weight: 5, itemName: 'FDT72', unit: 'Unit', sortOrder: 11 },
      { scope: 'SUBFEEDER', workType: 'CW', category: 'POLE', subCategory: 'POLE', weight: 50, itemName: 'Pole 7m "4"', unit: 'Unit', sortOrder: 100 },
      { scope: 'SUBFEEDER', workType: 'CW', category: 'CABLE', subCategory: 'CABLE', weight: 20, itemName: 'Kabel 48c', unit: 'Meter', sortOrder: 101 },
      { scope: 'SUBFEEDER', workType: 'EL', category: 'JC', subCategory: 'JC', weight: 20, itemName: 'Joint Closure (JC)', unit: 'Unit', sortOrder: 102 },
    ];

    for (const wi of defaultWorkItems) {
      await prisma.workItem.create({
        data: {
          clusterId: newCluster.id,
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

    return prisma.cluster.findUnique({
      where: { id: newCluster.id },
      include: {
        workItems: {
          include: { progressList: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  return null;
}

export async function getClusterItemsForForm(clusterId: string) {
  await ensureDatabaseRestoredFromNextcloud();
  const cluster = await resolveOrProvisionCluster(clusterId);

  if (!cluster) return null;

  const items = cluster.workItems.map((item) => {
    const installed = item.progressList.reduce((sum, p) => sum + p.quantity, 0);
    const isDone = item.status === 'DONE';
    const remaining = isDone ? 0 : Math.max(0, item.boq - installed);
    const status = item.status || (remaining === 0 && item.boq > 0 ? 'DONE' : 'ONGOING');
    return {
      id: item.id,
      scope: item.scope || 'CLUSTER',
      workType: item.workType || 'CW',
      category: item.category,
      subCategory: item.subCategory,
      weight: item.weight || 0,
      itemName: item.itemName,
      unit: item.unit,
      boq: item.boq,
      installed: installed,
      remaining: remaining,
      status: status,
    };
  });

  return {
    cluster: {
      id: cluster.id,
      name: cluster.name,
      homePasses: cluster.homePasses,
    },
    items,
  };
}

export async function submitDailyProgress(data: {
  clusterId: string;
  reportDate: string;
  reporterName: string;
  teamName: string;
  weather?: string;
  notes?: string;
  photoBase64List?: string[];
  items: Array<{ workItemId: string; quantity: number }>;
}) {
  const teamName = typeof data.teamName === 'string' ? data.teamName.trim() : '';
  if (!teamName) {
    return { success: false, error: 'Nama Tim Pelaksana wajib diisi.' };
  }

  try {
    await ensureDatabaseRestoredFromNextcloud();
    // Resolve clusterId in case a sitelist code was passed
    const resolvedCluster = await resolveOrProvisionCluster(data.clusterId);
    const targetClusterId = resolvedCluster ? resolvedCluster.id : data.clusterId;

    const canonicalDate = normalizeToDdMmmYy(data.reportDate);
    const dateVariants = getDateVariants(data.reportDate);

    // Find if report already exists for this cluster, date (either dd-mmm-yy or d-mmm-yy), and team
    const existingReport = await prisma.dailyReport.findFirst({
      where: {
        clusterId: targetClusterId,
        reportDate: { in: dateVariants },
        teamName,
      },
      include: { items: true },
    });

    const existingQtyMap = new Map<string, number>();
    if (existingReport) {
      existingReport.items.forEach((it) => existingQtyMap.set(it.workItemId, it.quantity));
    }

    // Check if any item to submit is already marked as DONE and attempting to add new volume
    for (const item of data.items) {
      const prevQty = existingQtyMap.get(item.workItemId) || 0;
      if (item.quantity > prevQty) {
        const workItem = await prisma.workItem.findUnique({
          where: { id: item.workItemId },
        });
        if (workItem && workItem.status === 'DONE') {
          return {
            success: false,
            error: `Item "${workItem.itemName}" sudah berstatus DONE (Final) dan tidak boleh ada penambahan volume lagi.`,
          };
        }
      }
    }

    // Process photos with Nextcloud cloud storage
    const savedPhotoPaths: string[] = [];
    if (data.photoBase64List && data.photoBase64List.length > 0) {
      for (let i = 0; i < data.photoBase64List.length; i++) {
        const photoStr = data.photoBase64List[i];

        // If it's already an uploaded URL from a previous save, keep it
        if (photoStr.startsWith('/api/photos/') || photoStr.startsWith('http')) {
          savedPhotoPaths.push(photoStr);
          continue;
        }

        const matches = photoStr.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const mimeType = matches[1];
          const ext = mimeType.includes('png') ? 'png' : 'jpg';
          const buffer = Buffer.from(matches[2], 'base64');
          const fileName = `doc-${Date.now()}-${i}.${ext}`;

          try {
            // Upload to Nextcloud under foto-imple/[clusterId]
            const uploadRes = await uploadFileToNextcloud({
              buffer,
              fileName,
              subFolder: targetClusterId,
              contentType: mimeType,
            });

            if (uploadRes.success) {
              savedPhotoPaths.push(uploadRes.url);
            } else {
              console.warn('Nextcloud upload failed, using fallback:', uploadRes.error);
              savedPhotoPaths.push(photoStr);
            }
          } catch (err) {
            console.error('Nextcloud upload error:', err);
            savedPhotoPaths.push(photoStr);
          }
        } else {
          savedPhotoPaths.push(photoStr);
        }
      }
    }

    let report;
    if (existingReport) {
      // Update existing report details (replace notes and photos cleanly so edit mode doesn't duplicate)
      report = await prisma.dailyReport.update({
        where: { id: existingReport.id },
        data: {
          reportDate: canonicalDate,
          reporterName: data.reporterName !== undefined ? data.reporterName : existingReport.reporterName,
          teamName,
          weather: data.weather || existingReport.weather,
          notes: data.notes !== undefined ? data.notes : existingReport.notes,
          photos:
            data.photoBase64List !== undefined
              ? savedPhotoPaths.length > 0
                ? JSON.stringify(savedPhotoPaths)
                : null
              : existingReport.photos,
        },
      });
    } else {
      // Create new daily report
      report = await prisma.dailyReport.create({
        data: {
          clusterId: targetClusterId,
          reportDate: canonicalDate,
          reporterName: data.reporterName,
          teamName,
          weather: data.weather,
          notes: data.notes,
          photos: savedPhotoPaths.length > 0 ? JSON.stringify(savedPhotoPaths) : null,
        },
      });
    }

    // Upsert items progress (use set/replace so edits overwrite correctly)
    for (const item of data.items) {
      if (item.quantity > 0) {
        await prisma.dailyProgressItem.upsert({
          where: {
            dailyReportId_workItemId: {
              dailyReportId: report.id,
              workItemId: item.workItemId,
            },
          },
          update: {
            quantity: item.quantity,
          },
          create: {
            dailyReportId: report.id,
            workItemId: item.workItemId,
            quantity: item.quantity,
          },
        });
      } else {
        // If user set quantity to 0 in edit mode, remove it from progress
        await prisma.dailyProgressItem.deleteMany({
          where: {
            dailyReportId: report.id,
            workItemId: item.workItemId,
          },
        });
      }
    }

    await backupDatabaseToNextcloud();

    revalidatePath('/');
    revalidatePath('/matrix');
    revalidatePath('/clusters');
    revalidatePath('/sitelist');

    return { success: true, message: 'Laporan progres harian berhasil disimpan!' };
  } catch (error: any) {
    console.error('Error submitting daily progress:', error);
    return { success: false, error: error.message || 'Gagal menyimpan progres' };
  }
}

export async function getDailyReportTeams(clusterId: string, reportDate: string) {
  try {
    const dateVariants = getDateVariants(reportDate);
    const reports = await prisma.dailyReport.findMany({
      where: { clusterId, reportDate: { in: dateVariants }, teamName: { not: null } },
      select: { teamName: true },
      distinct: ['teamName'],
      orderBy: { teamName: 'asc' },
    });

    return {
      success: true,
      teams: Array.from(new Set(
        reports
          .map((report) => report.teamName?.trim() || '')
          .filter((name) => name.length > 0)
      )),
    };
  } catch (error: any) {
    console.error('Error fetching report teams:', error);
    return { success: false, teams: [], error: error.message || 'Gagal memuat daftar tim.' };
  }
}

export async function getExistingDailyReport(clusterId: string, reportDate: string, teamName: string) {
  try {
    const normalizedTeamName = teamName.trim();
    if (!normalizedTeamName) return { exists: false, report: null };

    const dateVariants = getDateVariants(reportDate);
    const report = await prisma.dailyReport.findFirst({
      where: {
        clusterId,
        reportDate: { in: dateVariants },
        teamName: normalizedTeamName,
      },
      include: {
        items: true,
      },
    });

    if (!report) return { exists: false, report: null };

    return {
      exists: true,
      report: {
        id: report.id,
        reporterName: report.reporterName || '',
        teamName: report.teamName || normalizedTeamName,
        weather: report.weather || 'Cerah',
        notes: report.notes || '',
        photos: report.photos ? JSON.parse(report.photos) : [],
        items: report.items.map((it) => ({
          workItemId: it.workItemId,
          quantity: it.quantity,
        })),
      },
    };
  } catch (error: any) {
    console.error('Error getting existing report:', error);
    return { exists: false, error: error.message };
  }
}

export async function updateDailyCellProgress(
  clusterId: string,
  workItemId: string,
  reportDate: string,
  newQuantity: number
) {
  try {
    const reportsForDate = await prisma.dailyReport.findMany({
      where: { clusterId, reportDate },
      select: { teamName: true },
    });
    const teams = new Set(
      reportsForDate
        .map((report) => report.teamName?.trim() || '')
        .filter(Boolean)
    );
    if (teams.size > 1) {
      return {
        success: false,
        error: 'Koreksi Matriks dinonaktifkan karena tanggal ini memiliki laporan dari beberapa tim.',
      };
    }

    // 1. Find or create DailyReport for this cluster and date
    let report = await prisma.dailyReport.findFirst({
      where: {
        clusterId,
        reportDate,
      },
    });

    if (!report) {
      report = await prisma.dailyReport.create({
        data: {
          clusterId,
          reportDate,
          reporterName: 'Supervisor Lapangan',
          teamName: 'Tim FTTH Blora',
          notes: 'Koreksi progres via Matriks',
        },
      });
    } else {
      await prisma.dailyReport.update({
        where: { id: report.id },
        data: { updatedAt: new Date() },
      });
    }

    // 2. If newQuantity <= 0, delete or zero out the item
    if (newQuantity <= 0) {
      await prisma.dailyProgressItem.deleteMany({
        where: {
          dailyReportId: report.id,
          workItemId,
        },
      });
    } else {
      // 3. Upsert with the exact newQuantity
      await prisma.dailyProgressItem.upsert({
        where: {
          dailyReportId_workItemId: {
            dailyReportId: report.id,
            workItemId,
          },
        },
        update: {
          quantity: newQuantity,
        },
        create: {
          dailyReportId: report.id,
          workItemId,
          quantity: newQuantity,
        },
      });
    }

    await backupDatabaseToNextcloud();

    revalidatePath('/');
    revalidatePath('/matrix');
    revalidatePath('/clusters');
    revalidatePath('/sitelist');

    return { success: true, message: `Progres tanggal ${reportDate} berhasil diperbarui.` };
  } catch (error: any) {
    console.error('Error updating cell progress:', error);
    return { success: false, error: error.message || 'Gagal memperbarui progres cell.' };
  }
}

export async function deleteDailyReportByDate(clusterId: string, reportDate: string, teamName: string) {
  try {
    const normalizedTeamName = teamName.trim();
    if (!normalizedTeamName) {
      return { success: false, error: 'Nama Tim Pelaksana wajib diisi untuk menghapus laporan.' };
    }

    const dateVariants = getDateVariants(reportDate);
    const report = await prisma.dailyReport.findFirst({
      where: {
        clusterId,
        reportDate: { in: dateVariants },
        teamName: normalizedTeamName,
      },
    });

    if (!report) {
      return { success: false, error: 'Laporan tidak ditemukan.' };
    }

    // Delete progress items first (cascade will handle it, but explicit delete is safe)
    await prisma.dailyProgressItem.deleteMany({
      where: { dailyReportId: report.id },
    });

    await prisma.dailyReport.delete({
      where: { id: report.id },
    });

    await backupDatabaseToNextcloud();

    revalidatePath('/');
    revalidatePath('/matrix');
    revalidatePath('/clusters');
    revalidatePath('/sitelist');

    return { success: true, message: `Laporan progres tanggal ${reportDate} berhasil dihapus.` };
  } catch (error: any) {
    console.error('Error deleting daily report:', error);
    return { success: false, error: error.message || 'Gagal menghapus laporan.' };
  }
}

export async function getDailyReportsHistory(limit: number = 50) {
  try {
    const reports = await prisma.dailyReport.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        cluster: {
          select: { id: true, name: true },
        },
        items: {
          include: {
            workItem: {
              select: { itemName: true, unit: true, scope: true, category: true },
            },
          },
        },
      },
    });

    return { success: true, reports };
  } catch (error: any) {
    console.error('Error fetching reports history:', error);
    return { success: false, reports: [] };
  }
}

