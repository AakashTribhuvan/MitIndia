const controls = {
  start_hold: { formatter: (value) => `${Number(value).toFixed(2)} s` },
  stop_hold: { formatter: (value) => `${Number(value).toFixed(2)} s` },
  mode_hold: { formatter: (value) => `${Number(value).toFixed(2)} s` },
  movement_threshold: { formatter: (value) => Number(value).toFixed(2) },
  raised_below_shoulder: { formatter: (value) => Number(value).toFixed(2) }
}

let currentLearningHandCount = null

async function updateLearningTarget(sampleId) {
  const response = await fetch("/api/learning/target", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sample_id: sampleId }),
    cache: "no-store"
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`)
}

const statusNames = {
  idle: "IDLE",
  starting: "STARTING",
  signing: "SIGNING",
  ending: "ENDING"
}

const modeNames = {
  idle: "—",
  static: "STATIC",
  dynamic: "DYNAMIC"
}

const $ = (id) => document.getElementById(id)
const settingStatus = $("settings-status")
const cameraFeed = $("camera-feed")
const videoPlaceholder = $("video-placeholder")
const studioView = $("studio-view")
const learningView = $("learning-view")
const learningCameraFeed = $("learning-camera-feed")
const learningImage = $("learning-image")
const learningPlaceholder = $("learning-placeholder")
const learningGuide = $("learning-guide")
const learningGuideMarkers = $("learning-guide-markers")
const learningGuideBadge = $("learning-guide-badge")
const learningGuideCaption = $("learning-guide-caption")
const connectionState = $("connection-state")
const connectionDot = $("connection-dot")
let settingTimers = new Map()
let lastState = null
let settingsInitialized = false
let currentView = "studio-view"
let currentLearningLabel = null
let currentLearningSampleId = null

function setSettingsStatus(message, isError = false) {
  settingStatus.textContent = message
  settingStatus.classList.toggle("is-error", isError)
}

function renderSetting(key, value) {
  const input = $(key)
  input.value = value
  $(`${key}_value`).textContent = controls[key].formatter(value)
}

function renderSettings(settings) {
  for (const key of Object.keys(controls)) {
    if (Object.hasOwn(settings, key)) renderSetting(key, settings[key])
  }
}

async function saveSettings(changes) {
  setSettingsStatus("Applying changes…")
  try {
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
      cache: "no-store"
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`)
    renderSettings(changes)
    setSettingsStatus("Live settings applied")
  } catch (error) {
    setSettingsStatus(error.message || "Could not apply settings", true)
  }
}

function stateCaption(state, mode) {
  if (state === "starting") return "Checking that activity continues"
  if (state === "signing" && mode === "static") return "Still hands are being held as a sign"
  if (state === "signing" && mode === "dynamic") return "Sustained hand movement detected"
  if (state === "ending") return "Waiting for rest to confirm the end"
  return "Waiting for a clear signing movement"
}

function renderRuntime(runtime) {
  const state = runtime.state || "idle"
  const mode = runtime.mode || "idle"
  const formattedState = statusNames[state] || state.toUpperCase()
  const formattedMode = modeNames[mode] || "—"

  $("activity-state").textContent = formattedState
  $("activity-mode").textContent = formattedMode
  $("state-caption").textContent = stateCaption(state, mode)
  $("video-state-chip").textContent = `${formattedState}${mode !== "idle" ? ` · ${formattedMode}` : ""}`
  $("segment-time").textContent = Number(runtime.elapsed || 0).toFixed(1)
  $("wrist-speed").textContent = Number(runtime.wrist_speed || 0).toFixed(2)
  $("hands-count").textContent = Number(runtime.hands || 0)
  $("fps-value").textContent = Math.round(Number(runtime.fps || 0))
  $("raised-status").textContent = runtime.raised ? "Signing-height zone active" : "Hands below active zone"
  $("resolution-value").textContent = runtime.resolution || "Camera size pending"
  $("footer-resolution").textContent = `${runtime.resolution || "LOCAL"} · PRIVATE · IN PROGRESS`
  renderRecognition(runtime.recognition || {})
  renderLearningResult(runtime.recognition || {})
  renderLearningGuide(runtime.learning_guide || null)

  if (state !== lastState) {
    $("video-state-chip").dataset.state = state
    lastState = state
  }

}

