const messagingUrl = process.env.MESSAGING_URL ?? "http://localhost:3206";
const internalToken = process.env.INTERNAL_SERVICE_TOKEN ?? "dev-internal-token";

export async function sendOrgInviteEmail(body: {
  to: string;
  orgName: string;
  roleLabel: string;
  inviterName: string;
  acceptUrl: string;
  expiryHours: number;
  userId?: string;
}): Promise<void> {
  const res = await fetch(`${messagingUrl}/internal/email/org-invite`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": internalToken,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`org-invite email failed: ${res.status} ${await res.text()}`);
  }
}

export function roleLabelVi(role: string): string {
  switch (role) {
    case "OWNER":
      return "Chủ sở hữu";
    case "ADMIN":
      return "Quản trị";
    default:
      return "Thành viên";
  }
}
