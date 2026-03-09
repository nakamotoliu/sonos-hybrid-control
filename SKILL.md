---
name: sonos-hybrid-control
version: 2.1.0
description: >
  Hybrid Sonos control for OpenClaw agent.
  Use Sonos Web App for media search and playlist selection.
  Use Sonos CLI for volume, grouping, and transport controls.
  This design is optimized for locked-screen execution.
---

# Sonos Hybrid Control Skill

## Prerequisites

**Required (one-time setup):**

1. **OpenClaw Browser Relay Extension for Chrome**
   - **Location**: `~/clawd/projects/openclaw-browser-relay-rewrite/src/`
   - **Installation**: Load unpacked extension in `chrome://extensions`
   - **Must enable**: "Enable auto-attach on all HTTP/HTTPS websites" in extension options
   - **See**: `~/Documents/OpenClaw-Wiki/03-SOP/SOP_默认网页访问与操作方式.md`

2. **Sonos Web App Login**
   - Account credentials are stored in Bitwarden (item name maintained there)
   - Do **not** hardcode or document the account username in this skill
   - **Auto-login**: If login page appears, credentials are retrieved from Bitwarden at runtime and filled in
   - Use the local wiki-documented Bitwarden retrieval pattern; do not invent a new secret access flow

3. **Sonos CLI**
   - Installed via Homebrew: `brew install sonos`
   - Used for volume, grouping, transport controls

**This skill does NOT auto-install the extension.** The extension must be installed and configured manually once. After that, auto-attach mode ensures all HTTP/HTTPS pages (including Sonos Web App) are automatically attached when opened.

---

## Core Principle

Use **Sonos Web App** only for:
- searching music
- selecting playlists
- triggering playback when media search is required

Use **Sonos CLI** for:
- setting target room
- adjusting volume
- grouping or ungrouping rooms
- play / pause / next / previous for already-authorized/currently-loaded content
- all control actions during locked-screen execution

**Important playback authorization rule:**
- When the task involves choosing content (playlist / album / search result / recommendation), the **final playback trigger must be clicked in Sonos Web App**.
- Do **not** use CLI to start newly selected content after discovery, because CLI may fail on permission/authorization for some items even when Web App can play them.

Never use Web UI slider for volume control.
Never rely on Web UI for room grouping if Sonos CLI is available.

---

## Supported Actions

- play_music
- adjust_volume
- group_rooms
- transport_control

---

## Input Interpretation Rules

### play_music
Expected user intent may include:
- play some relaxing music in living room
- 在客厅放一点放松的音乐
- 播放专注歌单
- 在卧室播放适合睡觉的歌

Extract:
- action = play_music
- query = short mood keyword, ideally 2-4 Chinese characters
- target_room = optional

### adjust_volume
Expected user intent may include:
- set living room volume to 20
- 把客厅音量调到20
- 音量小一点
- 把卧室声音调大一点

Extract:
- action = adjust_volume
- target_room = optional
- volume_level = required if explicitly given
If user says only "大一点/小一点", interpret as relative adjustment with small safe steps.

### group_rooms
Expected user intent may include:
- group living room and bedroom
- 把客厅和卧室合并播放
- 让书房也一起播
- 只保留客厅播放

Extract:
- action = group_rooms
- target_room = anchor room / main room
- rooms = list of rooms to join or retain

### transport_control
Expected user intent may include:
- pause
- next song
- 播放下一首
- 暂停客厅
- 继续播放

Extract:
- action = transport_control
- transport = play / pause / next / prev
- target_room = optional

---

## Room Name Resolution (Mandatory)

When user says a fuzzy room keyword (e.g. "客厅"), do not use it directly in CLI.
You must resolve it to an exact speaker name first (e.g. "客厅 play5").

Resolution order:
1. For control-only tasks, prefer resolving exact names from CLI first (`sonos discover`, `sonos status --format json`, `sonos group status --format json` when available).
2. For media-discovery tasks already using the Web App, room cards in the Sonos Web App may also be used as an exact-name source.
3. If multiple exact names match the same keyword, ask a short clarification before control.