function renderRecognition(recognition) {
  const label = $("recognition-label")
  const caption = $("recognition-caption")
  if (!recognition.enabled) {
    label.textContent = "OFF"
    caption.textContent = "Run with --static-demo to try live labels."
    return
  }

  const states = {
    disabled: ["OFF", "Static-pose matching is disabled."],
    waiting: ["READY", "Hold a tracked pose to try a match."],
    starting: ["STARTING", "Waiting for the sign boundary to settle."],
    ending: ["ENDING", "Return to a held pose to continue matching."],
    dynamic: ["STATIC ONLY", "The still-image model does not recognize dynamic signs."],
    confirming: ["CHECKING…", "Waiting for the same pose to persist."],
    tracking: [
      "CHECK TRACKING",
      recognition.reason
        ? recognition.reason.replace(/_/g, " ")
        : "Keep the pose and hands clearly in frame."
    ],
    unknown: [
      "UNKNOWN",
      recognition.reason?.startsWith("no_class_supports_")
        ? "This hand count has no trained profiles; one-hand and two-hand signs are matched separately."
        : recognition.reason === "FOOD_requires_face_anchor"
        ? "Keep your face and signing hand visible for this face-relative sign."
        : recognition.reason
        ? recognition.reason.replace(/_/g, " ")
        : "No reliable match; try a clearer held pose."
    ],
    recognized: [
      readableLabel(recognition.label),
      "Experimental match · not a verified gloss."
    ]
  }
  const [title, message] = states[recognition.state] || ["READY", "Hold a tracked pose to try a match."]
  label.textContent = title
  const details = Number.isFinite(recognition.distance)
    ? ` · distance ${recognition.distance.toFixed(2)}${Number.isFinite(recognition.threshold) ? ` / limit ${recognition.threshold.toFixed(2)}` : ""}`
    : ""
  const torsoNote = recognition.torso_anchor_source === "shoulders_estimated"
    ? " · torso estimated from shoulders"
    : ""
  const faceNote = recognition.face_anchor_source === "unavailable"
    ? " · face anchor unavailable"
    : ""
  caption.textContent = `${message}${details}${torsoNote}${faceNote}`
}

function readableLabel(label) {
  if (label === "I_ME_MINE_MY") return "I / ME / MYSELF · combined folder label"
  return label ? label.replace(/_/g, " ") : "Unknown"
}

function renderLearningGuide(guide) {
  learningGuideMarkers.replaceChildren()
  if (!guide || guide.label !== currentLearningLabel) {
    learningGuide.hidden = true
    learningGuideBadge.hidden = true
    learningGuideCaption.textContent = currentLearningLabel
      ? `Expected ${currentLearningHandCount || "model"}-hand position will appear when body tracking is available.`
      : "Choose a reference to show its expected hand position."
    return
  }

  const expectedCount = Number(guide.expected_hand_count)
  learningGuideBadge.textContent = `MODEL GUIDE · ${expectedCount} ${expectedCount === 1 ? "HAND" : "HANDS"}`
  learningGuideBadge.hidden = false
  if (guide.reason) {
    learningGuide.hidden = true
    learningGuideCaption.textContent = `Cannot place the model guide: ${guide.reason}`
    return
  }
  const width = Number(guide.frame_width)
  const height = Number(guide.frame_height)
  const positions = Array.isArray(guide.positions) ? guide.positions : []
  if (!(width > 0 && height > 0) || positions.length !== expectedCount) {
    learningGuide.hidden = true
    learningGuideCaption.textContent = "Waiting for visible shoulders and a model-supported hand pose."
    return
  }

  learningGuide.setAttribute("viewBox", `0 0 ${width} ${height}`)
  const markerRadius = Math.max(28, Number(guide.marker_radius) || 0)
  positions.forEach((position, index) => {
    const x = Number(position.x)
    const y = Number(position.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle")
    marker.setAttribute("class", "learning-guide-marker")
    marker.setAttribute("cx", String(x))
    marker.setAttribute("cy", String(y))
    marker.setAttribute("r", String(markerRadius))
    learningGuideMarkers.append(marker)

    for (const [x1, y1, x2, y2] of [
      [x - markerRadius * 0.45, y, x + markerRadius * 0.45, y],
      [x, y - markerRadius * 0.45, x, y + markerRadius * 0.45]
    ]) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
      line.setAttribute("class", "learning-guide-crosshair")
      line.setAttribute("x1", String(x1))
      line.setAttribute("y1", String(y1))
      line.setAttribute("x2", String(x2))
      line.setAttribute("y2", String(y2))
      learningGuideMarkers.append(line)
    }

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text")
    label.setAttribute("class", "learning-guide-label")
    label.setAttribute("x", String(x + markerRadius * 0.55))
    label.setAttribute("y", String(y - markerRadius * 0.55))
    label.textContent = `HAND ${index + 1}`
    learningGuideMarkers.append(label)
  })
  learningGuide.hidden = false
  learningGuideCaption.textContent =
    `Gold rings mark the expected wrist locations from the ${readableLabel(guide.label)} ` +
    `${expectedCount}-hand model template. Match the hand positions and handshape; the guide is approximate.`
}

