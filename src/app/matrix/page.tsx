import { redirect } from 'next/navigation';
import { getMatrixData } from '@/actions/matrix';
import { getCurrentUser } from '@/lib/auth';
import { getFirstAllowedPath } from '@/lib/permissions';
import MatrixClient from './MatrixClient';

export const revalidate = 0;

export default async function MatrixPage({
  searchParams,
}: {
  searchParams: { clusterId?: string };
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect('/login');
  }
  if (currentUser.mustChangePassword) {
    redirect('/profile?firstLogin=1');
  }
  if (!currentUser.permissions.matrixView) {
    redirect(getFirstAllowedPath(currentUser));
  }

  const data = await getMatrixData(searchParams.clusterId);

  return (
    <div className="py-2">
      <MatrixClient
        dates={data.dates}
        matrixRows={data.matrixRows}
        clustersList={data.clustersList}
        initialClusterId={searchParams.clusterId}
        canExport={currentUser.permissions.matrixExport}
        canEditStatus={currentUser.permissions.matrixEditStatus}
        canEditCells={currentUser.permissions.dailyInputEditScope !== 'NONE'}
      />
    </div>
  );
}

