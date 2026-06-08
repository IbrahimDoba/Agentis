-- Per-user "Developer mode" toggle. When on, the dashboard surfaces the
-- Developer area (integrations hub + API keys) in the sidebar. Additive,
-- defaults off so nothing changes for existing users.
ALTER TABLE "User" ADD COLUMN "developerModeEnabled" BOOLEAN NOT NULL DEFAULT false;