function displayMeaning(label) {
  const meanings = {
    YOU: "You",
    I_ME_MINE_MY: "I / me / myself · combined folder label (source folder also includes MY/MINE)",
    WHAT: "What",
    FOOD: "Food · face and hand visible",
    HELP: "Help · two tracked hands expected",
    HOW: "How",
    WATER: "Water"
  }
  return meanings[label] || readableLabel(label)
}

function renderLearningResult(recognition) {
  const title = $("learning-result-label")
  const caption = $("learning-result-caption")
  if (!currentLearningLabel) {
    title.textContent = "Choose a reference sign"
    caption.textContent = "Load the practice set to begin."
  } else if (!recognition.enabled) {
    title.textContent = "Recognition is off"
    caption.textContent = "Restart with --static-demo to compare live poses."
  } else if (recognition.state === "recognized" && recognition.label === currentLearningLabel) {
    title.textContent = `Nice match: ${readableLabel(recognition.label)}`
    caption.textContent = "Experimental match · repeat and see if it stays consistent."
  } else if (recognition.state === "recognized") {
    title.textContent = `Model says: ${readableLabel(recognition.label)}`
    caption.textContent = `Practice target: ${readableLabel(currentLearningLabel)} · labels are unverified.`
  } else if (recognition.state === "dynamic") {
    title.textContent = "Still-pose practice only"
    caption.textContent = "This model cannot judge movement-based signs."
  } else if (recognition.state === "unknown") {
    if (recognition.reason?.startsWith("no_class_supports_")) {
      const count = recognition.reason.match(/no_class_supports_(\d+)_tracked_hands/)
      title.textContent = count
        ? `No ${count[1]}-hand profiles are available`
        : "No matching hand-count profile"
      caption.textContent = "The model compares one-hand and two-hand signs separately."
    } else {
      title.textContent = "No reliable match"
      caption.textContent = "Try a clearer pose, or use another reference."
    }
  } else if (recognition.state === "tracking") {
    title.textContent = "Tracking needs a clearer view"
    caption.textContent = recognition.reason
      ? recognition.reason.replace(/_/g, " ")
      : "Keep your signing hand visible."
  } else {
    title.textContent = "Hold the reference pose"
    caption.textContent = "Keep your shoulders and signing hand visible."
  }
}

function setActiveView(viewId) {
  const wasLearning = currentView === "learning-view"
  currentView = viewId
  const learningActive = viewId === "learning-view"
  studioView.hidden = learningActive
  learningView.hidden = !learningActive
  for (const tab of document.querySelectorAll(".view-tab")) {
    const selected = tab.dataset.view === viewId
    tab.classList.toggle("is-active", selected)
    tab.setAttribute("aria-selected", String(selected))
  }
  const activeFeed = learningActive ? learningCameraFeed : cameraFeed
  const inactiveFeed = learningActive ? cameraFeed : learningCameraFeed
  inactiveFeed.removeAttribute("src")
  activeFeed.src = activeFeed.dataset.streamSrc
  if (learningActive && !currentLearningLabel) {
    loadNextLearningExample()
  } else if (learningActive && currentLearningSampleId !== null) {
    updateLearningTarget(currentLearningSampleId).catch((error) => {
      learningGuideCaption.textContent = error.message || "Could not activate the model guide."
    })
  } else if (!learningActive && wasLearning) {
    updateLearningTarget(null).catch((error) => {
      learningGuideCaption.textContent = error.message || "Could not clear the model guide."
    })
  }
}

