'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import AuthBranding, { AuthMobileBrand } from '@/components/AuthBranding';
import { Field, FormError } from '@/components/ui/Field';
import PasswordInput from '@/components/ui/PasswordInput';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Errors = Partial<Record<'agency' | 'website' | 'email' | 'password' | 'terms', string>>;

export default function SignupPage() {
  const router = useRouter();
  const [agencyName, setAgencyName] = useState('');
  const [agencyWebsite, setAgencyWebsite] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const agencyRef = useRef<HTMLInputElement>(null);
  const websiteRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);
  const clear = (k: keyof Errors) => setErrors((x) => (x[k] ? { ...x, [k]: undefined } : x));

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const next: Errors = {};
    if (!agencyName.trim()) next.agency = 'Enter your agency name.';
    if (agencyWebsite.trim() && !/^https?:\/\/\S+\.\S+/.test(agencyWebsite.trim())) next.website = 'Enter a full address, like https://youragency.com.';
    if (!email.trim()) next.email = 'Enter your work email.';
    else if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.';
    if (password.length < 8) next.password = 'Use at least 8 characters.';
    if (!acceptTerms) next.terms = 'Accept the terms to continue.';
    setErrors(next);
    const first = (['agency', 'website', 'email', 'password', 'terms'] as const).find((k) => next[k]);
    if (first) {
      ({ agency: agencyRef, website: websiteRef, email: emailRef, password: passwordRef, terms: termsRef })[first].current?.focus();
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      // The agency name/website travel in the user metadata, so the workspace
      // can be created with them even when email confirmation delays the session.
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { agency_name: agencyName.trim(), agency_website: agencyWebsite.trim() } },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (!authData.user) {
        setError('Failed to create account. Please try again.');
        return;
      }

      if (authData.user.identities?.length === 0) {
        setErrors({ email: 'An account with this email already exists. Sign in instead.' });
        emailRef.current?.focus();
        return;
      }

      // Create the workspace now when the session is already active; otherwise
      // it is created on the first signed-in request.
      if (authData.session) {
        await fetch('/api/workspace').catch(() => {});
      }

      // Fire-and-forget: log + send welcome email server-side
      // Pass user_id + email in body — session cookie may not be set yet at this point
      fetch('/api/send-onboarding-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: authData.user.id, email: authData.user.email }),
      }).catch(() => {});

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
        headline="Scale your agency with absolute client trust."
        supporting="Join 500+ agencies building transparent, real-time dashboards that turn reporting into a competitive advantage."
      />

      <section className="flex min-h-screen w-full items-center justify-center bg-surface-container-lowest px-6 py-12">
        <div className="w-full max-w-md">
          <AuthMobileBrand />
          <div className="mb-8">
            <h1 className="type-page-title text-on-surface">Create your account</h1>
            <p className="mt-1 text-sm text-on-surface-variant">Start your 14-day free trial. No credit card required.</p>
          </div>

          <div className="mb-6">
            <FormError>{error}</FormError>
          </div>

          <form onSubmit={handleSignup} noValidate className="space-y-5">
            <Field label="Agency Name" error={errors.agency}>
              {(p) => (
                <input {...p} ref={agencyRef} type="text" autoComplete="organization" value={agencyName} onChange={(e) => { setAgencyName(e.target.value); clear('agency'); }} placeholder="Lumina Growth Partners" disabled={loading} className={clsx('input', errors.agency && 'input-error')} />
              )}
            </Field>

            <Field label="Agency Website" optional error={errors.website}>
              {(p) => (
                <input {...p} ref={websiteRef} type="url" autoComplete="url" value={agencyWebsite} onChange={(e) => { setAgencyWebsite(e.target.value); clear('website'); }} placeholder="https://youragency.com" disabled={loading} className={clsx('input', errors.website && 'input-error')} />
              )}
            </Field>

            <Field label="Work Email" error={errors.email}>
              {(p) => (
                <input {...p} ref={emailRef} type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); clear('email'); }} placeholder="name@agency.com" disabled={loading} className={clsx('input', errors.email && 'input-error')} />
              )}
            </Field>

            <Field label="Password" error={errors.password} hint="Minimum 8 characters.">
              {(p) => (
                <PasswordInput {...p} ref={passwordRef} autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); clear('password'); }} placeholder="At least 8 characters" disabled={loading} className={clsx(errors.password && 'input-error')} />
              )}
            </Field>

            <div>
              <div className="flex items-start gap-3">
                <input
                  id="terms"
                  ref={termsRef}
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => { setAcceptTerms(e.target.checked); clear('terms'); }}
                  disabled={loading}
                  aria-invalid={errors.terms ? true : undefined}
                  aria-describedby={errors.terms ? 'terms-error' : undefined}
                  className="mt-1 h-4 w-4 rounded border-outline-variant accent-[var(--color-primary)] disabled:opacity-50"
                />
                <label htmlFor="terms" className="text-sm text-on-surface-variant">
                  I agree to the <span className="font-medium text-on-surface">Terms of Service</span> and <span className="font-medium text-on-surface">Privacy Policy</span>.
                </label>
              </div>
              {errors.terms && (
                <p id="terms-error" role="alert" className="field-error">
                  {errors.terms}
                </p>
              )}
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="font-sans mt-8 text-center text-sm text-on-surface-variant">
            Already have an account?{' '}
            <Link href="/auth/login" className="font-sans font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
