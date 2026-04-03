import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import styles from "./page.module.css"
import { AgentSetupForm } from "@/components/admin/AgentSetupForm"
import { CopyAllButton } from "@/components/admin/CopyAllButton"
import { StatusBadge } from "@/components/ui/Badge"
import { formatDate } from "@/lib/utils"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminAgentDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  const { id } = await params

  const agent = await db.agent.findUnique({
    where: { id },
    include: { user: true },
  })

  if (!agent) notFound()

  const agentPublic = {
    id: agent.id,
    userId: agent.userId,
    businessName: agent.businessName,
    businessDescription: agent.businessDescription,
    productsServices: agent.productsServices,
    faqs: agent.faqs,
    operatingHours: agent.operatingHours,
    websiteLinks: agent.websiteLinks ?? undefined,
    responseGuidelines: agent.responseGuidelines ?? undefined,
    profileImageUrl: agent.profileImageUrl ?? undefined,
    whatsappBusinessName: agent.whatsappBusinessName ?? undefined,
    whatsappAgentLink: agent.whatsappAgentLink ?? undefined,
    whatsappPhoneNumber: agent.whatsappPhoneNumber ?? undefined,
    qrCodeUrl: agent.qrCodeUrl ?? undefined,
    elevenlabsAgentId: agent.elevenlabsAgentId ?? undefined,
    status: agent.status as any,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
    user: {
      id: agent.user.id,
      name: agent.user.name,
      email: agent.user.email,
      phone: agent.user.phone,
      businessName: agent.user.businessName,
      role: agent.user.role as any,
      status: agent.user.status as any,
      createdAt: agent.user.createdAt.toISOString(),
    },
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{agent.businessName}</h1>
          <p className={styles.subtitle}>
            by {agent.user.name} ({agent.user.email}) · Created {formatDate(agent.createdAt.toISOString())}
          </p>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      <div className={styles.grid}>
        {/* Business Info Card */}
        <div className={styles.infoCard}>
          <div className={styles.cardTitleRow}>
            <div className={styles.cardTitle}>Business & Profile Details</div>
            <CopyAllButton text={[
              `Business: ${agent.businessName}`,
              agent.category ? `Category: ${agent.category}` : "",
              `Description: ${agent.businessDescription}`,
              `Products/Services: ${agent.productsServices}`,
              `Operating Hours: ${agent.operatingHours}`,
              agent.address ? `Address: ${agent.address}` : "",
              agent.contactEmail ? `Email: ${agent.contactEmail}` : "",
              agent.contactPhone ? `Phone: ${agent.contactPhone}` : "",
              agent.websiteLinks ? `Website: ${agent.websiteLinks}` : "",
              `FAQs:\n${agent.faqs}`,
              agent.responseGuidelines ? `Response Guidelines:\n${agent.responseGuidelines}` : "",
              agent.whatsappBusinessName ? `WhatsApp Business Name: ${agent.whatsappBusinessName}` : "",
              agent.whatsappPhoneNumber ? `WhatsApp Number: ${agent.whatsappPhoneNumber}` : "",
              agent.whatsappAgentLink ? `WhatsApp Link: ${agent.whatsappAgentLink}` : "",
            ].filter(Boolean).join("\n\n")} />
          </div>

          {agent.profileImageUrl && (
            <div className={styles.infoRow} style={{ alignItems: "center" }}>
              <div className={styles.infoLabel}>Profile Image</div>
              <div className={styles.infoValue}>
                <img src={agent.profileImageUrl} alt="Agent Profile" style={{ width: "80px", height: "80px", borderRadius: "50%", objectFit: "cover" }} />
              </div>
            </div>
          )}

          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Business Name</div>
            <div className={styles.infoValue}>{agent.businessName}</div>
          </div>
          {agent.category && (
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>Category</div>
              <div className={styles.infoValue}>{agent.category}</div>
            </div>
          )}
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Description</div>
            <div className={styles.infoValue}>{agent.businessDescription}</div>
          </div>
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Products / Services</div>
            <div className={styles.infoValue}>{agent.productsServices}</div>
          </div>
          {Array.isArray(agent.productsData) && (agent.productsData as any[]).length > 0 && (
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>Product Catalogue</div>
              <div className={styles.productsList}>
                {(agent.productsData as any[]).map((p: any) => (
                  <div key={p.id} className={styles.productItem}>
                    <span className={styles.productName}>{p.name}</span>
                    {p.price && <span className={styles.productPrice}>{p.price}</span>}
                    {p.description && <span className={styles.productDesc}>{p.description}</span>}
                    {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer" className={styles.productLink}>{p.link}</a>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Operating Hours</div>
            <div className={styles.infoValue}>{agent.operatingHours}</div>
          </div>
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>FAQs</div>
            <div className={styles.infoValue}>{agent.faqs}</div>
          </div>
          
          <div style={{ marginTop: "1rem", marginBottom: "0.5rem", fontWeight: "600", fontSize: "1rem", color: "var(--foreground)" }}>Contact Details</div>
          
          {agent.contactEmail && (
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>Email</div>
              <div className={styles.infoValue}>{agent.contactEmail}</div>
            </div>
          )}
          {agent.contactPhone && (
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>Phone</div>
              <div className={styles.infoValue}>{agent.contactPhone}</div>
            </div>
          )}
          {agent.address && (
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>Address</div>
              <div className={styles.infoValue}>{agent.address}</div>
            </div>
          )}
          {agent.websiteLinks && (
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>Website</div>
              <div className={styles.infoValue}>{agent.websiteLinks}</div>
            </div>
          )}
          {agent.responseGuidelines && (
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>Response Guidelines</div>
              <div className={styles.infoValue}>{agent.responseGuidelines}</div>
            </div>
          )}

          <div style={{ marginTop: "1rem", marginBottom: "0.5rem", fontWeight: "600", fontSize: "1rem", color: "var(--foreground)" }}>WhatsApp Profile</div>

          {agent.whatsappBusinessName && (
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>WhatsApp Business Name</div>
              <div className={styles.infoValue}>{agent.whatsappBusinessName}</div>
            </div>
          )}
          {agent.whatsappPhoneNumber && (
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>WhatsApp Number</div>
              <div className={styles.infoValue}>{agent.whatsappPhoneNumber}</div>
            </div>
          )}
          {agent.whatsappAgentLink && (
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>WhatsApp Link</div>
              <div className={styles.infoValue}>
                <a href={agent.whatsappAgentLink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)" }}>
                  {agent.whatsappAgentLink}
                </a>
              </div>
            </div>
          )}
          {agent.qrCodeUrl && (
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>QR Code</div>
              <div className={styles.infoValue}>
                <img src={agent.qrCodeUrl} alt="WhatsApp QR Code" style={{ width: "100px", height: "100px", borderRadius: "8px" }} />
              </div>
            </div>
          )}
        </div>

        {/* Setup Form */}
        <div className={styles.setupSection}>
          <div className={styles.cardTitle}>Agent Setup & Configuration</div>
          <AgentSetupForm agent={agentPublic} />
        </div>
      </div>
    </div>
  )
}
