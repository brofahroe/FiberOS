import { prisma } from '@/lib/prisma';
import DailyInputClient from './DailyInputClient';

export const revalidate = 0;

export default async function DailyInputPage({
  searchParams,
}: {
  searchParams: { clusterId?: string };
}) {
  const clusters = await prisma.cluster.findMany({
    select: {
      id: true,
      name: true,
      homePasses: true,
    },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="py-2">
      <DailyInputClient
        clusters={clusters}
        initialClusterId={searchParams.clusterId}
      />
    </div>
  );
}

