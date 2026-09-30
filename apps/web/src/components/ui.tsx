import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-bold tracking-widest text-accent">SPEAKAI</p>
          <h1 className="text-3xl font-bold text-fg">{title}</h1>
          {subtitle ? <p className="text-muted">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </main>
  );
}

export function Field({ label, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-muted">{label}</span>
      <input
        className="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-fg outline-none placeholder:text-muted focus:border-accent"
        {...input}
      />
    </label>
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
