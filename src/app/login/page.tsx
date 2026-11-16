import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import LoginClient from './LoginClient';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { redirect?: string };
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect('/');
  }

  return <LoginClient redirectTo={searchParams.redirect} />;
}
