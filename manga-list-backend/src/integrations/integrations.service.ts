import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  DomainVerificationStatus,
  IntegrationPartnerApplicationStatus,
  IntegrationPartnerSecretVersion,
  IntegrationWebhookDeliveryStatus,
  Manga,
  MangaStatus,
  Prisma,
} from '@prisma/client';
import { Cache } from 'cache-manager';
import * as bcrypt from 'bcryptjs';
import { createHash, createHmac, randomBytes } from 'crypto';
import * as dns from 'dns/promises';
import { CACHE_TTL_MS } from '../cache/cache-ttl.constants';
import { MailService } from '../mail/mail.service';
import { MangaDexService } from '../mangadex/mangadex.service';
import {
  recordIntegrationExchangeResult,
  recordIntegrationSyncOutcome,
  recordIntegrationWebhookDelivery,
} from '../observability/integration-metrics.registry';
import { PrismaService } from '../prisma/prisma.service';
import { ApproveIntegrationApplicationDto } from './dto/approve-integration-application.dto';
import { CreateIntegrationApplicationDto } from './dto/create-integration-application.dto';
import { CreateIntegrationPartnerDto } from './dto/create-integration-partner.dto';
import { CreateIntegrationWebhookDto } from './dto/create-integration-webhook.dto';
import { ExchangeIntegrationConnectDto } from './dto/exchange-integration-connect.dto';
import { RejectIntegrationApplicationDto } from './dto/reject-integration-application.dto';
import { RotateIntegrationPartnerSecretDto } from './dto/rotate-integration-partner-secret.dto';
import { StartIntegrationConnectDto } from './dto/start-integration-connect.dto';
import { SyncIntegrationDto } from './dto/sync-integration.dto';
import { UpdateIntegrationPartnerDto } from './dto/update-integration-partner.dto';

type SyncOutcome = 'created' | 'updated' | 'noop';

type SyncResult = {
  outcome: SyncOutcome;
  userMangaId: string;
  currentChapter: number | null;
};

type IntegrationAuthContext = {
  userId: string;
  partnerId: string;
  partnerSlug: string;
  scopes: string[];
  tokenExpiresAt?: string;
};

type IntegrationConnectPayload = {
  userId: string;
  partnerId: string;
  partnerSlug: string;
  scopes: string[];
  sourceDomain?: string;
};

type JikanSearchItem = {
  mal_id: number;
  title?: string | null;
  title_english?: string | null;
  title_japanese?: string | null;
  title_synonyms?: string[] | null;
  titles?: Array<{ title?: string | null }> | null;
  images?: {
    jpg?: {
      large_image_url?: string | null;
      image_url?: string | null;
    } | null;
  } | null;
  genres?: Array<{ name?: string | null }> | null;
  chapters?: number | null;
  synopsis?: string | null;
  status?: string | null;
  authors?: Array<{ name?: string | null }> | null;
};

type JikanSearchResponse = {
  data?: JikanSearchItem[];
};

type AniListSearchItem = {
  id: number;
  idMal?: number | null;
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  } | null;
  synonyms?: string[] | null;
  coverImage?: {
    large?: string | null;
    medium?: string | null;
  } | null;
  genres?: string[] | null;
  chapters?: number | null;
  description?: string | null;
  status?: string | null;
  staff?: {
    nodes?: Array<{ name?: { full?: string | null } | null }> | null;
  } | null;
};

type AniListSearchResponse = {
  data?: {
    Page?: {
      media?: AniListSearchItem[];
    };
  };
};

type CatalogResolvedManga = {
  title: string;
  malId: number | null;
  anilistId: number | null;
  coverImage: string | null;
  genres: string[];
  totalChapters: number | null;
  description: string | null;
  publicationStatus: string | null;
  author: string | null;
};

