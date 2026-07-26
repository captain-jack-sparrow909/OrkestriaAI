import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  APPWRITE_SESSION_COOKIE,
  getAppwriteAccount,
} from "./lib/appwrite/auth";

export type AuthenticationProvider = "appwrite" | "chatgpt";

export type ChatGPTUser = {
  authProvider: AuthenticationProvider;
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  if (getAuthenticationProvider() === "appwrite") {
    const cookieStore = await cookies();
    const session = cookieStore.get(APPWRITE_SESSION_COOKIE)?.value;
    if (!session) return null;

    try {
      const account = await getAppwriteAccount(session);
      return {
        authProvider: "appwrite",
        displayName: account.name || account.email,
        email: account.email,
        fullName: account.name || null,
      };
    } catch {
      return null;
    }
  }

  const requestHeaders = await headers();
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    authProvider: "chatgpt",
    displayName: fullName ?? email,
    email,
    fullName,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  if (getAuthenticationProvider() === "appwrite") {
    redirect(
      `/sign-in?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`,
    );
  }

  redirect(chatGPTSignInPath(returnTo));
}

export function getAuthenticationProvider(): AuthenticationProvider {
  return process.env.ORK_AUTH_PROVIDER === "appwrite" ||
    Boolean(process.env.APPWRITE_SITE_ID)
    ? "appwrite"
    : "chatgpt";
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
