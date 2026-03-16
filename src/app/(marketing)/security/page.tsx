import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import styles from "./page.module.css"

export const metadata = {
  title: "Security — D-Zero AI",
  description: "How D-Zero AI protects your data and keeps your AI agent platform secure.",
}

const pillars = [
  { icon: "🔒", title: "Encrypted in Transit", desc: "All data transmitted between your browser and our servers uses TLS 1.3 encryption." },
  { icon: "🛡️", title: "Secure at Rest", desc: "Your data is stored in encrypted PostgreSQL databases hosted on Neon's secure infrastructure." },
  { icon: "🔑", title: "Access Controls", desc: "Role-based access ensures only authorised personnel can access your business data." },
  { icon: "🏗️", title: "Secure Infrastructure", desc: "Deployed on Vercel's edge network with automatic DDoS protection and zero-downtime deploys." },
  { icon: "🔍", title: "Continuous Monitoring", desc: "Our systems are monitored around the clock for unusual activity and potential threats." },
  { icon: "📋", title: "Responsible Disclosure", desc: "We have a clear process for security researchers to report vulnerabilities responsibly." },
]

const sections = [
  { id: "overview", title: "1. Security Overview" },
  { id: "data", title: "2. Data Protection" },
  { id: "auth", title: "3. Authentication" },
  { id: "infra", title: "4. Infrastructure" },
  { id: "third-party", title: "5. Third-Party Services" },
  { id: "incident", title: "6. Incident Response" },
  { id: "disclosure", title: "7. Responsible Disclosure" },
  { id: "contact", title: "8. Contact" },
]

