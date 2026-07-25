import { appwriteTables, getAppwriteServerConfig } from "../appwrite/config";
import { AppwriteRestClient, query } from "../appwrite/rest";
import {
  can,
  isWorkspaceRole,
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
