"use client";

import { useState } from "react";
import { login, signup } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn, UserPlus } from "lucide-react";

export default function LoginPage() {
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const action = isSignup ? signup : login;
    const result = await action(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-violet-50">
      <div className="w-full max-w-sm px-4">
        <div className="text-center mb-8">
          <div className="inline-flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20 mb-4">
            <span className="text-lg font-bold">GT</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">GTM Validate</h1>
          <p className="text-sm text-neutral-500 mt-1.5">
            {isSignup
              ? "Create an account to start validating leads."
              : "Sign in to access your validation pipeline."}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">
              {isSignup ? "Create account" : "Welcome back"}
            </CardTitle>
            <CardDescription>
              {isSignup
                ? "Enter your email and a password to get started."
                : "Enter your credentials to continue."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs">
                  Email address
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  className="h-9 text-sm"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs">
                  Password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="h-9 text-sm"
                  autoComplete={isSignup ? "new-password" : "current-password"}
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  "Please wait..."
                ) : isSignup ? (
                  <>
                    <UserPlus className="size-4" />
                    Create account
                  </>
                ) : (
                  <>
                    <LogIn className="size-4" />
                    Sign in
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => {
              setIsSignup(!isSignup);
              setError(null);
            }}
            className="text-sm text-neutral-500 hover:text-violet-600 transition-colors"
          >
            {isSignup ? "Already have an account? Sign in" : "Don't have an account? Create one"}
          </button>
        </div>
      </div>
    </div>
  );
}
