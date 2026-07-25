import { appwriteTables, getAppwriteServerConfig } from "../appwrite/config";
import { AppwriteRestClient, query } from "../appwrite/rest";
import {
  can,
  isWorkspaceRole,
  type AgentKey,
  type AgentPlanResult,
  type ApprovalRecord,
  type MembershipRecord,
} from "./model";

type RowList<T> = {
  rows: T[];
  total: number;
};

function getClient() {
  const config = getAppwriteServerConfig();
  if (!config) return null;
  return {
    config,
    client: new AppwriteRestClient(config),
  };
}

type FunctionExecution = {
  status: string;
  responseStatusCode: number;
  responseBody: string;
  errors?: string;
};

export const phaseTwoAgents = new Set<AgentKey>(["vela", "loom"]);

async function identityHash(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value.trim().toLowerCase()),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createIfMissing(
  appwrite: NonNullable<ReturnType<typeof getClient>>,
  path: string,
  body: unknown,
) {
  try {
    return await appwrite.client.request(path, { method: "POST", body });
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 409) {
      return null;
    }
    throw error;
  }
}

export async function ensureWorkspaceForUser(
  email: string,
  displayName: string,
) {
  const appwrite = getClient();
  if (!appwrite) return null;

  const hash = await identityHash(email);
  const userId = hash.slice(0, 32);
  const workspaceId = `ws_${hash.slice(0, 20)}`;
  const now = new Date().toISOString();

  await createIfMissing(
    appwrite,
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.workspaces}/rows`,
    {
      rowId: workspaceId,
      data: {
        name: "Northstar Labs",
        slug: `northstar-${hash.slice(0, 12)}`,
        plan: "starter",
        region: "global",
        status: "active",
        settings: JSON.stringify({ phase: 2, agents: ["vela", "loom"] }),
        createdBy: email.toLowerCase(),
        createdAt: now,
      },
      permissions: [],
    },
  );

  await createIfMissing(
    appwrite,
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.memberships}/rows`,
    {
      rowId: `mem_${hash.slice(0, 20)}`,
      data: {
        workspaceId,
        userId,
        userEmail: email.toLowerCase(),
        userName: displayName.slice(0, 128),
        role: "owner",
        status: "active",
        createdAt: now,
      },
      permissions: [],
    },
  );

  return { workspaceId, userId };
}

