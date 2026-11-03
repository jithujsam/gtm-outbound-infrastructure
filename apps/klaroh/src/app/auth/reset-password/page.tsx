'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import clsx from 'clsx';
import { ArrowLeft, Loader2 } from 'lucide-react';
import AuthBranding, { AuthMobileBrand } from '@/components/AuthBranding';
import { Field, FormError } from '@/components/ui/Field';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [error, setError] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const problem = !email.trim() ? 'Enter your email address.' : !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address.' : '';
    setEmailError(problem);
    if (problem) {
      emailRef.current?.focus();
      return;
    }
    setLoading(true);

    try {
      const supabase = createClient();
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/reset-password-confirm`,
      });

      setSubmitted(true);
    } catch (err) {
      console.error('Error:', err);
      setError('We couldn\'t send the link. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full lg:pl-[50%]">
      <AuthBranding
        headline="Reset your access in seconds."
        supporting="We'll email you a secure link to set a new password and get you back to your dashboards."
      />

      <section className="flex min-h-screen w-full items-center justify-center bg-surface-container-lowest px-6 py-12">
        <div className="w-full max-w-md">
          <AuthMobileBrand />
          <div className="mb-8">
            <h1 className="type-page-title text-on-surface">Forgot password</h1>
            <p className="mt-1 text-sm text-on-surface-variant">Enter your agency email and we&apos;ll send you a reset link.</p>
          </div>

          {submitted ? (
            <div className="space-y-6">
              <div role="status" className="rounded-lg border border-primary-fixed bg-primary-fixed/30 p-4">
                <p className="text-sm text-primary">Check your email for a password reset link. It will expire in 1 hour.</p>
              </div>
              <Link href="/auth/login" className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:underline">
                <ArrowLeft size={16} aria-hidden="true" />
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} noValidate className="space-y-5">
              <FormError>{error}</FormError>

              <Field label="Agency Email" error={emailError}>
                {(p) => (
                  <input
                    {...p}
                    ref={emailRef}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailError('');
                    }}
                    placeholder="name@agency.com"
                    disabled={loading}
                    className={clsx('input', emailError && 'input-error')}
                  />
                )}
              </Field>

              <button type="submit" disabled={loading} className="btn btn-primary w-full">
                {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                {loading ? 'Sending…' : 'Send reset link'}
              </button>

              <Link href="/auth/login" className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:underline">
                <ArrowLeft size={16} aria-hidden="true" />
                Back to sign in
              </Link>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
