import request from 'supertest';
import app from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import { seedSuperAdmin } from '../src/utils/seedSuperAdmin.js';

const integrationTest = process.env.MONGODB_URI ? test : test.skip;

describe('Auth basic flows (integration - requires MONGO_URI)', () => {
  test('health endpoint responds without a database', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'smart-queue-api' });
  });

  test('settings endpoints reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.statusCode).toBe(401);
  });

  test('permission endpoints reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/users/permissions');
    expect(res.statusCode).toBe(401);
  });

  test('queue endpoint rejects malformed provider IDs', async () => {
    const res = await request(app).get('/api/queue').query({ providerId: 'invalid' });
    expect(res.statusCode).toBe(400);
  });

  beforeAll(async () => {
    if (!process.env.MONGODB_URI) return;
    await connectDatabase();
    await seedSuperAdmin();
  });

  integrationTest('superadmin can login with seeded credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'superadmin', password: 'ChangeMe@123' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user.username).toBe('superadmin');
  });
});
