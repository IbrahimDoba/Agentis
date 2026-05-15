/*!
 * D-Zero AI embed widget — v1.
 * Vanilla JS, no dependencies. Renders a launcher + chat panel inside a
 * Shadow DOM root so the host site's CSS can never leak in (or out).
 *
 * Snippet:
 *   <script>
 *     window.dz = window.dz || function(...a){(window.dz.q=window.dz.q||[]).push(a)}
 *     dz('init', { publicKey: 'pk_live_...' })
 *   </script>
 *   <script async src="https://app.dailzero.ai/embed/v1.js"></script>
 *
 * Public API:
 *   dz('init', { publicKey })       — required, called once
 *   dz('open')                       — programmatically open the panel
 *   dz('close')                      — programmatically close
 *   dz('identify', { email, name }) — attach a known visitor identity
 */
(function () {
  "use strict"

  if (window.__dzEmbedLoaded) return // hot-reload safety
  window.__dzEmbedLoaded = true

  // ── Resolve the API host from this script's own src ────────────────────────
  // Falls back to current page origin if we can't read currentScript (rare).
  var SCRIPT_EL = document.currentScript
  var API_HOST = (function () {
    try {
      if (SCRIPT_EL && SCRIPT_EL.src) return new URL(SCRIPT_EL.src).origin
    } catch (_) {}
    return window.location.origin
  })()

  // ── Visitor ID — stable per-browser anonymous UUID ─────────────────────────
  var STORAGE_KEY = "dz_visitor_id"
  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID()
    return "v-" + Date.now() + "-" + Math.random().toString(36).slice(2)
  }
  function getVisitorId() {
    try {
      var existing = localStorage.getItem(STORAGE_KEY)
      if (existing) return existing
      var id = uuid()
      localStorage.setItem(STORAGE_KEY, id)
      return id
    } catch (_) {
      // localStorage unavailable (e.g. private mode + Safari) — fall back
      // to a session-only id. The conversation won't persist across tabs.
      return uuid()
    }
  }

  // ── State ──────────────────────────────────────────────────────────────────
  var state = {
    publicKey: null,
    identify: null,
    visitorId: getVisitorId(),
    conversationId: null,
    theme: {},
    open: false,
    booted: false,
    bootError: null,
    sending: false,
    messages: [], // { id, direction, content, createdAt }
    lastCreatedAt: null,
    pollHandle: null,
  }

  // ── Drain the dz() queue and replace it with the real implementation ──────
  var earlyQueue = (window.dz && window.dz.q) ? window.dz.q.slice() : []
  function api() {
    var args = Array.prototype.slice.call(arguments)
    var cmd = args.shift()
    if (cmd === "init") return init(args[0] || {})
    if (cmd === "open") return openPanel()
    if (cmd === "close") return closePanel()
    if (cmd === "identify") return identify(args[0] || {})
    console.warn("[dz] unknown command:", cmd)
  }
  window.dz = api

  function init(opts) {
    if (!opts || !opts.publicKey) {
      console.error("[dz] init called without publicKey")
      return
    }
    state.publicKey = opts.publicKey
    render()
  }

  function identify(opts) {
    state.identify = {
      email: typeof opts.email === "string" ? opts.email : undefined,
      name: typeof opts.name === "string" ? opts.name : undefined,
    }
    // If already booted, re-init so the server attaches the new identity.
    if (state.booted) {
      state.booted = false
      state.conversationId = null
      boot()
    }
  }

  // ── DOM / Shadow DOM bootstrap ─────────────────────────────────────────────
  var host = null
  var root = null
  var refs = {} // cached element references inside the shadowRoot

  function injectHost() {
    if (host) return
    host = document.createElement("div")
    host.setAttribute("data-dz-widget", "")
    host.style.all = "initial"
    host.style.position = "fixed"
    host.style.zIndex = "2147483647" // top of stack
    host.style.bottom = "0"
    host.style.right = "0"
    document.body.appendChild(host)
    root = host.attachShadow({ mode: "open" })
    root.innerHTML = TEMPLATE
    bindRefs()
    bindEvents()
  }

  function bindRefs() {
    refs.launcher = root.getElementById("dz-launcher")
    refs.panel = root.getElementById("dz-panel")
    refs.closeBtn = root.getElementById("dz-close")
    refs.messages = root.getElementById("dz-messages")
    refs.form = root.getElementById("dz-form")
    refs.input = root.getElementById("dz-input")
    refs.sendBtn = root.getElementById("dz-send")
    refs.title = root.getElementById("dz-title")
    refs.greeting = root.getElementById("dz-greeting")
    refs.typing = root.getElementById("dz-typing")
  }

  function bindEvents() {
    refs.launcher.addEventListener("click", openPanel)
    refs.closeBtn.addEventListener("click", closePanel)
    refs.form.addEventListener("submit", onSubmit)
    refs.input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        onSubmit(e)
      }
    })
  }

  // ── Rendering ──────────────────────────────────────────────────────────────
  function render() {
    injectHost()
    applyTheme()
    refs.panel.style.display = state.open ? "flex" : "none"
    refs.launcher.style.display = state.open ? "none" : "flex"
  }

  function applyTheme() {
    var color = (state.theme && state.theme.primaryColor) || "#00DC82"
    var position = (state.theme && state.theme.position) || "bottom-right"
    refs.launcher.style.background = color
    refs.sendBtn.style.background = color
    if (refs.title) refs.title.style.color = "#fff"
    // Reposition the host container.
    host.style.bottom = "16px"
    host.style.right = position === "bottom-right" ? "16px" : "auto"
    host.style.left = position === "bottom-left" ? "16px" : "auto"
  }

  function openPanel() {
    injectHost()
    state.open = true
    refs.panel.style.display = "flex"
    refs.launcher.style.display = "none"
    if (!state.booted) boot()
    else startPolling()
    setTimeout(function () { refs.input && refs.input.focus() }, 50)
  }

  function closePanel() {
    state.open = false
    if (refs.panel) refs.panel.style.display = "none"
    if (refs.launcher) refs.launcher.style.display = "flex"
    stopPolling()
  }

  // ── API calls ──────────────────────────────────────────────────────────────
  function apiUrl(path) {
    return API_HOST + path
  }

  function boot() {
    if (!state.publicKey) return
    fetch(apiUrl("/api/embed/init"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: state.publicKey,
        visitorId: state.visitorId,
        identify: state.identify || undefined,
      }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("init " + res.status)
        return res.json()
      })
      .then(function (data) {
        state.conversationId = data.conversationId
        state.theme = data.theme || {}
        state.booted = true
        state.bootError = null
        applyTheme()
        if (state.theme.greeting) {
          refs.greeting.textContent = state.theme.greeting
          refs.greeting.style.display = "block"
        }
        // Pull any existing history (e.g. repeat visitor).
        fetchMessages(null)
        startPolling()
      })
      .catch(function (err) {
        state.bootError = String(err && err.message ? err.message : err)
        refs.greeting.style.display = "block"
        refs.greeting.textContent = "Could not connect. Please refresh the page."
        console.error("[dz] boot failed:", err)
      })
  }

  function fetchMessages(since) {
    if (!state.booted || !state.conversationId) return
    var qs = new URLSearchParams({
      publicKey: state.publicKey,
      visitorId: state.visitorId,
      conversationId: state.conversationId,
    })
    if (since) qs.set("since", since)
    fetch(apiUrl("/api/embed/messages?" + qs.toString()))
      .then(function (res) { return res.ok ? res.json() : null })
      .then(function (data) {
        if (!data || !Array.isArray(data.messages) || data.messages.length === 0) return
        var hadAssistantReply = false
        for (var i = 0; i < data.messages.length; i++) {
          var m = data.messages[i]
          if (!state.messages.some(function (x) { return x.id === m.id })) {
            state.messages.push(m)
            renderMessage(m)
            if (m.direction === "outbound") hadAssistantReply = true
          }
          if (!state.lastCreatedAt || m.createdAt > state.lastCreatedAt) {
            state.lastCreatedAt = m.createdAt
          }
        }
        if (hadAssistantReply) hideTyping()
      })
      .catch(function (err) { console.warn("[dz] poll failed:", err) })
  }

  // Two polling cadences. Default is the slow 2500ms tick — light on the
  // server when nothing is happening. After the visitor sends a message we
  // know an AI reply is coming within ~1-3s, so we drop to a fast 600ms
  // tick for a short window to surface the reply almost as soon as it's
  // persisted, then settle back. Avoids burning queries when idle.
  var SLOW_POLL_MS = 2500
  var FAST_POLL_MS = 600
  var FAST_POLL_WINDOW_MS = 12000

  function startPolling() { schedulePolling(SLOW_POLL_MS) }
  function startFastPolling() {
    schedulePolling(FAST_POLL_MS)
    if (state.fastPollTimeout) clearTimeout(state.fastPollTimeout)
    state.fastPollTimeout = setTimeout(function () { startPolling() }, FAST_POLL_WINDOW_MS)
  }
  function schedulePolling(intervalMs) {
    stopPolling()
    state.pollHandle = setInterval(function () { fetchMessages(state.lastCreatedAt) }, intervalMs)
  }
  function stopPolling() {
    if (state.pollHandle) clearInterval(state.pollHandle)
    state.pollHandle = null
    if (state.fastPollTimeout) clearTimeout(state.fastPollTimeout)
    state.fastPollTimeout = null
  }

  function onSubmit(e) {
    e.preventDefault()
    if (state.sending || !state.booted || !state.conversationId) return
    var text = (refs.input.value || "").trim()
    if (!text) return
    refs.input.value = ""
    state.sending = true
    showTyping()
    // Reply is imminent — switch to fast polling so the visitor sees it as
    // soon as the orchestrator persists it, not on the next slow tick.
    startFastPolling()

    // Optimistic render of the visitor's own message so the UI feels snappy.
    var localId = "local-" + Date.now()
    var localMsg = { id: localId, direction: "inbound", content: text, createdAt: new Date().toISOString() }
    state.messages.push(localMsg)
    renderMessage(localMsg)

    fetch(apiUrl("/api/embed/message"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: state.publicKey,
        visitorId: state.visitorId,
        conversationId: state.conversationId,
        text: text,
      }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("send " + res.status)
        return res.json()
      })
      .then(function (data) {
        // Reconcile the optimistic local id with the server-issued messageId
        // (same uuid the orchestrator persists as the inbound row's id). When
        // polling later returns that row, the id will already match and the
        // dedup check in fetchMessages skips it — no double-render.
        if (!data || !data.messageId) return
        for (var i = 0; i < state.messages.length; i++) {
          if (state.messages[i].id === localId) {
            state.messages[i].id = data.messageId
            break
          }
        }
        var bubble = root.querySelector('[data-msg-id="' + localId + '"]')
        if (bubble) bubble.setAttribute("data-msg-id", data.messageId)
      })
      .catch(function (err) {
        hideTyping()
        // Mark the optimistic bubble as failed visually.
        var bubble = root.querySelector('[data-msg-id="' + localId + '"]')
        if (bubble) bubble.style.opacity = "0.5"
        console.error("[dz] send failed:", err)
      })
      .finally(function () { state.sending = false })
  }

  // ── Message rendering ──────────────────────────────────────────────────────
  function renderMessage(m) {
    if (!refs.messages) return
    var row = document.createElement("div")
    row.className = "dz-row " + (m.direction === "outbound" ? "dz-row-in" : "dz-row-out")
    row.setAttribute("data-msg-id", m.id)
    var bubble = document.createElement("div")
    bubble.className = "dz-bubble"
    bubble.textContent = m.content
    row.appendChild(bubble)
    refs.messages.appendChild(row)
    refs.messages.scrollTop = refs.messages.scrollHeight
  }

  function showTyping() {
    if (refs.typing) refs.typing.style.display = "flex"
  }

  function hideTyping() {
    if (refs.typing) refs.typing.style.display = "none"
  }

  // ── Markup + scoped styles (lives inside the Shadow DOM) ──────────────────
  var TEMPLATE = [
    "<style>",
    ":host, *, *::before, *::after { box-sizing: border-box; }",
    ".container { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }",
    "#dz-launcher { width: 56px; height: 56px; border-radius: 50%; background: #00DC82; box-shadow: 0 10px 25px rgba(0,0,0,0.18); display: flex; align-items: center; justify-content: center; cursor: pointer; border: none; padding: 0; transition: transform 0.15s ease; }",
    "#dz-launcher:hover { transform: scale(1.05); }",
    "#dz-launcher svg { width: 26px; height: 26px; fill: #fff; }",
    "#dz-panel { display: none; flex-direction: column; width: 360px; height: 540px; max-height: calc(100vh - 32px); background: #fff; border-radius: 16px; box-shadow: 0 24px 60px rgba(0,0,0,0.25); overflow: hidden; }",
    "@media (max-width: 480px) { #dz-panel { width: calc(100vw - 32px); height: calc(100vh - 100px); } }",
    "#dz-header { padding: 14px 16px; background: linear-gradient(135deg, rgba(0,0,0,0.85), rgba(0,0,0,0.95)); color: #fff; display: flex; align-items: center; justify-content: space-between; }",
    "#dz-title { font-weight: 600; font-size: 15px; margin: 0; }",
    "#dz-close { background: rgba(255,255,255,0.1); border: none; color: #fff; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 18px; line-height: 1; display: flex; align-items: center; justify-content: center; }",
    "#dz-close:hover { background: rgba(255,255,255,0.18); }",
    "#dz-messages { flex: 1; overflow-y: auto; padding: 16px; background: #f8f9fb; display: flex; flex-direction: column; gap: 8px; }",
    "#dz-greeting { display: none; color: #555; font-size: 13px; padding: 10px 12px; background: #fff; border-radius: 12px; align-self: flex-start; max-width: 80%; line-height: 1.45; }",
    ".dz-row { display: flex; }",
    ".dz-row-out { justify-content: flex-end; }",
    ".dz-row-in { justify-content: flex-start; }",
    ".dz-bubble { max-width: 80%; padding: 9px 12px; border-radius: 14px; font-size: 14px; line-height: 1.45; word-wrap: break-word; white-space: pre-wrap; }",
    ".dz-row-out .dz-bubble { background: #00DC82; color: #000; border-bottom-right-radius: 4px; }",
    ".dz-row-in .dz-bubble { background: #fff; color: #111; border: 1px solid #e5e7eb; border-bottom-left-radius: 4px; }",
    "#dz-typing { display: none; gap: 4px; padding: 8px 12px; }",
    "#dz-typing span { width: 6px; height: 6px; border-radius: 50%; background: #aaa; animation: dzBounce 1.2s infinite; }",
    "#dz-typing span:nth-child(2) { animation-delay: 0.15s; }",
    "#dz-typing span:nth-child(3) { animation-delay: 0.3s; }",
    "@keyframes dzBounce { 0%, 60%, 100% { opacity: 0.3; } 30% { opacity: 1; } }",
    "#dz-form { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid #eaecef; background: #fff; }",
    "#dz-input { flex: 1; border: 1px solid #e2e5ea; border-radius: 10px; padding: 9px 12px; font-size: 14px; outline: none; font-family: inherit; resize: none; min-height: 38px; max-height: 100px; line-height: 1.4; }",
    "#dz-input:focus { border-color: #00DC82; }",
    "#dz-send { background: #00DC82; color: #000; border: none; border-radius: 10px; padding: 0 16px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }",
    "#dz-send:hover { filter: brightness(0.95); }",
    "#dz-footer { text-align: center; padding: 6px; font-size: 10px; color: #999; background: #fff; }",
    "#dz-footer a { color: inherit; text-decoration: none; }",
    "</style>",
    "<div class='container'>",
    "  <button id='dz-launcher' aria-label='Open chat'>",
    "    <svg viewBox='0 0 24 24'><path d='M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z'/></svg>",
    "  </button>",
    "  <div id='dz-panel'>",
    "    <div id='dz-header'>",
    "      <span id='dz-title'>Chat</span>",
    "      <button id='dz-close' aria-label='Close chat'>✕</button>",
    "    </div>",
    "    <div id='dz-messages'>",
    "      <div id='dz-greeting'></div>",
    "    </div>",
    "    <div id='dz-typing'><span></span><span></span><span></span></div>",
    "    <form id='dz-form'>",
    "      <textarea id='dz-input' placeholder='Type a message…' rows='1'></textarea>",
    "      <button id='dz-send' type='submit'>Send</button>",
    "    </form>",
    "    <div id='dz-footer'>Powered by <a href='https://dailzero.ai' target='_blank' rel='noopener'>D-Zero AI</a></div>",
    "  </div>",
    "</div>",
  ].join("\n")

  // ── Process queued calls from the inline snippet ──────────────────────────
  for (var i = 0; i < earlyQueue.length; i++) {
    try { api.apply(null, earlyQueue[i]) } catch (e) { console.error("[dz] queue:", e) }
  }
})()
