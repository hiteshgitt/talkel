import Link from 'next/link';
import type { Me } from '@speakai/contracts';
import { Brand } from './brand';
import { SignOutButton } from './sign-out-button';

export function AppHeader({ me }: { me: Me }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line/80 bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Brand size={28} />
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/dashboard" className="text-muted hover:text-fg">
            Dashboard
          </Link>
          <Link href="/account" className="text-muted hover:text-fg">
            Account
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
