import { prisma } from '@/lib/prisma';
import DailyInputClient from './DailyInputClient';

export const revalidate = 0;

export default async function DailyInputPage({
  searchParams,
}: {
  searchParams: { clusterId?: string };
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

  return (
    <div className="py-2">
      <DailyInputClient
        clusters={clusters}
        initialClusterId={searchParams.clusterId}
      />
    </div>
  );
}

