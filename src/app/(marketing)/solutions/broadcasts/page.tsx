import { solutionMetadata } from "@/lib/solution-metadata"
import {
  MegaphoneIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  UserGroupIcon,
  BoltIcon,
  CheckIcon,
} from "@heroicons/react/24/outline"
import { SolutionPageLayout } from "@/components/landing/SolutionPageLayout"

export const metadata = solutionMetadata({
  title: "Broadcasts & Campaigns",
  description: "Reach your entire contact base on WhatsApp and let D-Zero AI handle every reply automatically.",
  slug: "broadcasts",
  ogImage: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=1600&q=80",
  ogImageAlt: "WhatsApp broadcast campaigns — D-Zero AI",
  keywords: ["whatsapp broadcast campaign", "bulk whatsapp messaging AI", "whatsapp marketing automation", "campaign reply bot", "whatsapp bulk sender"],
})

export default function BroadcastsSolutionPage() {
  return (
    <SolutionPageLayout
      slug="broadcasts"
      BadgeIcon={MegaphoneIcon}
      badge="Broadcasts & Campaigns"
      heroImage="https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=1600&q=80"
      heroImageAlt="Digital marketing and social media"
      heroTitle={<>Reach Your Entire Customer<br />Base on WhatsApp.</>}
      heroSub="Send targeted broadcast messages and promotions to your WhatsApp contacts — and let D-Zero AI handle every reply automatically, at any scale."
      floatingBadges={[
        { text: "98% Open Rate", dot: true },
        { text: "Campaign Live", Icon: CheckIcon },
        { text: "All Replies Handled", dot: true },
      ]}
      stats={[
        { val: "98%", label: "WhatsApp open rate" },
        { val: "5×", label: "Higher engagement vs email" },
        { val: "100%", label: "Replies handled by AI" },
      ]}
      chatBotName="CampaignBot AI"
      chatTitle={<>From broadcast sent to<br />sale closed automatically</>}
      chatDesc="When you send a campaign, D-Zero AI handles every reply that comes back — answering product questions, checking stock, and converting interested customers into buyers, automatically."
      chatPoints={[
        "Sends personalised messages to your full contact list",
        "Handles every campaign reply without your team getting involved",
        "Converts interested customers into leads and sales automatically",
        "Tracks delivery, engagement, and conversions from your dashboard",
      ]}
      conversation={[
        { from: "customer", text: "Hey, I got your message about the flash sale. Is the 40% off still on?" },
        { from: "ai", text: "Hi! 👋 Yes, the sale runs until Sunday midnight. Use code FLASH40 at checkout for 40% off everything." },
        { from: "customer", text: "Amazing! Does it work on the new collection too?" },
        { from: "ai", text: "It works on everything except already-discounted items. Is there something specific you're looking for? I can check availability." },
        { from: "customer", text: "The blue sneakers in size 9" },
        { from: "ai", text: "Size 9 is in stock! Want me to reserve a pair while you complete checkout? 🛍️", badge: "Sale Converted" },
      ]}
      painTitle="Sound familiar?"
      painPoints={[
        { title: "Email open rates are terrible", desc: "WhatsApp has 98% open rates vs 20% for email. You're putting your campaigns in the wrong channel." },
        { title: "Broadcasts trigger replies you can't handle", desc: "You send a campaign and get flooded with replies your team simply can't manage at volume." },
        { title: "No way to target specific customers", desc: "You blast everyone the same message instead of segmenting by product interest, purchase history, or behaviour." },
      ]}
      benefitsTitle="Everything your campaigns need on WhatsApp"
      benefits={[
        { Icon: MegaphoneIcon, title: "Broadcast Campaigns", desc: "Send targeted messages to your opted-in WhatsApp audience in minutes — to thousands of contacts at once." },
        { Icon: ChatBubbleLeftRightIcon, title: "AI-Handled Replies", desc: "Every reply to your broadcast is handled automatically — answering questions and converting interest into sales." },
        { Icon: UserGroupIcon, title: "Personalisation at Scale", desc: "Messages personalised with customer name, product interest, and purchase history — for every contact." },
        { Icon: ChartBarIcon, title: "Campaign Analytics", desc: "Track delivery, open rates, and conversions from your D-Zero dashboard in real time." },
      ]}
      stepsTitle="Up and running in minutes"
      steps={[
        { number: "1", title: "Connect your WhatsApp number", desc: "Scan a QR code or use a pairing code. No technical setup — live in under 5 minutes." },
        { number: "2", title: "Import your contact list", desc: "Upload your opted-in contacts and segment them by product interest, location, or purchase history." },
        { number: "3", title: "Send your campaign and let AI handle replies", desc: "Launch your broadcast and watch the AI convert every interested reply into a lead or sale — automatically." },
      ]}
      showcaseImages={[
        { src: "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=80", alt: "Digital marketing campaign", badge: "Campaign Live" },
        { src: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=800&q=80", alt: "Marketing and broadcast", badge: "98% Opened", BadgeIcon: CheckIcon },
      ]}
      showcaseQuote="We sent our first WhatsApp campaign to 2,000 contacts and the AI handled all 340 replies automatically. We woke up to 67 new orders."
      ctaTitle="Ready to make WhatsApp your highest-converting channel?"
      ctaDesc="Join businesses using D-Zero AI to run WhatsApp campaigns that actually convert — at any scale."
    />
  )
}
