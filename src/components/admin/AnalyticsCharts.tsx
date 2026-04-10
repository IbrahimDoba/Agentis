"use client"

import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"
import styles from "./AnalyticsCharts.module.css"

const PLAN_COLORS: Record<string, string> = {
  free: "#4a6b56",
  starter: "#00a862",
  pro: "#00dc82",
  enterprise: "#00f090",
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#00dc82",
  SETTING_UP: "#00a862",
  PENDING_REVIEW: "#f59e0b",
  INACTIVE: "#4a6b56",
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  SETTING_UP: "Setting Up",
  PENDING_REVIEW: "Pending",
  INACTIVE: "Inactive",
}

interface Props {
  userGrowthData: { month: string; count: number }[]
  convGrowthData: { month: string; count: number }[]
  planData: { plan: string; count: number }[]
  agentStatusData: { status: string; count: number }[]
}

const tooltipStyle = {
  backgroundColor: "#0f1e15",
  border: "1px solid #1e3a26",
  borderRadius: "10px",
  color: "#e8fdf0",
  fontSize: "13px",
}

export function AnalyticsCharts({ userGrowthData, convGrowthData, planData, agentStatusData }: Props) {
  const planPieData = planData.map((d) => ({
    name: PLAN_LABELS[d.plan] ?? d.plan,
    value: d.count,
    color: PLAN_COLORS[d.plan] ?? "#4a6b56",
  }))

  const agentPieData = agentStatusData.map((d) => ({
    name: STATUS_LABELS[d.status] ?? d.status,
    value: d.count,
    color: STATUS_COLORS[d.status] ?? "#4a6b56",
  }))

  return (
    <div className={styles.chartsGrid}>
      {/* User growth */}
      <div className={styles.chartCard}>
        <div className={styles.chartTitle}>User Growth (last 6 months)</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={userGrowthData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a26" />
            <XAxis dataKey="month" tick={{ fill: "#4a6b56", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#4a6b56", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="count" stroke="#00dc82" strokeWidth={2.5} dot={{ fill: "#00dc82", r: 4 }} name="New Users" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Conversations by month */}
      <div className={styles.chartCard}>
        <div className={styles.chartTitle}>Conversations (last 6 months)</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={convGrowthData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a26" />
            <XAxis dataKey="month" tick={{ fill: "#4a6b56", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#4a6b56", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" fill="#00dc82" radius={[4, 4, 0, 0]} name="Conversations" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Plan distribution */}
      <div className={styles.chartCard}>
        <div className={styles.chartTitle}>Plan Distribution</div>
        <div className={styles.pieWrap}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={planPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                {planPieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className={styles.pieLegend}>
            {planPieData.map((d) => (
              <div key={d.name} className={styles.legendRow}>
                <span className={styles.legendDot} style={{ background: d.color }} />
                <span className={styles.legendLabel}>{d.name}</span>
                <span className={styles.legendVal}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Agent status */}
      <div className={styles.chartCard}>
        <div className={styles.chartTitle}>Agent Status Breakdown</div>
        <div className={styles.pieWrap}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={agentPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                {agentPieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className={styles.pieLegend}>
            {agentPieData.map((d) => (
              <div key={d.name} className={styles.legendRow}>
                <span className={styles.legendDot} style={{ background: d.color }} />
                <span className={styles.legendLabel}>{d.name}</span>
                <span className={styles.legendVal}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
