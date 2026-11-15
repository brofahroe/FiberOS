import { prisma } from '@/lib/prisma';
import { ensureNextcloudDir, getFileFromNextcloud } from '@/lib/nextcloud';

const NEXTCLOUD_URL = (process.env.NEXTCLOUD_URL || 'https://drive.gciconnect.my.id').replace(/\/$/, '');
const NEXTCLOUD_USER = process.env.NEXTCLOUD_USER || 'gcibot';
const NEXTCLOUD_PASSWORD = process.env.NEXTCLOUD_PASSWORD || 'Gcidesign#1';
const NEXTCLOUD_DIR = (process.env.NEXTCLOUD_DIR || 'foto-imple').replace(/^\/|\/$/g, '');

const authHeader = `Basic ${Buffer.from(`${NEXTCLOUD_USER}:${NEXTCLOUD_PASSWORD}`).toString('base64')}`;
const davBaseUrl = `${NEXTCLOUD_URL}/remote.php/dav/files/${encodeURIComponent(NEXTCLOUD_USER)}`;

const BACKUP_SUBFOLDER = '_system_db';
const BACKUP_FILENAME = 'fiberos-state.json';
const BACKUP_REMOTE_PATH = `${NEXTCLOUD_DIR}/${BACKUP_SUBFOLDER}/${BACKUP_FILENAME}`;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatCanonicalReportDate(dateStr: string): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  const parts = trimmed.split(/[-/]/);

  // dd-mmm-yy, d-mmm-yy, or dd-mmm-yyyy (e.g., 19-Oct-2026, 9-Nov-26)
  if (parts.length === 3 && isNaN(Number(parts[1]))) {
    const dayNum = parseInt(parts[0], 10);
    const monthMatch = MONTHS_SHORT.find(
      (m) => m.toLowerCase() === parts[1].trim().slice(0, 3).toLowerCase()
    );
    const yearNum = parseInt(parts[2], 10);
    if (!isNaN(dayNum) && monthMatch && !isNaN(yearNum)) {
      const yy = String(yearNum).slice(-2).padStart(2, '0');
      return `${String(dayNum).padStart(2, '0')}-${monthMatch}-${yy}`;
    }
  }

  // YYYY-MM-DD (e.g., 2026-10-19)
  if (parts.length === 3 && parts[0].length === 4 && !isNaN(Number(parts[1]))) {
    const yearNum = parseInt(parts[0], 10);
    const monthIdx = parseInt(parts[1], 10) - 1;
    const dayNum = parseInt(parts[2], 10);
    if (!isNaN(dayNum) && monthIdx >= 0 && monthIdx < 12 && !isNaN(yearNum)) {
      const yy = String(yearNum).slice(-2).padStart(2, '0');
      return `${String(dayNum).padStart(2, '0')}-${MONTHS_SHORT[monthIdx]}-${yy}`;
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY
  if (parts.length === 3 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1]))) {
    const dayNum = parseInt(parts[0], 10);
    const monthIdx = parseInt(parts[1], 10) - 1;
    const yearNum = parseInt(parts[2], 10);
    if (!isNaN(dayNum) && monthIdx >= 0 && monthIdx < 12 && !isNaN(yearNum)) {
      const yy = String(yearNum).slice(-2).padStart(2, '0');
      return `${String(dayNum).padStart(2, '0')}-${MONTHS_SHORT[monthIdx]}-${yy}`;
    }
  }

  return trimmed;
}

export function parseReportDateMs(dateStr: string): number {
  if (!dateStr) return 0;
  const canonical = formatCanonicalReportDate(dateStr);
  const parts = canonical.split('-');
  if (parts.length === 3 && isNaN(Number(parts[1]))) {
    const day = parseInt(parts[0], 10);
    const monthIdx = MONTHS_SHORT.findIndex((m) => m.toLowerCase() === parts[1].toLowerCase());
    const rawYear = parseInt(parts[2], 10);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (!isNaN(day) && monthIdx >= 0 && !isNaN(year)) {
      return new Date(year, monthIdx, day).getTime();
    }
  }
  return new Date(dateStr).getTime() || 0;
}

/**
 * Normalizes any existing DailyReport.reportDate records in SQLite (e.g. "19-Oct-2026" -> "19-Oct-26",
 * "9-Nov-26" -> "09-Nov-26") and backs up the cleaned state to Nextcloud.
 */
