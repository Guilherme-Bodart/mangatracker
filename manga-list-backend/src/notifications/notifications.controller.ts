import {
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Request,
  UnauthorizedException,
  UseGuards,
  Body,
  Param,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { NotificationAdminGuard } from './guards/notification-admin.guard';
import { NotificationsService } from './notifications.service';

type AuthenticatedRequest = ExpressRequest & {
  user?: {
    id: string;
    email?: string;
  };
};

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  private requireUserId(req: AuthenticatedRequest): string {
    if (!req.user?.id) {
      throw new UnauthorizedException('Authenticated user not found');
    }
    return req.user.id;
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async listUserNotifications(@Request() req: AuthenticatedRequest) {
    return this.notificationsService.listUserAnnouncements(this.requireUserId(req));
  }

  @UseGuards(JwtAuthGuard)
  @Get('unread-count')
  async getUnreadCount(@Request() req: AuthenticatedRequest) {
    return this.notificationsService.getUnreadCount(this.requireUserId(req));
  }

  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Post('mark-all-read')
  async markAllRead(@Request() req: AuthenticatedRequest) {
    return this.notificationsService.markAllRead(this.requireUserId(req));
  }

  @UseGuards(JwtAuthGuard, NotificationAdminGuard)
  @Get('admin')
  async listAdminNotifications(@Query('includeInactive') includeInactive?: string) {
    return this.notificationsService.listAdminAnnouncements(
      includeInactive === 'true',
    );
  }

  @UseGuards(JwtAuthGuard, CsrfGuard, NotificationAdminGuard)
  @Post('admin')
  async createAdminNotification(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.notificationsService.createAnnouncement(
      this.requireUserId(req),
      dto,
    );
  }

  @UseGuards(JwtAuthGuard, CsrfGuard, NotificationAdminGuard)
  @Delete('admin/:id')
  async removeAdminNotification(@Param('id') id: string) {
    return this.notificationsService.removeAnnouncement(id);
  }
}

