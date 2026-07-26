import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthenticationProvider } from "../../../chatgpt-auth";
import {
  APPWRITE_SESSION_COOKIE,
  AppwriteAuthError,
  createAppwriteAccount,
  createAppwriteEmailSession,
  deleteAppwriteSession,
} from "../../../lib/appwrite/auth";
import { ensureWorkspaceForUser } from "../../../lib/platform/repository";

type AttemptWindow = { count: number; resetAt: number };

const attemptWindows = new Map<string, AttemptWindow>();
const ATTEMPT_LIMIT = 8;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function enforceAttemptLimit() {
  const requestHeaders = await headers();
  const key =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip") ||
    "unknown";
  const now = Date.now();
  const current = attemptWindows.get(key);

  if (!current || current.resetAt <= now) {
    attemptWindows.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return;
  }
  if (current.count >= ATTEMPT_LIMIT) {
    throw new AppwriteAuthError(
      "Too many authentication attempts. Try again in a few minutes.",
      429,
      "rate_limit_exceeded",
    );
  }
  current.count += 1;
}

export async function POST(request: Request) {
  if (getAuthenticationProvider() !== "appwrite") {
    return NextResponse.json(
      { error: "Appwrite authentication is not active on this deployment." },
      { status: 404 },
    );
  }

  try {
    await enforceAttemptLimit();
    const body = (await request.json()) as {
      email?: unknown;
      mode?: unknown;
      name?: unknown;
      password?: unknown;
    };
    const mode = body.mode === "sign-up" ? "sign-up" : "sign-in";
    const email = normalizeEmail(body.email);
    const password = readText(body.password);
    const name = readText(body.name);

    if (!email || !email.includes("@") || password.length < 8) {
      return NextResponse.json(
        { error: "Enter a valid email and a password of at least 8 characters." },
        { status: 400 },
      );
    }
    if (mode === "sign-up" && name.length < 2) {
      return NextResponse.json(
        { error: "Enter your full name." },
        { status: 400 },
      );
    }

    if (mode === "sign-up") {
      await createAppwriteAccount({ email, name, password });
    }

    const session = await createAppwriteEmailSession(email, password);
    await ensureWorkspaceForUser(email, name || email);

    const response = NextResponse.json({ success: true });
    response.cookies.set(APPWRITE_SESSION_COOKIE, session.secret, {
      expires: new Date(session.expire),
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (caught) {
    const status =
      caught instanceof AppwriteAuthError &&
      caught.status >= 400 &&
      caught.status < 500
        ? caught.status
        : 500;
    const message =
      caught instanceof AppwriteAuthError
        ? caught.code === "user_email_already_exists"
          ? "An account with this email already exists. Sign in instead."
          : caught.code === "user_invalid_credentials"
            ? "The email or password is incorrect."
            : caught.message
        : "Authentication is temporarily unavailable.";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  const session = cookieStore.get(APPWRITE_SESSION_COOKIE)?.value;
  if (session) {
    await deleteAppwriteSession(session).catch(() => null);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(APPWRITE_SESSION_COOKIE, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