export async function enforceAgentPlanRateLimit(email: string, limit = 12) {
  const appwrite = getClient();
  if (!appwrite) return null;

  const now = new Date();
  const windowStart = new Date(
    Math.floor(now.getTime() / 600_000) * 600_000,
  ).toISOString();
  const hash = await identityHash(`${email}:${windowStart}:agent-plan`);
  const rowId = `rl_${hash.slice(0, 24)}`;
  const path =
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.rateLimits}/rows/${rowId}`;

  try {
    const current = await appwrite.client.request<{
      count: number;
      limit: number;
    }>(path);
    if (current.count >= current.limit) {
      throw new Error("Planning limit reached. Try again when the 10-minute window resets.");
    }
    await appwrite.client.request(path, {
      method: "PATCH",
      body: {
        data: {
          count: current.count + 1,
          updatedAt: now.toISOString(),
        },
      },
    });
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 404) {
      await appwrite.client.request(
        `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.rateLimits}/rows`,
        {
          method: "POST",
          body: {
            rowId,
            data: {
              scope: `agent-plan:${hash.slice(0, 24)}`,
              windowStart,
              count: 1,
              limit,
              updatedAt: now.toISOString(),
            },
            permissions: [],
          },
        },
      );
      return { remaining: limit - 1, limit };
    }
    throw error;
  }

  return { remaining: Math.max(0, limit - 1), limit };
}

export async function createPhaseTwoPlan(input: {
  agent: AgentKey;
  goal: string;
  context: string;
  email: string;
  displayName: string;
}): Promise<AgentPlanResult | null> {
  const appwrite = getClient();
  if (!appwrite) return null;
  if (!phaseTwoAgents.has(input.agent)) {
    throw new Error("This agent is not available in Phase 2.");
  }

  const workspace = await ensureWorkspaceForUser(input.email, input.displayName);
  if (!workspace) return null;
  await enforceAgentPlanRateLimit(input.email);

  const functionId = process.env.APPWRITE_FUNCTION_ID || "orchestrator";
  const execution = await appwrite.client.request<FunctionExecution>(
    `/functions/${functionId}/executions`,
    {
      method: "POST",
      body: {
        body: JSON.stringify({
          workspaceId: workspace.workspaceId,
          agent: input.agent,
          goal: input.goal.slice(0, 6000),
          context: input.context.slice(0, 12000),
        }),
        async: false,
        path: "/ai/plan",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-orkestria-user-id": workspace.userId,
        },
      },
    },
  );

  let response: (AgentPlanResult & { error?: string }) | null = null;
  try {
    response = JSON.parse(execution.responseBody || "null");
  } catch {
    throw new Error("The agent returned an unreadable response.");
  }
  if (
    execution.status !== "completed" ||
    execution.responseStatusCode >= 400 ||
    !response?.plan
  ) {
    throw new Error(response?.error || execution.errors || "Agent planning failed.");
  }

  return response;
}

export async function findMembership(workspaceId: string, email: string) {
  const appwrite = getClient();
  if (!appwrite) return null;

  const result = await appwrite.client.request<RowList<MembershipRecord>>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.memberships}/rows`,
    {
      queries: [
        query.equal("workspaceId", workspaceId),
        query.equal("userEmail", email.toLowerCase()),
        query.equal("status", "active"),
        query.limit(1),
      ],
      ttl: 15,
    },
  );

  const membership = result.rows[0];
  if (!membership || !isWorkspaceRole(membership.role)) return null;
  return membership;
}

export async function listPendingApprovals(
  workspaceId: string,
  email: string,
): Promise<ApprovalRecord[] | null> {
  const appwrite = getClient();
  if (!appwrite) return null;
  const membership = await findMembership(workspaceId, email);
  if (!membership || !can(membership.role, "approvals.decide")) {
    throw new Error("You do not have permission to review approvals.");
  }

  const result = await appwrite.client.request<RowList<ApprovalRecord>>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.approvals}/rows`,
    {
      queries: [
        query.equal("workspaceId", workspaceId),
        query.equal("state", "pending"),
        query.orderDesc("requestedAt"),
        query.limit(25),
      ],
      ttl: 5,
    },
  );
  return result.rows;
}

export async function decideApproval(input: {
  approvalId: string;
  workspaceId: string;
  email: string;
  decision: "approved" | "denied";
  reason?: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const membership = await findMembership(input.workspaceId, input.email);
  if (!membership || !can(membership.role, "approvals.decide")) {
    throw new Error("You do not have permission to decide approvals.");
  }

  const approval = await appwrite.client.request<ApprovalRecord>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.approvals}/rows/${input.approvalId}`,
  );
  if (approval.workspaceId !== input.workspaceId || approval.state !== "pending") {
    throw new Error("This approval is not available for a decision.");
  }

  const now = new Date().toISOString();
  const updated = await appwrite.client.request<ApprovalRecord>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.approvals}/rows/${input.approvalId}`,
    {
      method: "PATCH",
      body: {
        data: {
          state: input.decision,
          approverEmail: input.email.toLowerCase(),
          reason: input.reason?.slice(0, 2000),
          decidedAt: now,
        },
      },
    },
  );

  await appwrite.client.request(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.auditEvents}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          actorEmail: input.email.toLowerCase(),
          action: `approval.${input.decision}`,
          targetType: "approval",
          targetId: input.approvalId,
          outcome: "success",
          metadata: JSON.stringify({ runId: approval.runId, reason: input.reason }),
          occurredAt: now,
        },
        permissions: [],
      },
    },
  );

  return updated;
}
