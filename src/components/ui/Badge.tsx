import { HTMLAttributes } from "react"
import styles from "./Badge.module.css"
import { cn, getStatusColor, getStatusLabel } from "@/lib/utils"

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: string
  showDot?: boolean
}

export function Badge({ variant, showDot = true, children, className, ...props }: BadgeProps) {
  const variantClass = variant ? styles[variant] || styles["badge--default"] : styles.default
  return (
    <span className={cn(styles.badge, variantClass, className)} {...props}>
      {showDot && <span className={styles.dot} />}
      {children}
    </span>
  )
}

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const colorClass = getStatusColor(status)
  const label = getStatusLabel(status)
  return (
    <span className={cn(styles.badge, styles[colorClass], className)}>
      <span className={styles.dot} />
      {label}
    </span>
  )
}

export default Badge
