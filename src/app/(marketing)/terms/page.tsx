import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import styles from "./page.module.css"

export const metadata = {
  title: "Terms of Service — D-Zero AI",
  description: "Read the D-Zero AI Terms of Service governing use of our WhatsApp AI agent platform.",
}

const sections = [
  { id: "acceptance", title: "1. Acceptance of Terms" },
  { id: "service", title: "2. Service Description" },
  { id: "eligibility", title: "3. Eligibility" },
  { id: "accounts", title: "4. Account Registration" },
  { id: "payments", title: "5. Payments & Subscriptions" },
  { id: "prohibited", title: "6. Prohibited Uses" },
  { id: "whatsapp", title: "7. WhatsApp Policy Compliance" },
  { id: "ip", title: "8. Intellectual Property" },
  { id: "disclaimers", title: "9. Disclaimers" },
  { id: "liability", title: "10. Limitation of Liability" },
  { id: "termination", title: "11. Termination" },
  { id: "governing", title: "12. Governing Law" },
  { id: "contact", title: "13. Contact Us" },
]

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className={styles.page}>
        <div className={styles.hero}>
          <div className={styles.badge}>Legal</div>
          <h1 className={styles.title}>Terms of Service</h1>
          <p className={styles.meta}>
            Last updated: <span>March 2026</span> · Effective: <span>March 1, 2026</span>
          </p>
        </div>

        <div className={styles.layout}>
          {/* Table of Contents */}
          <aside className={styles.toc}>
            <div className={styles.tocTitle}>Contents</div>
            <ul className={styles.tocList}>
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.title}</a>
                </li>
              ))}
            </ul>
          </aside>

          {/* Document */}
          <div className={styles.doc}>
            <div className={styles.highlight}>
              <p>
                Please read these Terms of Service carefully before using the D-Zero AI platform operated by Dailzero Technologies. By accessing or using our service, you agree to be bound by these terms.
              </p>
            </div>

            <div className={styles.section} id="acceptance">
              <h2>1. Acceptance of Terms</h2>
              <p>
                By registering for, accessing, or using the D-Zero AI platform available at <strong>dailzero.com</strong> (the &quot;Service&quot;), you (&quot;User&quot; or &quot;you&quot;) agree to be legally bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, you must not use the Service.
              </p>
              <p>
                These Terms constitute a binding legal agreement between you and Dailzero Technologies (&quot;D-Zero AI,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). We reserve the right to update these Terms at any time. Continued use of the Service after changes are posted constitutes your acceptance of the revised Terms.
              </p>
            </div>

            <div className={styles.section} id="service">
              <h2>2. Service Description</h2>
              <p>
                D-Zero AI provides a software-as-a-service (SaaS) platform that enables businesses to deploy AI-powered customer service agents for WhatsApp. The Service includes:
              </p>
              <ul>
                <li>An online dashboard for managing your AI agent configuration</li>
                <li>AI-generated response guidelines powered by third-party language models</li>
                <li>Conversation monitoring and analytics</li>
                <li>Integration with WhatsApp Business API via ElevenLabs Conversational AI</li>
                <li>Customer support and onboarding assistance</li>
              </ul>
              <p>
                The Service is provided on a managed basis. D-Zero AI configures and deploys agents on your behalf following account approval. You acknowledge that the AI-generated responses may not always be perfect and you retain responsibility for monitoring agent performance.
              </p>
            </div>

            <div className={styles.section} id="eligibility">
              <h2>3. Eligibility</h2>
              <p>
                To use our Service, you must:
              </p>
              <ul>
                <li>Be at least 18 years of age</li>
                <li>Be a registered business owner or authorised representative of a legal entity</li>
                <li>Have a valid WhatsApp Business account or be willing to set one up</li>
                <li>Comply with all applicable laws and regulations in your jurisdiction</li>
                <li>Not be located in a country subject to international sanctions</li>
              </ul>
              <p>
                D-Zero AI reserves the right to reject or terminate any application at our sole discretion. During our MVP phase, we onboard a limited number of businesses. Acceptance is not guaranteed.
              </p>
            </div>

            <div className={styles.section} id="accounts">
              <h2>4. Account Registration</h2>
              <p>
                You must register for an account to access the Service. You agree to:
              </p>
              <ul>
                <li>Provide accurate, complete, and current information during registration</li>
                <li>Maintain and promptly update your account information</li>
                <li>Keep your password secure and confidential</li>
                <li>Notify us immediately at <a href="mailto:support@dailzero.com">support@dailzero.com</a> of any unauthorised use of your account</li>
                <li>Take full responsibility for all activities that occur under your account</li>
              </ul>
              <p>
                Account access is granted after manual review by our team. We may refuse access or suspend your account without prior notice if we believe you are in breach of these Terms.
              </p>
            </div>

            <div className={styles.section} id="payments">
              <h2>5. Payments & Subscriptions</h2>
              <p>
                D-Zero AI offers paid subscription plans as described on our Pricing page. By subscribing, you authorise us to charge the applicable fees to your payment method.
              </p>
              <ul>
                <li><strong>Starter Plan:</strong> ₦50,000/month — includes one AI agent, basic conversation monitoring</li>
                <li><strong>Pro Plan:</strong> ₦100,000/month — includes one AI agent, full analytics, priority support</li>
              </ul>
              <p>
                All fees are stated in Nigerian Naira (NGN) and are exclusive of applicable taxes. Subscriptions renew automatically unless cancelled at least 5 business days before the renewal date. Refunds are not provided for partial billing periods.
              </p>
              <p>
                We reserve the right to change pricing with 30 days&apos; written notice. Continued use of the Service after a price change constitutes acceptance of the new pricing.
              </p>
            </div>

            <div className={styles.section} id="prohibited">
              <h2>6. Prohibited Uses</h2>
              <p>
                You agree not to use the Service to:
              </p>
              <ul>
                <li>Violate any applicable local, state, national, or international law or regulation</li>
                <li>Send spam, unsolicited messages, or bulk communications without consent</li>
                <li>Harass, abuse, threaten, or intimidate any person</li>
                <li>Engage in fraudulent, deceptive, or misleading business practices</li>
                <li>Distribute malware, viruses, or malicious code</li>
                <li>Attempt to reverse-engineer, decompile, or extract source code from the platform</li>
                <li>Resell, sublicense, or share your account access with third parties</li>
                <li>Use the Service for any illegal or unauthorised purpose</li>
                <li>Infringe upon the intellectual property rights of any party</li>
              </ul>
              <p>
                Breach of these prohibitions may result in immediate account termination and may expose you to legal liability.
              </p>
            </div>

            <div className={styles.section} id="whatsapp">
              <h2>7. WhatsApp Policy Compliance</h2>
              <p>
                Use of the Service involves integration with the WhatsApp Business Platform. You acknowledge and agree that:
              </p>
              <ul>
                <li>You will comply with Meta&apos;s WhatsApp Business Policy and Terms of Service at all times</li>
                <li>You will obtain all necessary consents from your customers before messaging them via WhatsApp</li>
                <li>You will not use the AI agent to send promotional messages without opt-in consent</li>
                <li>D-Zero AI is not liable for any actions taken by Meta/WhatsApp, including account suspension, in relation to your use of the WhatsApp platform</li>
                <li>You are solely responsible for ensuring your use of WhatsApp via our platform complies with applicable regulations</li>
              </ul>
            </div>

            <div className={styles.section} id="ip">
              <h2>8. Intellectual Property</h2>
              <p>
                The Service, including all software, design, text, graphics, logos, and content, is owned by D-Zero AI or its licensors and is protected by Nigerian and international intellectual property laws.
              </p>
              <p>
                You retain ownership of all business information, content, and data you provide to us (&quot;User Content&quot;). By submitting User Content, you grant D-Zero AI a non-exclusive, royalty-free licence to use, process, and store your User Content solely for the purpose of providing the Service.
              </p>
              <p>
                You may not copy, modify, distribute, sell, or sublicense any part of the Service without our prior written consent.
              </p>
            </div>

            <div className={styles.section} id="disclaimers">
              <h2>9. Disclaimers</h2>
              <p>
                THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
              </p>
              <p>
                We do not warrant that the Service will be uninterrupted, error-free, or completely secure. AI-generated responses may contain inaccuracies and should be monitored by your team. We are not responsible for any errors, omissions, or outcomes resulting from reliance on AI-generated content.
              </p>
            </div>

            <div className={styles.section} id="liability">
              <h2>10. Limitation of Liability</h2>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, D-ZERO AI SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, BUSINESS, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE.
              </p>
              <p>
                Our total liability to you for any claims arising under these Terms shall not exceed the total amount paid by you to D-Zero AI in the three (3) months preceding the event giving rise to the claim.
              </p>
            </div>

            <div className={styles.section} id="termination">
              <h2>11. Termination</h2>
              <p>
                You may terminate your account at any time by contacting us at <a href="mailto:support@dailzero.com">support@dailzero.com</a>. We may suspend or terminate your account immediately if we determine you have violated these Terms or for any other reason at our sole discretion.
              </p>
              <p>
                Upon termination, your right to use the Service will immediately cease. We will retain your data for up to 90 days after termination before deletion, unless required by law to retain it longer.
              </p>
            </div>

            <div className={styles.section} id="governing">
              <h2>12. Governing Law</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the Federal Republic of Nigeria, without regard to its conflict of law provisions.
              </p>
              <p>
                Any disputes arising from these Terms shall be subject to the exclusive jurisdiction of the Federal High Court of Nigeria. You agree to submit to the personal jurisdiction of courts located in Lagos, Nigeria.
              </p>
            </div>

            <div className={styles.section} id="contact">
              <h2>13. Contact Us</h2>
              <p>
                If you have any questions about these Terms of Service, please contact us:
              </p>
              <ul>
                <li><strong>Email:</strong> <a href="mailto:support@dailzero.com">support@dailzero.com</a></li>
                <li><strong>Website:</strong> <a href="https://dailzero.com">dailzero.com</a></li>
                <li><strong>X / Twitter:</strong> <a href="https://x.com/DobaIbrahim" target="_blank" rel="noopener noreferrer">@DobaIbrahim</a></li>
              </ul>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