After resolution:
- Store `resolved_room_name`
- Use this exact value for every CLI command in this task
- Never fallback to the fuzzy keyword once resolved

## Global Rules

1. If the task requires searching media or choosing content, use Web App.
2. If the task is only control-related, use CLI directly.
3. For locked-screen execution, prefer CLI whenever possible **except** for the final play click on newly selected content, which must stay in Web App.
4. Never claim success without checking result.
5. Default maximum volume is 50 unless the user explicitly requests a higher value.
6. If a room is specified, always resolve user keyword to the exact Sonos speaker name first (mandatory).
7. Use the resolved exact room name for all CLI calls (`--name "<exact_name>"`).
8. If Web playback is triggered successfully, subsequent volume / transport / grouping should use CLI, not Web UI.
9. **Before starting scheduled playback (or any room-specific play task), always run a grouping pre-check.** If current status shows the target room is in a group, ungroup first, then continue playback.
10. Group pre-check must be verified by CLI status after ungroup; do not assume ungroup succeeded.
11. For newly selected media, never replace the Web play trigger with `sonos open`, `sonos play spotify`, `sonos smapi ... + CLI play`, or any other CLI-based start command.

---

## Action: play_music

### When to use
Use this action when the user wants to:
- search by mood / keyword
- play a playlist
- find music in Sonos Web App

### Step 0: Group Pre-check (Mandatory)
If `target_room` is present (especially in cron/scheduled tasks):
1. Resolve target room to exact room name.
2. Run CLI status check for that exact room.
3. If status indicates grouped playback (target room is joined with other rooms), ungroup the target room first using a command that actually exists in this CLI, typically `sonos group solo --name "<resolved_room_name>"` or `sonos group unjoin --name "<resolved_room_name>"`.
4. Re-run `sonos group status` and/or `sonos status --name "<resolved_room_name>"` and confirm the target room is standalone.
5. Only then continue to media search/playback steps.

Do not skip this step for scheduled playback jobs.

### Step A: Ensure Chrome is Running with Sonos Tab

This step MUST work on a locked screen. Never use AppleScript GUI scripting.

**Resource policy (mandatory):**
- On the first attempt, you may reuse an existing attached Sonos tab (`browser tabs` + same domain + attachment info).
- On any retry after a failed playback/search/UI attempt, **always open a fresh Chrome window** for Sonos instead of reusing the previous one.
- Record tab(s) created in this run and close only those tabs/windows when task completes (do not close unrelated user tabs).

1. **Check if Chrome is running:**
   ```bash
   pgrep -x "Google Chrome"
   ```

2. **If Chrome is NOT running (no PID returned):**
   Launch Chrome with a fresh window (works on locked screen, more stable for relay context):
   ```bash
   open -na "Google Chrome" --args --new-window "https://play.sonos.com/zh-cn/web-app"
   ```
   **MANDATORY: Wait 5 seconds** for:
   - Chrome to start
   - Page to load
   - Auto-attach to complete
   
   Then proceed to Step B to verify relay attach status.

3. **If Chrome IS running:**
   Check browser tabs for an existing Sonos tab:
   ```
   browser: action: "tabs", profile: "chrome"
   ```
   - If a tab with URL containing `play.sonos.com` exists and has `wsUrl` → use its `targetId`, go to Step B.
   - If no reusable Sonos tab exists → open one via shell (prefer fresh window for deterministic attach):
     ```bash
     open -na "Google Chrome" --args --new-window "https://play.sonos.com/zh-cn/web-app"
     ```
     **MANDATORY: Wait 5 seconds** for page load and auto-attach to complete.
     Then proceed to Step B to verify relay attach status.

