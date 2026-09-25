import { Prisma } from "@prisma/client";
import type { GithubDeliveryStatus } from "@prisma/client";
import { BaseRepository } from "./base.repository.js";

export class GithubDeliveryRepository extends BaseRepository {
  async tryInsert(input: { deliveryId: string; event: string; action?: string | null }) {
    try {
      return await this.db.githubWebhookDelivery.create({
        data: {
          deliveryId: input.deliveryId,
          event: input.event,
          action: input.action ?? null,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return null;
      }
      throw err;
    }
  }

  markStatus(deliveryId: string, status: GithubDeliveryStatus) {
    return this.db.githubWebhookDelivery.update({
      where: { deliveryId },
      data: {
        status,
        processedAt: new Date(),
      },
    });
  }
}
