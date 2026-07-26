"use client";

import { useState } from "react";
import type { AuthenticationProvider } from "../chatgpt-auth";

export function SignOutControl({
  provider,
}: {
  provider: AuthenticationProvider;
}) {
  const [submitting, setSubmitting] = useState(false);

  if (provider === "chatgpt") {
    return (
      <a href="/signout-with-chatgpt?return_to=%2F">
        ↪ <span>Sign out</span>
      </a>
    );
  }

  return (
    <button
      disabled={submitting}
      onClick={async () => {
        setSubmitting(true);
        await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
        window.location.assign("/");
      }}
      type="button"
    >
      ↪ <span>{submitting ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}
