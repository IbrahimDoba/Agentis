import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import styles from "./page.module.css"

export const metadata = {
  title: "Privacy Policy — D-Zero AI",
  description: "Learn how D-Zero AI collects, uses, and protects your personal data in compliance with the NDPR and Meta's WhatsApp Business Platform requirements.",
}

const sections = [
  { id: "overview", title: "1. Overview" },
  { id: "collect", title: "2. Data We Collect" },
  { id: "meta-data", title: "3. WhatsApp & Meta Data" },
  { id: "use", title: "4. How We Use Your Data" },
  { id: "basis", title: "5. Legal Basis" },
  { id: "sharing", title: "6. Data Sharing" },
  { id: "meta-sharing", title: "7. Data Shared with Meta" },
  { id: "retention", title: "8. Data Retention" },
  { id: "security", title: "9. Security" },
  { id: "rights", title: "10. Your Rights" },
  { id: "cookies", title: "11. Cookies" },
  { id: "children", title: "12. Children's Privacy" },
  { id: "transfers", title: "13. International Transfers" },
  { id: "changes", title: "14. Changes to This Policy" },
  { id: "contact", title: "15. Contact Us" },
]

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className={styles.page}>
        <div className={styles.hero}>
          <div className={styles.badge}>Legal</div>
          <h1 className={styles.title}>Privacy Policy</h1>
          <p className={styles.meta}>
            Last updated: <span>March 2026</span> · NDPR Compliant · Meta WhatsApp Business Platform Compliant
          </p>
        </div>

        <div className={styles.layout}>
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

          <div className={styles.doc}>
            <div className={styles.highlight}>
              <p>
                D-Zero AI is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your information in compliance with the Nigerian Data Protection Regulation (NDPR) 2019, applicable international standards, and Meta&apos;s WhatsApp Business Platform requirements. Because our Service operates on WhatsApp — a Meta product — some data handling is also governed by <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Meta&apos;s Privacy Policy</a>.
              </p>
            </div>

            <div className={styles.section} id="overview">
              <h2>1. Overview</h2>
              <p>
                Dailzero Technologies (&quot;D-Zero AI,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates <strong>dailzero.com</strong> and related services. This Privacy Policy describes how we handle personal data of:
              </p>
              <ul>
                <li><strong>Business users</strong> — companies and individuals who register for and use the D-Zero AI platform</li>
                <li><strong>End users</strong> — customers of our business users who interact with AI agents via WhatsApp</li>
              </ul>
              <p>
                By using our Service, you consent to the collection and use of information as described in this policy. If you are a business user deploying our Service to serve your own customers, you are responsible for ensuring your customers are informed about data practices as described in Section 3.
              </p>
              <p>
                Our Service integrates with the <strong>WhatsApp Business Platform</strong>, operated by Meta Platforms, Inc. (&quot;Meta&quot;). Data transmitted through WhatsApp is also subject to <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Meta&apos;s Privacy Policy</a> and <a href="https://www.whatsapp.com/legal/business-terms" target="_blank" rel="noopener noreferrer">WhatsApp Business Terms</a>.
              </p>
            </div>

            <div className={styles.section} id="collect">
              <h2>2. Data We Collect</h2>
              <p>We collect the following categories of personal data:</p>

              <h3>2.1 Business User Data</h3>
              <ul>
                <li><strong>Account Information:</strong> Name, email address, phone number, business name, and password (hashed) provided during registration</li>
                <li><strong>Business Information:</strong> Business description, products/services, FAQs, operating hours, contact details, and response guidelines you submit to configure your AI agent</li>
                <li><strong>Usage Data:</strong> Pages visited, features used, login times, IP address, browser type, and device information</li>
                <li><strong>Payment Information:</strong> Billing records and transaction history (payment card details are processed by our payment partner — we do not store raw card data)</li>
                <li><strong>Communications:</strong> Messages you send to us via the contact form or email</li>
              </ul>

              <h3>2.2 End User Data (Your Customers via WhatsApp)</h3>
              <p>
                When your customers interact with your AI agent on WhatsApp, the following data is processed on your behalf:
              </p>
              <ul>
                <li><strong>WhatsApp Phone Number:</strong> The sender&apos;s WhatsApp-registered phone number (used as a user identifier)</li>
                <li><strong>Conversation Transcripts:</strong> The text content of messages exchanged between your customers and the AI agent</li>
                <li><strong>Message Metadata:</strong> Timestamps, message delivery status, conversation duration, and message counts</li>
                <li><strong>Media Content:</strong> Audio messages, images, videos, or documents shared in conversations (where applicable)</li>
                <li><strong>Conversation Summaries:</strong> AI-generated summaries of conversations processed via OpenAI&apos;s API</li>
              </ul>
              <p>
                This end-user data is collected and processed by us solely to provide the Service to our business users and is handled as described in Section 3 and Section 7 below.
              </p>
            </div>

            <div className={styles.section} id="meta-data">
              <h2>3. WhatsApp & Meta Data Handling</h2>
              <p>
                Our Service is built on the <strong>WhatsApp Business Platform API</strong>, a service provided by Meta Platforms, Inc. This section specifically addresses how data flows through Meta&apos;s infrastructure and our obligations in connection with it.
              </p>

              <h3>3.1 How WhatsApp Data Flows</h3>
              <p>
                When an end user sends a WhatsApp message to a business using D-Zero AI:
              </p>
              <ul>
                <li>The message is transmitted through Meta&apos;s WhatsApp servers in accordance with Meta&apos;s Privacy Policy</li>
                <li>Meta delivers the message to our platform via the WhatsApp Business API (via ElevenLabs Conversational AI)</li>
                <li>Our AI processes the message and generates a response</li>
                <li>The response is sent back through Meta&apos;s WhatsApp infrastructure to the end user</li>
                <li>Conversation metadata (timestamps, status, duration) is made available to us via the WhatsApp Business API for analytics and monitoring purposes</li>
              </ul>

              <h3>3.2 Meta&apos;s Independent Data Processing</h3>
              <p>
                Meta independently processes data transmitted through WhatsApp under its own Privacy Policy. D-Zero AI does not control Meta&apos;s data practices. Meta may collect, process, and use data in accordance with its own policies, which may include:
              </p>
              <ul>
                <li>Storing message metadata for delivery, security, and anti-abuse purposes</li>
                <li>Using account information for business verification</li>
                <li>Enforcing WhatsApp&apos;s Terms of Service and policies</li>
              </ul>
              <p>
                We encourage you to review <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Meta&apos;s Privacy Policy</a> to understand how they handle data on their platform.
              </p>

              <h3>3.3 Business User Obligations for End-User Privacy</h3>
              <p>
                If you are a business user deploying our Service to interact with your customers on WhatsApp, you are the data controller for your customers&apos; personal data. You must:
              </p>
              <ul>
                <li>Maintain your own publicly accessible Privacy Policy that discloses your use of WhatsApp and AI-powered messaging</li>
                <li>Inform your customers that they are communicating with an AI agent before or during their first interaction</li>
                <li>Obtain appropriate consent from your customers for WhatsApp communications as required by WhatsApp&apos;s Business Messaging Policy and applicable law</li>
                <li>Provide your customers with a clear means to opt out of communications and honour all opt-out requests promptly</li>
                <li>Not use WhatsApp conversation data for purposes beyond providing your customer service, including advertising, re-targeting, or selling to third parties</li>
                <li>Comply with Meta&apos;s <a href="https://www.whatsapp.com/legal/business-policy/" target="_blank" rel="noopener noreferrer">WhatsApp Business Messaging Policy</a> with respect to your customers</li>
              </ul>

              <h3>3.4 No Data Sale to Meta or Third-Party Advertisers</h3>
              <p>
                We do not sell, share, or transfer WhatsApp conversation data or end-user personal data to Meta, Facebook, or any third-party advertising network for advertising or marketing purposes. Data processed through the WhatsApp Business API is used solely to operate the Service.
              </p>
            </div>

            <div className={styles.section} id="use">
              <h2>4. How We Use Your Data</h2>
              <p>We use your personal data for the following purposes:</p>
              <ul>
                <li>To create and manage your account</li>
                <li>To configure and deploy your AI customer service agent on the WhatsApp Business Platform</li>
                <li>To generate AI-enhanced response guidelines using OpenAI&apos;s API</li>
                <li>To process and respond to WhatsApp messages on your behalf through ElevenLabs Conversational AI</li>
                <li>To provide conversation analytics and monitoring via the WhatsApp Business API</li>
                <li>To generate conversation summaries using AI</li>
                <li>To send transactional emails (account updates, approval notifications)</li>
                <li>To process subscription payments and send invoices</li>
                <li>To provide customer support</li>
                <li>To analyse usage patterns and improve our Service</li>
                <li>To detect and prevent fraud, abuse, and violations of Meta&apos;s platform policies</li>
                <li>To comply with our legal obligations and Meta&apos;s platform requirements</li>
              </ul>
              <p>
                We do not use conversation data or end-user personal data for advertising, marketing profiling, or any purpose beyond operating the Service. We do not sell your data or your customers&apos; data to any third party.
              </p>
            </div>

            <div className={styles.section} id="basis">
              <h2>5. Legal Basis for Processing</h2>
              <p>Under the NDPR and applicable law, we process your personal data on the following legal bases:</p>
              <ul>
                <li><strong>Contract performance:</strong> Processing necessary to provide the Service you requested, including facilitating WhatsApp-based AI interactions on your behalf</li>
                <li><strong>Legitimate interests:</strong> Improving the Service, detecting fraud, ensuring platform security, and complying with Meta&apos;s platform policies</li>
                <li><strong>Consent:</strong> Where you have explicitly given consent (e.g., marketing communications). Business users are responsible for maintaining valid consent from their end users for WhatsApp messaging</li>
                <li><strong>Legal obligation:</strong> Where processing is required by applicable Nigerian law or by Meta&apos;s platform policies</li>
              </ul>
            </div>

            <div className={styles.section} id="sharing">
              <h2>6. Data Sharing</h2>
              <p>
                We do not sell your personal data. We share data with trusted third parties only as necessary to operate the Service:
              </p>
              <ul>
                <li><strong>Meta / WhatsApp:</strong> Messages and conversation data are transmitted through Meta&apos;s WhatsApp Business Platform infrastructure as required to deliver the Service. See Section 7 for full details</li>
                <li><strong>ElevenLabs:</strong> Conversation processing and AI voice/chat agent infrastructure — conversation data is processed on their platform to generate AI responses</li>
                <li><strong>OpenAI:</strong> AI language model used to generate response guidelines and conversation summaries — data is processed under OpenAI&apos;s API data usage policies</li>
                <li><strong>Neon / PostgreSQL:</strong> Secure cloud database hosting for account and configuration data</li>
                <li><strong>Vercel:</strong> Application hosting and edge delivery</li>
                <li><strong>Resend:</strong> Transactional email delivery</li>
              </ul>
              <p>
                All third-party processors are bound by data processing agreements and must handle your data in accordance with applicable privacy laws.
              </p>
              <p>
                We may disclose personal data if required to do so by law, court order, or in response to a lawful request from a government or regulatory authority, including requests from Meta to enforce its platform policies.
              </p>
            </div>

            <div className={styles.section} id="meta-sharing">
              <h2>7. Data Shared with Meta</h2>
              <p>
                Because our Service uses the WhatsApp Business Platform API, certain data is necessarily shared with Meta as part of normal platform operation:
              </p>

              <h3>7.1 What We Share with Meta</h3>
              <ul>
                <li><strong>Business account information:</strong> Business name, phone number, and verification details required to operate a WhatsApp Business Account</li>
                <li><strong>Message content:</strong> Messages sent and received through WhatsApp are transmitted via Meta&apos;s servers. End-to-end encryption applies in standard WhatsApp; Business API messages are not end-to-end encrypted between business and Meta</li>
                <li><strong>Message metadata:</strong> Delivery status, timestamps, and conversation identifiers necessary for message delivery</li>
                <li><strong>Message templates:</strong> Template messages submitted for Meta&apos;s review and approval</li>
              </ul>

              <h3>7.2 What We Do Not Share with Meta for Advertising</h3>
              <ul>
                <li>We do not share your business configuration data, agent settings, or subscription information with Meta for advertising purposes</li>
                <li>We do not provide Meta with data derived from WhatsApp conversations for ad targeting</li>
                <li>We do not connect WhatsApp conversation data to Meta&apos;s advertising products (Facebook Ads, Instagram Ads, etc.)</li>
              </ul>

              <h3>7.3 Meta&apos;s Independent Rights</h3>
              <p>
                Meta has independent rights to data transmitted through the WhatsApp Business Platform as described in their own policies. D-Zero AI does not control Meta&apos;s data practices. For details on how Meta uses data, please review:
              </p>
              <ul>
                <li><a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">WhatsApp Privacy Policy</a></li>
                <li><a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer">Meta Privacy Policy</a></li>
                <li><a href="https://developers.facebook.com/terms/" target="_blank" rel="noopener noreferrer">Meta Platform Terms</a></li>
              </ul>
            </div>

            <div className={styles.section} id="retention">
              <h2>8. Data Retention</h2>
              <p>
                We retain your personal data for as long as your account is active and as needed to provide the Service. Specifically:
              </p>
              <ul>
                <li>Account data is retained for the duration of your subscription plus 90 days after termination</li>
                <li>Conversation transcripts and metadata are retained for up to 12 months, after which they are deleted or anonymised</li>
                <li>Payment records are retained for 7 years in compliance with Nigerian financial regulations</li>
                <li>Contact form submissions are retained for 2 years</li>
              </ul>
              <p>
                Retention of data held by Meta (e.g., WhatsApp message metadata) is governed by Meta&apos;s own data retention policies, which are independent of our retention schedules.
              </p>
              <p>
                You may request deletion of your data at any time by contacting <a href="mailto:support@dailzero.com">support@dailzero.com</a>.
              </p>
            </div>

            <div className={styles.section} id="security">
              <h2>9. Security</h2>
              <p>
                We implement industry-standard security measures to protect your personal data, including:
              </p>
              <ul>
                <li>Data in transit encrypted using TLS 1.3</li>
                <li>Passwords hashed using bcrypt with 12 salt rounds</li>
                <li>Role-based access control limiting data access to authorised personnel</li>
                <li>Regular security reviews and monitoring</li>
                <li>Secure API key management for all third-party integrations including Meta&apos;s WhatsApp Business API</li>
              </ul>
              <p>
                While we take appropriate precautions, no internet transmission is 100% secure. Please refer to our <a href="/security">Security page</a> for more details. Security of data within Meta&apos;s infrastructure is governed by Meta&apos;s own security practices.
              </p>
            </div>

            <div className={styles.section} id="rights">
              <h2>10. Your Rights</h2>
              <p>Under the NDPR, you have the following rights regarding your personal data:</p>
              <ul>
                <li><strong>Right of access:</strong> Request a copy of your personal data we hold</li>
                <li><strong>Right to rectification:</strong> Request correction of inaccurate or incomplete data</li>
                <li><strong>Right to erasure:</strong> Request deletion of your personal data (&quot;right to be forgotten&quot;)</li>
                <li><strong>Right to restriction:</strong> Request that we restrict processing of your data</li>
                <li><strong>Right to data portability:</strong> Receive your data in a structured, machine-readable format</li>
                <li><strong>Right to object:</strong> Object to processing based on legitimate interests</li>
                <li><strong>Right to withdraw consent:</strong> Withdraw consent at any time where processing is consent-based</li>
              </ul>
              <p>
                To exercise any of these rights, contact us at <a href="mailto:support@dailzero.com">support@dailzero.com</a>. We will respond within 30 days.
              </p>
              <p>
                For rights relating to data held by Meta (such as your WhatsApp account data), you must contact Meta directly through their <a href="https://www.facebook.com/help/contact/540977946302970" target="_blank" rel="noopener noreferrer">privacy request portal</a>.
              </p>

              <h3>10.1 End-User Rights (Your Customers)</h3>
              <p>
                If you are an end user (a customer who interacted with a business&apos;s AI agent on WhatsApp), your data is primarily controlled by the business you interacted with. To exercise your data rights, please contact that business directly. You may also contact us at <a href="mailto:support@dailzero.com">support@dailzero.com</a> and we will assist in directing your request appropriately.
              </p>
            </div>

            <div className={styles.section} id="cookies">
              <h2>11. Cookies</h2>
              <p>
                We use essential cookies to operate our Service, including session management cookies for authentication (NextAuth). We do not use advertising or third-party tracking cookies, and we do not use Meta Pixel or any Meta advertising cookies on our platform.
              </p>
              <p>
                You can control cookie settings through your browser, but disabling essential cookies may prevent the Service from functioning correctly.
              </p>
            </div>

            <div className={styles.section} id="children">
              <h2>12. Children&apos;s Privacy</h2>
              <p>
                Our Service is not directed to individuals under the age of 18. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data through our platform or through WhatsApp interactions with a business using our Service, please contact us and we will promptly delete it.
              </p>
              <p>
                Business users must not deploy our Service to interact with users known to be under 13 years of age, in accordance with WhatsApp&apos;s minimum age requirements.
              </p>
            </div>

            <div className={styles.section} id="transfers">
              <h2>13. International Data Transfers</h2>
              <p>
                Some of our third-party service providers (such as Vercel, ElevenLabs, and OpenAI) may process data outside Nigeria. Where data is transferred internationally, we ensure appropriate safeguards are in place, including contractual data processing agreements that meet the NDPR&apos;s cross-border transfer requirements.
              </p>
              <p>
                Data transmitted through the WhatsApp Business Platform is processed by Meta globally in accordance with their own data transfer mechanisms. Meta maintains data centres in multiple countries. By using our Service, you acknowledge that WhatsApp conversation data may be processed in countries outside Nigeria, including the United States, in accordance with Meta&apos;s Privacy Policy.
              </p>
            </div>

            <div className={styles.section} id="changes">
              <h2>14. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time, including when required by changes to Meta&apos;s WhatsApp Business Platform policies. We will notify you of material changes via email or a prominent notice on our website at least 14 days before the changes take effect. The &quot;Last updated&quot; date at the top of this page reflects the most recent revision.
              </p>
            </div>

            <div className={styles.section} id="contact">
              <h2>15. Contact Us</h2>
              <p>
                For privacy-related questions, requests, or complaints, please contact our Data Protection Officer:
              </p>
              <ul>
                <li><strong>Email:</strong> <a href="mailto:support@dailzero.com">support@dailzero.com</a></li>
                <li><strong>Website:</strong> <a href="https://dailzero.com">dailzero.com</a></li>
              </ul>
              <p>
                You also have the right to lodge a complaint with the National Information Technology Development Agency (NITDA), which supervises NDPR compliance in Nigeria.
              </p>
              <p>
                For complaints related to Meta&apos;s data practices, please contact Meta directly via their <a href="https://www.facebook.com/help/contact/540977946302970" target="_blank" rel="noopener noreferrer">privacy request portal</a> or their Data Protection Officer at <a href="mailto:privacy@whatsapp.com">privacy@whatsapp.com</a>.
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
