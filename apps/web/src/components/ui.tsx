import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export { Field } from './field';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-bold tracking-widest text-accent">TALKEL</p>
          <h1 className="text-3xl font-bold text-fg">{title}</h1>
          {subtitle ? <p className="text-muted">{subtitle}</p> : null}
        </div>
        {children}
        <nav className="flex justify-center gap-5 pt-4 text-xs text-muted">
          <Link href="/privacy" className="hover:text-fg">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-fg">
            Terms
          </Link>
          <Link href="/delete-account" className="hover:text-fg">
            Delete account
          </Link>
        </nav>
      </div>
    </main>
  );
}

export function Button({
  variant = 'primary',
  loading,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; loading?: boolean }) {
  const styles = {
    primary: 'bg-accent text-white hover:brightness-110',
    secondary: 'bg-raised text-fg hover:brightness-125',
    ghost: 'text-accent hover:underline',
  }[variant];
  return (
    <button
      className={`w-full rounded-full px-5 py-3.5 font-semibold transition disabled:opacity-50 ${styles} ${className}`}
      disabled={props.disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-surface p-5 ${className}`}>{children}</section>;
}
