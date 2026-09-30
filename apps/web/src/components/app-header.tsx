import Link from 'next/link';
import type { Me } from '@speakai/contracts';
import { SignOutButton } from './sign-out-button';

export function AppHeader({ me }: { me: Me }) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/dashboard" className="text-sm font-bold tracking-widest text-accent">
          SPEAKAI
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/dashboard" className="text-muted hover:text-fg">
            Dashboard
          </Link>
          {me.user.role === 'admin' ? (
            <Link href="/admin" className="text-muted hover:text-fg">
              Admin
            </Link>
          ) : null}
          <SignOutButton />
        </nav>
      </div>
    </header>
  );
}
