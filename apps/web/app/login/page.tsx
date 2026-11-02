"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await signIn("admin-login", {
      email,
      password,
      redirect: true,
      callbackUrl: "/dashboard",
    });
    if (res?.error) setError("Invalid credentials");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-parchment px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-bold text-ink-950">ClaimShield AI</h1>
          <p className="mt-2 text-ink-500">Healthcare Denial Appeal Platform</p>
        </div>

        <div className="rounded-2xl border border-ink-300/30 bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-center font-display text-xl font-semibold text-ink-950">Sign in to your account</h2>

          <button
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-ink-300/40 bg-white px-4 py-3 text-sm font-medium text-ink-700 shadow-sm transition hover:bg-ink-950/5 hover:shadow"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-ink-300/30" />
            <span className="text-xs text-ink-500">OR</span>
            <div className="h-px flex-1 bg-ink-300/30" />
          </div>

          {!showAdmin ? (
            <div className="space-y-3">
              <button
                onClick={() => setShowAdmin(true)}
                className="w-full rounded-lg border border-ink-300/40 px-4 py-3 text-sm font-medium text-ink-700 transition hover:bg-ink-950/5"
              >
                Admin Login
              </button>
              <button
                onClick={() => signIn("dev-login", { callbackUrl: "/dashboard" })}
                className="w-full rounded-lg bg-ink-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-ink-900"
              >
                Quick Dev Login
              </button>
              <button
                onClick={() => signIn("dev-reviewer-login", { callbackUrl: "/dashboard" })}
                className="w-full rounded-lg border border-ink-300/40 px-4 py-3 text-sm font-medium text-ink-700 transition hover:bg-ink-950/5"
              >
                Dev Login as Reviewer
              </button>
            </div>
          ) : (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              {error && <p className="rounded bg-red-50 p-2 text-center text-sm text-red-600">{error}</p>}
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-ink-300/40 px-3 py-2.5 text-sm focus:border-ink-700 focus:outline-none focus:ring-1 focus:ring-ink-700"
                  placeholder="admin@claimshield.local"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-ink-300/40 px-3 py-2.5 text-sm focus:border-ink-700 focus:outline-none focus:ring-1 focus:ring-ink-700"
                  placeholder="Enter password"
                  required
                />
              </div>
              <button type="submit" className="w-full rounded-lg bg-ink-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-ink-900">
                Sign In
              </button>
              <button type="button" onClick={() => setShowAdmin(false)} className="w-full text-center text-xs text-ink-500 hover:text-ink-700">
                Back to options
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-ink-500">
          By signing in, you agree to ClaimShield's Terms of Service
        </p>
      </div>
    </div>
  );
}
