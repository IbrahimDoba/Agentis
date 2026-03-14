import styles from "./Spinner.module.css"
import { cn } from "@/lib/utils"

interface SpinnerProps {
  size?: "sm" | "md" | "lg"
  className?: string
}

export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <div className={cn(styles.spinner, styles[size], className)} role="status" aria-label="Loading">
      <span className={styles.sr}>Loading...</span>
    </div>
  )
}

export default Spinner
