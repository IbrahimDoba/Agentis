import { NextResponse } from "next/server"

const siteInfo = {
  product: {
    name: "D-Zero AI",
    tagline: "Your Business, Always Responding",
    description:
      "D-Zero AI deploys an AI agent that handles WhatsApp conversations 24/7. It answers questions, captures leads, and delights customers — automatically. No human intervention needed for routine queries.",
    stats: {
      conversationsHandled: "1,200+",
      responseTime: "Under 2 seconds",
      uptime: "24/7 guaranteed",
      businessesTrusted: "10+ businesses across Nigeria",
    },
  },

  features: [
    {
      title: "Instant AI Responses",
      description:
        "Your AI agent reads and replies to every WhatsApp message within seconds — 24 hours a day, 7 days a week. No human intervention needed for routine queries.",
      bullets: [
        "Sub-2 second average response time",
        "Context-aware multi-turn conversations",
        "Handles unlimited concurrent chats",
        "Smart handoff to human agents when needed",
      ],
    },
    {
      title: "Full Conversation Dashboard",
      description:
        "Monitor every customer interaction in real-time from a clean, intuitive dashboard. Track trends, review transcripts, and see what your customers actually need.",
      bullets: [
        "Live conversation feed with search",
        "Conversation analytics and trends",
        "Customer satisfaction tracking",
        "Full transcript history",
      ],
    },
    {
      title: "Easy Agent Configuration",
      description:
        "Setting up your AI agent takes minutes, not weeks. Tell us about your business, define your agent's personality, and we handle the rest. No technical knowledge required.",
      bullets: [
        "Guided setup wizard",
        "AI-generated FAQ suggestions",
        "Custom greeting and sign-off messages",
        "Multiple language support",
      ],
    },
  ],

  howItWorks: [
    {
      step: 1,
      title: "Sign Up & Apply",
      description:
        "Create your D-Zero AI account and submit basic business information. Approval takes less than 24 hours.",
    },
    {
      step: 2,
      title: "Configure Your Agent",
      description:
        "Fill in your business details, FAQs, and response style. Our AI can auto-generate suggestions from your website.",
    },
    {
      step: 3,
      title: "We Set It Up",
      description:
        "Our team connects your WhatsApp Business number to the AI agent. You'll be notified once it's live.",
    },
    {
      step: 4,
      title: "Go Live & Monitor",
      description:
        "Your agent starts handling conversations immediately. Watch the dashboard in real time and optimize as you grow.",
    },
  ],

  pricing: {
    trialInfo: "7-day free trial on both plans. No credit card required. Cancel anytime.",
    annualDiscount: "Save 20% with annual billing.",
    plans: [
      {
        name: "Starter",
        monthlyPrice: "₦50,000/month",
        annualPrice: "₦40,000/month (billed annually)",
        description:
          "Perfect for small businesses getting started with AI-powered WhatsApp customer service.",
        features: [
          "1 AI WhatsApp Agent",
          "60,000 credits/month (~600 conversations)",
          "Text responses only",
          "Basic FAQ handling",
          "Business hours configuration",
          "Custom greeting & sign-off",
          "Conversation monitoring dashboard",
          "Email support",
          "7-day free trial",
          "₦1,000 per 1,000 extra credits",
        ],
        notIncluded: [
          "Voice call capability",
          "Image & media sending",
          "Advanced AI personality",
          "Multi-language support",
          "Priority support",
          "Advanced analytics",
        ],
        overageRate: "₦1,000 per 1,000 credits above 60,000",
      },
      {
        name: "Pro",
        monthlyPrice: "₦85,000/month",
        annualPrice: "₦68,000/month (billed annually)",
        description:
          "For growing businesses that need advanced AI capabilities, higher volume, and priority support.",
        popular: true,
        features: [
          "1 AI WhatsApp Agent",
          "100,000 credits/month (~1,000 conversations)",
          "Text + Voice call capability",
          "Image & media sending",
          "Automated follow-up messages",
          "Advanced AI with custom personality",
          "Multi-language support (English + any language)",
          "Priority support (24hr response)",
          "Advanced analytics & insights",
          "Custom response guidelines",
          "7-day free trial",
          "₦800 per 1,000 extra credits",
        ],
        overageRate: "₦800 per 1,000 credits above 100,000",
      },
    ],
    enterprise: {
      description:
        "Custom conversation limits, multiple agents, dedicated support, and API access — built for high-volume businesses.",
      cta: "Book a free demo via the Contact page to discuss requirements.",
    },
  },

  faqs: [
    {
      question: "Is there a free trial?",
      answer:
        "Yes! Both the Starter and Pro plans come with a 7-day free trial. You get full access to all features of your chosen plan. No credit card is required to start.",
    },
    {
      question: "Can I switch plans?",
      answer:
        "Absolutely. You can upgrade from Starter to Pro at any time and the change takes effect immediately. Downgrading happens at the start of your next billing cycle.",
    },
    {
      question: "What happens if I exceed my conversation limit?",
      answer:
        "On the Starter plan, additional credits beyond your 60,000 monthly allowance are charged at ₦1,000 per 1,000 credits. On the Pro plan, the overage rate is ₦800 per 1,000 credits. Free plan users are paused until the next month.",
    },
    {
      question: "Do you offer custom plans?",
      answer:
        "Yes! If your business needs more conversations, multiple agents, or custom integrations, we offer enterprise plans. Book a call with our team to discuss your requirements.",
    },
    {
      question: "What payment methods do you accept?",
      answer:
        "We accept all major Nigerian bank transfers, Paystack, and Flutterwave. Monthly billing happens automatically on your chosen payment method.",
    },
    {
      question: "Can I get a refund?",
      answer:
        "If you're not satisfied within your first 7 days of a paid plan, we offer a full refund, no questions asked.",
    },
    {
      question: "What industries does D-Zero AI work for?",
      answer:
        "D-Zero AI works for any business that receives customer messages on WhatsApp. Industries include e-commerce, fashion retail, real estate, healthcare, food & beverage, education, logistics, beauty & wellness, auto dealerships, travel & tourism, event planning, professional services, financial services, and hospitality.",
    },
    {
      question: "How long does setup take?",
      answer:
        "Setup takes minutes, not weeks. After you configure your agent, our team connects your WhatsApp Business number. You'll be live within 24 hours of approval.",
    },
  ],

  testimonials: [
    {
      quote:
        "Before D-Zero AI, we missed dozens of WhatsApp messages every day. Now our agent handles everything while we sleep. Sales have gone up 40% since we launched.",
      name: "Tunde Adeyemi",
      role: "CEO, QuickStyle Lagos",
    },
    {
      quote:
        "Our customers love that they get instant responses even at midnight. The agent knows our entire product catalogue and handles orders perfectly. Worth every kobo.",
      name: "Ngozi Okonkwo",
      role: "Founder, Mama's Kitchen Abuja",
    },
    {
      quote:
        "We run a real estate agency and clients ask lots of questions. D-Zero AI handles the initial enquiries so my team only speaks to serious buyers. Game changer.",
      name: "Emeka Okafor",
      role: "MD, HomeFind Realty",
    },
  ],

  links: {
    signup: "/signup",
    pricing: "/pricing",
    contact: "/contact",
    features: "/features",
    howItWorks: "/how-it-works",
    blog: "/blog",
  },
}

export async function GET() {
  return NextResponse.json(siteInfo, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  })
}
