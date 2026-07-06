import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Events Controller (e2e)', () => {
  let app: INestApplication<App>;
  let jwtToken: string;
  let workspaceId: string;
  let eventId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Register and login to obtain JWT token
    const username = `testuser_${Date.now()}`;
    const password = 'password123';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password })
      .expect(200);

    jwtToken = loginRes.body.accessToken;

    // Create a workspace to run tests inside
    const workspaceRes = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ name: 'E2E Test Workspace', description: 'Testing workspace' })
      .expect(201);

    workspaceId = workspaceRes.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create an event inside the workspace', async () => {
    const res = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/events`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        name: 'Annual Sports Meet 2028',
        description: 'E2E Testing Event',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
        status: 'upcoming',
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Annual Sports Meet 2028');
    expect(res.body.status).toBe('upcoming');
    eventId = res.body.id;
  });

  it('should retrieve a list of events', async () => {
    const res = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/events`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.some((e: any) => e.id === eventId)).toBe(true);
  });

  it('should update the created event', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/workspaces/${workspaceId}/events/${eventId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        status: 'ongoing',
        description: 'Updated E2E description',
      })
      .expect(200);

    expect(res.body.status).toBe('ongoing');
    expect(res.body.description).toBe('Updated E2E description');
  });

  it('should delete the event', async () => {
    await request(app.getHttpServer())
      .delete(`/workspaces/${workspaceId}/events/${eventId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(204);

    // Verify it is deleted
    const res = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/events`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    expect(res.body.some((e: any) => e.id === eventId)).toBe(false);
  });
});
