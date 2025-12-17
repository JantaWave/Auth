import { redis } from "googleapis/build/src/apis/redis/index.js";
import redisClient from "../config/redis";

export const getCache = async (key) => {
  const data = await redisClient.get(key);
  return data ? JSON.parse(data) : null;
};

export const setCache = async (key, value, ttl = 60) => {
  await redisClient.set(key, JSON.stringify(value), "EX", ttl);
};

export const delCache = async (key) => {
  await redisClient.del(key);
};
