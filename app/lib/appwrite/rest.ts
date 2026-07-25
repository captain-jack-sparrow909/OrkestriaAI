import type { AppwriteServerConfig } from "./config";

export class AppwriteRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AppwriteRequestError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  queries?: unknown[];
  ttl?: number;
};

export class AppwriteRestClient {
  constructor(private readonly config: AppwriteServerConfig) {}

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.config.endpoint}${path}`);
    for (const query of options.queries ?? []) {
      url.searchParams.append("queries[]", JSON.stringify(query));
    }
    if (options.ttl !== undefined) {
      url.searchParams.set("ttl", String(options.ttl));
    }
    url.searchParams.set("total", "false");

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Appwrite-Project": this.config.projectId,
        "X-Appwrite-Key": this.config.apiKey,
        "X-Appwrite-Response-Format": "1.9.5",
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as {
        message?: string;
        type?: string;
      };
      throw new AppwriteRequestError(
        error.message ?? "Appwrite request failed",
        response.status,
        error.type,
      );
    }

    return response.json() as Promise<T>;
  }
}

export const query = {
  equal: (attribute: string, values: string | string[]) => ({
    method: "equal",
    attribute,
    values: Array.isArray(values) ? values : [values],
  }),
  orderDesc: (attribute: string) => ({
    method: "orderDesc",
    attribute,
  }),
  limit: (value: number) => ({
    method: "limit",
    values: [value],
  }),
};
