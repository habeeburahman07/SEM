import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType, NOTIFICATION_ICONS } from '../entities/notification.entity';
import { EventsGateway } from '../events.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async getNotifications(userId: string): Promise<Notification[]> {
    return this.notificationRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async markNotificationsRead(userId: string): Promise<void> {
    await this.notificationRepo.update({ userId, isRead: false }, { isRead: true });
  }

  /**
   * Send a single notification to one user.
   */
  async sendNotification(
    userId: string,
    type: NotificationType,
    message: string,
    workspaceId?: string | null,
    metadata?: Record<string, any> | null,
  ): Promise<void> {
    const notification = this.notificationRepo.create({
      userId,
      type,
      message,
      icon: NOTIFICATION_ICONS[type] || null,
      workspaceId: workspaceId ?? null,
      metadata: metadata ?? null,
    });
    const saved = await this.notificationRepo.save(notification);
    this.eventsGateway.sendNotification(userId, saved);
  }

  /**
   * Send the same notification to multiple users at once.
   */
  async sendNotificationToMany(
    userIds: string[],
    type: NotificationType,
    message: string,
    workspaceId?: string | null,
    metadata?: Record<string, any> | null,
  ): Promise<void> {
    if (userIds.length === 0) return;
    const uniqueIds = [...new Set(userIds)];
    const notifications = uniqueIds.map((uid) =>
      this.notificationRepo.create({
        userId: uid,
        type,
        message,
        icon: NOTIFICATION_ICONS[type] || null,
        workspaceId: workspaceId ?? null,
        metadata: metadata ?? null,
      }),
    );
    const saved = await this.notificationRepo.save(notifications);
    for (const notification of saved) {
      this.eventsGateway.sendNotification(notification.userId, notification);
    }
  }
}
