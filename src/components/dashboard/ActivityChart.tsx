"use client"

import { useState, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts"
import styles from "./ActivityChart.module.css"

type Range = "day" | "week" | "month" | "custom"

interface DataPoint {
  label: string
  conversations: number
  credits: number
}

interface AnalyticsResponse {
  data: DataPoint[]
  totalConversations: number
  totalCredits: number
  busiestDay: string | null
}

async function fetchAnalytics(agentId: string, range: Range, from?: string, to?: string) {
  const params = new URLSearchParams({ range })
  if (range === "custom" && from && to) {
    params.set("from", from)
    params.set("to", to)
  }
  const res = await fetch(`/api/agents/${agentId}/analytics?${params}`)
  if (!res.ok) throw new Error("Failed to load analytics")
  return res.json() as Promise<AnalyticsResponse>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipLabel}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className={styles.tooltipRow}>
          <span className={styles.tooltipDot} style={{ background: p.color }} />
          <span className={styles.tooltipKey}>{p.dataKey === "conversations" ? "Conversations" : "Credits"}:</span>
          <span className={styles.tooltipVal}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomLegend({ payload }: any) {
  return (
    <div className={styles.legend}>
      {payload?.map((p: any) => (
        <div key={p.dataKey} className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: p.color }} />
          <span className={styles.legendLabel}>
            {p.dataKey === "conversations" ? "Conversations" : "Credits used"}
          </span>
        </div>
      ))}
    </div>
  )
}

const RANGE_LABELS: Record<Range, string> = {
  day: "Last 7 days",
  week: "Last 12 weeks",
  month: "Last 12 months",
  custom: "Custom range",
}

const ACCENT = "var(--accent)"
const CREDITS_COLOR = "#818cf8" // indigo

interface Props {
  agentId: string
}

export function ActivityChart({ agentId }: Props) {
  const [range, setRange] = useState<Range>("day")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [appliedFrom, setAppliedFrom] = useState("")
  const [appliedTo, setAppliedTo] = useState("")

  const queryKey = ["analytics", agentId, range, appliedFrom, appliedTo]
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchAnalytics(agentId, range, appliedFrom, appliedTo),
    staleTime: 2 * 60 * 1000,
    enabled: range !== "custom" || (!!appliedFrom && !!appliedTo),
  })

  const applyCustom = useCallback(() => {
    if (customFrom && customTo) {
      setAppliedFrom(customFrom)
      setAppliedTo(customTo)
    }
  }, [customFrom, customTo])

  const isEmpty = !isLoading && (!data?.data.length || data.data.every((d) => d.conversations === 0 && d.credits === 0))

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Conversation Activity</div>
          <div className={styles.subtitle}>{RANGE_LABELS[range]}</div>
        </div>
        <div className={styles.controls}>
          {(["day", "week", "month", "custom"] as Range[]).map((r) => (
            <button
              key={r}
              className={`${styles.rangeBtn} ${range === r ? styles.rangeBtnActive : ""}`}
              onClick={() => setRange(r)}
            >
              {r === "day" ? "7D" : r === "week" ? "12W" : r === "month" ? "12M" : "Range"}
            </button>
          ))}
        </div>
      </div>

      {range === "custom" && (
        <div className={styles.customRange}>
          <input
            type="date"
            className={styles.dateInput}
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
          />
          <span className={styles.dateSep}>→</span>
          <input
            type="date"
            className={styles.dateInput}
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
          />
          <button className={styles.applyBtn} onClick={applyCustom} disabled={!customFrom || !customTo}>
            Apply
          </button>
        </div>
      )}

      <div className={styles.stats}>
        <div className={styles.statItem}>
          <div className={styles.statVal}>{isLoading ? "—" : (data?.totalConversations ?? 0)}</div>
          <div className={styles.statLbl}>Total conversations</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statVal}>{isLoading ? "—" : (data?.totalCredits ?? 0)}</div>
          <div className={styles.statLbl}>Credits used</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statVal}>{isLoading ? "—" : (data?.busiestDay ?? "—")}</div>
          <div className={styles.statLbl}>Busiest day</div>
        </div>
      </div>

      <div className={styles.chartWrap}>
        {isLoading ? (
          <div className={styles.loading}>
            <svg className={styles.loadingLine} viewBox="0 0 300 80" preserveAspectRatio="none">
              <polyline
                points="0,60 40,45 80,55 120,20 160,35 200,25 240,40 300,15"
                fill="none"
                stroke="var(--border)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ) : isEmpty ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📊</div>
            <div>No conversation data yet for this period</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradConv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={ACCENT} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCredits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CREDITS_COLOR} stopOpacity={0.12} />
                  <stop offset="95%" stopColor={CREDITS_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="conv"
                allowDecimals={false}
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="cred"
                orientation="right"
                allowDecimals={false}
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }} />
              <Legend content={<CustomLegend />} />
              <Area
                yAxisId="conv"
                type="monotone"
                dataKey="conversations"
                stroke={ACCENT}
                strokeWidth={2}
                fill="url(#gradConv)"
                dot={false}
                activeDot={{ r: 4, fill: ACCENT, strokeWidth: 0 }}
              />
              <Area
                yAxisId="cred"
                type="monotone"
                dataKey="credits"
                stroke={CREDITS_COLOR}
                strokeWidth={2}
                fill="url(#gradCredits)"
                dot={false}
                activeDot={{ r: 4, fill: CREDITS_COLOR, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
