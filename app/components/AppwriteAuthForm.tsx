"use client";

import { type FormEvent, useState } from "react";

export function AppwriteAuthForm({
  mode,
}: {
  mode: "sign-in" | "sign-up";
}) {
  const creatingAccount = mode === "sign-up";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (creatingAccount && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          name: creatingAccount ? name : undefined,
          email,
          password,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        success?: boolean;
      };
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Authentication failed.");
      }
      window.location.assign("/dashboard");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Authentication failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="appwrite-auth-form" onSubmit={submit}>
      {creatingAccount && (
        <label className="field">
          <span>Full name</span>
          <input
            autoComplete="name"
            maxLength={128}
            onChange={(event) => setName(event.target.value)}
            required
            type="text"
            value={name}
          />
        </label>
      )}
      <label className="field">
        <span>Work email</span>
        <input
          autoComplete="email"
          maxLength={254}
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          autoComplete={creatingAccount ? "new-password" : "current-password"}
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {creatingAccount && (
        <label className="field">
          <span>Confirm password</span>
          <input
            autoComplete="new-password"
            minLength={8}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            type="password"
            value={confirmPassword}
          />
        </label>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button button-primary auth-submit"
        disabled={submitting}
        type="submit"
      >
        {submitting
          ? creatingAccount
            ? "Creating secure access…"
            : "Verifying identity…"
          : creatingAccount
            ? "Create OrkestriaAI account"
            : "Sign in to OrkestriaAI"}{" "}
        {!submitting && <span aria-hidden="true">↗</span>}
      </button>
    </form>
  );
}