export async function normalizeDatabaseReportDates(): Promise<void> {
  try {
    const reports = await prisma.dailyReport.findMany({
      include: { items: true },
    });

    let changedCount = 0;

    for (const report of reports) {
      const canonical = formatCanonicalReportDate(report.reportDate);
      if (!canonical || canonical === report.reportDate) continue;

      const teamName = report.teamName || 'Tim FTTH Blora';
      const existingTarget = await prisma.dailyReport.findUnique({
        where: {
          clusterId_reportDate_teamName: {
            clusterId: report.clusterId,
            reportDate: canonical,
            teamName,
          },
        },
        include: { items: true },
      });

      if (existingTarget && existingTarget.id !== report.id) {
        for (const item of report.items) {
          const prev = existingTarget.items.find((i) => i.workItemId === item.workItemId);
          const mergedQty = prev ? Math.max(prev.quantity, item.quantity) : item.quantity;
          await prisma.dailyProgressItem.upsert({
            where: {
              dailyReportId_workItemId: {
                dailyReportId: existingTarget.id,
                workItemId: item.workItemId,
              },
            },
            update: { quantity: mergedQty },
            create: {
              dailyReportId: existingTarget.id,
              workItemId: item.workItemId,
              quantity: mergedQty,
            },
          });
        }
        await prisma.dailyReport.delete({ where: { id: report.id } });
      } else {
        await prisma.dailyReport.update({
          where: { id: report.id },
          data: { reportDate: canonical },
        });
      }
      changedCount++;
    }

    if (changedCount > 0) {
      await backupDatabaseToNextcloud();
    }
  } catch (err) {
    console.warn('Error normalizing database report dates:', err);
  }
}

let hasRestoredInThisProcess = false;
let isRestoring = false;

/**
 * Exports the entire Prisma database (Projects, Clusters, WorkItems, DailyReports, DailyProgressItems)
 * to Nextcloud WebDAV so container rebuilds/redeployments never lose data.
 */
export async function backupDatabaseToNextcloud(): Promise<boolean> {
  try {
    const projects = await prisma.project.findMany({
      include: {
        clusters: {
          include: {
            workItems: true,
            dailyReports: {
              include: {
                items: true,
              },
            },
          },
        },
      },
    });

    if (projects.length === 0) return false;

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      projects,
    };

    const targetDir = `${NEXTCLOUD_DIR}/${BACKUP_SUBFOLDER}`;
    await ensureNextcloudDir(targetDir);

    const targetUrl = `${davBaseUrl}/${encodeURI(BACKUP_REMOTE_PATH)}`;
    const bodyBuffer = Buffer.from(JSON.stringify(payload), 'utf-8');

    const res = await fetch(targetUrl, {
      method: 'PUT',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: new Uint8Array(bodyBuffer),
      cache: 'no-store',
    });

    if (res.status === 200 || res.status === 201 || res.status === 204) {
      return true;
    }
    console.warn('Nextcloud DB backup returned status:', res.status);
    return false;
  } catch (err) {
    console.error('Error backing up database to Nextcloud:', err);
    return false;
  }
}

/**
 * Restores database state from Nextcloud WebDAV if a cloud backup exists.
 * Called once per server startup so ephemeral Docker container deployments keep 100% of user data.
 */