4. **If Chrome was force-quit or zombie:**
   Sometimes Chrome processes linger after force-quit. Kill cleanly first:
   ```bash
   pkill -x "Google Chrome" 2>/dev/null; sleep 2
   open -na "Google Chrome" --args --new-window "https://play.sonos.com/zh-cn/web-app"
   ```
   **MANDATORY: Wait 5 seconds** for page load and auto-attach to complete.
   Then proceed to Step B to verify relay attach status.

5. **If the user wants to watch live:**
   Prefer the visible Chrome relay tab/profile for interactive playback/search demonstrations.
   Only fall back to the isolated `openclaw` browser profile when the visible Chrome relay tab is unavailable, detached, or unusable.

### Step B: Verify Relay Attach

**CRITICAL: This step must happen AFTER the mandatory 5-second wait in Step A.**

**With auto-attach all sites enabled (default)**, pages should attach automatically within 5 seconds of opening.

After the 5-second wait and opening the Sonos page, verify the relay is connected:
```
browser: action: "tabs", profile: "chrome"
```

Attach is considered successful only if:
- a Chrome tab URL contains `play.sonos.com`
- and that tab shows browser-relay attachment metadata (for example `wsUrl` if present in the current tool output)

Do not hardcode a single field name as the only success signal forever. Use the current `browser tabs` output shape and confirm the tab is actually attached.

If no attached Sonos tab is visible after Chrome is running with the Sonos page:
1. Wait 5 more seconds and re-check tabs (auto-attach needs time after page load)
2. If still no `wsUrl`, reopen the Sonos page once in visible Chrome and re-check:
   ```bash
   open -na "Google Chrome" --args --new-window "https://play.sonos.com/zh-cn/web-app"
   ```
   Wait 5 seconds, then re-run `browser tabs`.
3. If still no `wsUrl`, check extension status:
   - Verify extension is loaded in `chrome://extensions`
   - Verify "Enable auto-attach on all HTTP/HTTPS websites" is checked in extension options
   - Verify gateway token is configured correctly
4. If extension is properly configured but still not attaching, try reloading the extension:
   ```
   Tell user: "请在 chrome://extensions 中重新加载 Browser Relay 扩展"
   ```
5. If still fails after verification, report: "Chrome relay 未连接。请确认：
   1. OpenClaw Browser Relay 扩展已安装
   2. Auto-attach all sites 已启用
   3. Gateway token 已配置
   详见：~/Documents/OpenClaw-Wiki/03-SOP/SOP_默认网页访问与操作方式.md"

### Step C: Verify UI Ready and Handle Login

Use browser snapshot.

**If the page shows login form** (email/password input):
1. Get credentials from Bitwarden using the local wiki-documented retrieval pattern.
   - Do **not** hardcode the username or password in this skill.
   - Use the maintained Bitwarden helper/session flow documented in the wiki.
   - Read the relevant local wiki note first if needed, then retrieve the login item and extract username/password at runtime.

2. Fill in login form using browser automation:
   ```
   browser: action: "act", kind: "type", ref: <email_input_ref>, text: "$USERNAME"
   browser: action: "act", kind: "type", ref: <password_input_ref>, text: "$PASSWORD"
   browser: action: "act", kind: "click", ref: <login_button_ref>
   ```

3. Wait 5 seconds for login to complete

4. Take a new snapshot and verify login succeeded

5. If login fails after 2 attempts:
   - Check if credentials are correct in Bitwarden
   - Report: "Sonos 登录失败，请检查 Bitwarden 中的凭证是否正确"

**If the page is already logged in**, confirm at least one of the following is visible:
- playback controls
- room cards
- now playing area
- search entry

If UI elements are still not visible after login:
- Refresh the page and wait 5 seconds
- If still failing, report UI readiness issue

### Step D: Lobster 7-Step Play Protocol
1. Snapshot current playback state
2. If currently playing, pause first
3. Wait until paused state is reflected in UI
4. Reduce user intent into a 2-4 character keyword (mandatory)
   - Never search with long natural-language phrases first.
   - Always compress intent to a short keyword before typing.
   Examples:
   - 放松
   - 专注
   - 振奋
   - 助眠
   - 治愈
   - 学友
   - 男声
   - 情歌
   - 怀旧
