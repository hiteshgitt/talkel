import { redirect } from 'next/navigation';
import { getMe } from '@/lib/server-api';

export default async function Home() {
  const me = await getMe();
  redirect(me ? '/dashboard' : '/sign-in');
}
