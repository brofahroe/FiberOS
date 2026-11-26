import { redirect } from 'next/navigation';
import { getSitelistData } from '@/actions/sitelist';
import { getCurrentUser } from '@/lib/auth';
import { getFirstAllowedPath } from '@/lib/permissions';
import SitelistClient from './SitelistClient';

export const revalidate = 0;

export default async function SitelistPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect('/login');
  }
  if (currentUser.mustChangePassword) {
    redirect('/profile?firstLogin=1');
  }
  if (!currentUser.permissions.sitelistView && !currentUser.permissions.sitelistManage) {
    redirect(getFirstAllowedPath(currentUser));
  }

  const data = await getSitelistData();

  return (
    <div className="py-2">
      <SitelistClient
        initialEntries={data.entries}
        kecamatanSummaries={data.kecamatanSummaries}
        kabupatenSummaries={data.kabupatenSummaries}
        kecamatanList={data.kecamatanList}
        kabupatenList={data.kabupatenList}
        oltList={data.oltList}
        canManage={currentUser.permissions.sitelistManage}
        canCreateInput={currentUser.permissions.dailyInputCreate}
        canViewMatrix={currentUser.permissions.matrixView}
      />
    </div>
  );
}
