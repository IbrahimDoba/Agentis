"use client"

import { useEffect, useState } from "react"
import { PlayIcon } from "@heroicons/react/24/solid"
import { PlayCircleIcon } from "@heroicons/react/24/outline"
import { Modal } from "@/components/ui/Modal"
import { useBrand } from "@/components/BrandProvider"
import { getTutorial, type PublishedTutorial, type TutorialId } from "@/lib/tutorial-videos"
import styles from "./Tutorials.module.css"

// The iframe only mounts once the player opens, so pages with a tutorial link
// don't load YouTube's player for people who never press play.
export function TutorialPlayer({ video, onClose }: { video: PublishedTutorial | null; onClose: () => void }) {
  useEffect(() => {
    if (!video) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [video, onClose])

  return (
    <Modal open={video !== null} onClose={onClose} title={video?.title} size="lg">
      {video && (
        <>
          <div className={styles.frame}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&rel=0&modestbranding=1`}
              title={video.title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
          <p className={styles.playerDesc}>{video.description}</p>
        </>
      )}
    </Modal>
  )
}

// Small "Watch how it works" link for page headers. Renders nothing on reseller
// tenants (the videos show Dailzero branding) or before the video is uploaded.
export function TutorialLink({ id, label = "Watch how it works" }: { id: TutorialId; label?: string }) {
  const brand = useBrand()
  const [open, setOpen] = useState(false)
  const video = getTutorial(id)
  if (!brand.isPlatform || !video) return null

  return (
    <>
      <button type="button" className={styles.link} onClick={() => setOpen(true)}>
        <PlayCircleIcon width={16} height={16} aria-hidden />
        {label}
        <span className={styles.linkMeta}>{video.duration}</span>
      </button>
      <TutorialPlayer video={open ? video : null} onClose={() => setOpen(false)} />
    </>
  )
}

function Thumb({ video }: { video: PublishedTutorial }) {
  return (
    <span className={styles.thumb}>
      <img src={video.thumbnail} alt="" width={640} height={360} loading="lazy" />
      <span className={styles.play} aria-hidden><PlayIcon width={16} height={16} /></span>
    </span>
  )
}

// Grid of every published tutorial, for the guide index.
export function TutorialGrid({ videos }: { videos: PublishedTutorial[] }) {
  const [playing, setPlaying] = useState<PublishedTutorial | null>(null)
  return (
    <>
      <div className={styles.grid}>
        {videos.map((v) => (
          <button key={v.id} type="button" className={styles.card} onClick={() => setPlaying(v)}>
            <Thumb video={v} />
            <span className={styles.cardText}>
              <span className={styles.cardTitle}>{v.title}</span>
              <span className={styles.cardDesc}>{v.description}</span>
            </span>
          </button>
        ))}
      </div>
      <TutorialPlayer video={playing} onClose={() => setPlaying(null)} />
    </>
  )
}

// One wide card at the top of a written guide.
export function TutorialFeature({ video }: { video: PublishedTutorial }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={styles.feature} onClick={() => setOpen(true)}>
        <Thumb video={video} />
        <span className={styles.cardText}>
          <span className={styles.featureLabel}>Video</span>
          <span className={styles.cardTitle}>{video.title}</span>
          <span className={styles.cardDesc}>{video.description}</span>
        </span>
      </button>
      <TutorialPlayer video={open ? video : null} onClose={() => setOpen(false)} />
    </>
  )
}
