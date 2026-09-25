import { PrismaClient, TeamRole } from "@prisma/client";

const prisma = new PrismaClient();

const PERMISSIONS: Record<TeamRole, string[]> = {
  lead: [
    "team:view",
    "team:manage",
    "member:invite",
    "member:remove",
    "member:role:update",
  ],
  member: ["team:view"],
  viewer: ["team:view"],
};

async function main() {
  for (const [roleName, keys] of Object.entries(PERMISSIONS)) {
    for (const permissionKey of keys) {
      await prisma.rolePermission.upsert({
        where: {
          roleName_permissionKey: { roleName, permissionKey },
        },
        create: { roleName, permissionKey },
        update: {},
      });
    }
  }
  console.log("Seeded roles_permissions");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
