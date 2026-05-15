import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
  Header,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApproveIntegrationApplicationDto } from './dto/approve-integration-application.dto';
import { CreateIntegrationApplicationDto } from './dto/create-integration-application.dto';
import { CreateIntegrationPartnerDto } from './dto/create-integration-partner.dto';
import { CreateIntegrationWebhookDto } from './dto/create-integration-webhook.dto';
import { ExchangeIntegrationConnectDto } from './dto/exchange-integration-connect.dto';
import { ListIntegrationApplicationsQueryDto } from './dto/list-integration-applications-query.dto';
import { RejectIntegrationApplicationDto } from './dto/reject-integration-application.dto';
import { RotateIntegrationPartnerSecretDto } from './dto/rotate-integration-partner-secret.dto';
import { StartIntegrationConnectDto } from './dto/start-integration-connect.dto';
import { SyncIntegrationDto } from './dto/sync-integration.dto';
import { UpdateIntegrationPartnerDto } from './dto/update-integration-partner.dto';
import { IntegrationAdminGuard } from './guards/integration-admin.guard';
import { IntegrationRateLimitGuard } from './guards/integration-rate-limit.guard';
import { IntegrationTokenGuard } from './guards/integration-token.guard';
import { IntegrationsService } from './integrations.service';

type AuthenticatedRequest = ExpressRequest & {
  user?: {
    id: string;
    email?: string;
  };
};