export default function SecurityPage() {
  return (
    <>
      <Navbar />
      <main className={styles.page}>
        <div className={styles.hero}>
          <div className={styles.badge}>🔒 Security</div>
          <h1 className={styles.title}>Security at D-Zero AI</h1>
          <p className={styles.subtitle}>
            We take the security of your business data seriously. Here&apos;s how we protect it.
          </p>
        </div>

        {/* Security Pillars */}
        <div className={styles.pillars}>
          {pillars.map((p) => (
            <div key={p.title} className={styles.pillar}>
              <div className={styles.pillarIcon}>{p.icon}</div>
              <div className={styles.pillarTitle}>{p.title}</div>
              <div className={styles.pillarDesc}>{p.desc}</div>
            </div>
          ))}
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
            <div className={styles.section} id="overview">
              <h2>1. Security Overview</h2>
              <p>
                Security is built into every layer of the D-Zero AI platform. We follow industry best practices for application security, data protection, and access management. This page provides transparency about our security posture so you can make informed decisions about using our Service.
              </p>
              <p>
                Our security programme covers: secure development practices, data encryption, access controls, infrastructure hardening, incident response, and regular security reviews.
              </p>
            </div>

            <div className={styles.section} id="data">
              <h2>2. Data Protection</h2>
              <p><strong>Data in transit:</strong> All communications between clients and our servers are encrypted using TLS 1.3. We enforce HTTPS across all endpoints and redirect HTTP traffic automatically.</p>
              <p><strong>Data at rest:</strong> Your business data, conversation records, and account information are stored in PostgreSQL databases hosted on Neon&apos;s serverless platform, which provides encryption at rest by default.</p>
              <p><strong>Password security:</strong> Passwords are never stored in plaintext. We use bcrypt with 12 salt rounds — a widely-accepted standard that makes brute-force attacks computationally expensive.</p>
              <p><strong>Sensitive credentials:</strong> API keys, database connection strings, and third-party service tokens are stored as environment variables, never committed to source code.</p>
            </div>

            <div className={styles.section} id="auth">
              <h2>3. Authentication & Sessions</h2>
              <p>
                D-Zero AI uses NextAuth v5 (Auth.js) for authentication. Sessions are implemented as signed JWTs containing only the minimum necessary user information (ID, role, status). Tokens are signed with a secure secret and expire after a limited period.
              </p>
              <p>
                All dashboard and admin routes are protected by middleware that validates session tokens on every request. Users with a PENDING or REJECTED status cannot access protected routes regardless of token validity.
              </p>
              <p>
                Admin access is strictly role-gated. Regular users cannot access any admin endpoints or pages.
              </p>
            </div>

            <div className={styles.section} id="infra">
              <h2>4. Infrastructure Security</h2>
              <p>
                Our platform runs on <strong>Vercel</strong>, a production-grade hosting platform that provides:
              </p>
              <ul>
                <li>Automatic DDoS mitigation and edge-level protection</li>
                <li>Isolated serverless function execution environments</li>
                <li>Automatic TLS certificate provisioning and renewal</li>
                <li>99.99% uptime SLA with global edge distribution</li>
                <li>Zero-downtime deployments</li>
              </ul>
              <p>
                Our database is hosted on <strong>Neon</strong>, a serverless PostgreSQL provider with:
              </p>
              <ul>
                <li>Encryption at rest using AES-256</li>
                <li>Automatic backups with point-in-time recovery</li>
                <li>Network isolation and VPC-level security</li>
                <li>SOC 2 Type II compliance</li>
              </ul>
            </div>

            <div className={styles.section} id="third-party">
              <h2>5. Third-Party Services</h2>
              <p>We rely on the following security-vetted third-party providers:</p>
              <ul>
                <li><strong>ElevenLabs:</strong> Handles AI conversation processing. Data is processed per their enterprise security policies.</li>
                <li><strong>OpenAI:</strong> Used for generating response guidelines. Data submitted is governed by OpenAI&apos;s data processing terms.</li>
                <li><strong>Resend:</strong> Handles transactional emails with TLS-encrypted delivery.</li>
                <li><strong>UploadThing:</strong> Manages file uploads with access controls and signed URLs.</li>
              </ul>
              <p>
                All third-party providers are selected based on their security certifications, data processing agreements, and privacy standards.
              </p>
            </div>

            <div className={styles.section} id="incident">
              <h2>6. Incident Response</h2>
              <p>
                We maintain an incident response process to handle security events quickly and effectively:
              </p>
              <ul>
                <li><strong>Detection:</strong> Automated alerts for anomalous activity, failed authentication attempts, and unusual data access patterns</li>
                <li><strong>Containment:</strong> Rapid isolation of affected systems and revocation of compromised credentials</li>
                <li><strong>Notification:</strong> Affected users will be notified within 72 hours of a confirmed data breach, as required by the NDPR</li>
                <li><strong>Recovery:</strong> Restoration from backups and a post-incident review to prevent recurrence</li>
              </ul>
              <p>
                In the event of a security incident affecting your data, we will contact you directly at your registered email address.
              </p>
            </div>

            <div className={styles.section} id="disclosure">
              <h2>7. Responsible Disclosure</h2>
              <p>
                We welcome responsible security research. If you discover a vulnerability in our platform, please report it privately before public disclosure to give us time to address it.
              </p>
              <div className={styles.disclosureBox}>
                <p>
                  <strong>To report a security issue:</strong> Email us at <a href="mailto:support@dailzero.com">support@dailzero.com</a> with the subject line &quot;Security Disclosure.&quot; Include a description of the vulnerability, steps to reproduce, and your contact information. We will acknowledge receipt within 48 hours and aim to provide a fix within 30 days for critical issues.
                </p>
              </div>
              <p>
                We ask that you:
              </p>
              <ul>
                <li>Do not access, modify, or delete data belonging to other users</li>
                <li>Do not perform denial-of-service attacks</li>
                <li>Do not publicly disclose the vulnerability before we&apos;ve had a chance to fix it</li>
                <li>Act in good faith to avoid harm to the platform and its users</li>
              </ul>
            </div>

            <div className={styles.section} id="contact">
              <h2>8. Contact</h2>
              <p>For security-related questions or to report a vulnerability:</p>
              <ul>
                <li><strong>Email:</strong> <a href="mailto:support@dailzero.com">support@dailzero.com</a></li>
                <li><strong>Subject line:</strong> &quot;Security Disclosure&quot; or &quot;Security Question&quot;</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
