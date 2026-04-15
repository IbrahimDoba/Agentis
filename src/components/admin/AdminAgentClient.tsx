"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeftIcon } from "@heroicons/react/24/outline"

import { AgentForm } from "@/components/dashboard/AgentForm"
import { AgentProfileForm } from "@/components/dashboard/AgentProfileForm"
import { KnowledgeBaseTab } from "@/components/dashboard/KnowledgeBaseTab"
import { ToolsTab } from "@/components/dashboard/ToolsTab"

import { AgentSetupForm } from "@/components/admin/AgentSetupForm"
import { CopyAllButton } from "@/components/admin/CopyAllButton"
import { StatusBadge } from "@/components/ui/Badge"
import { cn, formatDate } from "@/lib/utils"

import styles from "@/app/dashboard/agent/[id]/page.module.css"
import adminStyles from "@/app/admin/agents/[id]/page.module.css"

const TABS = [
    { id: "setup", label: "Admin Setup" },
    { id: "profile", label: "Profile" },
    { id: "configuration", label: "Configuration" },
    { id: "knowledge-base", label: "Knowledge Base" },
    { id: "tools", label: "Tools" },
]

function AgentAvatar({ src, name, size = 48 }: { src?: string | null; name: string; size?: number }) {
    const initials = name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    if (src) return <Image src={src} alt={name} width={size} height={size} style={{ borderRadius: "50%", objectFit: "cover", width: size, height: size }} />
    return (
        <div style={{
            width: size, height: size, borderRadius: "50%",
            background: "linear-gradient(135deg, var(--accent) 0%, #00a86b 100%)",
            color: "#000", fontWeight: 700, fontSize: size * 0.35,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
            {initials}
        </div>
    )
}

export function AdminAgentClient({ agent }: { agent: any }) {
    const [activeTab, setActiveTab] = useState("setup")

    const copyText = [
        `Business: ${agent.businessName}`,
        agent.category ? `Category: ${agent.category}` : "",
        `Description: ${agent.businessDescription}`,
        agent.address ? `Address: ${agent.address}` : "",
        agent.contactEmail ? `Email: ${agent.contactEmail}` : "",
        agent.contactPhone ? `Phone: ${agent.contactPhone}` : "",
        agent.websiteLinks ? `Website: ${agent.websiteLinks}` : "",
        agent.responseGuidelines ? `Response Guidelines:\n${agent.responseGuidelines}` : "",
        agent.whatsappPhoneNumber ? `WhatsApp Number: ${agent.whatsappPhoneNumber}` : "",
        agent.whatsappAgentLink ? `WhatsApp Link: ${agent.whatsappAgentLink}` : "",
    ].filter(Boolean).join("\n\n")

    return (
        <div className={styles.page}>
            <Link href="/admin/agents" className={styles.back}>
                <ArrowLeftIcon width={15} height={15} /> All Agents
            </Link>

            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <AgentAvatar src={agent.profileImageUrl} name={agent.businessName} size={52} />
                    <div>
                        <h1 className={styles.title}>{agent.businessName}</h1>
                        <p className={styles.category}>
                            by {agent.user.name} ({agent.user.email}) &middot; Created {formatDate(agent.createdAt)}
                        </p>
                    </div>
                </div>
                <StatusBadge status={agent.status} />
            </div>

            <div className={styles.tabs}>
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        className={cn(styles.tab, activeTab === tab.id ? styles.tabActive : undefined)}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className={styles.tabContent}>
                {activeTab === "setup" && (
                    <div className={adminStyles.grid}>
                        <div className={adminStyles.infoCard}>
                            <div className={adminStyles.cardTitleRow}>
                                <div className={adminStyles.cardTitle}>Business & Profile Details</div>
                                <CopyAllButton text={copyText} />
                            </div>

                            {agent.profileImageUrl && (
                                <div className={adminStyles.infoRow} style={{ alignItems: "center" }}>
                                    <div className={adminStyles.infoLabel}>Profile Image</div>
                                    <div className={adminStyles.infoValue}>
                                        <img src={agent.profileImageUrl} alt="Agent Profile" style={{ width: "80px", height: "80px", borderRadius: "50%", objectFit: "cover" }} />
                                    </div>
                                </div>
                            )}

                            <div className={adminStyles.infoRow}>
                                <div className={adminStyles.infoLabel}>Business Name</div>
                                <div className={adminStyles.infoValue}>{agent.businessName}</div>
                            </div>
                            {agent.category && (
                                <div className={adminStyles.infoRow}>
                                    <div className={adminStyles.infoLabel}>Category</div>
                                    <div className={adminStyles.infoValue}>{agent.category}</div>
                                </div>
                            )}
                            <div className={adminStyles.infoRow}>
                                <div className={adminStyles.infoLabel}>Description</div>
                                <div className={adminStyles.infoValue}>{agent.businessDescription}</div>
                            </div>
                            {Array.isArray(agent.productsData) && (agent.productsData as any[]).length > 0 && (
                                <div className={adminStyles.infoRow}>
                                    <div className={adminStyles.infoLabel}>Product Catalogue</div>
                                    <div className={adminStyles.productsList}>
                                        {(agent.productsData as any[]).map((p: any) => (
                                            <div key={p.id} className={adminStyles.productItem}>
                                                <span className={adminStyles.productName}>{p.name}</span>
                                                {p.price && <span className={adminStyles.productPrice}>{p.price}</span>}
                                                {p.description && <span className={adminStyles.productDesc}>{p.description}</span>}
                                                {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer" className={adminStyles.productLink}>{p.link}</a>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div style={{ marginTop: "1rem", marginBottom: "0.5rem", fontWeight: "600", fontSize: "1rem", color: "var(--foreground)" }}>Contact Details</div>

                            {agent.contactEmail && (
                                <div className={adminStyles.infoRow}>
                                    <div className={adminStyles.infoLabel}>Email</div>
                                    <div className={adminStyles.infoValue}>{agent.contactEmail}</div>
                                </div>
                            )}
                            {agent.contactPhone && (
                                <div className={adminStyles.infoRow}>
                                    <div className={adminStyles.infoLabel}>Phone</div>
                                    <div className={adminStyles.infoValue}>{agent.contactPhone}</div>
                                </div>
                            )}
                            {agent.address && (
                                <div className={adminStyles.infoRow}>
                                    <div className={adminStyles.infoLabel}>Address</div>
                                    <div className={adminStyles.infoValue}>{agent.address}</div>
                                </div>
                            )}
                            {agent.websiteLinks && (
                                <div className={adminStyles.infoRow}>
                                    <div className={adminStyles.infoLabel}>Website</div>
                                    <div className={adminStyles.infoValue}>{agent.websiteLinks}</div>
                                </div>
                            )}
                            {agent.responseGuidelines && (
                                <div className={adminStyles.infoRow}>
                                    <div className={adminStyles.infoLabel}>Response Guidelines</div>
                                    <div className={adminStyles.infoValue}>{agent.responseGuidelines}</div>
                                </div>
                            )}

                            <div style={{ marginTop: "1rem", marginBottom: "0.5rem", fontWeight: "600", fontSize: "1rem", color: "var(--foreground)" }}>WhatsApp Profile</div>

                            {agent.whatsappPhoneNumber && (
                                <div className={adminStyles.infoRow}>
                                    <div className={adminStyles.infoLabel}>WhatsApp Number</div>
                                    <div className={adminStyles.infoValue}>{agent.whatsappPhoneNumber}</div>
                                </div>
                            )}
                            {agent.whatsappAgentLink && (
                                <div className={adminStyles.infoRow}>
                                    <div className={adminStyles.infoLabel}>WhatsApp Link</div>
                                    <div className={adminStyles.infoValue}>
                                        <a href={agent.whatsappAgentLink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)" }}>
                                            {agent.whatsappAgentLink}
                                        </a>
                                    </div>
                                </div>
                            )}
                            {agent.qrCodeUrl && (
                                <div className={adminStyles.infoRow}>
                                    <div className={adminStyles.infoLabel}>QR Code</div>
                                    <div className={adminStyles.infoValue}>
                                        <img src={agent.qrCodeUrl} alt="WhatsApp QR Code" style={{ width: "100px", height: "100px", borderRadius: "8px" }} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className={adminStyles.setupSection}>
                            <div className={adminStyles.cardTitle}>Agent Setup & Configuration</div>
                            <AgentSetupForm agent={agent} />
                        </div>
                    </div>
                )}

                {activeTab === "profile" && <AgentProfileForm agent={agent} />}
                {activeTab === "configuration" && <AgentForm initialData={agent} agentId={agent.id} />}
                {activeTab === "knowledge-base" && <KnowledgeBaseTab agentId={agent.id} elevenlabsAgentId={agent.elevenlabsAgentId} />}
                {activeTab === "tools" && (
                    <ToolsTab
                        agentId={agent.id}
                        initialTools={agent.toolsData || []}
                        elevenlabsAgentId={agent.elevenlabsAgentId}
                    />
                )}
            </div>
        </div>
    )
}
