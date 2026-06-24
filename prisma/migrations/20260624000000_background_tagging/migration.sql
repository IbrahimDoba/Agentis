-- Background chat tagging: AI keeps tagging while a human handles the chat
-- (cheap throttled classify-only pass). Off by default.
ALTER TABLE "Agent" ADD COLUMN "backgroundTaggingEnabled" BOOLEAN NOT NULL DEFAULT false;
