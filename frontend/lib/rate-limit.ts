import { Redis } from "ioredis"
import { RateLimiterRedis } from "rate-limiter-flexible"

const redisClient = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  enableOfflineQueue: false,
})

export const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "middleware",
  points: 20, // 20 requests
  duration: 1, // per 1 second by IP
})

export const apiRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "api_limit",
  points: 100, // 100 requests
  duration: 60, // per 60 seconds by Token/IP
})