type CatalogResolveCacheValue =
  | { found: true; manga: CatalogResolvedManga }
  | { found: false };

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);
  private readonly JIKAN_BASE_URL = 'https://api.jikan.moe/v4';
  private readonly ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly mailService: MailService,
    private readonly mangaDexService: MangaDexService,
  ) {}

  async listPartners() {
    const partners = await this.prisma.integrationPartner.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        allowedDomains: true,
        parserMode: true,
        parserTitleSelectors: true,
        parserChapterSelectors: true,
        isActive: true,
        previousClientSecretExpiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const previousSecretUsageByPartner =
      await this.prisma.integrationSecretUsageLog.groupBy({
        by: ['partnerId'],
        where: {
          secretVersion: IntegrationPartnerSecretVersion.PREVIOUS,
        },
        _max: {
          usedAt: true,
        },
      });
    const previousSecretUsageMap = new Map(
      previousSecretUsageByPartner.map((entry) => [
        entry.partnerId,
        entry._max.usedAt ?? null,
      ]),
    );
    const now = Date.now();

    return partners.map((partner) => {
      const previousSecretExpiresAt = partner.previousClientSecretExpiresAt;
      const previousSecretActive =
        !!previousSecretExpiresAt &&
        previousSecretExpiresAt.getTime() > now;

      return {
        id: partner.id,
        slug: partner.slug,
        name: partner.name,
        allowedDomains: partner.allowedDomains,
        parserMode: this.normalizePartnerParserMode(partner.parserMode),
        parserTitleSelectors: partner.parserTitleSelectors,
        parserChapterSelectors: partner.parserChapterSelectors,
        isActive: partner.isActive,
        createdAt: partner.createdAt,
        updatedAt: partner.updatedAt,
        secretRotation: {
          previousSecretExpiresAt,
          previousSecretActive,
          lastPreviousSecretUsedAt:
            previousSecretUsageMap.get(partner.id) ?? null,
        },
      };
    });
  }

  async listConnectablePartners() {
    const partners = await this.prisma.integrationPartner.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        allowedDomains: true,
        parserMode: true,
        parserTitleSelectors: true,
        parserChapterSelectors: true,
      },
    });

    return partners.map((partner) => ({
      id: partner.id,
      slug: partner.slug,
      name: partner.name,
      allowedDomains: partner.allowedDomains,
      parserMode: this.normalizePartnerParserMode(partner.parserMode),
      parserTitleSelectors: partner.parserTitleSelectors,
      parserChapterSelectors: partner.parserChapterSelectors,
    }));
  }

  async createPartnerApplication(
    dto: CreateIntegrationApplicationDto,
    requesterIp?: string,
  ) {
    if (dto.website?.trim()) {
      throw new BadRequestException('Invalid submission');
    }

    await this.validatePublicApplyCaptcha(dto.captchaToken, requesterIp);

    const requestedSlug = dto.requestedSlug.trim().toLowerCase();
    const name = dto.name.trim();
    const contactEmail = dto.contactEmail.trim().toLowerCase();
    const siteUrl = this.normalizeSiteUrl(dto.siteUrl);
    const normalizedDomains = this.normalizeDomains(dto.allowedDomains);
    const inferredDomain = this.readHostnameFromUrl(siteUrl);
    if (inferredDomain) {
      await this.assertPublicApplyDomainCooldown(inferredDomain);
    }
    const allowedDomains =
      normalizedDomains.length > 0
        ? normalizedDomains
        : inferredDomain
          ? [inferredDomain]
          : [];
    const useCase = dto.useCase?.trim() || null;
    const verificationDomain = inferredDomain ?? null;
    const domainVerificationToken = this.generateDomainVerificationToken();

    const existingPartner = await this.prisma.integrationPartner.findUnique({
      where: { slug: requestedSlug },
      select: { id: true },
    });
    if (existingPartner) {
      throw new ConflictException('Requested slug is already in use');
    }

    const existingSameSlug = await this.prisma.integrationPartnerApplication.findFirst({
      where: {
        requestedSlug,
        status: {
          in: [
            IntegrationPartnerApplicationStatus.PENDING,
            IntegrationPartnerApplicationStatus.APPROVED,
          ],
        },
      },
      select: { id: true },
    });
    if (existingSameSlug) {
      throw new ConflictException(
        'An application with this slug is already pending or approved',
      );
    }

    const existingSameSitePending =
      await this.prisma.integrationPartnerApplication.findFirst({
        where: {
          contactEmail,
          siteUrl,
          status: IntegrationPartnerApplicationStatus.PENDING,
        },
        select: { id: true },
      });
    if (existingSameSitePending) {
      throw new ConflictException('An application for this site is already pending review');
    }

    const created = await this.prisma.integrationPartnerApplication.create({
      data: {
        requestedSlug,
        name,
        contactEmail,
        siteUrl,
        allowedDomains,
        useCase,
        verificationDomain,
        domainVerificationToken,
        domainVerificationStatus: DomainVerificationStatus.PENDING,
        status: IntegrationPartnerApplicationStatus.PENDING,
      },
      select: {
        id: true,
        requestedSlug: true,
        name: true,
        contactEmail: true,
        siteUrl: true,
        allowedDomains: true,
        useCase: true,
        verificationDomain: true,
        domainVerificationToken: true,
        domainVerificationStatus: true,
        status: true,
        createdAt: true,
      },
    });

    if (inferredDomain) {
      await this.cacheManager.set(
        this.buildPublicApplyDomainCooldownKey(inferredDomain),
        created.id,
        this.getPublicApplyDomainCooldownMs(),
      );
    }

    return {
      ...created,
      domainVerificationDnsRecordName: created.verificationDomain
        ? this.buildDomainVerificationDnsRecordName(created.verificationDomain)
        : null,
    };
  }

  async listPartnerApplications(
    status?: 'PENDING' | 'APPROVED' | 'REJECTED',
  ) {
    const normalizedStatus = status as IntegrationPartnerApplicationStatus | undefined;
    return this.prisma.integrationPartnerApplication.findMany({
      where: normalizedStatus ? { status: normalizedStatus } : {},
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        requestedSlug: true,
        name: true,
        contactEmail: true,
        siteUrl: true,
        allowedDomains: true,
        useCase: true,
        verificationDomain: true,
        domainVerificationStatus: true,
        domainVerificationError: true,
        domainVerificationLastCheckedAt: true,
        domainVerifiedAt: true,
        status: true,
        reviewReason: true,
        approvedPartnerId: true,
        reviewedByEmail: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getPublicApplicationStatus(id: string) {
    const application = await this.prisma.integrationPartnerApplication.findUnique({
      where: { id },
      select: {
        id: true,
        requestedSlug: true,
        verificationDomain: true,
        domainVerificationToken: true,
        domainVerificationStatus: true,
        domainVerificationError: true,
        domainVerificationLastCheckedAt: true,
        domainVerifiedAt: true,
        status: true,
        reviewReason: true,
        createdAt: true,
        reviewedAt: true,
        updatedAt: true,
      },
    });

    if (!application) {
      throw new BadRequestException('Partner application not found');
    }

    const nextAction =
      application.status === IntegrationPartnerApplicationStatus.REJECTED
        ? 'CHECK_REVIEW_REASON_OR_CONTACT_SUPPORT'
        : application.status === IntegrationPartnerApplicationStatus.APPROVED
          ? 'CHECK_EMAIL_FOR_CREDENTIALS'
          : application.domainVerificationStatus !== DomainVerificationStatus.VERIFIED
            ? 'VERIFY_DOMAIN'
            : 'WAIT_APPROVAL';

    return {
      ...application,
      domainVerificationDnsRecordName: application.verificationDomain
        ? this.buildDomainVerificationDnsRecordName(application.verificationDomain)
        : null,
      nextAction,
    };
  }

  async verifyPublicApplicationDomain(id: string) {
    const application = await this.prisma.integrationPartnerApplication.findUnique({
      where: { id },
      select: {
        id: true,
        siteUrl: true,
        status: true,
        verificationDomain: true,
        domainVerificationToken: true,
      },
    });

    if (!application) {
      throw new BadRequestException('Partner application not found');
    }

    if (application.status !== IntegrationPartnerApplicationStatus.PENDING) {
      throw new ConflictException(
        'Only pending applications can run domain verification',
      );
    }

    const verificationDomain =
      application.verificationDomain ??
      this.readHostnameFromUrl(application.siteUrl);
    const domainVerificationToken = application.domainVerificationToken;
    if (!verificationDomain || !domainVerificationToken) {
      throw new BadRequestException('Application verification data is not available');
    }

    const verificationResult = await this.verifyDomainOwnership(
      verificationDomain,
      domainVerificationToken,
    );
    const checkedAt = new Date();

    return this.prisma.integrationPartnerApplication.update({
      where: { id: application.id },
      data: {
        verificationDomain,
        domainVerificationStatus: verificationResult.verified
          ? DomainVerificationStatus.VERIFIED
          : DomainVerificationStatus.FAILED,
        domainVerificationError: verificationResult.error,
        domainVerificationLastCheckedAt: checkedAt,
        domainVerifiedAt: verificationResult.verified ? checkedAt : null,
      },
      select: {
        id: true,
        verificationDomain: true,
        domainVerificationToken: true,
        domainVerificationStatus: true,
        domainVerificationError: true,
        domainVerificationLastCheckedAt: true,
        domainVerifiedAt: true,
      },
    }).then((result) => ({
      ...result,
      domainVerificationDnsRecordName: result.verificationDomain
        ? this.buildDomainVerificationDnsRecordName(result.verificationDomain)
        : null,
    }));
  }

  async approvePartnerApplication(
    id: string,
    reviewedByEmail: string,
    dto: ApproveIntegrationApplicationDto,
  ) {
    const application = await this.prisma.integrationPartnerApplication.findUnique({
      where: { id },
      select: {
        id: true,
        requestedSlug: true,
        name: true,
        contactEmail: true,
        allowedDomains: true,
        verificationDomain: true,
        domainVerificationStatus: true,
        domainVerifiedAt: true,
        status: true,
      },
    });
    if (!application) {
      throw new BadRequestException('Partner application not found');
    }
    if (application.status !== IntegrationPartnerApplicationStatus.PENDING) {
      throw new ConflictException('Only pending applications can be approved');
    }
    if (application.domainVerificationStatus !== DomainVerificationStatus.VERIFIED) {
      throw new ConflictException(
        'Application domain must be verified before approval',
      );
    }

    const slug = (dto.slug?.trim().toLowerCase() || application.requestedSlug).trim();
    const name = (dto.name?.trim() || application.name).trim();
    const allowedDomains = this.normalizeDomains(
      dto.allowedDomains ?? application.allowedDomains,
    );

    const createdPartner = await this.createPartner({
      slug,
      name,
      allowedDomains,
      isActive: true,
      ...(dto.clientSecret ? { clientSecret: dto.clientSecret } : {}),
    });

    const updatedApplication =
      await this.prisma.integrationPartnerApplication.update({
        where: { id: application.id },
        data: {
          requestedSlug: slug,
          name,
          allowedDomains,
          status: IntegrationPartnerApplicationStatus.APPROVED,
          approvedPartnerId: createdPartner.id,
          reviewReason: null,
          reviewedByEmail,
          reviewedAt: new Date(),
        },
        select: {
          id: true,
          requestedSlug: true,
          name: true,
          contactEmail: true,
          allowedDomains: true,
          verificationDomain: true,
          domainVerificationStatus: true,
          domainVerifiedAt: true,
          status: true,
          approvedPartnerId: true,
          reviewedByEmail: true,
          reviewedAt: true,
          updatedAt: true,
        },
      });

    try {
      await this.mailService.sendIntegrationApprovedEmail(application.contactEmail, {
        partnerName: createdPartner.name,
        partnerSlug: createdPartner.slug,
        clientSecret: createdPartner.clientSecret,
        docsUrl: this.getIntegrationOnboardingUrl(),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send integration approval email to ${application.contactEmail}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    return {
      application: updatedApplication,
      partner: createdPartner,
    };
  }

  async rejectPartnerApplication(
    id: string,
    reviewedByEmail: string,
    dto: RejectIntegrationApplicationDto,
  ) {
    const application = await this.prisma.integrationPartnerApplication.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
      },
    });
    if (!application) {
      throw new BadRequestException('Partner application not found');
    }
    if (application.status !== IntegrationPartnerApplicationStatus.PENDING) {
      throw new ConflictException('Only pending applications can be rejected');
    }

    return this.prisma.integrationPartnerApplication.update({
      where: { id },
      data: {
        status: IntegrationPartnerApplicationStatus.REJECTED,
        reviewReason: dto.reason?.trim() || null,
        reviewedByEmail,
        reviewedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        reviewReason: true,
        reviewedByEmail: true,
        reviewedAt: true,
        updatedAt: true,
      },
    });
  }

  async createPartner(dto: CreateIntegrationPartnerDto) {
    const existing = await this.prisma.integrationPartner.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Partner slug already exists');
    }

    const clientSecret = dto.clientSecret?.trim() || this.generatePartnerSecret();
    const clientSecretHash = await bcrypt.hash(clientSecret, 12);

    const created = await this.prisma.integrationPartner.create({
      data: {
        slug: dto.slug.trim(),
        name: dto.name.trim(),
        clientSecretHash,
        allowedDomains: this.normalizeDomains(dto.allowedDomains),
        parserMode: this.normalizePartnerParserMode(dto.parserMode),
        parserTitleSelectors: this.normalizePartnerSelectors(
          dto.parserTitleSelectors,
        ),
        parserChapterSelectors: this.normalizePartnerSelectors(
          dto.parserChapterSelectors,
        ),
        isActive: dto.isActive ?? true,
      },
      select: {
        id: true,
        slug: true,
        name: true,
        allowedDomains: true,
        parserMode: true,
        parserTitleSelectors: true,
        parserChapterSelectors: true,
        isActive: true,
        previousClientSecretExpiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const previousSecretExpiresAt = created.previousClientSecretExpiresAt;
    return {
      id: created.id,
      slug: created.slug,
      name: created.name,
      allowedDomains: created.allowedDomains,
      parserMode: this.normalizePartnerParserMode(created.parserMode),
      parserTitleSelectors: created.parserTitleSelectors,
      parserChapterSelectors: created.parserChapterSelectors,
      isActive: created.isActive,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      secretRotation: {
        previousSecretExpiresAt,
        previousSecretActive:
          !!previousSecretExpiresAt && previousSecretExpiresAt.getTime() > Date.now(),
        lastPreviousSecretUsedAt: null,
      },
      clientSecret,
    };
  }

  async listPartnerWebhooks(partnerId: string) {
    const partner = await this.prisma.integrationPartner.findUnique({
      where: { id: partnerId },
      select: { id: true, slug: true, name: true },
    });
    if (!partner) {
      throw new BadRequestException('Integration partner not found');
    }

    const endpoints = await this.prisma.integrationWebhookEndpoint.findMany({
      where: { partnerId },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        url: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!endpoints.length) {
      return {
        partner,
        endpoints: [],
      };
    }

    const endpointIds = endpoints.map((endpoint) => endpoint.id);
    const deliveryCounts = await this.prisma.integrationWebhookDeliveryLog.groupBy({
      by: ['endpointId', 'status'],
      where: {
        endpointId: { in: endpointIds },
      },
      _count: {
        _all: true,
      },
    });

    const deliveryCountMap = new Map<string, Record<string, number>>();
    for (const row of deliveryCounts) {
      const existing = deliveryCountMap.get(row.endpointId) ?? {};
      existing[row.status] = row._count._all;
      deliveryCountMap.set(row.endpointId, existing);
    }

    const latestDeliveries = await this.prisma.integrationWebhookDeliveryLog.findMany({
      where: {
        endpointId: {
          in: endpointIds,
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        endpointId: true,
        eventId: true,
        status: true,
        attempt: true,
        responseStatus: true,
        errorMessage: true,
        deliveredAt: true,
        nextRetryAt: true,
        createdAt: true,
      },
    });

    const latestDeliveryMap = new Map<
      string,
      {
        eventId: string;
        status: IntegrationWebhookDeliveryStatus;
        attempt: number;
        responseStatus: number | null;
        errorMessage: string | null;
        deliveredAt: Date | null;
        nextRetryAt: Date | null;
        createdAt: Date;
      }
    >();
    for (const delivery of latestDeliveries) {
      if (!latestDeliveryMap.has(delivery.endpointId)) {
        latestDeliveryMap.set(delivery.endpointId, {
          eventId: delivery.eventId,
          status: delivery.status,
          attempt: delivery.attempt,
          responseStatus: delivery.responseStatus,
          errorMessage: delivery.errorMessage,
          deliveredAt: delivery.deliveredAt,
          nextRetryAt: delivery.nextRetryAt,
          createdAt: delivery.createdAt,
        });
      }
    }

    return {
      partner,
      endpoints: endpoints.map((endpoint) => {
        const counts = deliveryCountMap.get(endpoint.id) ?? {};
        return {
          ...endpoint,
          deliveryStats: {
            delivered: counts.DELIVERED ?? 0,
            retry: counts.RETRY ?? 0,
            dlq: counts.DLQ ?? 0,
          },
          lastDelivery: latestDeliveryMap.get(endpoint.id) ?? null,
        };
      }),
    };
  }

  async createPartnerWebhook(partnerId: string, dto: CreateIntegrationWebhookDto) {
    const partner = await this.prisma.integrationPartner.findUnique({
      where: { id: partnerId },
      select: { id: true },
    });
    if (!partner) {
      throw new BadRequestException('Integration partner not found');
    }

    const normalizedUrl = this.normalizeWebhookUrl(dto.url);
    const signingSecret = dto.signingSecret?.trim() || this.generatePartnerSecret();

    let created: {
      id: string;
      partnerId: string;
      url: string;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    };
    try {
      created = await this.prisma.integrationWebhookEndpoint.create({
        data: {
          partnerId,
          url: normalizedUrl,
          signingSecret,
          isActive: dto.isActive ?? true,
        },
        select: {
          id: true,
          partnerId: true,
          url: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Webhook URL already registered for this partner');
      }
      throw error;
    }

    return {
      ...created,
      signingSecret,
    };
  }

  async updatePartner(id: string, dto: UpdateIntegrationPartnerDto) {
    const existing = await this.prisma.integrationPartner.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new BadRequestException('Integration partner not found');
    }

    return this.prisma.integrationPartner.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.allowedDomains !== undefined
          ? { allowedDomains: this.normalizeDomains(dto.allowedDomains) }
          : {}),
        ...(dto.parserMode !== undefined
          ? { parserMode: this.normalizePartnerParserMode(dto.parserMode) }
          : {}),
        ...(dto.parserTitleSelectors !== undefined
          ? {
              parserTitleSelectors: this.normalizePartnerSelectors(
                dto.parserTitleSelectors,
              ),
            }
          : {}),
        ...(dto.parserChapterSelectors !== undefined
          ? {
              parserChapterSelectors: this.normalizePartnerSelectors(
                dto.parserChapterSelectors,
              ),
            }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: {
        id: true,
        slug: true,
        name: true,
        allowedDomains: true,
        parserMode: true,
        parserTitleSelectors: true,
        parserChapterSelectors: true,
        isActive: true,
        previousClientSecretExpiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }).then((updated) => {
      const previousSecretExpiresAt = updated.previousClientSecretExpiresAt;
      return {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        allowedDomains: updated.allowedDomains,
        parserMode: this.normalizePartnerParserMode(updated.parserMode),
        parserTitleSelectors: updated.parserTitleSelectors,
        parserChapterSelectors: updated.parserChapterSelectors,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        secretRotation: {
          previousSecretExpiresAt,
          previousSecretActive:
            !!previousSecretExpiresAt &&
            previousSecretExpiresAt.getTime() > Date.now(),
          lastPreviousSecretUsedAt: null,
        },
      };
    });
  }

  async rotatePartnerSecret(
    id: string,
    dto: RotateIntegrationPartnerSecretDto,
  ) {
    const existing = await this.prisma.integrationPartner.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        clientSecretHash: true,
      },
    });
    if (!existing) {
      throw new BadRequestException('Integration partner not found');
    }

    const clientSecret = dto.clientSecret?.trim() || this.generatePartnerSecret();
    const clientSecretHash = await bcrypt.hash(clientSecret, 12);
    const transitionWindowMs = this.getSecretRotationWindowMs(
      dto.transitionWindowHours,
    );
    const previousSecretExpiresAt = new Date(Date.now() + transitionWindowMs);

    await this.prisma.integrationPartner.update({
      where: { id },
      data: {
        clientSecretHash,
        previousClientSecretHash: existing.clientSecretHash,
        previousClientSecretExpiresAt: previousSecretExpiresAt,
      },
    });

    return {
      id,
      clientSecret,
      previousSecretExpiresAt,
      transitionWindowHours: Math.floor(transitionWindowMs / (60 * 60 * 1000)),
    };
  }

  async listConnections(partnerSlug?: string) {
    return this.prisma.userPartnerConnection.findMany({
      where: {
        ...(partnerSlug
          ? {
              partner: {
                slug: partnerSlug,
              },
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        isActive: true,
        scopes: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
        partner: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });
  }

  async getConnectionStatus(auth: IntegrationAuthContext) {
    const partner = await this.prisma.integrationPartner.findFirst({
      where: {
        id: auth.partnerId,
        slug: auth.partnerSlug,
      },
      select: {
        id: true,
        slug: true,
        isActive: true,
      },
    });

    const connection = await this.prisma.userPartnerConnection.findFirst({
      where: {
        userId: auth.userId,
        partnerId: auth.partnerId,
      },
      select: {
        id: true,
        isActive: true,
        scopes: true,
        updatedAt: true,
      },
    });

    const tokenHasWriteScope =
      auth.scopes.length === 0 || auth.scopes.includes('manga:write');
    const connectionHasWriteScope =
      !!connection &&
      (connection.scopes.length === 0 ||
        connection.scopes.includes('manga:write'));
    const isPartnerActive = !!partner?.isActive;
    const isConnectionActive = !!connection?.isActive;
    const connected =
      isPartnerActive &&
      isConnectionActive &&
      tokenHasWriteScope &&
      connectionHasWriteScope;
    const effectiveScopes =
      connection?.scopes && connection.scopes.length > 0
        ? connection.scopes
        : auth.scopes;

    return {
      connected,
      partner: {
        id: auth.partnerId,
        slug: auth.partnerSlug,
      },
      checks: {
        partnerExists: !!partner,
        partnerActive: isPartnerActive,
        connectionExists: !!connection,
        connectionActive: isConnectionActive,
        tokenHasWriteScope,
        connectionHasWriteScope,
      },
      scopes: effectiveScopes,
      tokenExpiresAt: auth.tokenExpiresAt ?? null,
      connectionId: connection?.id ?? null,
      connectionUpdatedAt: connection?.updatedAt?.toISOString() ?? null,
    };
  }

  async revokeConnection(connectionId: string) {
    const connection = await this.prisma.userPartnerConnection.findUnique({
      where: { id: connectionId },
      select: { id: true },
    });
    if (!connection) {
      throw new BadRequestException('Connection not found');
    }

    return this.prisma.userPartnerConnection.update({
      where: { id: connectionId },
      data: { isActive: false },
      select: {
        id: true,
        isActive: true,
        updatedAt: true,
      },
    });
  }

  async startConnection(
    userId: string,
    dto: StartIntegrationConnectDto,
  ): Promise<{ code: string; expiresInMs: number }> {
    const partner = await this.prisma.integrationPartner.findFirst({
      where: {
        slug: dto.partnerSlug,
        isActive: true,
      },
    });
    if (!partner) {
      recordIntegrationExchangeResult('rejected', 'partner_not_allowed');
      throw new UnauthorizedException('Integration partner is not allowed');
    }

    try {
      this.assertAllowedDomain(partner.allowedDomains, dto.sourceDomain);
    } catch (error) {
      recordIntegrationExchangeResult('rejected', 'source_domain_not_allowed');
      throw error;
    }

    const scopes = this.normalizeScopes(dto.scopes);
    if (scopes.length > 0 && !scopes.includes('manga:write')) {
      throw new BadRequestException('manga:write scope is required');
    }

    const code = randomBytes(24).toString('hex');
    const payload: IntegrationConnectPayload = {
      userId,
      partnerId: partner.id,
      partnerSlug: partner.slug,
      scopes,
      sourceDomain: dto.sourceDomain?.trim().toLowerCase(),
    };

    await this.cacheManager.set(
      this.buildConnectCodeCacheKey(code),
      payload,
      CACHE_TTL_MS.INTEGRATION_CONNECT_CODE,
    );

    return {
      code,
      expiresInMs: CACHE_TTL_MS.INTEGRATION_CONNECT_CODE,
    };
  }

  async exchangeConnectionCode(dto: ExchangeIntegrationConnectDto): Promise<{
    accessToken: string;
    tokenType: 'Bearer';
    expiresInSeconds: number;
    scopes: string[];
  }> {
    const partner = await this.prisma.integrationPartner.findFirst({
      where: {
        slug: dto.partnerSlug,
        isActive: true,
      },
    });
    if (!partner) {
      recordIntegrationExchangeResult('rejected', 'partner_not_allowed');
      throw new UnauthorizedException('Integration partner is not allowed');
    }

    try {
      this.assertAllowedDomain(partner.allowedDomains, dto.sourceDomain);
    } catch (error) {
      recordIntegrationExchangeResult('rejected', 'source_domain_not_allowed');
      throw error;
    }

    const publicPartnerSlugs = this.getPublicPartnerSlugs();
    const isPublicPartner = publicPartnerSlugs.has(partner.slug.toLowerCase());

    if (!isPublicPartner) {
      await this.assertPartnerClientSecret(
        partner,
        dto.clientSecret,
        dto.sourceDomain,
      );
    }

    const cacheKey = this.buildConnectCodeCacheKey(dto.code.trim());
    const payload =
      await this.cacheManager.get<IntegrationConnectPayload>(cacheKey);
    if (!payload) {
      recordIntegrationExchangeResult('rejected', 'invalid_or_expired_code');
      throw new UnauthorizedException('Invalid or expired connect code');
    }
    await this.cacheManager.del(cacheKey);

    if (
      payload.partnerId !== partner.id ||
      payload.partnerSlug !== dto.partnerSlug
    ) {
      recordIntegrationExchangeResult('rejected', 'connect_code_partner_mismatch');
      throw new UnauthorizedException('Connect code does not match partner');
    }

    if (
      payload.sourceDomain &&
      dto.sourceDomain?.trim().toLowerCase() !== payload.sourceDomain
    ) {
      recordIntegrationExchangeResult('rejected', 'connect_code_domain_mismatch');
      throw new UnauthorizedException('Connect code domain mismatch');
    }

    await this.prisma.userPartnerConnection.upsert({
      where: {
        userId_partnerId: {
          userId: payload.userId,
          partnerId: payload.partnerId,
        },
      },
      update: {
        isActive: true,
        scopes: payload.scopes,
      },
      create: {
        userId: payload.userId,
        partnerId: payload.partnerId,
        isActive: true,
        scopes: payload.scopes,
      },
    });

    const expiresInSeconds = 60 * 60 * 24 * 30;
    const accessToken = this.jwtService.sign(
      {
        sub: payload.userId,
        pid: payload.partnerId,
        psl: payload.partnerSlug,
        scp: payload.scopes,
        typ: 'integration',
      },
      {
        secret: this.getIntegrationJwtSecret(),
        expiresIn: expiresInSeconds,
      },
    );

    recordIntegrationExchangeResult('success');

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresInSeconds,
      scopes: payload.scopes,
    };
  }

  async syncWithIntegrationToken(
    auth: IntegrationAuthContext,
    dto: SyncIntegrationDto,
    idempotencyKey?: string,
  ): Promise<SyncResult> {
    const idempotencyCacheKey = this.buildIdempotencyCacheKey(
      auth.userId,
      auth.partnerId,
      idempotencyKey,
    );
    if (idempotencyCacheKey) {
      const cached = await this.cacheManager.get<SyncResult>(idempotencyCacheKey);
      if (cached) {
        recordIntegrationSyncOutcome(cached.outcome);
        return cached;
      }
    }

    const partner = await this.prisma.integrationPartner.findFirst({
      where: {
        id: auth.partnerId,
        slug: auth.partnerSlug,
        isActive: true,
      },
    });

    if (!partner) {
      recordIntegrationSyncOutcome('rejected', 'partner_not_allowed');
      throw new UnauthorizedException('Integration partner is not allowed');
    }

    if (dto.partnerSlug !== auth.partnerSlug) {
      recordIntegrationSyncOutcome('rejected', 'partner_slug_mismatch');
      throw new ForbiddenException('Partner slug mismatch for integration token');
    }

    try {
      this.assertAllowedDomain(partner.allowedDomains, dto.sourceDomain);
    } catch (error) {
      recordIntegrationSyncOutcome('rejected', 'source_domain_not_allowed');
      throw error;
    }

    if (auth.scopes.length > 0 && !auth.scopes.includes('manga:write')) {
      recordIntegrationSyncOutcome('rejected', 'token_missing_write_scope');
      throw new ForbiddenException('Missing manga:write scope');
    }

    const connection = await this.prisma.userPartnerConnection.findFirst({
      where: {
        userId: auth.userId,
        partnerId: partner.id,
        isActive: true,
      },
    });

    if (!connection) {
      recordIntegrationSyncOutcome('rejected', 'connection_not_found');
      throw new ForbiddenException('Partner is not connected for this user');
    }

    if (
      connection.scopes.length > 0 &&
      !connection.scopes.includes('manga:write')
    ) {
      recordIntegrationSyncOutcome('rejected', 'connection_missing_write_scope');
      throw new ForbiddenException('Missing manga:write scope');
    }

    const normalizedTitle = this.selectPreferredSyncTitle(
      dto.title,
      dto.externalMangaId,
    );
    const resolvedCatalogManga =
      await this.resolveCanonicalMangaByTitle(normalizedTitle);

    const result: SyncResult = await this.prisma.$transaction(async (tx) => {
      const existingMap = await tx.externalMangaMap.findUnique({
        where: {
          userId_partnerId_externalMangaId: {
            userId: auth.userId,
            partnerId: partner.id,
            externalMangaId: dto.externalMangaId,
          },
        },
      });

      if (existingMap) {
        const existingUserManga = await tx.userManga.findFirst({
          where: {
            userId: auth.userId,
            mangaId: existingMap.mangaId,
          },
        });

        if (existingUserManga) {
          if (
            existingUserManga.currentChapter !== null &&
            dto.chapter <= existingUserManga.currentChapter
          ) {
            await this.logSyncEvent(tx, {
              userId: auth.userId,
              partnerId: partner.id,
              externalMangaId: dto.externalMangaId,
              chapter: dto.chapter,
              outcome: 'noop',
              details: {
                reason: 'chapter_not_greater_than_current',
                sourceDomain: dto.sourceDomain ?? null,
              },
            });

            return {
              outcome: 'noop',
              userMangaId: existingUserManga.id,
              currentChapter: existingUserManga.currentChapter,
            };
          }

          const updated = await tx.userManga.update({
            where: { id: existingUserManga.id },
            data: {
              currentChapter: dto.chapter,
            },
          });

          await this.logSyncEvent(tx, {
            userId: auth.userId,
            partnerId: partner.id,
            externalMangaId: dto.externalMangaId,
            chapter: dto.chapter,
            outcome: 'updated',
            details: {
              sourceDomain: dto.sourceDomain ?? null,
            },
          });

          return {
            outcome: 'updated',
            userMangaId: updated.id,
            currentChapter: updated.currentChapter,
          };
        }

        await tx.externalMangaMap.delete({
          where: { id: existingMap.id },
        });
      }

      const manga = await this.getOrCreateExternalManga(
        tx,
        partner.id,
        dto.externalMangaId,
        normalizedTitle,
        resolvedCatalogManga,
      );

      const existingUserEntry = await tx.userManga.findFirst({
        where: {
          userId: auth.userId,
          mangaId: manga.id,
        },
      });

      if (existingUserEntry) {
        const updated = await tx.userManga.update({
          where: { id: existingUserEntry.id },
          data: {
            currentChapter:
              existingUserEntry.currentChapter === null
                ? dto.chapter
                : Math.max(existingUserEntry.currentChapter, dto.chapter),
          },
        });

        await tx.externalMangaMap.create({
          data: {
            userId: auth.userId,
            partnerId: partner.id,
            externalMangaId: dto.externalMangaId,
            mangaId: manga.id,
          },
        });

        await this.logSyncEvent(tx, {
          userId: auth.userId,
          partnerId: partner.id,
          externalMangaId: dto.externalMangaId,
          chapter: dto.chapter,
          outcome: 'updated',
          details: {
            reason: 'mapped_existing_user_entry',
            sourceDomain: dto.sourceDomain ?? null,
          },
        });

        return {
          outcome: 'updated',
          userMangaId: updated.id,
          currentChapter: updated.currentChapter,
        };
      }

      const created = await tx.userManga.create({
        data: {
          userId: auth.userId,
          mangaId: manga.id,
          status: MangaStatus.READING,
          currentChapter: dto.chapter,
        },
      });

      await tx.externalMangaMap.create({
        data: {
          userId: auth.userId,
          partnerId: partner.id,
          externalMangaId: dto.externalMangaId,
          mangaId: manga.id,
        },
      });

      await this.logSyncEvent(tx, {
        userId: auth.userId,
        partnerId: partner.id,
        externalMangaId: dto.externalMangaId,
        chapter: dto.chapter,
        outcome: 'created',
        details: {
          sourceDomain: dto.sourceDomain ?? null,
        },
      });

      return {
        outcome: 'created',
        userMangaId: created.id,
        currentChapter: created.currentChapter,
      };
    });

    if (idempotencyCacheKey) {
      await this.cacheManager.set(
        idempotencyCacheKey,
        result,
        CACHE_TTL_MS.INTEGRATION_IDEMPOTENCY,
      );
    }

    recordIntegrationSyncOutcome(result.outcome);

    void this.publishSyncWebhookEvent({
      partnerId: partner.id,
      partnerSlug: partner.slug,
      userId: auth.userId,
      sourceDomain: dto.sourceDomain,
      request: {
        externalMangaId: dto.externalMangaId,
        title: dto.title,
        chapter: dto.chapter,
      },
      response: result,
      idempotencyKey: idempotencyKey?.trim() || null,
    }).catch((error) => {
      this.logger.warn(
        `Webhook publish failed for partner ${partner.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    });

    return result;
  }

  private async publishSyncWebhookEvent(payload: {
    partnerId: string;
    partnerSlug: string;
    userId: string;
    sourceDomain?: string;
    request: {
      externalMangaId: string;
      title: string;
      chapter: number;
    };
    response: SyncResult;
    idempotencyKey: string | null;
  }): Promise<void> {
    const endpoints = await this.prisma.integrationWebhookEndpoint.findMany({
      where: {
        partnerId: payload.partnerId,
        isActive: true,
      },
      select: {
        id: true,
        url: true,
        signingSecret: true,
      },
    });
    if (!endpoints.length) {
      return;
    }

    const event = await this.prisma.integrationWebhookEventLog.create({
      data: {
        partnerId: payload.partnerId,
        eventType: 'integration.sync.v1',
        payload: {
          eventType: 'integration.sync.v1',
          occurredAt: new Date().toISOString(),
          partner: {
            id: payload.partnerId,
            slug: payload.partnerSlug,
          },
          user: {
            id: payload.userId,
          },
          request: payload.request,
          response: payload.response,
          idempotencyKey: payload.idempotencyKey,
          sourceDomain: payload.sourceDomain?.trim().toLowerCase() || null,
        },
      },
      select: {
        id: true,
        eventType: true,
        payload: true,
      },
    });

    for (const endpoint of endpoints) {
      void this.deliverWebhookEventWithRetry({
        endpointId: endpoint.id,
        endpointUrl: endpoint.url,
        signingSecret: endpoint.signingSecret,
        eventId: event.id,
        eventType: event.eventType,
        payload: event.payload,
      }).catch((error) => {
        this.logger.warn(
          `Webhook delivery dispatcher failed for event ${event.id} endpoint ${endpoint.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      });
    }
  }

  private async deliverWebhookEventWithRetry(payload: {
    endpointId: string;
    endpointUrl: string;
    signingSecret: string;
    eventId: string;
    eventType: string;
    payload: Prisma.JsonValue;
  }): Promise<void> {
    const maxAttempts = this.getWebhookMaxAttempts();
    const rawBody = JSON.stringify(payload.payload);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = this.buildWebhookSignature(
        payload.signingSecret,
        timestamp,
        rawBody,
      );

      try {
        const response = await fetch(payload.endpointUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-mangalist-signature': signature,
            'x-mangalist-signature-alg': 'hmac-sha256',
            'x-mangalist-timestamp': timestamp,
            'x-mangalist-event-id': payload.eventId,
            'x-mangalist-event-type': payload.eventType,
            'x-mangalist-delivery-attempt': attempt.toString(),
          },
          body: rawBody,
          signal: AbortSignal.timeout(this.getWebhookTimeoutMs()),
        });

        if (response.ok) {
          await this.prisma.integrationWebhookDeliveryLog.create({
            data: {
              eventId: payload.eventId,
              endpointId: payload.endpointId,
              attempt,
              status: IntegrationWebhookDeliveryStatus.DELIVERED,
              responseStatus: response.status,
              deliveredAt: new Date(),
            },
          });
          recordIntegrationWebhookDelivery('DELIVERED');
          return;
        }

        const shouldRetry =
          this.shouldRetryWebhookStatus(response.status) && attempt < maxAttempts;
        if (!shouldRetry) {
          await this.prisma.integrationWebhookDeliveryLog.create({
            data: {
              eventId: payload.eventId,
              endpointId: payload.endpointId,
              attempt,
              status: IntegrationWebhookDeliveryStatus.DLQ,
              responseStatus: response.status,
              errorMessage: `HTTP ${response.status}`,
            },
          });
          recordIntegrationWebhookDelivery('DLQ');
          return;
        }

        const retryDelayMs = this.getWebhookRetryDelayMs(attempt);
        await this.prisma.integrationWebhookDeliveryLog.create({
          data: {
            eventId: payload.eventId,
            endpointId: payload.endpointId,
            attempt,
            status: IntegrationWebhookDeliveryStatus.RETRY,
            responseStatus: response.status,
            errorMessage: `HTTP ${response.status}`,
            nextRetryAt: new Date(Date.now() + retryDelayMs),
          },
        });
        recordIntegrationWebhookDelivery('RETRY');
        await this.sleep(retryDelayMs);
      } catch (error) {
        const shouldRetry = attempt < maxAttempts;
        if (!shouldRetry) {
          await this.prisma.integrationWebhookDeliveryLog.create({
            data: {
              eventId: payload.eventId,
              endpointId: payload.endpointId,
              attempt,
              status: IntegrationWebhookDeliveryStatus.DLQ,
              errorMessage:
                error instanceof Error ? error.message : 'Webhook request failed',
            },
          });
          recordIntegrationWebhookDelivery('DLQ');
          return;
        }

        const retryDelayMs = this.getWebhookRetryDelayMs(attempt);
        await this.prisma.integrationWebhookDeliveryLog.create({
          data: {
            eventId: payload.eventId,
            endpointId: payload.endpointId,
            attempt,
            status: IntegrationWebhookDeliveryStatus.RETRY,
            errorMessage:
              error instanceof Error ? error.message : 'Webhook request failed',
            nextRetryAt: new Date(Date.now() + retryDelayMs),
          },
        });
        recordIntegrationWebhookDelivery('RETRY');
        await this.sleep(retryDelayMs);
      }
    }
  }

  private shouldRetryWebhookStatus(status: number): boolean {
    return status === 429 || status >= 500;
  }

  private buildWebhookSignature(
    secret: string,
    timestamp: string,
    body: string,
  ): string {
    const signedPayload = `${timestamp}.${body}`;
    const digest = createHmac('sha256', secret).update(signedPayload).digest('hex');
    return `sha256=${digest}`;
  }

  private assertAllowedDomain(
    allowedDomains: string[],
    sourceDomain: string | undefined,
  ): void {
    if (allowedDomains.length === 0 || !sourceDomain?.trim()) {
      return;
    }

    const normalizedSource = sourceDomain.trim().toLowerCase();
    const isAllowed = allowedDomains.some(
      (domain) => domain.trim().toLowerCase() === normalizedSource,
    );

    if (!isAllowed) {
      throw new ForbiddenException('Source domain is not allowed for partner');
    }
  }

  private normalizeScopes(scopes: string[] | undefined): string[] {
    if (!scopes || scopes.length === 0) {
      return ['manga:write'];
    }

    const normalized = Array.from(
      new Set(scopes.map((scope) => scope.trim()).filter((scope) => !!scope)),
    );
    return normalized.length > 0 ? normalized : ['manga:write'];
  }

  private async assertPartnerClientSecret(
    partner: {
      id: string;
      slug: string;
      clientSecretHash: string;
      previousClientSecretHash: string | null;
      previousClientSecretExpiresAt: Date | null;
    },
    clientSecret: string | undefined,
    sourceDomain: string | undefined,
  ): Promise<void> {
    const providedSecret = clientSecret?.trim();
    if (!providedSecret) {
      recordIntegrationExchangeResult('rejected', 'missing_partner_credentials');
      throw new UnauthorizedException('Missing partner credentials');
    }

    const isCurrentSecretValid = await bcrypt.compare(
      providedSecret,
      partner.clientSecretHash,
    );
    if (isCurrentSecretValid) {
      return;
    }

    const isPreviousSecretValid = await this.isPreviousPartnerSecretValid(
      partner,
      providedSecret,
    );
    if (!isPreviousSecretValid) {
      recordIntegrationExchangeResult('rejected', 'invalid_partner_credentials');
      throw new UnauthorizedException('Invalid partner credentials');
    }

    await this.auditPartnerSecretUsage(
      partner.id,
      IntegrationPartnerSecretVersion.PREVIOUS,
      sourceDomain,
    );
    this.logger.warn(
      `Partner ${partner.slug} authenticated with previous client secret inside transition window`,
    );
  }

  private async isPreviousPartnerSecretValid(
    partner: {
      previousClientSecretHash: string | null;
      previousClientSecretExpiresAt: Date | null;
    },
    clientSecret: string,
  ): Promise<boolean> {
    if (
      !partner.previousClientSecretHash ||
      !partner.previousClientSecretExpiresAt
    ) {
      return false;
    }

    if (partner.previousClientSecretExpiresAt.getTime() <= Date.now()) {
      return false;
    }

    return bcrypt.compare(clientSecret, partner.previousClientSecretHash);
  }

  private async auditPartnerSecretUsage(
    partnerId: string,
    secretVersion: IntegrationPartnerSecretVersion,
    sourceDomain: string | undefined,
  ): Promise<void> {
    try {
      await this.prisma.integrationSecretUsageLog.create({
        data: {
          partnerId,
          secretVersion,
          sourceDomain: sourceDomain?.trim().toLowerCase() || null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist partner secret usage audit for ${partnerId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private normalizeDomains(domains: string[] | undefined): string[] {
    if (!domains) {
      return [];
    }

    return Array.from(
      new Set(
        domains
          .map((domain) => domain.trim().toLowerCase())
          .filter((domain) => domain.length > 0),
      ),
    );
  }

  private normalizePartnerParserMode(
    value: string | null | undefined,
  ): 'generic' | 'mangalivre' | 'seriesSlugNumberPath' | 'singleSlugNumberPath' | null {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return null;
    }

    switch (normalized) {
      case 'generic':
      case 'mangalivre':
      case 'seriesSlugNumberPath':
      case 'singleSlugNumberPath':
        return normalized;
      default:
        throw new BadRequestException('Unsupported parser mode');
    }
  }

  private normalizePartnerSelectors(values: string[] | undefined): string[] {
    if (!values) {
      return [];
    }

    return Array.from(
      new Set(
        values
          .map((value) => String(value || '').trim())
          .filter((value) => value.length > 0)
          .map((value) => value.slice(0, 160)),
      ),
    ).slice(0, 20);
  }

  private normalizeWebhookUrl(value: string): string {
    const normalized = this.normalizeSiteUrl(value);
    const parsed = new URL(normalized);
    if (
      process.env.NODE_ENV === 'production' &&
      parsed.protocol.toLowerCase() !== 'https:'
    ) {
      throw new BadRequestException('Webhook URL must use https in production');
    }
    return normalized;
  }

  private normalizeSiteUrl(value: string): string {
    const trimmed = value.trim();
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new BadRequestException('Invalid site URL');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('Site URL must use http or https');
    }

    parsed.hash = '';
    parsed.search = '';
    return parsed.toString();
  }

  private readHostnameFromUrl(value: string): string | null {
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.trim().toLowerCase();
      return host || null;
    } catch {
      return null;
    }
  }

  private getWebhookMaxAttempts(): number {
    const raw = this.configService.get<string>('INTEGRATION_WEBHOOK_MAX_ATTEMPTS');
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 10) {
      return Math.floor(parsed);
    }
    return 4;
  }

  private getWebhookTimeoutMs(): number {
    const raw = this.configService.get<string>('INTEGRATION_WEBHOOK_TIMEOUT_MS');
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 250) {
      return Math.floor(parsed);
    }
    return 5000;
  }

  private getWebhookInitialBackoffMs(): number {
    const raw = this.configService.get<string>('INTEGRATION_WEBHOOK_INITIAL_BACKOFF_MS');
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 50) {
      return Math.floor(parsed);
    }
    return 500;
  }

  private getWebhookMaxBackoffMs(): number {
    const raw = this.configService.get<string>('INTEGRATION_WEBHOOK_MAX_BACKOFF_MS');
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 100) {
      return Math.floor(parsed);
    }
    return 10_000;
  }

  private getWebhookRetryDelayMs(attempt: number): number {
    const base = this.getWebhookInitialBackoffMs();
    const max = this.getWebhookMaxBackoffMs();
    const exponential = Math.min(base * 2 ** Math.max(0, attempt - 1), max);
    const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(exponential * 0.25)));
    return Math.min(exponential + jitter, max);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private generateDomainVerificationToken(): string {
    return randomBytes(24).toString('hex');
  }

  private buildDomainVerificationDnsRecordName(domain: string): string {
    const prefix =
      this.configService
        .get<string>('INTEGRATION_DOMAIN_VERIFICATION_DNS_PREFIX')
        ?.trim() || '_manga-tracker-verification';
    return `${prefix}.${domain.trim().toLowerCase()}`;
  }

  private async verifyDomainOwnership(
    domain: string,
    expectedToken: string,
  ): Promise<{
    verified: boolean;
    error: string | null;
  }> {
    const dnsResult = await this.verifyDomainDnsTxtToken(domain, expectedToken);
    if (dnsResult.verified) {
      return dnsResult;
    }

    const wellKnownResult = await this.verifyDomainWellKnownToken(
      domain,
      expectedToken,
    );
    if (wellKnownResult.verified) {
      return wellKnownResult;
    }

    return {
      verified: false,
      error: `DNS TXT check failed: ${dnsResult.error ?? 'unknown error'}; Well-known check failed: ${wellKnownResult.error ?? 'unknown error'}`,
    };
  }

  private async verifyDomainDnsTxtToken(
    domain: string,
    expectedToken: string,
  ): Promise<{
    verified: boolean;
    error: string | null;
  }> {
    const normalizedDomain = domain.trim().toLowerCase();
    if (!normalizedDomain) {
      return {
        verified: false,
        error: 'Invalid verification domain',
      };
    }

    const dnsRecordName =
      this.buildDomainVerificationDnsRecordName(normalizedDomain);
    try {
      const records = await dns.resolveTxt(dnsRecordName);
      const values = records
        .map((entry) => entry.join('').trim())
        .filter((entry) => entry.length > 0);

      if (values.some((value) => value === expectedToken)) {
        return {
          verified: true,
          error: null,
        };
      }

      return {
        verified: false,
        error: `Token mismatch on DNS TXT record ${dnsRecordName}`,
      };
    } catch (error) {
      return {
        verified: false,
        error: `DNS TXT lookup failed for ${dnsRecordName}: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
    }
  }

  private async verifyDomainWellKnownToken(
    domain: string,
    expectedToken: string,
  ): Promise<{
    verified: boolean;
    error: string | null;
  }> {
    const normalizedDomain = domain.trim().toLowerCase();
    if (!normalizedDomain) {
      return {
        verified: false,
        error: 'Invalid verification domain',
      };
    }

    const path = '/.well-known/manga-tracker-verification.txt';
    const urls = [
      `https://${normalizedDomain}${path}`,
      `http://${normalizedDomain}${path}`,
    ];

    let lastError = `Verification file not found at ${urls[0]}`;

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
        });

        if (!response.ok) {
          lastError = `HTTP ${response.status} on ${url}`;
          continue;
        }

        const text = (await response.text()).trim();
        if (text === expectedToken) {
          return {
            verified: true,
            error: null,
          };
        }

        lastError = `Token mismatch on ${url}`;
      } catch (error) {
        lastError = `Request failed on ${url}: ${error instanceof Error ? error.message : 'unknown error'}`;
      }
    }

    return {
      verified: false,
      error: lastError,
    };
  }

  private getIntegrationJwtSecret(): string {
    const secret =
      this.configService.get<string>('INTEGRATION_JWT_SECRET') ??
      this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new UnauthorizedException('Integration token secret is not configured');
    }
    return secret;
  }

  private buildConnectCodeCacheKey(code: string): string {
    return `integrations:connect:${code}`;
  }

  private buildIdempotencyCacheKey(
    userId: string,
    partnerId: string,
    idempotencyKey: string | undefined,
  ): string | null {
    const normalized = idempotencyKey?.trim();
    if (!normalized) {
      return null;
    }

    const digest = createHash('sha256').update(normalized).digest('hex');
    return `integrations:idempotency:${userId}:${partnerId}:${digest}`;
  }

  private getSecretRotationWindowMs(transitionWindowHours?: number): number {
    if (
      Number.isFinite(transitionWindowHours) &&
      transitionWindowHours !== undefined &&
      transitionWindowHours > 0
    ) {
      return Math.floor(transitionWindowHours * 60 * 60 * 1000);
    }

    const configured = this.configService.get<string>(
      'INTEGRATION_SECRET_ROTATION_WINDOW_HOURS',
    );
    const parsed = Number(configured);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed * 60 * 60 * 1000);
    }

    return 72 * 60 * 60 * 1000;
  }

  private generatePartnerSecret(): string {
    return randomBytes(32).toString('hex');
  }

  private getPublicPartnerSlugs(): Set<string> {
    const raw =
      this.configService.get<string>('INTEGRATION_PUBLIC_PARTNERS') ??
      'mangalivre';
    return new Set(
      raw
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0),
    );
  }

  private getIntegrationOnboardingUrl(): string {
    const configured = this.configService.get<string>('INTEGRATION_ONBOARDING_URL');
    if (configured?.trim()) {
      return configured.trim();
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    if (frontendUrl?.trim()) {
      return `${frontendUrl.trim().replace(/\/+$/, '')}/pt/how-to-use-api`;
    }

    return 'https://your-frontend-domain.com/pt/how-to-use-api';
  }

  private getPublicApplyDomainCooldownMs(): number {
    const raw = this.configService.get<string>(
      'INTEGRATION_PUBLIC_APPLY_DOMAIN_COOLDOWN_MS',
    );
    if (!raw) {
      return CACHE_TTL_MS.AUTH_RATE_LIMIT_WINDOW;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return CACHE_TTL_MS.AUTH_RATE_LIMIT_WINDOW;
    }
    return Math.floor(parsed);
  }

  private buildPublicApplyDomainCooldownKey(domain: string): string {
    return `integrations:public-apply:domain:${domain}`;
  }

  private async assertPublicApplyDomainCooldown(domain: string): Promise<void> {
    const key = this.buildPublicApplyDomainCooldownKey(domain);
    const existing = await this.cacheManager.get<string>(key);
    if (existing) {
      throw new HttpException(
        'Too many applications for this domain. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async validatePublicApplyCaptcha(
    captchaToken: string | undefined,
    requesterIp?: string,
  ): Promise<void> {
    const secret = this.configService
      .get<string>('INTEGRATION_PUBLIC_APPLY_CAPTCHA_SECRET')
      ?.trim();
    if (!secret) {
      return;
    }

    const token = captchaToken?.trim();
    if (!token) {
      throw new BadRequestException('Captcha token is required');
    }

    const verifyUrl =
      this.configService
        .get<string>('INTEGRATION_PUBLIC_APPLY_CAPTCHA_VERIFY_URL')
        ?.trim() || 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    const payload = new URLSearchParams();
    payload.set('secret', secret);
    payload.set('response', token);
    if (requesterIp?.trim()) {
      payload.set('remoteip', requesterIp.trim());
    }

    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(verifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: payload.toString(),
      });
    } catch (error) {
      this.logger.warn(
        `Captcha verification request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new BadRequestException('Captcha validation unavailable');
    }

    let parsed: { success?: boolean } | null = null;
    try {
      parsed = (await response.json()) as { success?: boolean };
    } catch {
      parsed = null;
    }

    if (!response.ok || !parsed?.success) {
      throw new BadRequestException('Captcha validation failed');
    }
  }

  private async getOrCreateExternalManga(
    tx: Prisma.TransactionClient,
    partnerId: string,
    externalMangaId: string,
    title: string,
    resolvedCatalogManga?: CatalogResolvedManga | null,
  ): Promise<Manga> {
    if (resolvedCatalogManga) {
      const existingByAniListId =
        resolvedCatalogManga.anilistId !== null
          ? await tx.manga.findUnique({
              where: { anilistId: resolvedCatalogManga.anilistId },
            })
          : null;
      if (existingByAniListId) {
        return existingByAniListId;
      }

      const preferredMalIds: number[] = [];
      if (
        resolvedCatalogManga.malId !== null &&
        Number.isFinite(resolvedCatalogManga.malId)
      ) {
        preferredMalIds.push(resolvedCatalogManga.malId);
      } else if (
        resolvedCatalogManga.anilistId !== null &&
        Number.isFinite(resolvedCatalogManga.anilistId)
      ) {
        for (let attempt = 0; attempt < 4; attempt++) {
          preferredMalIds.push(
            this.buildCatalogFallbackMalId(
              `anilist:${resolvedCatalogManga.anilistId}`,
              attempt,
            ),
          );
        }
      }

      for (const malId of preferredMalIds) {
        const existing = await tx.manga.findUnique({
          where: { malId },
        });
        if (existing) {
          if (!existing.anilistId && resolvedCatalogManga.anilistId !== null) {
            return tx.manga.update({
              where: { id: existing.id },
              data: {
                anilistId: resolvedCatalogManga.anilistId,
              },
            });
          }
          return existing;
        }

        try {
          return await tx.manga.create({
            data: {
              malId,
              anilistId: resolvedCatalogManga.anilistId ?? null,
              title: resolvedCatalogManga.title,
              coverImage: resolvedCatalogManga.coverImage,
              author: resolvedCatalogManga.author,
              genres: resolvedCatalogManga.genres,
              totalChapters: resolvedCatalogManga.totalChapters,
              description: resolvedCatalogManga.description,
              publicationStatus: resolvedCatalogManga.publicationStatus,
            },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            // Try the next malId candidate when unique constraint conflicts.
            continue;
          }
          throw error;
        }
      }
    }

    const maxAttempts = 8;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const syntheticMalId = this.buildSyntheticMalId(
        partnerId,
        externalMangaId,
        attempt,
      );

      const existing = await tx.manga.findUnique({
        where: { malId: syntheticMalId },
      });

      if (!existing) {
        return tx.manga.create({
          data: {
            malId: syntheticMalId,
            title,
            genres: [],
          },
        });
      }

      if (existing.title === title) {
        return existing;
      }
    }

    throw new ConflictException('Could not allocate synthetic manga id');
  }

  private async resolveCanonicalMangaByTitle(
    title: string,
  ): Promise<CatalogResolvedManga | null> {
    const normalizedTitle = this.normalizeTitleForMatching(title);
    if (!normalizedTitle || normalizedTitle.length < 2) {
      return null;
    }

    const cacheKey = `integration:manga-resolve:${normalizedTitle}`;
    const cached =
      await this.cacheManager.get<CatalogResolveCacheValue>(cacheKey);
    if (cached) {
      return cached.found ? cached.manga : null;
    }

    const fromAniList = await this.resolveFromAniList(title, normalizedTitle);
    if (fromAniList) {
      await this.cacheManager.set(
        cacheKey,
        { found: true, manga: fromAniList } satisfies CatalogResolveCacheValue,
        12 * 60 * 60 * 1000,
      );
      return fromAniList;
    }

    const fromJikan = await this.resolveFromJikan(title, normalizedTitle);
    if (fromJikan) {
      await this.cacheManager.set(
        cacheKey,
        { found: true, manga: fromJikan } satisfies CatalogResolveCacheValue,
        12 * 60 * 60 * 1000,
      );
      return fromJikan;
    }

    const fromMangaDex = await this.resolveFromMangaDex(title);
    if (fromMangaDex) {
      await this.cacheManager.set(
        cacheKey,
        { found: true, manga: fromMangaDex } satisfies CatalogResolveCacheValue,
        12 * 60 * 60 * 1000,
      );
      return fromMangaDex;
    }

    await this.cacheManager.set(
      cacheKey,
      { found: false } satisfies CatalogResolveCacheValue,
      60 * 60 * 1000,
    );
    return null;
  }

  private async resolveFromJikan(
    title: string,
    normalizedTitle: string,
  ): Promise<CatalogResolvedManga | null> {
    const url = `${this.JIKAN_BASE_URL}/manga?q=${encodeURIComponent(title)}&limit=10`;
    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      this.logger.warn(
        `Jikan lookup failed for "${title}": ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as JikanSearchResponse;
    const candidates = payload.data ?? [];
    if (!candidates.length) {
      return null;
    }

    let bestItem: JikanSearchItem | null = null;
    let bestScore = 0;
    for (const item of candidates) {
      const labels = this.collectJikanCandidateTitles(item);
      const score = this.computeBestTitleScore(normalizedTitle, labels);
      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }

    if (!bestItem || bestScore < 0.45) {
      return null;
    }

    const fallbackTitle =
      bestItem.title_english?.trim() ||
      bestItem.title?.trim() ||
      bestItem.title_japanese?.trim() ||
      title;

    return {
      title: fallbackTitle,
      malId: bestItem.mal_id,
      anilistId: null,
      coverImage:
        bestItem.images?.jpg?.large_image_url?.trim() ||
        bestItem.images?.jpg?.image_url?.trim() ||
        null,
      genres: (bestItem.genres ?? [])
        .map((genre) => (genre?.name ?? '').trim())
        .filter((genre) => genre.length > 0),
      totalChapters:
        typeof bestItem.chapters === 'number' ? bestItem.chapters : null,
      description: bestItem.synopsis?.trim() || null,
      publicationStatus: bestItem.status?.trim() || null,
      author:
        (bestItem.authors ?? [])
          .map((author) => (author?.name ?? '').trim())
          .find((author) => author.length > 0) || null,
    };
  }

  private async resolveFromAniList(
    title: string,
    normalizedTitle: string,
  ): Promise<CatalogResolvedManga | null> {
    const query = `
      query ($search: String!, $perPage: Int!) {
        Page(page: 1, perPage: $perPage) {
          media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
            id
            idMal
            title {
              romaji
              english
              native
            }
            synonyms
            coverImage {
              large
              medium
            }
            genres
            chapters
            description(asHtml: false)
            status
            staff {
              nodes {
                name {
                  full
                }
              }
            }
          }
        }
      }
    `;

    let response: Response;
    try {
      response = await fetch(this.ANILIST_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: {
            search: title,
            perPage: 10,
          },
        }),
      });
    } catch (error) {
      this.logger.warn(
        `AniList lookup failed for "${title}": ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as AniListSearchResponse;
    const candidates = payload.data?.Page?.media ?? [];
    if (!candidates.length) {
      return null;
    }

    let bestItem: AniListSearchItem | null = null;
    let bestScore = 0;
    for (const item of candidates) {
      const labels = this.collectAniListCandidateTitles(item);
      const score = this.computeBestTitleScore(normalizedTitle, labels);
      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }

    if (!bestItem || bestScore < 0.45) {
      return null;
    }

    const resolvedTitle =
      bestItem.title?.english?.trim() ||
      bestItem.title?.romaji?.trim() ||
      bestItem.title?.native?.trim() ||
      title;

    return {
      title: resolvedTitle,
      malId:
        typeof bestItem.idMal === 'number' && bestItem.idMal > 0
          ? bestItem.idMal
          : null,
      anilistId: bestItem.id,
      coverImage:
        bestItem.coverImage?.large?.trim() ||
        bestItem.coverImage?.medium?.trim() ||
        null,
      genres: (bestItem.genres ?? [])
        .map((genre) => (genre ?? '').trim())
        .filter((genre) => genre.length > 0),
      totalChapters:
        typeof bestItem.chapters === 'number' ? bestItem.chapters : null,
      description: bestItem.description?.trim() || null,
      publicationStatus: this.mapAniListStatus(bestItem.status),
      author:
        (bestItem.staff?.nodes ?? [])
          .map((node) => node?.name?.full?.trim() ?? '')
          .find((author) => author.length > 0) || null,
    };
  }

  private async resolveFromMangaDex(
    title: string,
  ): Promise<CatalogResolvedManga | null> {
    let dexManga: Awaited<ReturnType<MangaDexService['searchMangaByTitle']>>;
    try {
      dexManga = await this.mangaDexService.searchMangaByTitle(title);
    } catch (error) {
      this.logger.warn(
        `MangaDex lookup failed for "${title}": ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }

    if (!dexManga) {
      return null;
    }

    const [descriptions, coverImage] = await Promise.all([
      this.mangaDexService.getDescriptions(dexManga.id),
      this.mangaDexService.getCoverImageUrl(dexManga.id),
    ]);

    const totalChaptersRaw = dexManga.attributes.lastChapter?.trim();
    const parsedTotalChapters = totalChaptersRaw
      ? Number.parseInt(totalChaptersRaw, 10)
      : Number.NaN;

    return {
      title,
      malId: this.buildCatalogFallbackMalId(`mangadex:${dexManga.id}`, 0),
      anilistId: null,
      coverImage: coverImage?.trim() || null,
      genres: [],
      totalChapters:
        Number.isFinite(parsedTotalChapters) && parsedTotalChapters > 0
          ? parsedTotalChapters
          : null,
      description:
        descriptions.en?.trim() || descriptions.pt?.trim() || null,
      publicationStatus: this.mapMangaDexStatus(
        dexManga.attributes.status ?? null,
      ),
      author: null,
    };
  }

  private collectJikanCandidateTitles(item: JikanSearchItem): string[] {
    const titles = [
      item.title,
      item.title_english,
      item.title_japanese,
      ...(item.title_synonyms ?? []),
      ...(item.titles ?? []).map((entry) => entry?.title ?? null),
    ];
    return titles
      .map((value) => (value ?? '').trim())
      .filter((value) => value.length > 0);
  }

  private collectAniListCandidateTitles(item: AniListSearchItem): string[] {
    const titles = [
      item.title?.english,
      item.title?.romaji,
      item.title?.native,
      ...(item.synonyms ?? []),
    ];
    return titles
      .map((value) => (value ?? '').trim())
      .filter((value) => value.length > 0);
  }

  private normalizeTitleForMatching(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private computeBestTitleScore(query: string, candidates: string[]): number {
    let best = 0;

    for (const rawCandidate of candidates) {
      const candidate = this.normalizeTitleForMatching(rawCandidate);
      if (!candidate) continue;
      if (candidate === query) return 1;
      if (candidate.startsWith(query) || query.startsWith(candidate)) {
        best = Math.max(best, 0.9);
      } else if (candidate.includes(query) || query.includes(candidate)) {
        best = Math.max(best, 0.82);
      }

      const tokenScore = this.computeTokenJaccard(query, candidate);
      best = Math.max(best, tokenScore);
    }

    return best;
  }

  private computeTokenJaccard(left: string, right: string): number {
    const leftTokens = new Set(left.split(' ').filter(Boolean));
    const rightTokens = new Set(right.split(' ').filter(Boolean));
    if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

    let intersection = 0;
    for (const token of leftTokens) {
      if (rightTokens.has(token)) {
        intersection++;
      }
    }

    const union = new Set([...leftTokens, ...rightTokens]).size;
    return union === 0 ? 0 : intersection / union;
  }

  private mapAniListStatus(status: string | null | undefined): string | null {
    if (!status) return null;
    if (status === 'RELEASING') return 'Publishing';
    if (status === 'FINISHED') return 'Finished';
    if (status === 'HIATUS') return 'On Hiatus';
    if (status === 'CANCELLED') return 'Discontinued';
    return null;
  }

  private mapMangaDexStatus(status: string | null | undefined): string | null {
    if (!status) return null;
    if (status === 'ongoing') return 'Publishing';
    if (status === 'completed') return 'Finished';
    if (status === 'hiatus') return 'On Hiatus';
    if (status === 'cancelled') return 'Discontinued';
    return null;
  }

  private buildCatalogFallbackMalId(key: string, attempt: number): number {
    const digest = createHash('sha256')
      .update(`catalog:${key}:${attempt}`)
      .digest();
    const value = digest.readUInt32BE(0) % 2_000_000_000;
    return -(value + 1);
  }

  private buildSyntheticMalId(
    partnerId: string,
    externalMangaId: string,
    attempt: number,
  ): number {
    const digest = createHash('sha256')
      .update(`${partnerId}:${externalMangaId}:${attempt}`)
      .digest();
    const value = digest.readUInt32BE(0) % 2_000_000_000;
    return -(value + 1);
  }

  private normalizeExternalTitle(value: string): string {
    return value
      .replace(/\s*[-|]\s*(mangalivre|manga livre)\s*$/i, '')
      .replace(/\s*[-|]\s*cap(?:i|\u00ed)tulo\s+\d+.*$/i, '')
      .replace(/\s*[-|]\s*chapter\s+\d+.*$/i, '')
      .replace(/\s*[-|]\s*ch\.?\s*\d+.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildTitleFromExternalMangaId(externalMangaId: string): string {
    return String(externalMangaId || '')
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private selectPreferredSyncTitle(
    rawTitle: string,
    externalMangaId: string,
  ): string {
    const normalizedTitle = this.normalizeExternalTitle(rawTitle);
    const slugBasedTitle = this.normalizeExternalTitle(
      this.buildTitleFromExternalMangaId(externalMangaId),
    );

    if (!normalizedTitle) {
      return slugBasedTitle;
    }
    if (!slugBasedTitle) {
      return normalizedTitle;
    }

    const normalizedTitleForMatch =
      this.normalizeTitleForMatching(normalizedTitle);
    const slugTitleForMatch = this.normalizeTitleForMatching(slugBasedTitle);
    const jaccard = this.computeTokenJaccard(
      normalizedTitleForMatch,
      slugTitleForMatch,
    );
    const isContains =
      normalizedTitleForMatch.includes(slugTitleForMatch) ||
      slugTitleForMatch.includes(normalizedTitleForMatch);

    return jaccard >= 0.4 || isContains ? normalizedTitle : slugBasedTitle;
  }

  private async logSyncEvent(
    tx: Prisma.TransactionClient,
    payload: {
      userId: string;
      partnerId: string;
      externalMangaId: string;
      chapter: number;
      outcome: SyncOutcome;
      details: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await tx.syncEventLog.create({
      data: payload,
    });
  }
}