5. Open search and input the short keyword
   - If the first short keyword returns no useful result, switch to a synonym and retry.
   - Do not keep retrying the same failed wording.
6. Strict result filter (no live radio)
   - first choice: 播放列表 / 歌单 / mix / collection
   - second choice: 专辑 / 艺人页中的“播放全部”
   - hard block: 站点 / Radio / Sonos Radio / TuneIn / 直播电台
   - avoid single-song detail pages if possible
7. Click 随机播放 if available, otherwise click 播放
   - This Web App click is mandatory for newly selected content.
   - Do not substitute a CLI start command here, even as a shortcut.

### Step E: Verify Playback
Playback is successful only if **CLI confirms PLAYING** and Web UI is consistent:
1. target room is correct, if specified
2. now playing content changed
3. UI state indicates playing
4. CLI `sonos status --name "<room>"` shows `State: PLAYING`

Additional hard checks:
- If URI contains `x-sonosapi-stream` (live radio/tunein style), treat as invalid result for this workflow and re-select non-radio content.
- Do not claim success when CLI is `STOPPED` even if Web UI button looks like playing.

If verification fails, use this retry ladder (mandatory):
- Retry #1 (same content): click 播放/随机播放 once on the current non-radio item
- Retry #2 (fresh Chrome window): open a **new Chrome window** to Sonos Web App, wait for attach, relocate the target content, and retry
- Retry #3 (fresh Chrome window + content switch): open another **new Chrome window**, switch to the next non-radio playlist/album result, and trigger play
- If search itself returns no useful result, switch to a short synonym keyword before escalating page-level recovery
- Do not keep retrying inside the same stale Sonos tab/window once playback verification has already failed there
- if still failing, report that playback could not be confirmed

### Step F: Optional CLI Room Control
If target_room is specified after Web playback begins:
run CLI with resolved exact room name:
`sonos status --name "<resolved_room_name>"`

If needed after the Web App has already successfully authorized and started the chosen content, you may use:
`sonos play --name "<resolved_room_name>"`

But do **not** use `sonos play` (or any CLI start/open command) as a replacement for the initial playback trigger of newly selected content.

---

## Action: adjust_volume

### Principle
All volume operations must use Sonos CLI.
Do not use Web UI slider.

### If target_room is specified
Resolve to exact room name first, then run:
`sonos status --name "<resolved_room_name>"`

### If user provided exact volume
Run:
`sonos volume set --name "<resolved_room_name>" <volume_level>`

### If user said relative change only
Use safe small-step adjustment:
- "大一点" = increase slightly
- "小一点" = decrease slightly

This CLI should be treated as **absolute-volume only** unless you have directly verified a relative subcommand exists.
Default procedure:
1. Read current volume with `sonos volume get --name "<resolved_room_name>"` (or `sonos status --name "<resolved_room_name>"` if needed).
2. Calculate a nearby safe target.
3. Apply it with `sonos volume set --name "<resolved_room_name>" <target>`.

Do not invent commands such as `volume up`, `volume down`, or additive volume syntax unless `sonos volume --help` on this machine explicitly shows them.

### Safety Rule
If requested volume > 50 and user did not explicitly authorize high volume:
- cap at 50
- tell the user you used the safe limit

### Verification
Run:
`sonos status --name "<resolved_room_name>"`

Confirm:
- target room is correct
- volume reflects the intended target or expected relative change

---

## Action: group_rooms

### Principle
All grouping and ungrouping must use Sonos CLI.

### Grouping
1. Resolve anchor room to exact name (`resolved_room_name`).

2. For each room in rooms, resolve the exact name, then use the actual CLI syntax supported here, typically:
`sonos group join --name "<member_room>" "<resolved_room_name>"`

3. Verify grouping with:
`sonos group status`
and, if useful, `sonos status --name "<resolved_room_name>"`

