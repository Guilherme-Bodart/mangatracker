import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Manga, MangaStatus, Prisma } from '@prisma/client';
import { Cache } from 'cache-manager';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { CACHE_TTL_MS } from '../cache/cache-ttl.constants';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIntegrationPartnerDto } from './dto/create-integration-partner.dto';
import { ExchangeIntegrationConnectDto } from './dto/exchange-integration-connect.dto';
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
};

type IntegrationConnectPayload = {
  userId: string;
  partnerId: string;
  partnerSlug: string;
  scopes: string[];
  sourceDomain?: string;
};

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async listPartners() {
    return this.prisma.integrationPartner.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        allowedDomains: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async listConnectablePartners() {
    return this.prisma.integrationPartner.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        allowedDomains: true,
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
        isActive: dto.isActive ?? true,
      },
      select: {
        id: true,
        slug: true,
        name: true,
        allowedDomains: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...created,
      clientSecret,
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
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: {
        id: true,
        slug: true,
        name: true,
        allowedDomains: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async rotatePartnerSecret(
    id: string,
    dto: RotateIntegrationPartnerSecretDto,
  ) {
    const existing = await this.prisma.integrationPartner.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new BadRequestException('Integration partner not found');
    }

    const clientSecret = dto.clientSecret?.trim() || this.generatePartnerSecret();
    const clientSecretHash = await bcrypt.hash(clientSecret, 12);
    await this.prisma.integrationPartner.update({
      where: { id },
      data: { clientSecretHash },
    });

    return { id, clientSecret };
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
      throw new UnauthorizedException('Integration partner is not allowed');
    }

    this.assertAllowedDomain(partner.allowedDomains, dto.sourceDomain);

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
      throw new UnauthorizedException('Integration partner is not allowed');
    }

    this.assertAllowedDomain(partner.allowedDomains, dto.sourceDomain);

    const isSecretValid = await bcrypt.compare(
      dto.clientSecret,
      partner.clientSecretHash,
    );
    if (!isSecretValid) {
      throw new UnauthorizedException('Invalid partner credentials');
    }

    const cacheKey = this.buildConnectCodeCacheKey(dto.code.trim());
    const payload =
      await this.cacheManager.get<IntegrationConnectPayload>(cacheKey);
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired connect code');
    }
    await this.cacheManager.del(cacheKey);

    if (
      payload.partnerId !== partner.id ||
      payload.partnerSlug !== dto.partnerSlug
    ) {
      throw new UnauthorizedException('Connect code does not match partner');
    }

    if (
      payload.sourceDomain &&
      dto.sourceDomain?.trim().toLowerCase() !== payload.sourceDomain
    ) {
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
      throw new UnauthorizedException('Integration partner is not allowed');
    }

    if (dto.partnerSlug !== auth.partnerSlug) {
      throw new ForbiddenException('Partner slug mismatch for integration token');
    }

    this.assertAllowedDomain(partner.allowedDomains, dto.sourceDomain);

    if (auth.scopes.length > 0 && !auth.scopes.includes('manga:write')) {
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
      throw new ForbiddenException('Partner is not connected for this user');
    }

    if (
      connection.scopes.length > 0 &&
      !connection.scopes.includes('manga:write')
    ) {
      throw new ForbiddenException('Missing manga:write scope');
    }

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
        this.normalizeExternalTitle(dto.title),
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

    return result;
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

  private generatePartnerSecret(): string {
    return randomBytes(32).toString('hex');
  }

  private async getOrCreateExternalManga(
    tx: Prisma.TransactionClient,
    partnerId: string,
    externalMangaId: string,
    title: string,
  ): Promise<Manga> {
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
      .replace(/\s*[-|]\s*cap[ií]tulo\s+\d+.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
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
