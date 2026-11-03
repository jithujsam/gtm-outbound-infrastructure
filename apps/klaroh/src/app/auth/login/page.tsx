'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import AuthBranding, { AuthMobileBrand } from '@/components/AuthBranding';
import { Field, FormError } from '@/components/ui/Field';
import PasswordInput from '@/components/ui/PasswordInput';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (next.email || next.password) {
      (next.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

      if (signInError) {
        setError('Email or password is incorrect.');
        return;
      }

      router.push('/dashboard');
    } catch {
      setError('Something went wrong. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full lg:pl-[50%]">
      <AuthBranding
        headline="The client visibility platform for lead gen agencies."
        supporting="Automate your reporting, unify your data streams, and build absolute trust with your clients through transparent, real-time dashboards."
      />

      <section className="flex min-h-screen w-full items-center justify-center bg-surface-container-lowest px-6 py-12">
        <div className="w-full max-w-md">
          <AuthMobileBrand />
          <div className="mb-8">
            <h1 className="type-page-title text-on-surface">Welcome back</h1>
            <p className="mt-1 text-sm text-on-surface-variant">Access your client performance dashboards.</p>
          </div>

          <div className="mb-6">
            <FormError>{error}</FormError>
          </div>

          <form onSubmit={handleLogin} noValidate className="space-y-5">
            <Field label="Agency Email" error={errors.email}>
              {(p) => (
                <input
                  {...p}
                  ref={emailRef}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrors((x) => ({ ...x, email: undefined }));
                  }}
                  placeholder="name@agency.com"
                  disabled={loading}
                  className={clsx('input', errors.email && 'input-error')}
                />
              )}
            </Field>

            <div>
              <Field
                label="Password"
                error={errors.password}
              >
                {(p) => (
                  <PasswordInput
                    {...p}
                    ref={passwordRef}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrors((x) => ({ ...x, password: undefined }));
                    }}
                    placeholder="••••••••"
                    disabled={loading}
                    className={clsx(errors.password && 'input-error')}
                  />
                )}
              </Field>
              <p className="mt-2 text-right text-xs">
                <Link href="/auth/reset-password" className="font-medium text-primary hover:underline">
                  Forgot your password?
                </Link>
              </p>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-on-surface-variant">
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" className="font-medium text-primary hover:underline">
              Start free trial
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
