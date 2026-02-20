import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { MangaService } from '../src/manga/manga.service';
import { MailService } from '../src/mail/mail.service';
import { requestTraceMiddleware } from '../src/common/middleware/request-trace.middleware';

type CookieMap = Record<string, string>;

type FakeMangaItem = {
  id: string;
  userId: string;
  status: string;
  rating?: number;
  currentChapter?: number;
  notes?: string;
  isFavorite: boolean;
  manga: {
    id: string;
    malId: number;
    title: string;
  };
};

class FakeMangaService {
  private seq = 1;
  private items = new Map<string, FakeMangaItem>();

  async addMangaToList(userId: string, dto: { malId: number; status: string }) {
    const id = `um-${this.seq++}`;
    const item: FakeMangaItem = {
      id,
      userId,
      status: dto.status,
      isFavorite: false,
      manga: {
        id: `m-${dto.malId}`,
        malId: dto.malId,
        title: `Manga ${dto.malId}`,
      },
    };
    this.items.set(id, item);
    return item;
  }

  async getUserList(userId: string) {
    return Array.from(this.items.values()).filter(
      (item) => item.userId === userId,
    );
  }

  async updateUserManga(
    id: string,
    userId: string,
    dto: Record<string, unknown>,
  ) {
    const item = this.items.get(id);
    if (!item || item.userId !== userId) {
      throw new Error('Manga not found in your list');
    }
    const updated = { ...item, ...dto } as FakeMangaItem;
    this.items.set(id, updated);
    return updated;
  }

  async removeFromUserList(id: string, userId: string) {
    const item = this.items.get(id);
    if (!item || item.userId !== userId) {
      throw new Error('Manga not found in your list');
    }
    this.items.delete(id);
    return { message: 'Manga removed from list' };
  }

  async toggleFavorite(id: string, userId: string) {
    const item = this.items.get(id);
    if (!item || item.userId !== userId) {
      throw new Error('Manga not found in your list');
    }
    const updated = { ...item, isFavorite: !item.isFavorite };
    this.items.set(id, updated);
    return updated;
  }

  async searchManga() {
    return {
      data: [],
      pagination: {
        has_next_page: false,
        current_page: 1,
        last_visible_page: 1,
      },
    };
  }

  async getTopManga() {
    return {
      data: [],
      pagination: {
        has_next_page: false,
        current_page: 1,
        last_visible_page: 1,
      },
    };
  }

  async getUserListByUsername() {
    return { user: null, mangaList: [], stats: {} };
  }
}

