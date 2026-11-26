import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getMasterTeams } from '@/lib/timPelaksana';
import { getCurrentUser } from '@/lib/auth';
import {
  canAccessCity,
  getFirstAllowedPath,
  hasAnyDailyInputAccess,
} from '@/lib/permissions';
import DailyInputClient from './DailyInputClient';

export const revalidate = 0;

export default async function DailyInputPage({
  searchParams,
}: {
  searchParams: { clusterId?: string; date?: string; team?: string };
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect('/login');
  }
  if (currentUser.mustChangePassword) {
    redirect('/profile?firstLogin=1');
  }
  if (!hasAnyDailyInputAccess(currentUser.permissions)) {
    redirect(getFirstAllowedPath(currentUser));
  }

  let clusters: any[] = [];
  try {
    const rawClusters = await prisma.cluster.findMany({
      select: {
        id: true,
        name: true,
        homePasses: true,
        kabupaten: true,
      },
      orderBy: { name: 'asc' },
    });
    clusters = rawClusters
      .filter((c) => canAccessCity(currentUser, c.kabupaten))
      .map(({ id, name, homePasses }) => ({ id, name, homePasses }));
  } catch (err) {
    console.error('Error fetching clusters for daily input:', err);
  }

  const masterTeams = await getMasterTeams();

  return (
    <div className="py-2">
      <DailyInputClient
        clusters={clusters}
        masterTeams={masterTeams}
        loggedInUserName={currentUser.fullName || currentUser.username}
        currentUserRole={currentUser.role}
        allowedCities={currentUser.allowedCities}
        canCreate={currentUser.permissions.dailyInputCreate}
        canExportWa={currentUser.permissions.matrixExport}
        initialClusterId={searchParams.clusterId}
        initialDate={searchParams.date}
        initialTeam={searchParams.team}
      />
    </div>
  );
}

