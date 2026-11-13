'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';

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
      category: item.category,
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

    // Process photos if any
    const savedPhotoPaths: string[] = [];
    if (data.photoBase64List && data.photoBase64List.length > 0) {
      for (let i = 0; i < data.photoBase64List.length; i++) {
        const base64Str = data.photoBase64List[i];
        if (process.env.VERCEL) {
          // On Vercel serverless, store compressed base64 directly in database
          savedPhotoPaths.push(base64Str);
        } else {
          try {
            const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
            if (!fs.existsSync(uploadsDir)) {
              fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const matches = base64Str.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
              const ext = matches[1].includes('png') ? 'png' : 'jpg';
              const buffer = Buffer.from(matches[2], 'base64');
              const fileName = `doc-${Date.now()}-${i}.${ext}`;
              const filePath = path.join(uploadsDir, fileName);
              fs.writeFileSync(filePath, buffer);
              savedPhotoPaths.push(`/uploads/${fileName}`);
            } else {
              savedPhotoPaths.push(base64Str);
            }
          } catch {
            // Fallback to base64 if filesystem is read-only
            savedPhotoPaths.push(base64Str);
          }
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

    // Upsert items progress
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
            quantity: {
              increment: item.quantity,
            },
          },
          create: {
            dailyReportId: report.id,
            workItemId: item.workItemId,
            quantity: item.quantity,
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

