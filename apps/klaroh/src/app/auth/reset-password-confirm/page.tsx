'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { Field, FormError } from '@/components/ui/Field';
import PasswordInput from '@/components/ui/PasswordInput';

export default function ResetPasswordConfirmPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check if user came from reset link
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setError('Invalid or expired reset link');
      }
    });
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 8 characters, the same minimum as sign-up.
    const next: { password?: string; confirm?: string } = {};
    if (password.length < 8) next.password = 'Use at least 8 characters.';
    if (confirmPassword !== password) next.confirm = 'The passwords do not match.';
    setErrors(next);
    if (next.password || next.confirm) {
      (next.password ? passwordRef : confirmRef).current?.focus();
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/auth/login'), 2000);
    } catch {
      setError('Something went wrong. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl shadow-modal border border-outline-variant/50 bg-surface-container-lowest p-8">
          <h1 className="type-page-title text-on-surface">New password</h1>
          <p className="mt-1 mb-8 text-sm text-on-surface-variant">Choose a new password for your Klaroh account.</p>

          {success ? (
            <div role="status" className="rounded-lg border border-primary-fixed bg-primary-fixed/30 p-4">
              <p className="text-sm text-primary">
                Password updated successfully. Redirecting to sign in…
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <FormError>{error}</FormError>
              </div>

              <form onSubmit={handleResetPassword} noValidate className="space-y-5">
                <Field label="New Password" error={errors.password} hint="Minimum 8 characters.">
                  {(p) => (
                    <PasswordInput
                      {...p}
                      ref={passwordRef}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setErrors((x) => ({ ...x, password: undefined }));
                      }}
                      placeholder="At least 8 characters"
                      disabled={loading}
                      className={clsx(errors.password && 'input-error')}
                    />
                  )}
                </Field>

                <Field label="Confirm Password" error={errors.confirm}>
                  {(p) => (
                    <PasswordInput
                      {...p}
                      ref={confirmRef}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setErrors((x) => ({ ...x, confirm: undefined }));
                      }}
                      placeholder="Repeat the password"
                      disabled={loading}
                      className={clsx(errors.confirm && 'input-error')}
                    />
                  )}
                </Field>

                <button type="submit" disabled={loading} className="btn btn-primary w-full">
                  {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                  {loading ? 'Updating…' : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
