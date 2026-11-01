import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { getStatusPost, setStatusPostStatus } from "../db/queries/status-posts.js"
import { scheduleStatusPost, deleteStatusPostJob } from "../queue/status-queue.js"

// The app writes the StatusPost row (and cancels it) through Prisma; the worker
// only owns the queue that posts it and the delete that reaches WhatsApp.
export const statusRoutes: FastifyPluginAsync = async (app) => {
  const Params = z.object({ postId: z.string().min(1) })
  const Body = z.object({ agentId: z.string().min(1) })

  app.post("/status/posts/:postId/schedule", async (req, reply) => {
    const { postId } = Params.parse(req.params)
    const { agentId } = Body.parse(req.body)
    const post = await getStatusPost(postId)
    if (!post || post.agentId !== agentId) return reply.code(404).send({ error: "Post not found" })
    if (post.status !== "scheduled") return reply.code(409).send({ error: "Post is not scheduled" })
    await scheduleStatusPost(post.id, post.agentId, post.scheduledAt)
    return reply.send({ ok: true })
  })

  app.post("/status/posts/:postId/delete", async (req, reply) => {
    const { postId } = Params.parse(req.params)
    const { agentId } = Body.parse(req.body)
    const post = await getStatusPost(postId)
    if (!post || post.agentId !== agentId) return reply.code(404).send({ error: "Post not found" })
    if (!(await setStatusPostStatus(post.id, ["posted"], "deleting"))) {
      return reply.code(409).send({ error: "Only a posted status can be deleted" })
    }
    await deleteStatusPostJob(post.id, post.agentId)
    return reply.send({ ok: true })
  })
}
