import { prisma } from '@/lib/prisma';
import { getMasterTeams } from '@/lib/timPelaksana';
import DailyInputClient from './DailyInputClient';

export const revalidate = 0;

export default async function DailyInputPage({
  searchParams,
}: {
  searchParams: { clusterId?: string; date?: string; team?: string };
}) {
  let clusters: any[] = [];
  try {
    clusters = await prisma.cluster.findMany({
      select: {
        id: true,
        name: true,
        homePasses: true,
      },
      orderBy: { name: 'asc' },
    });
  } catch (err) {
    console.error('Error fetching clusters for daily input:', err);
  }

  const masterTeams = getMasterTeams();

  return (
    <div className="py-2">
      <DailyInputClient
        clusters={clusters}
        masterTeams={masterTeams}
        initialClusterId={searchParams.clusterId}
        initialDate={searchParams.date}
        initialTeam={searchParams.team}
      />
    </div>
  );
}

