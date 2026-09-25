import { createHash } from "node:crypto";

export type WorkspaceUserHashInput = {
  primaryEmail: string;
  fullName: string;
  orgUnit: string | null;
  photoUrl: string | null;
  suspended: boolean;
};

export function workspaceUserContentHash(input: WorkspaceUserHashInput): string {
  const payload = [
    input.primaryEmail.trim().toLowerCase(),
    input.fullName,
    input.orgUnit ?? "",
    input.photoUrl ?? "",
    input.suspended ? "1" : "0",
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}
