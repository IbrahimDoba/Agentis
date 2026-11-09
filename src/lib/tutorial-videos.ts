// Tutorial videos hosted on the Dailzero YouTube channel. They show Dailzero
// branding, so callers only show them on the platform tenant. A video with no
// youtubeId yet (not uploaded) is hidden everywhere.

export type TutorialId =
  | "dashboard-tour"
  | "create-agent"
  | "conversations"
  | "channels"
  | "appointments"
  | "broadcasts"
  | "status"
  | "team"
  | "billing"
  | "agent-configuration"
  | "agent-documents"
  | "agent-settings"

export interface TutorialVideo {
  id: TutorialId
  youtubeId: string | null
  title: string
  description: string
  duration: string
  thumbnail: string
  // Written guide that covers the same ground; the video sits at its top.
  guideSlugs: string[]
}

export const TUTORIAL_PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLZ-Pol4qjjuo"

const TUTORIALS: TutorialVideo[] = [
  {
    id: "dashboard-tour",
    youtubeId: "Z_7tMkv9VZU",
    title: "Dashboard tour",
    description: "A quick look around: where your agents, chats, broadcasts and billing live.",
    duration: "1:17",
    thumbnail: "/tutorials/01-dashboard-tour.jpg",
    guideSlugs: ["welcome"],
  },
  {
    id: "create-agent",
    youtubeId: "tRJLpiwRi50",
    title: "Create your WhatsApp AI agent",
    description: "Set up your agent from scratch and see what each tab on the agent page does.",
    duration: "1:46",
    thumbnail: "/tutorials/02-create-an-agent-and-tabs.jpg",
    guideSlugs: ["first-agent", "profile-tab"],
  },
  {
    id: "conversations",
    youtubeId: "zkcZiXYs5-4",
    title: "Conversations",
    description: "Read every chat your AI is having and take over when a customer needs a person.",
    duration: "1:31",
    thumbnail: "/tutorials/03-conversations.jpg",
    guideSlugs: ["conversations"],
  },
  {
    id: "channels",
    youtubeId: "M1CRnmdJK1Y",
    title: "Connect your WhatsApp number",
    description: "Link your WhatsApp number so your agent can start replying to customers.",
    duration: "1:27",
    thumbnail: "/tutorials/04-channels.jpg",
    guideSlugs: ["connecting-whatsapp"],
  },
  {
    id: "appointments",
    youtubeId: "IfoX6ct1EdI",
    title: "Appointments",
    description: "Let the AI book meetings and calls, and get reminded before each one.",
    duration: "1:14",
    thumbnail: "/tutorials/05-appointments.jpg",
    guideSlugs: [],
  },
  {
    id: "broadcasts",
    youtubeId: "lIN-xM7yRqw",
    title: "Broadcasts",
    description: "Send one message to many customers at a safe pace, and track who replied.",
    duration: "1:47",
    thumbnail: "/tutorials/06-broadcasts.jpg",
    guideSlugs: ["broadcasts"],
  },
  {
    id: "status",
    youtubeId: "GVv_xWZNfF4",
    title: "WhatsApp Status and Autopilot",
    description: "Post to your WhatsApp Status, save posts to your gallery and let Autopilot keep it fresh.",
    duration: "2:17",
    thumbnail: "/tutorials/07-status.jpg",
    guideSlugs: [],
  },
  {
    id: "team",
    youtubeId: "oOq6wcf5ySw",
    title: "Add your team",
    description: "Invite staff to your workspace and choose what each person can do.",
    duration: "0:50",
    thumbnail: "/tutorials/08-team.jpg",
    guideSlugs: ["team-workspaces"],
  },
  {
    id: "billing",
    youtubeId: "E8ui5OpSar4",
    title: "Billing and credits",
    description: "How plans and credits work, and how to top up or upgrade.",
    duration: "1:20",
    thumbnail: "/tutorials/09-billing.jpg",
    guideSlugs: ["billing-credits"],
  },
  {
    id: "agent-configuration",
    youtubeId: "VG-uXaONmGM",
    title: "Agent configuration",
    description: "Teach your AI your products, prices, hours and how it should talk to customers.",
    duration: "1:14",
    thumbnail: "/tutorials/10-agent-configuration.jpg",
    guideSlugs: ["configuration-tab"],
  },
  {
    id: "agent-documents",
    youtubeId: null,
    title: "Agent documents",
    description: "Upload price lists and documents, or add your website, so your agent can answer from them.",
    duration: "0:44",
    thumbnail: "/tutorials/11-agent-documents.jpg",
    guideSlugs: ["documents-tab"],
  },
  {
    id: "agent-settings",
    youtubeId: null,
    title: "Agent settings",
    description: "Control when your AI replies: reply guard, auto-pause when you step in, and hand-offs to a person.",
    duration: "1:13",
    thumbnail: "/tutorials/12-agent-settings.jpg",
    guideSlugs: ["settings-tab", "auto-pause"],
  },
]

export type PublishedTutorial = TutorialVideo & { youtubeId: string }

const isPublished = (v: TutorialVideo): v is PublishedTutorial => v.youtubeId !== null

export const PUBLISHED_TUTORIALS: PublishedTutorial[] = TUTORIALS.filter(isPublished)

export function getTutorial(id: TutorialId): PublishedTutorial | undefined {
  return PUBLISHED_TUTORIALS.find((v) => v.id === id)
}

export function getTutorialForGuide(slug: string): PublishedTutorial | undefined {
  return PUBLISHED_TUTORIALS.find((v) => v.guideSlugs.includes(slug))
}
