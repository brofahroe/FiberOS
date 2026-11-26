import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import {
  canAccessCity,
  getFirstAllowedPath,
  hasAnyDailyInputAccess,
} from '@/lib/permissions';
import { calculateClusterProgress, sortWorkItems } from '@/lib/progressCalculator';
import ClustersBoqClient, { type ClusterBoqView } from './ClustersBoqClient';

export const revalidate = 0;

export default async function ClustersPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect('/login');
  }
  if (currentUser.mustChangePassword) {
    redirect('/profile?firstLogin=1');
  }
  if (!currentUser.permissions.clustersView && !currentUser.permissions.clustersEdit) {
    redirect(getFirstAllowedPath(currentUser));
  }

  let clusterViews: ClusterBoqView[] = [];

  try {
    const rawClusters = await prisma.cluster.findMany({
      include: {
        workItems: {
          include: {
            progressList: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const clusters = rawClusters.filter((c) => canAccessCity(currentUser, c.kabupaten));

    clusterViews = clusters.map((cluster) => {
      const calcInput = cluster.workItems.map((it) => {
        const installed = it.progressList.reduce((sum, p) => sum + p.quantity, 0);
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

      const clusterCalc = calculateClusterProgress(calcInput, {
        projectType: cluster.projectType,
      });

      const sortedRawItems = sortWorkItems(cluster.workItems);
      const items = sortedRawItems.map((it) => {
        const installed = it.progressList.reduce((sum, p) => sum + p.quantity, 0);
        const isDone = it.status === 'DONE';
        const remaining = isDone ? 0 : Math.max(0, it.boq - installed);
        const percentage = isDone
          ? 100
          : it.boq > 0
          ? Math.min(100, Math.round((installed / it.boq) * 100))
          : installed > 0
          ? 100
          : 0;

        return {
          id: it.id,
          itemName: it.itemName,
          scope: it.scope,
          category: it.category,
          unit: it.unit,
          boq: it.boq,
          installed: Math.round(installed * 10) / 10,
          remaining: Math.round(remaining * 10) / 10,
          percentage,
          status: it.status || 'ONGOING',
        };
      });

      return {
        id: cluster.id,
        name: cluster.name,
        homePasses: cluster.homePasses,
        projectType: cluster.projectType === 'MAIN_FEEDER' ? 'MAIN_FEEDER' : 'CLUSTER_SF',
        totalWeightedPercentage: clusterCalc.totalWeightedPercentage,
        clrPercentage: clusterCalc.clr.scopePercentage,
        sfPercentage: clusterCalc.sf.scopePercentage,
        items,
      };
    });
  } catch (err) {
    console.error('Error fetching clusters:', err);
  }

  return (
    <ClustersBoqClient
      initialClusters={clusterViews}
      canEdit={currentUser.permissions.clustersEdit}
      canCreateInput={hasAnyDailyInputAccess(currentUser.permissions)}
      canViewMatrix={currentUser.permissions.matrixView}
    />
  );
}
