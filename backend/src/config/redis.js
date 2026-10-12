import { createClient } from 'redis';

let client;

export const getRedisClient = async () => {
  if (!process.env.REDIS_URL) return null;
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on('error', (error) => console.error('Redis error:', error.message));
    await client.connect();
  }
  return client;
};
