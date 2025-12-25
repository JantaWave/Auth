import redisClient from "../config/redis.js";

export async function getOrSetCache(key, ttlSeconds, fetcher) {
  const cached = await redisClient.get(key);
  if (cached) return JSON.parse(cached);

  const fresh = await fetcher();
  if (fresh) {
    await redisClient.set(key, JSON.stringify(fresh), "EX", ttlSeconds);
  }
  return fresh;
}

export async function invalidate(keys = []) {
  if (!keys.length) return;
  await redisClient.del(keys);
}
