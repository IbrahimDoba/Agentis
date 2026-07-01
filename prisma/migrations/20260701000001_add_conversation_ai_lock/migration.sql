-- AlterTable: "always human" lock so a conversation is never auto-resumed to AI
ALTER TABLE "Conversation" ADD COLUMN "aiLocked" BOOLEAN NOT NULL DEFAULT false;
