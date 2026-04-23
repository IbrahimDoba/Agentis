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
