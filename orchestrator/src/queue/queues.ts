import { Queue } from "bullmq"
import { getRedis } from "./redis.js"

export const inboundQueue = new Queue("orchestrator-inbound", {
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
})

export const embedQueue = new Queue("orchestrator-embed", {
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
})

export const crawlQueue = new Queue("orchestrator-crawl", {
  connection: getRedis(),
  defaultJobOptions: {
    // One retry only. A crawl takes up to two minutes and a site that failed
    // twice is usually down or blocking us, not flaky — three attempts just
    // means six minutes of a stuck spinner in the dashboard.
    attempts: 2,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
})
