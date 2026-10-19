import { describe, it, expect } from "vitest"
import { promisesHumanFollowUp } from "./human-promise.js"

// Real AI replies from production (JustFits, Coffee Bar, D-zero, …).
const promises = [
  "Thanks for the photo — let me confirm this and get back to you.",
  "Good evening! Let me confirm that with the team and get right back to you.",
  "Thank you for reaching out! A team member will attend to you shortly 🙏",
  "Let me confirm that with the team and get right back to you. One moment please!",
  "Good evening! Let me confirm that with the team and come right back to you.",
  "Good afternoon! Let me confirm that one with the team and come right back to you.",
  "Anytime! 😊 I'll get back to you shortly with the information you need.",
  "Good evening! Let me get a team member to respond to you on that shortly 🙏",
  "Someone from our team will get back to you shortly.",
  "The team will get back to you within the hour.",
  "I'm handing you over to the team now.",
]

const notPromises = [
  "Anytime! If you need any assistance or have questions in the future, just reach out. Have a great day!",
  "Anytime! Feel free to reach out whenever you're ready. I'm here to help! 😊",
  "Anytime! Just reach out when you're ready to continue. 😊",
  "Got it — the team will confirm and get your order dispatched. Tracking details coming soon.",
  "Done — you're booked for Thursday at 2 PM. Our team will reach out on this number. Looking forward to it!",
  "Good evening! Our caps are around 30k. Want to see the collection?",
  "Awesome! You have two options: *1. Online Application:* Schedule a WhatsApp call with our team.",
  "Let me know if you get stuck on any step.",
  "",
]

describe("promisesHumanFollowUp", () => {
  it.each(promises)("detects a promise: %s", (t) => {
    expect(promisesHumanFollowUp(t)).toBe(true)
  })
  it.each(notPromises)("ignores a non-promise: %s", (t) => {
    expect(promisesHumanFollowUp(t)).toBe(false)
  })
  it("handles null/undefined", () => {
    expect(promisesHumanFollowUp(null)).toBe(false)
    expect(promisesHumanFollowUp(undefined)).toBe(false)
  })
})
