import { getMatrixData } from '@/actions/matrix';
import MatrixClient from './MatrixClient';

export const revalidate = 0;

export default async function MatrixPage({
  searchParams,
}: {
  searchParams: { clusterId?: string };
}) {
  const data = await getMatrixData(searchParams.clusterId);

  return (
    <div className="py-2">
      <MatrixClient
        dates={data.dates}
        matrixRows={data.matrixRows}
        clustersList={data.clustersList}
        initialClusterId={searchParams.clusterId}
      />
    </div>
  );
}

