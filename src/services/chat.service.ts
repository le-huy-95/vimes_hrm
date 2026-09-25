import { AppError } from "../lib/errors.js";
import type { ChannelRepository } from "../repositories/channel.repository.js";
import type { MessageRepository } from "../repositories/message.repository.js";
import type { TeamRepository } from "../repositories/team.repository.js";
import type { FileRepository } from "../repositories/file.repository.js";

export class ChatService {
  constructor(
    private readonly channels: ChannelRepository,
    private readonly messages: MessageRepository,
    private readonly teams: TeamRepository,
    private readonly files: FileRepository,
  ) {}

  private async assertTeamMember(teamId: string, userId: string, orgId: string) {
    const team = await this.teams.findById(teamId);
    if (!team || team.orgId !== orgId) throw new AppError(404, "Team not found");
    const membership = await this.teams.findMember(teamId, userId);
    if (!membership) throw new AppError(403, "Not a team member");
    return team;
  }

  async listChannels(teamId: string, userId: string, orgId: string) {
    await this.assertTeamMember(teamId, userId, orgId);
    await this.channels.ensureTeamChannel(teamId);
    return this.channels.listByTeam(teamId);
  }

  async listMessages(
    teamId: string,
    channelId: string,
    userId: string,
    orgId: string,
    opts: { take: number; after?: string; before?: string },
  ) {
    await this.assertTeamMember(teamId, userId, orgId);
    const channel = await this.channels.findById(channelId);
    if (!channel || channel.teamId !== teamId) {
      throw new AppError(404, "Channel not found");
    }
    const rows = await this.messages.listByChannel({
      channelId,
      take: opts.take,
      after: opts.after,
      before: opts.before,
    });
    return opts.after ? rows : rows.reverse();
  }

  async createMessage(input: {
    teamId: string;
    channelId: string;
    userId: string;
    orgId: string;
    content: string;
    attachmentFileId?: string;
    replyToId?: string;
  }) {
    await this.assertTeamMember(input.teamId, input.userId, input.orgId);
    const channel = await this.channels.findById(input.channelId);
    if (!channel || channel.teamId !== input.teamId) {
      throw new AppError(404, "Channel not found");
    }
    const content = input.content.trim();
    if (!content && !input.attachmentFileId) {
      throw new AppError(400, "Message content required");
    }

    if (input.attachmentFileId) {
      const file = await this.files.findById(input.attachmentFileId);
      if (!file || file.orgId !== input.orgId || file.status !== "confirmed") {
        throw new AppError(400, "Invalid attachment file");
      }
    }

    if (input.replyToId) {
      const reply = await this.messages.findById(input.replyToId);
      if (!reply || reply.channelId !== input.channelId) {
        throw new AppError(400, "Invalid replyToId");
      }
    }

    return this.messages.create({
      channelId: input.channelId,
      senderId: input.userId,
      content: content || "(attachment)",
      attachmentFileId: input.attachmentFileId ?? null,
      replyToId: input.replyToId ?? null,
    });
  }

  async authorizeChannelAccess(
    channelId: string,
    userId: string,
    orgId: string,
  ) {
    const channel = await this.channels.findById(channelId);
    if (!channel) throw new AppError(404, "Channel not found");
    await this.assertTeamMember(channel.teamId, userId, orgId);
    return channel;
  }

  async markRead(
    channelId: string,
    messageId: string,
    userId: string,
    orgId: string,
  ) {
    await this.authorizeChannelAccess(channelId, userId, orgId);
    const message = await this.messages.findById(messageId);
    if (!message || message.channelId !== channelId) {
      throw new AppError(404, "Message not found");
    }
    return this.messages.markRead(messageId, userId);
  }
}
