import Link from "next/link"
import { Navbar } from "@/components/landing/Navbar"
import styles from "./not-found.module.css"

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className={styles.page}>
        <div className={styles.bg} />

        {/* Floating particles */}
        <div className={styles.particles}>
          <span className={styles.p1} />
          <span className={styles.p2} />
          <span className={styles.p3} />
          <span className={styles.p4} />
          <span className={styles.p5} />
          <span className={styles.p6} />
          <span className={styles.p7} />
          <span className={styles.p8} />
        </div>

        {/* 3D Cube */}
        <div className={styles.scene}>
          <div className={styles.cubeWrapper}>
            <div className={styles.cube}>
              <div className={`${styles.face} ${styles.front}`} />
              <div className={`${styles.face} ${styles.back}`} />
              <div className={`${styles.face} ${styles.left}`} />
              <div className={`${styles.face} ${styles.right}`} />
              <div className={`${styles.face} ${styles.top}`} />
              <div className={`${styles.face} ${styles.bottom}`} />
            </div>
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.errorCode}>404</div>
          <h1 className={styles.title}>Lost in space</h1>
          <p className={styles.desc}>
            The page you&apos;re looking for doesn&apos;t exist or has drifted somewhere into the universe.
          </p>
          <div className={styles.actions}>
            <Link href="/" className={styles.primary}>← Back to Home</Link>
            <Link href="/contact" className={styles.secondary}>Contact Support</Link>
          </div>
        </div>
      </main>
    </>
  )
}
