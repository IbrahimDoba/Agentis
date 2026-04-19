import { Worker, type Job } from "bullmq"
import { getRedis } from "../redis.js"
import { handleInbound, type InboundPayload } from "../../orchestrator/handle-inbound.js"
import { logger as rootLogger } from "../../lib/logger.js"

const logger = rootLogger.child({ module: "inbound-worker" })

export function startInboundWorker(): Worker {
  const worker = new Worker<InboundPayload>(
    "orchestrator-inbound",
    async (job: Job<InboundPayload>) => {
      logger.info({
        jobId: job.id,
        agentId: job.data.agentId,
        fromPhone: job.data.fromPhone,
      }, "Processing inbound job")

      await handleInbound(job.data)
    },
    {
      connection: getRedis(),
      concurrency: 20,
    }
  )

  worker.on("failed", (job, err) => {
    logger.error({
      jobId: job?.id,
      agentId: job?.data?.agentId,
      err: err.message,
    }, "Inbound job failed")
  })

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id }, "Inbound job completed")
  })

  return worker
}
