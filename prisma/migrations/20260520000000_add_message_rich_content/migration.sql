-- Add richContent column to Message for structured UI payloads (product cards,
-- category lists, etc.) — rendered by the embed widget alongside the text reply.
ALTER TABLE "Message" ADD COLUMN "richContent" JSONB;