describe('Auth and Manga critical flows (e2e)', () => {
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;

  const mailService = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  const mangaService = new FakeMangaService();

  const readCookies = (res: request.Response): CookieMap => {
    const raw = res.headers['set-cookie'] ?? [];
    const list = Array.isArray(raw) ? raw : [raw];
    const map: CookieMap = {};
    for (const entry of list) {
      const [firstPart] = entry.split(';');
      const [name, ...rest] = firstPart.split('=');
      map[name] = decodeURIComponent(rest.join('='));
    }
    return map;
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PASSWORD_RESET_DEV_RESPONSE = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue(mailService)
      .overrideProvider(MangaService)
      .useValue(mangaService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(requestTraceMiddleware);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();

    agent = request.agent(app.getHttpServer());
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should enforce 401 for protected endpoint without auth cookie', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('should perform register/login/logout flow with cookie + csrf', async () => {
    const unique = Date.now();

    const csrfRes = await agent.get('/auth/csrf').expect(200);
    const csrf = readCookies(csrfRes).csrf_token;
    expect(csrf).toBeDefined();

    const registerRes = await agent
      .post('/auth/register')
      .set('x-csrf-token', csrf)
      .send({
        username: `user_${unique}`,
        email: `user_${unique}@example.com`,
        password: 'Password123!',
      })
      .expect(201);

    expect(registerRes.body.user).toBeDefined();

    const meRes = await agent.get('/auth/me').expect(200);
    expect(meRes.body.user.email).toBe(`user_${unique}@example.com`);

    const meCookies = readCookies(meRes);
    const authCsrf = meCookies.csrf_token;
    expect(authCsrf).toBeDefined();

    await agent.post('/auth/logout').set('x-csrf-token', authCsrf).expect(200);
    await agent.get('/auth/me').expect(401);

    const csrfRes2 = await agent.get('/auth/csrf').expect(200);
    const csrf2 = readCookies(csrfRes2).csrf_token;

    await agent
      .post('/auth/login')
      .set('x-csrf-token', csrf2)
      .send({ email: `user_${unique}@example.com`, password: 'Password123!' })
      .expect(201);

    await agent.get('/auth/me').expect(200);
  });

  it('should enforce 403 when csrf header is missing on authenticated mutation', async () => {
    await agent.post('/auth/logout').expect(403);
  });

  it('should support forgot/reset password end-to-end', async () => {
    const unique = Date.now() + 1;

    const csrfRes = await agent.get('/auth/csrf').expect(200);
    const csrf = readCookies(csrfRes).csrf_token;

    await agent
      .post('/auth/register')
      .set('x-csrf-token', csrf)
      .send({
        username: `reset_${unique}`,
        email: `reset_${unique}@example.com`,
        password: 'Password123!',
      })
      .expect(201);

    const forgotRes = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: `reset_${unique}@example.com` })
      .expect(201);

    expect(forgotRes.body.success).toBe(true);
    expect(forgotRes.body.resetToken).toBeDefined();

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        token: forgotRes.body.resetToken,
        password: 'NewPassword123!',
        confirmPassword: 'NewPassword123!',
      })
      .expect(201);

    const csrfOld = await request(app.getHttpServer())
      .get('/auth/csrf')
      .expect(200);
    const oldToken = readCookies(csrfOld).csrf_token;

    await request(app.getHttpServer())
      .post('/auth/login')
      .set('Cookie', csrfOld.headers['set-cookie'])
      .set('x-csrf-token', oldToken)
      .send({ email: `reset_${unique}@example.com`, password: 'Password123!' })
      .expect(401);

    const csrfNew = await request(app.getHttpServer())
      .get('/auth/csrf')
      .expect(200);
    const newToken = readCookies(csrfNew).csrf_token;

    await request(app.getHttpServer())
      .post('/auth/login')
      .set('Cookie', csrfNew.headers['set-cookie'])
      .set('x-csrf-token', newToken)
      .send({
        email: `reset_${unique}@example.com`,
        password: 'NewPassword123!',
      })
      .expect(201);
  });

  it('should return 429 on login brute-force attempts', async () => {
    const unique = Date.now() + 2;

    const csrfRes = await request(app.getHttpServer())
      .get('/auth/csrf')
      .expect(200);
    const cookies = csrfRes.headers['set-cookie'];
    const csrf = readCookies(csrfRes).csrf_token;

    let blocked: request.Response | null = null;
    for (let i = 0; i < 12; i++) {
      const attempt = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', csrf)
        .send({ email: `none_${unique}@example.com`, password: 'invalid' });

      if (attempt.status === 429) {
        blocked = attempt;
        break;
      }
    }

    expect(blocked).toBeDefined();
    if (!blocked) {
      throw new Error('Expected login to be rate-limited');
    }
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
  });

  it('should perform authenticated manga CRUD flow with csrf', async () => {
    const unique = Date.now() + 3;
    const preAuthCsrfRes = await agent.get('/auth/csrf').expect(200);
    const preAuthCsrf = readCookies(preAuthCsrfRes).csrf_token;

    await agent
      .post('/auth/register')
      .set('x-csrf-token', preAuthCsrf)
      .send({
        username: `manga_${unique}`,
        email: `manga_${unique}@example.com`,
        password: 'Password123!',
      })
      .expect(201);

    const meRes = await agent.get('/auth/me').expect(200);
    const csrf = readCookies(meRes).csrf_token;

    const addRes = await agent
      .post('/manga/list')
      .set('x-csrf-token', csrf)
      .send({ malId: 101, status: 'READING' })
      .expect(201);

    const userMangaId = addRes.body.id;
    expect(userMangaId).toBeDefined();

    const listRes = await agent.get('/manga/list').expect(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThan(0);

    const meRes2 = await agent.get('/auth/me').expect(200);
    const csrf2 = readCookies(meRes2).csrf_token;

    await agent
      .patch(`/manga/list/${userMangaId}`)
      .set('x-csrf-token', csrf2)
      .send({ status: 'COMPLETED' })
      .expect(200);

    const meRes3 = await agent.get('/auth/me').expect(200);
    const csrf3 = readCookies(meRes3).csrf_token;

    const favRes = await agent
      .patch(`/manga/list/${userMangaId}/favorite`)
      .set('x-csrf-token', csrf3)
      .expect(200);

    expect(favRes.body.isFavorite).toBe(true);

    const meRes4 = await agent.get('/auth/me').expect(200);
    const csrf4 = readCookies(meRes4).csrf_token;

    await agent
      .delete(`/manga/list/${userMangaId}`)
      .set('x-csrf-token', csrf4)
      .expect(200);
  });
});
