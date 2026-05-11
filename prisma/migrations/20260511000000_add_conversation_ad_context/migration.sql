-- Capture WhatsApp click-to-WhatsApp ad referral context on inbound messages.
-- Populated automatically by the worker when it detects externalAdReply on
-- the customer's first message after clicking a CTWA ad. Sticky-first: set
-- once, never overwritten (so a later ad click doesn't clobber the original
-- context the AI used to greet them).
-- Shape: { title, body, sourceUrl, sourceId, ctwaClid, capturedAt, mediaType?, thumbnailUrl? }
ALTER TABLE "Conversation"
  ADD COLUMN "adContext" JSONB;
