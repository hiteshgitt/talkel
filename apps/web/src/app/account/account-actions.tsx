'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorText, Field } from '@/components/ui';
import { authClient } from '@/lib/auth-client';

export function AccountActions({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch('/v1/me/export', { credentials: 'include' });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'talkel-data.json';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    const { error } = await authClient.deleteUser(hasPassword ? { password } : {});
    setDeleting(false);
    if (error) {
      setDeleteError(
        error.code === 'INVALID_PASSWORD'
          ? 'That password is incorrect.'
          : error.code === 'SESSION_EXPIRED'
            ? 'For your security, please sign out, sign in again, and then delete your account.'
            : (error.message ?? 'Could not delete your account.'),
      );
      return;
    }
    router.replace('/sign-in?deleted=1');
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Download your data</h2>
        <p className="text-sm text-muted">
          One file with everything Talkel stores about you: your account, settings, every conversation with its transcript and
          feedback, missions, progress and memories.
        </p>
        <Button variant="secondary" onClick={() => void download()} loading={downloading}>
          Download my data (JSON)
        </Button>
        <ErrorText>{downloadError}</ErrorText>
      </section>

      <section className="space-y-3 border-t border-line pt-6">
        <h2 className="text-lg font-semibold text-danger">Delete your account</h2>
        <p className="text-sm text-muted">
          This permanently deletes your account and everything in it — conversations, transcripts, feedback, recordings,
          mission progress and memories. It can’t be undone.
        </p>
        {!confirming ? (
          <Button variant="secondary" className="!text-danger" onClick={() => setConfirming(true)}>
            Delete my account…
          </Button>
        ) : (
          <div className="space-y-4">
            {hasPassword ? (
              <Field label="Your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            ) : (
              <p className="text-sm text-muted">You signed in with Google. If this was more than a day ago, sign out and back in first.</p>
            )}
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              <span>I understand my account and all my data will be permanently deleted.</span>
            </label>
            <ErrorText>{deleteError}</ErrorText>
            <Button className="!bg-danger" onClick={() => void deleteAccount()} loading={deleting} disabled={!understood || (hasPassword && !password)}>
              Permanently delete my account
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep my account
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