export async function ensureDatabaseRestoredFromNextcloud(): Promise<void> {
  if (hasRestoredInThisProcess || isRestoring) return;
  isRestoring = true;

  try {
    const res = await getFileFromNextcloud(BACKUP_REMOTE_PATH);
    if (!res) {
      // No backup on Nextcloud yet -> create initial backup from current DB state
      hasRestoredInThisProcess = true;
      await backupDatabaseToNextcloud();
      return;
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.projects) || data.projects.length === 0) {
      hasRestoredInThisProcess = true;
      return;
    }

    for (const proj of data.projects) {
      const dbProject = await prisma.project.upsert({
        where: { code: proj.code },
        update: {
          name: proj.name,
          description: proj.description,
        },
        create: {
          id: proj.id,
          code: proj.code,
          name: proj.name,
          description: proj.description,
          createdAt: proj.createdAt ? new Date(proj.createdAt) : undefined,
        },
      });

      if (!Array.isArray(proj.clusters)) continue;

      const restoredClusterIds: string[] = [];

      for (const cl of proj.clusters) {
        const dbCluster = await prisma.cluster.upsert({
          where: {
            projectId_name: {
              projectId: dbProject.id,
              name: cl.name,
            },
          },
          update: {
            code: cl.code,
            emrSiteCode: cl.emrSiteCode,
            subfeederId: cl.subfeederId,
            clusterName: cl.clusterName,
            oltName: cl.oltName,
            kecamatan: cl.kecamatan,
            kabupaten: cl.kabupaten || 'Blora',
            homePasses: cl.homePasses ?? 0,
          },
          create: {
            id: cl.id,
            projectId: dbProject.id,
            name: cl.name,
            code: cl.code,
            emrSiteCode: cl.emrSiteCode,
            subfeederId: cl.subfeederId,
            clusterName: cl.clusterName,
            oltName: cl.oltName,
            kecamatan: cl.kecamatan,
            kabupaten: cl.kabupaten || 'Blora',
            homePasses: cl.homePasses ?? 0,
            createdAt: cl.createdAt ? new Date(cl.createdAt) : undefined,
          },
        });
        restoredClusterIds.push(dbCluster.id);

        // Map old workItem.id -> actual dbWorkItem.id in case IDs differed
        const workItemIdMap = new Map<string, string>();

        if (Array.isArray(cl.workItems)) {
          for (const wi of cl.workItems) {
            const dbWi = await prisma.workItem.upsert({
              where: {
                clusterId_scope_itemName: {
                  clusterId: dbCluster.id,
                  scope: wi.scope || 'CLUSTER',
                  itemName: wi.itemName,
                },
              },
              update: {
                workType: wi.workType || 'CW',
                category: wi.category,
                subCategory: wi.subCategory,
                weight: wi.weight ?? 0,
                unit: wi.unit,
                boq: wi.boq ?? 0,
                status: wi.status || 'ONGOING',
                sortOrder: wi.sortOrder ?? 0,
              },
              create: {
                id: wi.id,
                clusterId: dbCluster.id,
                scope: wi.scope || 'CLUSTER',
                workType: wi.workType || 'CW',
                category: wi.category,
                subCategory: wi.subCategory,
                weight: wi.weight ?? 0,
                itemName: wi.itemName,
                unit: wi.unit,
                boq: wi.boq ?? 0,
                status: wi.status || 'ONGOING',
                sortOrder: wi.sortOrder ?? 0,
                createdAt: wi.createdAt ? new Date(wi.createdAt) : undefined,
              },
            });
            workItemIdMap.set(wi.id, dbWi.id);
          }

          const validWiIds = Array.from(workItemIdMap.values());
          await prisma.workItem.deleteMany({
            where: {
              clusterId: dbCluster.id,
              id: { notIn: validWiIds },
            },
          });
        }

        if (Array.isArray(cl.dailyReports)) {
          const restoredReportIds: string[] = [];
          for (const rep of cl.dailyReports) {
            const teamName = rep.teamName || 'Tim FTTH Blora';
            const normalizedReportDate = formatCanonicalReportDate(rep.reportDate);
            const dbReport = await prisma.dailyReport.upsert({
              where: {
                clusterId_reportDate_teamName: {
                  clusterId: dbCluster.id,
                  reportDate: normalizedReportDate,
                  teamName,
                },
              },
              update: {
                reporterName: rep.reporterName,
                weather: rep.weather,
                notes: rep.notes,
                photos: rep.photos,
                updatedAt: rep.updatedAt ? new Date(rep.updatedAt) : undefined,
              },
              create: {
                id: rep.id,
                clusterId: dbCluster.id,
                reportDate: normalizedReportDate,
                reporterName: rep.reporterName,
                teamName,
                weather: rep.weather,
                notes: rep.notes,
                photos: rep.photos,
                createdAt: rep.createdAt ? new Date(rep.createdAt) : undefined,
                updatedAt: rep.updatedAt ? new Date(rep.updatedAt) : undefined,
              },
            });
            restoredReportIds.push(dbReport.id);

            if (Array.isArray(rep.items)) {
              for (const item of rep.items) {
                const targetWorkItemId = workItemIdMap.get(item.workItemId) || item.workItemId;
                // Verify targetWorkItemId exists
                const existsWi = await prisma.workItem.findUnique({
                  where: { id: targetWorkItemId },
                  select: { id: true },
                });
                if (!existsWi) continue;

                await prisma.dailyProgressItem.upsert({
                  where: {
                    dailyReportId_workItemId: {
                      dailyReportId: dbReport.id,
                      workItemId: targetWorkItemId,
                    },
                  },
                  update: {
                    quantity: item.quantity,
                    updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
                  },
                  create: {
                    id: item.id,
                    dailyReportId: dbReport.id,
                    workItemId: targetWorkItemId,
                    quantity: item.quantity,
                    createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
                    updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
                  },
                });
              }
            }
          }

          await prisma.dailyReport.deleteMany({
            where: {
              clusterId: dbCluster.id,
              id: { notIn: restoredReportIds },
            },
          });
        }
      }

      // Remove any local seed clusters that were deactivated/deleted in the cloud snapshot
      await prisma.cluster.deleteMany({
        where: {
          projectId: dbProject.id,
          id: { notIn: restoredClusterIds },
        },
      });
    }

    hasRestoredInThisProcess = true;
    await normalizeDatabaseReportDates();
  } catch (err) {
    console.error('Error restoring database from Nextcloud:', err);
  } finally {
    isRestoring = false;
  }
}
