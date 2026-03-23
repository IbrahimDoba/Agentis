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
  { id: "meta", title: "7. Meta & WhatsApp Compliance" },
  { id: "data-responsibilities", title: "8. Data Responsibilities" },
  { id: "ip", title: "9. Intellectual Property" },
  { id: "disclaimers", title: "10. Disclaimers" },
  { id: "liability", title: "11. Limitation of Liability" },
  { id: "termination", title: "12. Termination" },
  { id: "governing", title: "13. Governing Law" },
  { id: "contact", title: "14. Contact Us" },
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
                Please read these Terms of Service carefully before using the D-Zero AI platform operated by Dailzero Technologies. By accessing or using our service, you agree to be bound by these terms. Our platform operates on Meta&apos;s WhatsApp Business Platform; your use is also subject to Meta&apos;s applicable policies referenced herein.
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
              <p>
                Because our Service uses the WhatsApp Business Platform (a Meta product), your use of this Service is also governed by Meta&apos;s <a href="https://www.whatsapp.com/legal/business-terms" target="_blank" rel="noopener noreferrer">WhatsApp Business Terms of Service</a>, <a href="https://developers.facebook.com/terms/" target="_blank" rel="noopener noreferrer">Meta Platform Terms</a>, and <a href="https://www.facebook.com/policies/ads/" target="_blank" rel="noopener noreferrer">Meta&apos;s Acceptable Use Policy</a>. In the event of any conflict between these Terms and Meta&apos;s policies as they relate to WhatsApp usage, Meta&apos;s policies shall prevail.
              </p>
            </div>

            <div className={styles.section} id="service">
              <h2>2. Service Description</h2>
              <p>
                D-Zero AI provides a software-as-a-service (SaaS) platform that enables businesses to deploy AI-powered customer service agents on the WhatsApp Business Platform. The Service includes:
              </p>
              <ul>
                <li>An online dashboard for managing your AI agent configuration</li>
                <li>AI-generated response guidelines powered by third-party language models</li>
                <li>Conversation monitoring and analytics via the WhatsApp Business Platform API</li>
                <li>Integration with WhatsApp Business API through ElevenLabs Conversational AI</li>
                <li>Automated customer messaging subject to WhatsApp&apos;s messaging policies</li>
                <li>Customer support and onboarding assistance</li>
              </ul>
              <p>
                The Service is provided on a managed basis. D-Zero AI configures and deploys agents on your behalf following account approval. You acknowledge that the AI-generated responses may not always be perfect and you retain responsibility for monitoring agent performance and ensuring compliance with applicable Meta and WhatsApp policies.
              </p>
              <p>
                <strong>Meta Relationship:</strong> D-Zero AI is an independent service provider and is not affiliated with, endorsed by, or a partner of Meta Platforms, Inc. &quot;WhatsApp&quot; and &quot;Meta&quot; are registered trademarks of Meta Platforms, Inc.
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
                <li>Be eligible to use the WhatsApp Business Platform under Meta&apos;s terms and policies</li>
                <li>Not have been previously banned or suspended from Meta&apos;s platforms</li>
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
                Account access is granted after manual review by our team. We may refuse access or suspend your account without prior notice if we believe you are in breach of these Terms or Meta&apos;s platform policies.
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
              <p>
                <strong>Note:</strong> WhatsApp Business API usage may attract separate conversation-based fees charged by Meta. These are not included in our subscription pricing and are your responsibility to understand and manage directly with Meta.
              </p>
            </div>

            <div className={styles.section} id="prohibited">
              <h2>6. Prohibited Uses</h2>
              <p>
                You agree not to use the Service to:
              </p>
              <ul>
                <li>Violate any applicable local, state, national, or international law or regulation</li>
                <li>Send spam, unsolicited messages, or bulk communications without proper opt-in consent as required by WhatsApp&apos;s messaging policies</li>
                <li>Harass, abuse, threaten, intimidate, or discriminate against any person</li>
                <li>Engage in fraudulent, deceptive, or misleading business practices</li>
                <li>Distribute malware, viruses, or any malicious code</li>
                <li>Attempt to reverse-engineer, decompile, or extract source code from the platform</li>
                <li>Resell, sublicense, or share your account access with third parties</li>
                <li>Use the Service for any illegal or unauthorised purpose</li>
                <li>Infringe upon the intellectual property rights of any party</li>
                <li>Violate Meta&apos;s <a href="https://www.facebook.com/policies/ads/" target="_blank" rel="noopener noreferrer">Advertising Policies</a> or <a href="https://transparency.fb.com/policies/community-standards/" target="_blank" rel="noopener noreferrer">Community Standards</a></li>
                <li>Use automated messaging in ways prohibited by WhatsApp&apos;s Business Messaging Policy</li>
                <li>Promote products or services that are prohibited under Meta&apos;s Restricted Content policies, including but not limited to illegal goods, tobacco, drugs, weapons, or adult content</li>
                <li>Collect, harvest, or scrape user data from WhatsApp conversations beyond what is necessary to operate your business service</li>
                <li>Use WhatsApp conversation data to build profiles for advertising or re-targeting purposes</li>
              </ul>
              <p>
                Breach of these prohibitions may result in immediate account termination, reporting to Meta, and may expose you to legal liability.
              </p>
            </div>

            <div className={styles.section} id="meta">
              <h2>7. Meta & WhatsApp Compliance</h2>
              <p>
                Our Service is built on the WhatsApp Business Platform, which is owned and operated by Meta Platforms, Inc. By using our Service, you acknowledge and agree to the following:
              </p>

              <h3>7.1 Meta Platform Terms</h3>
              <p>You agree to comply with and be bound by:</p>
              <ul>
                <li><a href="https://www.whatsapp.com/legal/business-terms" target="_blank" rel="noopener noreferrer">WhatsApp Business Terms of Service</a></li>
                <li><a href="https://developers.facebook.com/terms/" target="_blank" rel="noopener noreferrer">Meta Platform Terms</a></li>
                <li><a href="https://www.whatsapp.com/legal/business-policy/" target="_blank" rel="noopener noreferrer">WhatsApp Business Messaging Policy</a></li>
                <li><a href="https://developers.facebook.com/docs/whatsapp/overview/policy-enforcement" target="_blank" rel="noopener noreferrer">WhatsApp Business Policy Enforcement Guidelines</a></li>
                <li><a href="https://www.facebook.com/policies/ads/" target="_blank" rel="noopener noreferrer">Meta Advertising Policies</a></li>
                <li>Any other Meta policies applicable to your use of WhatsApp and the WhatsApp Business API</li>
              </ul>

              <h3>7.2 User Consent Requirements</h3>
              <p>You are solely responsible for obtaining all required consents from your end users (customers) before sending them messages through the Service. This includes:</p>
              <ul>
                <li>Obtaining explicit opt-in consent before initiating any conversation or sending template messages</li>
                <li>Clearly disclosing to your customers that they are communicating with an AI agent</li>
                <li>Providing your customers with a clear and easy means to opt out of communications</li>
                <li>Honouring all opt-out requests promptly</li>
                <li>Maintaining records of user consents as required by applicable law and Meta&apos;s policies</li>
              </ul>

              <h3>7.3 Permitted Use Cases</h3>
              <p>You may only use the Service for legitimate business communication purposes, including:</p>
              <ul>
                <li>Customer support and service inquiries</li>
                <li>Order and transactional notifications (with user opt-in)</li>
                <li>Appointment reminders and confirmations</li>
                <li>Informational responses to customer-initiated conversations</li>
              </ul>
              <p>You must not use the Service to send unsolicited marketing or promotional messages to users who have not explicitly opted in to receive such communications.</p>

              <h3>7.4 Message Template Compliance</h3>
              <p>Any WhatsApp message templates used through the Service must be submitted for Meta&apos;s approval and may only be used for approved purposes. You agree not to use approved templates in ways that circumvent Meta&apos;s intent or policies.</p>

              <h3>7.5 Meta&apos;s Rights and Actions</h3>
              <p>You acknowledge that Meta may at any time, at their sole discretion:</p>
              <ul>
                <li>Suspend, restrict, or terminate your WhatsApp Business Account</li>
                <li>Remove or reject message templates</li>
                <li>Modify the WhatsApp Business Platform features or policies</li>
                <li>Discontinue the WhatsApp Business Platform entirely</li>
              </ul>
              <p>
                D-Zero AI is not liable for any disruption to your Service caused by Meta&apos;s actions. We will make reasonable efforts to notify you of material changes to Meta&apos;s platform that affect our Service.
              </p>

              <h3>7.6 Business Verification</h3>
              <p>
                You may be required to complete Meta&apos;s Business Verification process as a condition of using the WhatsApp Business API. You agree to cooperate fully with this process and to provide accurate business information. Failure to complete verification may result in limitations on your messaging capabilities.
              </p>
            </div>

            <div className={styles.section} id="data-responsibilities">
              <h2>8. Data Responsibilities</h2>
              <p>
                Our Service processes personal data of your end users (your customers) on your behalf through the WhatsApp Business Platform. In this context:
              </p>
              <ul>
                <li>You are the <strong>data controller</strong> responsible for your customers&apos; personal data collected through WhatsApp interactions</li>
                <li>D-Zero AI acts as a <strong>data processor</strong>, processing end-user data only to provide the Service to you</li>
                <li>You must maintain a publicly accessible Privacy Policy that discloses your use of automated messaging and AI agents via WhatsApp</li>
                <li>You must inform your customers that their WhatsApp conversations may be processed by AI, and that conversation data is handled in accordance with Meta&apos;s Privacy Policy</li>
                <li>You must not instruct us to process personal data in a manner that would violate applicable data protection law or Meta&apos;s policies</li>
                <li>You agree to our <a href="/privacy">Privacy Policy</a> which describes how we handle data shared with us through the Service</li>
              </ul>
              <p>
                Meta&apos;s handling of data transmitted through the WhatsApp Business Platform is governed by <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Meta&apos;s Privacy Policy</a>. We are not responsible for Meta&apos;s data practices.
              </p>
            </div>

            <div className={styles.section} id="ip">
              <h2>9. Intellectual Property</h2>
              <p>
                The Service, including all software, design, text, graphics, logos, and content, is owned by D-Zero AI or its licensors and is protected by Nigerian and international intellectual property laws.
              </p>
              <p>
                You retain ownership of all business information, content, and data you provide to us (&quot;User Content&quot;). By submitting User Content, you grant D-Zero AI a non-exclusive, royalty-free licence to use, process, and store your User Content solely for the purpose of providing the Service.
              </p>
              <p>
                You may not copy, modify, distribute, sell, or sublicense any part of the Service without our prior written consent.
              </p>
              <p>
                &quot;WhatsApp,&quot; &quot;Meta,&quot; and &quot;Facebook&quot; are registered trademarks of Meta Platforms, Inc. D-Zero AI&apos;s use of these names is solely for descriptive purposes and does not imply any affiliation, endorsement, or partnership with Meta Platforms, Inc.
              </p>
            </div>

            <div className={styles.section} id="disclaimers">
              <h2>10. Disclaimers</h2>
              <p>
                THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
              </p>
              <p>
                We do not warrant that the Service will be uninterrupted, error-free, or completely secure. AI-generated responses may contain inaccuracies and should be monitored by your team. We are not responsible for any errors, omissions, or outcomes resulting from reliance on AI-generated content.
              </p>
              <p>
                We make no representations or warranties regarding the continued availability of the WhatsApp Business Platform or Meta&apos;s policies. The Service&apos;s features may change if Meta modifies the WhatsApp Business API.
              </p>
            </div>

            <div className={styles.section} id="liability">
              <h2>11. Limitation of Liability</h2>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, D-ZERO AI SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, BUSINESS, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE.
              </p>
              <p>
                Our total liability to you for any claims arising under these Terms shall not exceed the total amount paid by you to D-Zero AI in the three (3) months preceding the event giving rise to the claim.
              </p>
              <p>
                We are not liable for any losses arising from Meta&apos;s suspension, restriction, or termination of your WhatsApp Business Account; changes to the WhatsApp Business Platform; or Meta&apos;s enforcement of its policies.
              </p>
            </div>

            <div className={styles.section} id="termination">
              <h2>12. Termination</h2>
              <p>
                You may terminate your account at any time by contacting us at <a href="mailto:support@dailzero.com">support@dailzero.com</a>. We may suspend or terminate your account immediately if we determine you have violated these Terms, Meta&apos;s platform policies, or for any other reason at our sole discretion.
              </p>
              <p>
                Upon termination, your right to use the Service will immediately cease. We will retain your data for up to 90 days after termination before deletion, unless required by law to retain it longer. Termination of our Service does not automatically terminate your WhatsApp Business Account with Meta.
              </p>
            </div>

            <div className={styles.section} id="governing">
              <h2>13. Governing Law</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the Federal Republic of Nigeria, without regard to its conflict of law provisions.
              </p>
              <p>
                Any disputes arising from these Terms shall be subject to the exclusive jurisdiction of the Federal High Court of Nigeria. You agree to submit to the personal jurisdiction of courts located in Lagos, Nigeria.
              </p>
            </div>

            <div className={styles.section} id="contact">
              <h2>14. Contact Us</h2>
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
