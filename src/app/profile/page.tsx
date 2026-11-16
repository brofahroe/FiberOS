import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import ProfileClient from './ProfileClient';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { firstLogin?: string };
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  return (
    <div className="py-2">
      <ProfileClient
        user={user}
        isFirstLoginPrompt={user.mustChangePassword || searchParams.firstLogin === '1'}
      />
    </div>
  );
}
