import { Redis } from "ioredis"
import { config } from "../config.js"
import { logger } from "../lib/logger.js"

let redisClient: Redis | null = null

export function getRedis(): Redis {
  if (redisClient) return redisClient

  redisClient = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  })

  redisClient.on("connect", () => logger.info("Redis connected"))
  redisClient.on("error", (err: Error) => logger.error({ err }, "Redis error"))

  return redisClient
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
  }
}
