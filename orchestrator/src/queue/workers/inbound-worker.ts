import { Worker, type Job } from "bullmq"
import { getRedis } from "../redis.js"
import { handleInbound, handleReplyJob, type InboundPayload, type ReplyJobPayload } from "../../orchestrator/handle-inbound.js"
import { logger as rootLogger } from "../../lib/logger.js"

const logger = rootLogger.child({ module: "inbound-worker" })

export function startInboundWorker(): Worker {
  const worker = new Worker<InboundPayload | ReplyJobPayload>(
    "orchestrator-inbound",
    async (job: Job<InboundPayload | ReplyJobPayload>) => {
      // Two job kinds share this queue: "inbound" (ingest a message, then reply
      // now or schedule a debounced reply) and "reply" (a delayed, coalesced
      // reply — see handle-inbound.ts).
      if (job.name === "reply") {
        const data = job.data as ReplyJobPayload
        logger.info({ jobId: job.id, agentId: data.agentId, conversationId: data.conversationId, seq: data.seq }, "Processing debounced reply job")
        await handleReplyJob(data)
        return
      }

      const data = job.data as InboundPayload
      logger.info({
        jobId: job.id,
        agentId: data.agentId,
        fromPhone: data.fromPhone,
      }, "Processing inbound job")

      await handleInbound(data)
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
