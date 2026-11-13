'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';
import { uploadFileToNextcloud } from '@/lib/nextcloud';

export async function getClusterItemsForForm(clusterId: string) {
  const cluster = await prisma.cluster.findUnique({
    where: { id: clusterId },
    include: {
      workItems: {
        include: {
          progressList: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

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
  try {
    // Check if any item to submit is already marked as DONE
    for (const item of data.items) {
      if (item.quantity > 0) {
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
              subFolder: data.clusterId,
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

    // Find if report already exists for this cluster and date
    let report = await prisma.dailyReport.findFirst({
      where: {
        clusterId: data.clusterId,
        reportDate: data.reportDate,
      },
    });

    if (report) {
      // Update existing report details
      report = await prisma.dailyReport.update({
        where: { id: report.id },
        data: {
          reporterName: data.reporterName || report.reporterName,
          teamName: data.teamName || report.teamName,
          weather: data.weather || report.weather,
          notes: data.notes ? `${report.notes ? report.notes + ' | ' : ''}${data.notes}` : report.notes,
          photos: savedPhotoPaths.length > 0 
            ? JSON.stringify([...(report.photos ? JSON.parse(report.photos) : []), ...savedPhotoPaths])
            : report.photos,
        },
      });
    } else {
      // Create new daily report
      report = await prisma.dailyReport.create({
        data: {
          clusterId: data.clusterId,
          reportDate: data.reportDate,
          reporterName: data.reporterName,
          teamName: data.teamName,
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

    revalidatePath('/');
    revalidatePath('/matrix');
    revalidatePath('/clusters');

    return { success: true, message: 'Laporan progres harian berhasil disimpan!' };
  } catch (error: any) {
    console.error('Error submitting daily progress:', error);
    return { success: false, error: error.message || 'Gagal menyimpan progres' };
  }
}

export async function getExistingDailyReport(clusterId: string, reportDate: string) {
  try {
    const report = await prisma.dailyReport.findFirst({
      where: {
        clusterId,
        reportDate,
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
        teamName: report.teamName || '',
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

    revalidatePath('/');
    revalidatePath('/matrix');
    revalidatePath('/clusters');

    return { success: true, message: `Progres tanggal ${reportDate} berhasil diperbarui.` };
  } catch (error: any) {
    console.error('Error updating cell progress:', error);
    return { success: false, error: error.message || 'Gagal memperbarui progres cell.' };
  }
}

export async function deleteDailyReportByDate(clusterId: string, reportDate: string) {
  try {
    const report = await prisma.dailyReport.findFirst({
      where: {
        clusterId,
        reportDate,
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

    revalidatePath('/');
    revalidatePath('/matrix');
    revalidatePath('/clusters');

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

