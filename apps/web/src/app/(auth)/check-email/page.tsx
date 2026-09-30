import Link from 'next/link';
import { AuthShell, Card } from '@/components/ui';

export default async function CheckEmailPage({ searchParams }: PageProps<'/check-email'>) {
  const { email } = await searchParams;
  const address = typeof email === 'string' ? email : 'your inbox';

  return (
    <AuthShell title="Check your email">
      <p>
        We sent a verification link to <strong>{address}</strong>. Click it to finish creating your account — you’ll be
        signed in automatically.
      </p>
      <Card>
        <p className="text-sm text-muted">Can’t find it? Check your spam folder. You can request a new link from the sign-in page.</p>
      </Card>
      <Link href="/sign-in" className="block text-center text-sm text-accent hover:underline">
        Back to sign in
      </Link>
    </AuthShell>
  );
}
