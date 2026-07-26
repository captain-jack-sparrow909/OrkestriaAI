export const APPWRITE_SESSION_COOKIE = "orkestria_session";

type AppwriteAccount = {
  $id: string;
  email: string;
  name: string;
};

type AppwriteSession = {
  $id: string;
  expire: string;
  secret: string;
};

type AppwriteAuthConfig = {
  apiKey: string;
  endpoint: string;
  projectId: string;
};

export class AppwriteAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AppwriteAuthError";
  }
}

function getAppwriteAuthConfig(): AppwriteAuthConfig {
  const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;

  if (!endpoint || !projectId || !apiKey) {
    throw new AppwriteAuthError(
      "Appwrite authentication is not configured.",
      503,
      "configuration_missing",
    );
  }

  return {
    endpoint: endpoint.replace(/\/$/, ""),
    projectId,
    apiKey,
  };
}

async function appwriteAuthRequest<T>(
  path: string,
  options: {
    body?: unknown;
    method?: "GET" | "POST" | "DELETE";
    session?: string;
    useAdminKey?: boolean;
  } = {},
): Promise<T> {
  const config = getAppwriteAuthConfig();
  const response = await fetch(`${config.endpoint}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": config.projectId,
      "X-Appwrite-Response-Format": "1.9.5",
      ...(options.useAdminKey ? { "X-Appwrite-Key": config.apiKey } : {}),
      ...(options.session ? { "X-Appwrite-Session": options.session } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
      type?: string;
    };
    throw new AppwriteAuthError(
      error.message ?? "Appwrite authentication failed.",
      response.status,
      error.type,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function createAppwriteAccount(input: {
  email: string;
  name: string;
  password: string;
}): Promise<AppwriteAccount> {
  return appwriteAuthRequest<AppwriteAccount>("/users", {
    method: "POST",
    useAdminKey: true,
    body: {
      userId: crypto.randomUUID().replaceAll("-", ""),
      email: input.email,
      password: input.password,
      name: input.name,
    },
  });
}

export async function createAppwriteEmailSession(
  email: string,
  password: string,
): Promise<AppwriteSession> {
  return appwriteAuthRequest<AppwriteSession>("/account/sessions/email", {
    method: "POST",
    useAdminKey: true,
    body: { email, password },
  });
}

export async function getAppwriteAccount(
  session: string,
): Promise<AppwriteAccount> {
  return appwriteAuthRequest<AppwriteAccount>("/account", { session });
}

export async function deleteAppwriteSession(session: string): Promise<void> {
  await appwriteAuthRequest<void>("/account/sessions/current", {
    method: "DELETE",
    session,
  });
}