Confirm that grouped rooms are reflected in group status output.

### Ungrouping
If the user wants only one room to keep playing:
1. switch to the target room
2. use an actually supported command such as:
   - `sonos group solo --name "<resolved_room_name>"` (preferred when the target should play by itself)
   - or `sonos group unjoin --name "<resolved_room_name>"` when leaving the current group
3. verify with:
`sonos group status`
and optionally `sonos status --name "<resolved_room_name>"`

### Notes
Do not use nonexistent top-level commands like `sonos ungroup`, `sonos join`, or `sonos leave` unless a future CLI version explicitly adds them and local help confirms it.
Always verify after grouping changes.

---

## Action: transport_control

### Principle
All transport operations should use Sonos CLI whenever possible.

### If target_room is specified
Resolve to exact room name first.

### Execute by transport value (always with exact name)

If transport = play:
`sonos play --name "<resolved_room_name>"`

If transport = pause:
`sonos pause --name "<resolved_room_name>"`

If transport = next:
`sonos next --name "<resolved_room_name>"`

If transport = prev:
`sonos prev --name "<resolved_room_name>"`

### Verification
Run:
`sonos status --name "<resolved_room_name>"`

Confirm:
- play => state becomes playing
- pause => state becomes paused
- next / prev => track info changes if available

---

## Recovery Flow

### Web Layer Recovery
Use this only for search / playlist selection / playback triggering:
1. retry current action once (same content)
2. open a **fresh Chrome window** to Sonos Web App and retry there
3. if needed, open another **fresh Chrome window**, switch to the next non-radio result, and retry
4. relocate elements using a new browser snapshot in the fresh window
5. only if Chrome is globally unresponsive or relay cannot attach anywhere, consider a full Chrome restart as a last resort
6. if still failing after the fresh-window recovery path, report failure clearly

Default recovery preference: **new Chrome window first, full Chrome kill/restart last**.

If login page appears during recovery:
- Follow Step C login protocol (retrieve credentials from Bitwarden at runtime and fill in)
- If auto-login fails after 2 attempts, report: "Sonos 自动登录失败，请检查 Bitwarden 中的凭证"

### CLI Layer Recovery
Use this for volume / grouping / transport:
1. re-resolve room keyword to exact room name
2. retry command once with `--name "<resolved_room_name>"`
3. run `sonos status --name "<resolved_room_name>"`
4. if still failing, report CLI command failure clearly

Do not invent success if CLI output does not confirm the action.

---

## Response Style Rules

### Good success examples
- 已在客厅开始播放“放松”相关歌单，并确认已经进入播放状态。
- 已将客厅音量调整到 20。
- 已把卧室加入客厅的播放分组。
- 已暂停书房播放。

### Good partial-result examples
- 我已经在网页端找到并触发了播放，但还没能确认进度是否持续前进。
- 我已经切换到客厅房间，但这次 CLI 没有返回可确认的音量结果。
- Sonos 网页端当前需要登录，我无法继续搜索和选歌单。

### Never say
- 请手动调音量
- 因为技术限制无法操作
- 因为 OpenAI / Anthropic / API 余额不足所以失败
- 我应该已经成功了
- 我猜应该在播了

Always describe only what has actually been verified.

---

## Priority Routing

If user request includes media discovery:
- use Web App for search/selection
- use Web App to click the final play trigger on the chosen content
- then use CLI only for follow-up controls/verification

If user request is only control:
- use CLI directly

Examples:

1. “在客厅播放一点放松的音乐”
- Web search + Web play trigger
- CLI room verification if needed

2. “把客厅音量调到20”
- CLI only

3. “暂停卧室”
- CLI only

4. “把客厅和书房合并播放”
- CLI only

5. “下一首”
- CLI only

---

## Final Execution Principle

For Chinese-region Sonos usage:
- Web App is the media selection layer
- CLI is the device control layer

This split is mandatory for stability, especially during locked-screen execution.