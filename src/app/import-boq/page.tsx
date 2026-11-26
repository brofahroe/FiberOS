import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getFirstAllowedPath } from '@/lib/permissions';
import ImportBoqClient from './ImportBoqClient';

export const metadata = {
  title: 'Impor Master BOQ - FiberOS',
};

export default async function ImportBoqPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect('/login');
  }
  if (currentUser.mustChangePassword) {
    redirect('/profile?firstLogin=1');
  }
  if (!currentUser.permissions.importBoq) {
    redirect(getFirstAllowedPath(currentUser));
  }

  return (
    <div className="py-2">
      <ImportBoqClient />
    </div>
  );
}