type IntegrationRequest = ExpressRequest & {
  integrationAuth?: {
    userId: string;
    partnerId: string;
    partnerSlug: string;
    scopes: string[];
    tokenExpiresAt?: string;
  };
};

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  private requireUserId(req: AuthenticatedRequest): string {
    if (!req.user?.id) {
      throw new UnauthorizedException('Authenticated user not found');
    }
    return req.user.id;
  }

  private requireUserEmail(req: AuthenticatedRequest): string {
    const email = req.user?.email?.trim().toLowerCase();
    if (!email) {
      throw new UnauthorizedException('Authenticated admin email not found');
    }
    return email;
  }

  private requireIntegrationAuth(req: IntegrationRequest) {
    if (!req.integrationAuth) {
      throw new UnauthorizedException('Integration authentication not found');
    }
    return req.integrationAuth;
  }

  private readIdempotencyKey(req: ExpressRequest): string | undefined {
    const raw = req.headers['x-idempotency-key'];
    if (!raw) return undefined;
    const key = Array.isArray(raw) ? raw[0] : raw;
    const normalized = key?.trim();
    return normalized ? normalized : undefined;
  }

  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Post('connect/start')
  async startConnection(
    @Request() req: AuthenticatedRequest,
    @Body() dto: StartIntegrationConnectDto,
  ) {
    return this.integrationsService.startConnection(this.requireUserId(req), dto);
  }

  @UseGuards(IntegrationRateLimitGuard)
  @Post('connect/exchange')
  async exchangeConnectionCode(@Body() dto: ExchangeIntegrationConnectDto) {
    return this.integrationsService.exchangeConnectionCode(dto);
  }

  @UseGuards(IntegrationRateLimitGuard)
  @Post('public/apply')
  async createPartnerApplication(
    @Request() req: ExpressRequest,
    @Body() dto: CreateIntegrationApplicationDto,
  ) {
    return this.integrationsService.createPartnerApplication(dto, req.ip);
  }

  @UseGuards(IntegrationRateLimitGuard)
  @Get('public/apply/:id/status')
  async getPublicApplicationStatus(@Param('id') id: string) {
    return this.integrationsService.getPublicApplicationStatus(id);
  }

  @UseGuards(IntegrationRateLimitGuard)
  @Post('public/apply/:id/verify-domain')
  async verifyPublicApplicationDomain(@Param('id') id: string) {
    return this.integrationsService.verifyPublicApplicationDomain(id);
  }

  @UseGuards(IntegrationTokenGuard, IntegrationRateLimitGuard)
  @Post('sync')
  async sync(@Request() req: IntegrationRequest, @Body() dto: SyncIntegrationDto) {
    return this.integrationsService.syncWithIntegrationToken(
      this.requireIntegrationAuth(req),
      dto,
      this.readIdempotencyKey(req),
    );
  }

  @UseGuards(IntegrationTokenGuard, IntegrationRateLimitGuard)
  @Get('connection/status')
  async getConnectionStatus(@Request() req: IntegrationRequest) {
    return this.integrationsService.getConnectionStatus(
      this.requireIntegrationAuth(req),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('partners')
  async listConnectablePartners() {
    return this.integrationsService.listConnectablePartners();
  }

  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  @Get('partners/public')
  async listPublicPartners() {
    return this.integrationsService.listConnectablePartners();
  }

  @UseGuards(JwtAuthGuard, IntegrationAdminGuard)
  @Get('admin/partners')
  async listPartners() {
    return this.integrationsService.listPartners();
  }

  @UseGuards(JwtAuthGuard, CsrfGuard, IntegrationAdminGuard)
  @Post('admin/partners')
  async createPartner(@Body() dto: CreateIntegrationPartnerDto) {
    return this.integrationsService.createPartner(dto);
  }

  @UseGuards(JwtAuthGuard, IntegrationAdminGuard)
  @Get('admin/partners/:id/webhooks')
  async listPartnerWebhooks(@Param('id') id: string) {
    return this.integrationsService.listPartnerWebhooks(id);
  }

  @UseGuards(JwtAuthGuard, CsrfGuard, IntegrationAdminGuard)
  @Post('admin/partners/:id/webhooks')
  async createPartnerWebhook(
    @Param('id') id: string,
    @Body() dto: CreateIntegrationWebhookDto,
  ) {
    return this.integrationsService.createPartnerWebhook(id, dto);
  }

  @UseGuards(JwtAuthGuard, CsrfGuard, IntegrationAdminGuard)
  @Patch('admin/partners/:id')
  async updatePartner(
    @Param('id') id: string,
    @Body() dto: UpdateIntegrationPartnerDto,
  ) {
    return this.integrationsService.updatePartner(id, dto);
  }

  @UseGuards(JwtAuthGuard, CsrfGuard, IntegrationAdminGuard)
  @Post('admin/partners/:id/rotate-secret')
  async rotatePartnerSecret(
    @Param('id') id: string,
    @Body() dto: RotateIntegrationPartnerSecretDto,
  ) {
    return this.integrationsService.rotatePartnerSecret(id, dto);
  }

  @UseGuards(JwtAuthGuard, IntegrationAdminGuard)
  @Get('admin/connections')
  async listConnections(@Query('partnerSlug') partnerSlug?: string) {
    return this.integrationsService.listConnections(partnerSlug);
  }

  @UseGuards(JwtAuthGuard, IntegrationAdminGuard)
  @Get('admin/applications')
  async listApplications(@Query() query: ListIntegrationApplicationsQueryDto) {
    return this.integrationsService.listPartnerApplications(query.status);
  }

  @UseGuards(JwtAuthGuard, CsrfGuard, IntegrationAdminGuard)
  @Post('admin/applications/:id/approve')
  async approveApplication(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ApproveIntegrationApplicationDto,
  ) {
    return this.integrationsService.approvePartnerApplication(
      id,
      this.requireUserEmail(req),
      dto,
    );
  }

  @UseGuards(JwtAuthGuard, CsrfGuard, IntegrationAdminGuard)
  @Post('admin/applications/:id/reject')
  async rejectApplication(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: RejectIntegrationApplicationDto,
  ) {
    return this.integrationsService.rejectPartnerApplication(
      id,
      this.requireUserEmail(req),
      dto,
    );
  }

  @UseGuards(JwtAuthGuard, CsrfGuard, IntegrationAdminGuard)
  @Post('admin/connections/:id/revoke')
  async revokeConnection(@Param('id') id: string) {
    return this.integrationsService.revokeConnection(id);
  }
}
