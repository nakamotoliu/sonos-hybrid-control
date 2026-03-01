# Sonos Hybrid Control Skill

This is a hybrid control skill for OpenClaw that automates your Sonos system. It uses a dual-layer approach for maximum stability, especially during locked-screen background execution:

1. **Web App Layer (`play.sonos.com`)**: Used exclusively for searching music and selecting playlists.
2. **CLI Layer (`sonos-cli`)**: Used for robust device control (volume, grouping, play/pause).

## ⚠️ CRITICAL PREREQUISITE: Patching Browser Relay

For this skill to run fully autonomously in the background (e.g., via cron jobs), it must be able to automatically open and attach to the Sonos Web App. The default OpenClaw Browser Relay requires manual clicking. 

**Before using this skill, you MUST modify your OpenClaw Browser Relay extension:**

1. **Locate your OpenClaw Browser Relay extension source code** (usually loaded unpacked in Developer Mode).
2. **Modify `src/background.js`** to automatically open `https://play.sonos.com/` if no valid tab is found.
   Find the `connectOrToggleForActiveTab` function and modify it to include the following logic:
   ```javascript
   async function connectOrToggleForActiveTab() {
     const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
     let tabId = active?.id
     const tabUrl = active?.url
   
     // Add this block to auto-open Sonos
     if (tabId && !(typeof tabUrl === 'string' && tabUrl.includes('play.sonos.com'))) {
       try {
         const newTab = await chrome.tabs.create({ url: 'https://play.sonos.com/', active: true })
         if (newTab?.id) {
           tabId = newTab.id
           // Wait for tab to load before attaching
           await new Promise((resolve) => setTimeout(resolve, 1500))
         }
       } catch (err) {
         console.warn('Failed to open default URL:', err)
       }
     }
     // ... rest of the function remains unchanged
   ```
3. **Ensure the `manifest.json` includes `host_permissions`** for the Sonos site:
   ```json
   "host_permissions": ["http://127.0.0.1/*", "http://localhost/*", "https://play.sonos.com/*"]
   ```
4. Reload the unpacked extension in `chrome://extensions/`.

## Installation

1. **Install Sonos CLI**:
   Ensure you have a working Sonos CLI installed (e.g., via `npm install -g sonos-cli` or your preferred binary) and available in your system's PATH.
   ```bash
   sonos --version
   ```

2. **Load the Skill**:
   Place the `Sonos Hybrid Control Skill.md` (or `SKILL.md`) in your OpenClaw skills directory.

3. **Login to Sonos Web**:
   Open Chrome, go to `https://play.sonos.com/`, and ensure you are logged in. The skill cannot bypass the manual login screen.

## How it Works

When you ask the agent to "Play some relaxing music in the living room at volume 20":
- The agent uses CLI `sonos room 客厅` and `sonos volume 20`.
- The agent uses the patched Browser Relay to attach to Chrome, opening `play.sonos.com` if needed.
- It searches for "relaxing" (or a Chinese equivalent like "放松").
- It visually confirms playback has started before reporting success.

## Usage Examples

- "在客厅放一点放松的音乐" (Play relaxing music in the living room)
- "把客厅和卧室合并播放" (Group living room and bedroom)
- "客厅音量调到20" (Set living room volume to 20)
- "播放下一首" (Next track)