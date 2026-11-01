import { jidNormalizedUser, type WASocket, type WAMessage, type MessageUserReceiptUpdate } from "@whiskeysockets/baileys"
import { resolvePhone } from "./contacts-store.js"
import { receiptEvents, statusLikeTarget } from "./status-post.js"
import { postIdForStatus, queueStatusEvent } from "../db/queries/status-views.js"

// Status viewers usually show up as @lid. The socket's own mapping is async and
// fresher than the contacts-store cache, so it's tried first.
async function viewerPhone(sock: WASocket, agentId: string, jid: string | null | undefined): Promise<string | null> {
  if (!jid) return null
  if (jid.endsWith("@lid")) {
    const pn = await sock.signalRepository?.lidMapping?.getPNForLID(jid).catch(() => null)
    if (pn) return pn.split("@")[0].split(":")[0]
  }
  return resolvePhone(agentId, jid)
}

// The owner's own phone reports reading its own status; that isn't a viewer.
function ownPhone(sock: WASocket): string | null {
  return sock.user?.id ? jidNormalizedUser(sock.user.id).split("@")[0] : null
}

export async function recordStatusReceipts(sock: WASocket, agentId: string, updates: MessageUserReceiptUpdate[]): Promise<void> {
  const me = ownPhone(sock)
  for (const { key, receipt } of updates) {
    // Cheap filter first: almost every receipt is for an ordinary chat message.
    if (key.remoteJid !== "status@broadcast" || !key.fromMe || !key.id) continue
    const events = receiptEvents(receipt)
    if (events.length === 0) continue
    const postId = await postIdForStatus(agentId, key.id)
    if (!postId) continue
    const phone = await viewerPhone(sock, agentId, receipt.userJid)
    if (!phone || phone === me) continue
    for (const e of events) queueStatusEvent(postId, agentId, phone, e.kind, e.at)
  }
}

export async function recordStatusLike(sock: WASocket, agentId: string, msg: WAMessage): Promise<void> {
  const like = statusLikeTarget(msg)
  if (!like) return
  const postId = await postIdForStatus(agentId, like.statusId)
  if (!postId) return
  const phone = await viewerPhone(sock, agentId, like.likerJid)
  if (!phone || phone === ownPhone(sock)) return
  const at = new Date(Number(msg.messageTimestamp ?? 0) * 1000 || Date.now())
  queueStatusEvent(postId, agentId, phone, "liked", at)
}

export async function recordStatusReply(agentId: string, statusId: string, phone: string, at: Date): Promise<void> {
  const postId = await postIdForStatus(agentId, statusId)
  if (postId) queueStatusEvent(postId, agentId, phone, "replied", at)
}
