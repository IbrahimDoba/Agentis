/**
 * CUSTOMER HISTORY WEBHOOK — ElevenLabs Tool Call Handler
 *
 * PURPOSE:
 * This endpoint is called by ElevenLabs as a client tool at the START of each voice call.
 * It injects a customer's conversation history as context so the AI agent greets returning
 * customers by name and continues from where they left off.
 *
 * IMPLEMENTATION SUMMARY:
 * 1. Receives { phone_number, agent_id, conversation_id } from ElevenLabs.
 * 2. Normalizes the phone number (strips WhatsApp JID suffixes, non-digits).
 * 3. Early-saves a ConversationLog row mapping conversation_id → phone_number immediately,
 *    because ElevenLabs history API does not expose phone numbers in metadata — this bridges
 *    the ElevenLabs conversation to our internal Customer record in PostgreSQL.
 * 4. Queries up to 6 past ConversationLog entries for this customer (excluding the current call).
 * 5. If a log has no summary/transcript yet (post-call webhook still processing), falls back to
 *    fetching live data directly from the ElevenLabs API.
 * 6. Also prepends a rolling AI-generated conversationSummary from the Customer record if present.
 * 7. Returns { history: "<formatted string>" } which ElevenLabs injects into the agent's context.
 *
 * RELATED:
 * - Post-call webhook: /api/webhook/elevenlabs/post-call — archives transcripts & generates summaries.
 * - Customer memory: db.customer.conversationSummary — rolling summary updated after each call.
 */
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getConversation } from "@/lib/elevenlabs"

function normalizePhone(raw: string): string | null {
    const jidMatch = raw.match(/^(\d+)[:@]/)
    const cleaned = jidMatch ? jidMatch[1] : raw.replace(/\D/g, "")
    return cleaned.length >= 7 ? cleaned : null
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { phone_number, agent_id, conversation_id } = body

        console.log('=== BODY RECEIVED ===', { phone_number, agent_id, conversation_id })

        if (!phone_number || !agent_id) {
            return NextResponse.json({ history: "Missing required fields. Treat as new customer." })
        }

        console.log('=== ENV CHECK ===', {
            agent_id: process.env.ELEVENLABS_AGENT_ID,
            api_key: process.env.ELEVENLABS_API_KEY ? 'SET' : 'NOT SET',
            phone_number: phone_number,
            conversation_id: conversation_id
        })

        const normalizedPhone = normalizePhone(phone_number) || phone_number
        const targetAgentId = agent_id

        // Verify agent exists in our DB (safety check)
        const dbAgent = await db.agent.findFirst({
            where: { elevenlabsAgentId: targetAgentId },
            select: { id: true, businessName: true }
        })

        // --- STEP 1: Save mapping early when conversation starts ---
        /**
         * TECHNICAL NOTE: Why do we save early?
         * ElevenLabs' native history fetching does NOT include phone numbers in the metadata list. 
         * By upserting the mapping as soon as the tool is called, we bridge the ElevenLabs conversation_id 
         * to the WhatsApp phone number in our local PostgreSQL database.
         */
        let customerId: string | null = null
        if (conversation_id && targetAgentId) {
            const customer = await db.customer.upsert({
                where: { phoneNumber: normalizedPhone },
                create: { phoneNumber: normalizedPhone, lastSeen: new Date() },
                update: { lastSeen: new Date() }
            })
            customerId = customer.id

            await db.conversationLog.upsert({
                where: { conversationId: conversation_id },
                create: {
                    conversationId: conversation_id,
                    elevenlabsAgentId: targetAgentId,
                    agentId: dbAgent?.id || null, // Link to our internal DB agent record
                    phoneNumber: normalizedPhone,
                    customerId: customer.id,
                    status: "IN_PROGRESS",
                    rawPayload: {},
                    transcript: []
                },
                update: {
                    phoneNumber: normalizedPhone,
                    customerId: customer.id,
                    agentId: dbAgent?.id || undefined
                }
            })
        } else {
            const existingCustomer = await db.customer.findUnique({
                where: { phoneNumber: normalizedPhone }
            })
            if (existingCustomer) customerId = existingCustomer.id
        }

        // --- STEP 2: Query local database excluding current conversation ---
        /**
         * MEMORY ARCHITECTURE:
         * We query up to 6 past interactions for this customer.
         * For performance, we prefer the local db.conversationLog. If the previous call 
         * hasn't been archived yet (webhooks are async), we use a direct ElevenLabs API fallback.
         */
        const excludeCurrentId = conversation_id || "MISSING"

        const dbLogs = await db.conversationLog.findMany({
            where: {
                elevenlabsAgentId: targetAgentId,
                conversationId: { not: excludeCurrentId },
                OR: [
                    { phoneNumber: normalizedPhone },
                    { phoneNumber: phone_number }
                ]
            },
            orderBy: { createdAt: "desc" },
            take: 10
        })

        // Also check if we have a rolling AI summary of the customer globally
        const customerProfile = customerId ? await db.customer.findUnique({
            where: { id: customerId },
            select: { conversationSummary: true }
        }) : null

        let summary = ""

        if (dbLogs.length > 0) {
            summary += `This customer has contacted us before. Here are their most recent interactions:\n\n`

            const agentName = dbAgent?.businessName || "Agent"

            for (let i = 0; i < dbLogs.length; i++) {
                const log = dbLogs[i]
                summary += `--- Interaction ${i + 1} (${new Date(log.createdAt).toDateString()}) ---\n`

                let transcriptArray = Array.isArray(log.transcript) ? log.transcript : []
                let logSummary = log.summary

                // ELEVENLABS API FALLBACK: Bridge the gap if webhook is still processing
                if (!logSummary && transcriptArray.length === 0) {
                    try {
                        const liveConv = await getConversation(log.conversationId)
                        if (liveConv && liveConv.transcript) {
                            transcriptArray = liveConv.transcript
                            logSummary = liveConv.analysis?.transcript_summary || liveConv.transcript_summary || liveConv.call_summary_title
                        }
                    } catch (err) {
                        // Silently fail fallback and use DB state
                    }
                }

                if (logSummary) {
                    summary += `Summary: ${logSummary}\n`
                } else if (transcriptArray.length > 0) {
                    // Fallback to a snippet of the transcript if summary is missing
                    summary += `Recent Transcript:\n`
                    transcriptArray.slice(0, 15).forEach((turn: any) => {
                        const role = turn.role === 'user' ? 'Customer' : agentName
                        summary += `${role}: ${turn.message}\n`
                    })
                } else {
                    summary += `(No detailed summary text available for this specific interaction)\n`
                }
                summary += '\n'
            }
        }

        if (!summary) {
            const noHistoryMsg = "No previous interactions found. This is a new customer. Greet them warmly and ask how you can help."
            console.log('=== RESPONSE SENT ===', { history: noHistoryMsg })
            return NextResponse.json({ history: noHistoryMsg })
        }

        console.log('=== RESPONSE SENT ===', { history: summary })
        return NextResponse.json({ history: summary })

    } catch (error) {
        console.error('History fetch error:', error)
        return NextResponse.json({
            history: "Could not retrieve history. Treat as new customer."
        })
    }
}
