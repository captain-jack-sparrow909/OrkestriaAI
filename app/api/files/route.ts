import { getChatGPTUser } from "../../chatgpt-auth";
import { getAppwriteServerConfig } from "../../lib/appwrite/config";
import {
  ensureWorkspaceForUser,
  recordWorkspaceFile,
} from "../../lib/platform/repository";

const allowedExtensions = new Set([
  "txt", "csv", "json", "log", "yaml", "yml", "tf", "js", "jsx", "ts",
  "tsx", "py", "go", "java", "rb", "php", "sh", "xml", "toml", "ini", "conf",
]);
const maximumAnalysisFileSize = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const config = getAppwriteServerConfig();
  if (!config) {
    return Response.json({ error: "Appwrite is not configured" }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Choose a file to upload." }, { status: 400 });
  }
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (
    !allowedExtensions.has(extension) ||
    file.size === 0 ||
    file.size > maximumAnalysisFileSize
  ) {
    return Response.json(
      { error: "Upload a supported text, code, log, JSON, YAML, or Terraform file up to 5 MB." },
      { status: 400 },
    );
  }

  const workspace = await ensureWorkspaceForUser(user.email, user.displayName);
  if (!workspace) {
    return Response.json({ error: "Workspace unavailable" }, { status: 503 });
  }

  const fileId = crypto.randomUUID();
  const upload = new FormData();
  upload.set("fileId", fileId);
  upload.set("file", file, file.name);

  const response = await fetch(
    `${config.endpoint}/storage/buckets/workspace-uploads/files`,
    {
      method: "POST",
      headers: {
        "X-Appwrite-Project": config.projectId,
        "X-Appwrite-Key": config.apiKey,
        "X-Appwrite-Response-Format": "1.9.5",
      },
      body: upload,
    },
  );
  const stored = await response.json().catch(() => ({})) as {
    $id?: string;
    name?: string;
    mimeType?: string;
    sizeOriginal?: number;
    message?: string;
  };
  if (!response.ok || !stored.$id) {
    return Response.json(
      { error: stored.message || "The evidence file could not be stored." },
      { status: 502 },
    );
  }

  try {
    await recordWorkspaceFile({
      workspaceId: workspace.workspaceId,
      fileId: stored.$id,
      ownerEmail: user.email,
      name: stored.name || file.name,
      mimeType: stored.mimeType || file.type || "text/plain",
      size: stored.sizeOriginal || file.size,
    });
  } catch {
    await fetch(
      `${config.endpoint}/storage/buckets/workspace-uploads/files/${stored.$id}`,
      {
        method: "DELETE",
        headers: {
          "X-Appwrite-Project": config.projectId,
          "X-Appwrite-Key": config.apiKey,
          "X-Appwrite-Response-Format": "1.9.5",
        },
      },
    ).catch(() => null);
    return Response.json({ error: "File metadata could not be recorded." }, { status: 502 });
  }

  return Response.json({
    file: {
      id: stored.$id,
      name: stored.name || file.name,
      size: stored.sizeOriginal || file.size,
      scanStatus: "pending",
      retentionDays: 30,
    },
  });
}
