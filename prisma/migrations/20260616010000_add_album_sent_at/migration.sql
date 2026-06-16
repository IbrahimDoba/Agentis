-- Track when the full product album was last sent to a conversation. The AI was
-- re-dumping the whole catalogue on follow-up messages (burning credits); once
-- sent, the album only resends when the customer explicitly asks to see all
-- products again.
ALTER TABLE "Conversation" ADD COLUMN "lastProductAlbumSentAt" TIMESTAMP(3);