async function loadNextLearningExample() {
  const button = $("next-learning")
  const label = $("learning-label")
  button.disabled = true
  label.textContent = "Finding an accepted reference…"
  try {
    const response = await fetch("/api/learning/next", { cache: "no-store" })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`)
    currentLearningLabel = result.label
    currentLearningSampleId = result.sample_id
    currentLearningHandCount = result.expected_hand_count
    label.textContent = readableLabel(result.label)
    $("learning-meaning").textContent = displayMeaning(result.label)
    $("learning-progress").textContent = `${result.sample} / ${result.total} REFERENCES`
    $("learning-index").textContent = `IMAGE ${result.sample}`
    $("learning-note").textContent =
      `Model profile expects ${result.expected_hand_count} ` +
      `${result.expected_hand_count === 1 ? "hand" : "hands"} · reference label remains unverified.`
    learningPlaceholder.hidden = true
    learningImage.hidden = false
    learningImage.src = result.image_url
    await updateLearningTarget(result.sample_id)
    renderLearningResult({})
  } catch (error) {
    currentLearningLabel = null
    currentLearningSampleId = null
    label.textContent = "Practice set unavailable"
    $("learning-meaning").textContent = "No sign reference available"
    learningImage.hidden = true
    learningPlaceholder.hidden = false
    learningPlaceholder.querySelector("strong").textContent = "No reference images are ready"
    learningPlaceholder.querySelector("span").textContent =
      error.message || "No accepted or calibrated reference examples are available."
    $("learning-progress").textContent = "NOT READY"
    $("learning-note").textContent =
      "Some labels may be hidden until the held-out data can calibrate a recognition threshold."
  } finally {
    button.disabled = false
  }
}

async function refreshStatus() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" })
    if (!response.ok) throw new Error(`Status request failed (${response.status})`)
    const result = await response.json()
    connectionState.textContent = "CONNECTED"
    connectionDot.parentElement.classList.add("is-online")
    $("connection-hint").textContent = "Local tracker is sending live status"
    if (!settingsInitialized) {
      renderSettings(result.settings)
      settingsInitialized = true
    }
    renderRuntime(result.runtime)
  } catch {
    connectionState.textContent = "RECONNECTING"
    connectionDot.parentElement.classList.remove("is-online")
    $("connection-hint").textContent = "Waiting for the local Python tracker"
  }
}

for (const key of Object.keys(controls)) {
  $(key).addEventListener("input", (event) => {
    const value = Number(event.target.value)
    $(`${key}_value`).textContent = controls[key].formatter(value)
    window.clearTimeout(settingTimers.get(key))
    settingTimers.set(key, window.setTimeout(() => saveSettings({ [key]: value }), 140))
  })
}

$("reset-settings").addEventListener("click", async () => {
  for (const timer of settingTimers.values()) window.clearTimeout(timer)
  settingTimers = new Map()
  await saveSettings({
    start_hold: 0.15,
    stop_hold: 0.7,
    mode_hold: 0.45,
    movement_threshold: 1.0,
    raised_below_shoulder: 0.55
  })
})

cameraFeed.addEventListener("load", () => {
  if (currentView === "studio-view") videoPlaceholder.hidden = true
})
cameraFeed.addEventListener("error", () => {
  if (currentView === "studio-view") videoPlaceholder.hidden = false
})

for (const tab of document.querySelectorAll(".view-tab")) {
  tab.addEventListener("click", () => setActiveView(tab.dataset.view))
}
$("next-learning").addEventListener("click", loadNextLearningExample)
learningImage.addEventListener("error", () => {
  learningImage.hidden = true
  learningPlaceholder.hidden = false
  learningPlaceholder.querySelector("strong").textContent = "Could not load this reference"
})

setActiveView("studio-view")
refreshStatus()
window.setInterval(refreshStatus, 500)
