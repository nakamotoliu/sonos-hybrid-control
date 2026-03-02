# Extension Architecture & Agent Pitfall Guide

This document helps agents understand the Browser Relay extension internals, so they can debug or modify it correctly on the first try.

---

## How the Relay Works

The OpenClaw Browser Relay is a Chrome extension that bridges the agent's `browser` tool to real Chrome tabs via WebSocket.

### Key Components

| File | Role |
|------|------|
| `manifest.json` | Extension config, permissions, host_permissions |
| `src/background.js` | Service worker: manages WebSocket, tab attach/detach |
| `src/content.js` | Injected into attached tabs, relays DOM access |
| `src/popup.html/js` | Extension popup UI (badge ON/OFF) |

### Attach Flow

```
User clicks extension button (action.onClicked)
  → connectOrToggleForActiveTab()
    → Checks if current tab qualifies
    → Injects content script
    → Opens WebSocket to 127.0.0.1
    → Badge turns "ON"
    → browser.tabs(profile="chrome") now returns wsUrl
```

### The Critical Gap (Pre-Fix)

The old logic ONLY attached via `action.onClicked`. This means:
- ✅ Click extension button on Sonos tab → attached
- ❌ Agent opens play.sonos.com via `open -a Chrome` → NOT attached
- ❌ User manually navigates to play.sonos.com → NOT attached

### The Fix: Two-Layer Attach

Correct implementation requires TWO entry points:

1. **`action.onClicked`** — Manual entry (user clicks extension button)
2. **`webNavigation.onCompleted`** — Auto entry (page navigates to play.sonos.com)

```javascript
// In background.js
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId === 0 && details.url.includes('play.sonos.com')) {
    // Auto-attach relay to this tab
    await attachToTab(details.tabId);
  }
});
```

Both paths must end at the same attach logic (inject content script, open WebSocket, set badge ON).

---

## Verification Checklist (After Any Extension Modification)

After modifying the extension, an agent MUST verify all 3:

1. **Extension reloaded**
   - `chrome://extensions` → click Reload on the unpacked extension
   - Or via CLI if available

2. **Badge is ON after trigger**
   - Navigate to play.sonos.com (or click extension button)
   - Badge should show "ON"

3. **`browser.tabs(profile="chrome")` returns connection info**
   - Must see a tab with URL containing `play.sonos.com`
   - Must have `wsUrl` present (proves relay is connected)

If any of these 3 fail, the modification is incomplete. Do NOT proceed to test playback.

---

## Common Agent Mistakes

### 1. Only modifying `action.onClicked`
**Symptom:** Extension works when manually clicked, but agent can't auto-attach.
**Fix:** Also add `webNavigation.onCompleted` listener.

### 2. Confusing "opening a page" with "attaching relay"
**Symptom:** `chrome.tabs.create()` opens Sonos, but `wsUrl` is missing.
**Fix:** Opening a tab ≠ attaching. Must explicitly call attach logic after navigation completes.

### 3. Not doing minimal verification loops
**Symptom:** Multiple rounds of changes without checking if each change worked.
**Fix:** After every code change: Reload extension → trigger → check `browser.tabs`. No exceptions.

### 4. Falling back to CLI for media search
**Symptom:** Agent uses CLI to pick songs when Web relay fails.
**Fix:** Per skill spec, media search MUST use Web. If Web is unavailable, report "skill prerequisite not met" — don't disguise CLI fallback as complete execution.

---

## Hard Rules for Agents Modifying This Extension

1. **Two-layer attach is mandatory** — `action.onClicked` + `webNavigation.onCompleted`
2. **Verify 3 things after every change** — Reload, Badge ON, `browser.tabs` has `wsUrl`
3. **Media search = Web only, CLI = control only** — no exceptions, no silent fallbacks
4. **On failure, give actionable next steps** — not "connection failed", but "go to chrome://extensions, click Reload, then navigate to play.sonos.com and tell me the badge state"

---

*This document was created from a real first-install failure. An agent modified only `action.onClicked`, missed the `webNavigation` path, and needed multiple rounds to fix it. This guide exists so the next agent gets it right the first time.*
