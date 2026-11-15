import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NEXTCLOUD_URL = (process.env.NEXTCLOUD_URL || 'https://drive.gciconnect.my.id').replace(/\/$/, '');
const NEXTCLOUD_USER = process.env.NEXTCLOUD_USER || 'gcibot';
const NEXTCLOUD_PASSWORD = process.env.NEXTCLOUD_PASSWORD || 'Gcidesign#1';
const NEXTCLOUD_DIR = (process.env.NEXTCLOUD_DIR || 'foto-imple').replace(/^\/|\/$/g, '');

const authHeader = `Basic ${Buffer.from(`${NEXTCLOUD_USER}:${NEXTCLOUD_PASSWORD}`).toString('base64')}`;
const davBaseUrl = `${NEXTCLOUD_URL}/remote.php/dav/files/${encodeURIComponent(NEXTCLOUD_USER)}`;
const BACKUP_REMOTE_PATH = `${NEXTCLOUD_DIR}/_system_db/fiberos-state.json`;

async function main() {
  console.log('☁️ Checking Nextcloud for persistent database snapshot...');
  try {
    const targetUrl = `${davBaseUrl}/${encodeURI(BACKUP_REMOTE_PATH)}`;
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: { Authorization: authHeader },
    });

    if (res.status !== 200) {
      console.log(`ℹ️ No existing cloud snapshot found on Nextcloud (status ${res.status}). Skipping restore.`);
      return;
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.projects) || data.projects.length === 0) {
      console.log('ℹ️ Cloud snapshot is empty. Skipping restore.');
      return;
    }

    console.log(`📥 Restoring database snapshot from Nextcloud (exported at ${data.exportedAt})...`);

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

      const restoredClusterIds = [];

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

        const workItemIdMap = new Map();

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
          const restoredReportIds = [];
          for (const rep of cl.dailyReports) {
            const teamName = rep.teamName || 'Tim FTTH Blora';
            const dbReport = await prisma.dailyReport.upsert({
              where: {
                clusterId_reportDate_teamName: {
                  clusterId: dbCluster.id,
                  reportDate: rep.reportDate,
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
                reportDate: rep.reportDate,
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

    console.log('✅ Cloud database snapshot restored successfully!');
  } catch (err) {
    console.warn('⚠️ Could not restore snapshot from Nextcloud:', err.message);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
