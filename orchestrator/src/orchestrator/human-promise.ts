// Detects a reply in which the AI tells the customer that a person / the team
// will come back to them. The model writes these lines reliably but calls the
// request_human_handoff tool only ~1 in 6 times, which leaves the chat in AI
// mode — the AI then answers the customer's next message despite having just
// promised a human. When this matches, the caller performs the handoff itself.
// Pure (no config/db imports) so it's unit-tested directly.
//
// Deliberately narrow: only a commitment that WE will come back ("get back to
// you", "a team member will attend to you"). Invitations for the customer to
// return ("just reach out", "feel free to reach out") must not match, nor
// process lines like "the team will confirm and get your order dispatched".

const PATTERNS: RegExp[] = [
  // "let me confirm that with the team and get right back to you", "I'll get
  // back to you shortly", "we'll come right back to you"
  /\b(let me|i'?ll|i will|we'?ll|we will)\b[^.!?\n]{0,80}?\b(get|come)\s+(right\s+)?back\s+to\s+you\b/i,
  // "a team member will attend to you shortly", "let me get a team member to respond to you"
  /\bteam\s+member\b[^.!?\n]{0,60}?\b(attend\s+to|respond\s+to|get\s+back\s+to|be\s+with)\s+you\b/i,
  // "someone from our team will attend to you / get back to you"
  /\bsomeone\s+from\s+(our|the)\s+team\b[^.!?\n]{0,60}?\b(attend\s+to|respond\s+to|get\s+back\s+to|be\s+with)\s+you\b/i,
  // "the team will get back to you / attend to you / respond to you"
  /\b(the|our)\s+team\s+will\s+(get\s+back\s+to|attend\s+to|respond\s+to|be\s+with)\s+you\b/i,
  // "I'm handing you over to the team", "passing this to a team member"
  /\b(hand(ing)?|pass(ing)?)\s+(you|this|your\s+(chat|conversation|request))\s+(over\s+)?to\s+(a|our|the)\s+(team|human|person|colleague|team\s+member)\b/i,
]

export function promisesHumanFollowUp(text: string | null | undefined): boolean {
  if (!text) return false
  return PATTERNS.some((re) => re.test(text))
}
