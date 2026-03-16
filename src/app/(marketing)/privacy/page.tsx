import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import styles from "./page.module.css"

export const metadata = {
  title: "Privacy Policy — D-Zero AI",
  description: "Learn how D-Zero AI collects, uses, and protects your personal data in compliance with the NDPR.",
}

const sections = [
  { id: "overview", title: "1. Overview" },
  { id: "collect", title: "2. Data We Collect" },
  { id: "use", title: "3. How We Use Your Data" },
  { id: "basis", title: "4. Legal Basis" },
  { id: "sharing", title: "5. Data Sharing" },
  { id: "retention", title: "6. Data Retention" },
  { id: "security", title: "7. Security" },
  { id: "rights", title: "8. Your Rights" },
  { id: "cookies", title: "9. Cookies" },
  { id: "children", title: "10. Children's Privacy" },
  { id: "transfers", title: "11. International Transfers" },
  { id: "changes", title: "12. Changes to This Policy" },
  { id: "contact", title: "13. Contact Us" },
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
            Last updated: <span>March 2026</span> · NDPR Compliant
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
                D-Zero AI is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your information in compliance with the Nigerian Data Protection Regulation (NDPR) 2019 and applicable international standards.
              </p>
            </div>

            <div className={styles.section} id="overview">
              <h2>1. Overview</h2>
              <p>
                Dailzero Technologies (&quot;D-Zero AI,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates <strong>dailzero.com</strong> and related services. This Privacy Policy describes how we handle personal data of users who access our platform, website, and services.
              </p>
              <p>
                By using our Service, you consent to the collection and use of information as described in this policy.
              </p>
            </div>

            <div className={styles.section} id="collect">
              <h2>2. Data We Collect</h2>
              <p>We collect the following categories of personal data:</p>
              <ul>
                <li><strong>Account Information:</strong> Name, email address, phone number, business name, and password (hashed) provided during registration</li>
                <li><strong>Business Information:</strong> Business description, products/services, FAQs, operating hours, contact details, and response guidelines you submit to configure your AI agent</li>
                <li><strong>Contact Details:</strong> Business email, phone number, and website URLs</li>
                <li><strong>Usage Data:</strong> Pages visited, features used, login times, IP address, browser type, and device information</li>
                <li><strong>Conversation Data:</strong> WhatsApp conversation transcripts and metadata from your AI agent, processed via ElevenLabs Conversational AI</li>
                <li><strong>Payment Information:</strong> Billing records and transaction history (payment card details are processed by our payment partner — we do not store raw card data)</li>
                <li><strong>Communications:</strong> Messages you send to us via the contact form or email</li>
              </ul>
            </div>

            <div className={styles.section} id="use">
              <h2>3. How We Use Your Data</h2>
              <p>We use your personal data for the following purposes:</p>
              <ul>
                <li>To create and manage your account</li>
                <li>To configure and deploy your AI customer service agent</li>
                <li>To generate AI-enhanced response guidelines using OpenAI&apos;s API</li>
                <li>To send transactional emails (account updates, approval notifications)</li>
                <li>To process subscription payments and send invoices</li>
                <li>To provide customer support</li>
                <li>To analyse usage patterns and improve our Service</li>
                <li>To detect and prevent fraud or abuse</li>
                <li>To comply with our legal obligations</li>
              </ul>
              <p>
                We do not use your data for unsolicited marketing without your consent.
              </p>
            </div>

            <div className={styles.section} id="basis">
              <h2>4. Legal Basis for Processing</h2>
              <p>Under the NDPR and applicable law, we process your personal data on the following legal bases:</p>
              <ul>
                <li><strong>Contract performance:</strong> Processing necessary to provide the Service you requested</li>
                <li><strong>Legitimate interests:</strong> Improving the Service, detecting fraud, and ensuring platform security</li>
                <li><strong>Consent:</strong> Where you have explicitly given consent (e.g., marketing communications)</li>
                <li><strong>Legal obligation:</strong> Where processing is required by applicable Nigerian law</li>
              </ul>
            </div>

            <div className={styles.section} id="sharing">
              <h2>5. Data Sharing</h2>
              <p>
                We do not sell your personal data. We share data with trusted third parties only as necessary to operate the Service:
              </p>
              <ul>
                <li><strong>ElevenLabs:</strong> Conversation processing and AI voice/chat agent infrastructure</li>
                <li><strong>OpenAI:</strong> AI language model used to generate response guidelines</li>
                <li><strong>Neon / PostgreSQL:</strong> Secure cloud database hosting</li>
                <li><strong>Vercel:</strong> Application hosting and edge delivery</li>
                <li><strong>Resend:</strong> Transactional email delivery</li>
                <li><strong>UploadThing:</strong> Secure file and image uploads</li>
              </ul>
              <p>
                All third-party processors are bound by data processing agreements and must handle your data in accordance with applicable privacy laws.
              </p>
              <p>
                We may disclose personal data if required to do so by law, court order, or in response to a lawful request from a government or regulatory authority.
              </p>
            </div>

            <div className={styles.section} id="retention">
              <h2>6. Data Retention</h2>
              <p>
                We retain your personal data for as long as your account is active and as needed to provide the Service. Specifically:
              </p>
              <ul>
                <li>Account data is retained for the duration of your subscription plus 90 days after termination</li>
                <li>Conversation transcripts are retained for up to 12 months, after which they are deleted or anonymised</li>
                <li>Payment records are retained for 7 years in compliance with Nigerian financial regulations</li>
                <li>Contact form submissions are retained for 2 years</li>
              </ul>
              <p>
                You may request deletion of your data at any time by contacting <a href="mailto:support@dailzero.com">support@dailzero.com</a>.
              </p>
            </div>

            <div className={styles.section} id="security">
              <h2>7. Security</h2>
              <p>
                We implement industry-standard security measures to protect your personal data, including:
              </p>
              <ul>
                <li>Data in transit encrypted using TLS 1.3</li>
                <li>Passwords hashed using bcrypt with 12 salt rounds</li>
                <li>Role-based access control limiting data access to authorised personnel</li>
                <li>Regular security reviews and monitoring</li>
              </ul>
              <p>
                While we take appropriate precautions, no internet transmission is 100% secure. Please refer to our <a href="/security">Security page</a> for more details.
              </p>
            </div>

            <div className={styles.section} id="rights">
              <h2>8. Your Rights</h2>
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
            </div>

            <div className={styles.section} id="cookies">
              <h2>9. Cookies</h2>
              <p>
                We use essential cookies to operate our Service, including session management cookies for authentication (NextAuth). We do not use advertising or third-party tracking cookies.
              </p>
              <p>
                You can control cookie settings through your browser, but disabling essential cookies may prevent the Service from functioning correctly.
              </p>
            </div>

            <div className={styles.section} id="children">
              <h2>10. Children&apos;s Privacy</h2>
              <p>
                Our Service is not directed to individuals under the age of 18. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, please contact us and we will promptly delete it.
              </p>
            </div>

            <div className={styles.section} id="transfers">
              <h2>11. International Data Transfers</h2>
              <p>
                Some of our third-party service providers (such as Vercel and ElevenLabs) may process data outside Nigeria. Where data is transferred internationally, we ensure appropriate safeguards are in place, including contractual data processing agreements that meet the NDPR&apos;s cross-border transfer requirements.
              </p>
            </div>

            <div className={styles.section} id="changes">
              <h2>12. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of material changes via email or a prominent notice on our website at least 14 days before the changes take effect. The &quot;Last updated&quot; date at the top of this page reflects the most recent revision.
              </p>
            </div>

            <div className={styles.section} id="contact">
              <h2>13. Contact Us</h2>
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
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
