---
name: sonos-hybrid-control
version: 2.0.0
description: >
  Hybrid Sonos control for OpenClaw agent.
  Use Sonos Web App for media search and playlist selection.
  Use Sonos CLI for volume, grouping, and transport controls.
  This design is optimized for locked-screen execution.
---

# Sonos Hybrid Control Skill

## Core Principle

Use **Sonos Web App** only for:
- searching music
- selecting playlists
- triggering playback when media search is required

Use **Sonos CLI** for:
- setting target room
- adjusting volume
- grouping or ungrouping rooms
- play / pause / next / previous
- all control actions during locked-screen execution

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
1. Prefer exact names visible in Sonos Web App "系统视图" room cards.
2. If Web view is unavailable, probe CLI with likely names and keep only successful exact matches.
3. If multiple exact names match the same keyword, ask a short clarification before control.

After resolution:
- Store `resolved_room_name`
- Use this exact value for every CLI command in this task
- Never fallback to the fuzzy keyword once resolved

## Global Rules

1. If the task requires searching media, use Web App.
2. If the task is only control-related, use CLI directly.
3. For locked-screen execution, prefer CLI whenever possible.
4. Never claim success without checking result.
5. Default maximum volume is 50 unless the user explicitly requests a higher value.
6. If a room is specified, always resolve user keyword to the exact Sonos speaker name first (mandatory).
7. Use the resolved exact room name for all CLI calls (`--name "<exact_name>"`).
8. If Web playback is triggered successfully, subsequent volume / transport / grouping should use CLI, not Web UI.

---

## Action: play_music

### When to use
Use this action when the user wants to:
- search by mood / keyword
- play a playlist
- find music in Sonos Web App

### Step A: Ensure Chrome is Running with Sonos Tab

This step MUST work on a locked screen. Never use AppleScript GUI scripting.

**Resource policy (mandatory):**
- Prefer reusing an existing attached Sonos tab (`browser tabs` + same domain + `wsUrl`).
- Open a new window only when no reusable Sonos tab exists.
- Record tab created in this run and close only that tab when task completes (do not close user tabs).

1. **Check if Chrome is running:**
   ```bash
   pgrep -x "Google Chrome"
   ```

2. **If Chrome is NOT running (no PID returned):**
   Launch Chrome with a fresh window (works on locked screen, more stable for relay context):
   ```bash
   open -na "Google Chrome" --args --new-window "https://play.sonos.com/zh-cn/web-app"
   ```
   Wait 8 seconds for Chrome to start and the page to load.

3. **If Chrome IS running:**
   Check browser tabs for an existing Sonos tab:
   ```
   browser: action: "tabs", profile: "chrome"
   ```
   - If a tab with URL containing `play.sonos.com` exists → use its `targetId`, go to Step B.
   - If no reusable Sonos tab exists → open one via shell (prefer fresh window for deterministic attach):
     ```bash
     open -na "Google Chrome" --args --new-window "https://play.sonos.com/zh-cn/web-app"
     ```
     Wait 5 seconds, then re-check tabs.

4. **If Chrome was force-quit or zombie:**
   Sometimes Chrome processes linger after force-quit. Kill cleanly first:
   ```bash
   pkill -x "Google Chrome" 2>/dev/null; sleep 2
   open -na "Google Chrome" --args --new-window "https://play.sonos.com/zh-cn/web-app"
   ```
   Wait 8 seconds.

### Step B: Verify Relay Attach

After Step A, verify the relay is connected:
```
browser: action: "tabs", profile: "chrome"
```

Attach is considered successful only if:
- a Chrome tab URL contains `play.sonos.com`
- and that tab has `wsUrl` (meaning relay extension is connected)

If NO tab has `wsUrl` after Chrome is running with the Sonos page:
1. Wait 5 more seconds and re-check tabs (relay auto-attaches on page load)
2. If still no `wsUrl`, try navigating the tab:
   ```
   browser: action: "navigate", profile: "chrome", targetId: "<sonos_tab_id>", targetUrl: "https://play.sonos.com/zh-cn/web-app"
   ```
3. Wait 5 seconds and re-check
4. If still fails after 3 attempts, report: "Chrome relay 未连接，请确认 OpenClaw Browser Relay 扩展已安装并启用"

### Step C: Verify UI Ready
Use browser snapshot.
Confirm at least one of the following is visible:
- playback controls
- room cards
- now playing area
- search entry

If the page is not logged in:
- stop and tell the user manual login is required

### Step D: Lobster 7-Step Play Protocol
1. Snapshot current playback state
2. If currently playing, pause first
3. Wait until paused state is reflected in UI
4. Reduce user intent into a 2-4 character keyword
   Examples:
   - 放松
   - 专注
   - 振奋
   - 助眠
   - 治愈
5. Open search and input the keyword
6. Strict result filter (no live radio)
   - first choice: 播放列表 / 歌单 / mix / collection
   - second choice: 专辑 / 艺人页中的“播放全部”
   - hard block: 站点 / Radio / Sonos Radio / TuneIn / 直播电台
   - avoid single-song detail pages if possible
7. Click 随机播放 if available, otherwise click 播放

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
- Retry #2 (content switch): switch to the next non-radio playlist/album result and trigger play
- Retry #3 (content switch): switch again to another non-radio result and trigger play
- Then refresh snapshot and retry once
- Then reload tab and retry once
- if still failing, report that playback could not be confirmed

### Step F: Optional CLI Room Control
If target_room is specified after Web playback begins:
run CLI with resolved exact room name:
`sonos status --name "<resolved_room_name>"`

If needed, run:
`sonos play --name "<resolved_room_name>"`

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

If CLI supports relative volume adjustment, use it.
If not, first read current volume from:
`sonos status --name "<resolved_room_name>"`
Then calculate a nearby safe target and set it with exact name.

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

2. For each room in rooms, resolve exact name then join via local CLI syntax.

3. Verify with exact name:
`sonos status --name "<resolved_room_name>"`

Confirm that grouped rooms are reflected in CLI status.

### Ungrouping
If the user wants only one room to keep playing:
1. switch to target room
2. remove or unjoin the other rooms using the CLI capability available in your environment
3. verify with:
`sonos status`

### Notes
If your CLI has a different syntax for unjoin / leave / ungroup, use the local available command.
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
2. switch content to next non-radio result and retry
3. switch content again to another non-radio result and retry
4. refresh browser snapshot and relocate elements
5. reload Sonos tab via navigate action
6. if Chrome is unresponsive or no relay connection:
   ```bash
   pkill -x "Google Chrome" 2>/dev/null; sleep 2
   open -a "Google Chrome" "https://play.sonos.com/zh-cn/web-app"
   ```
   Wait 8 seconds, then re-verify relay attach per Step B.
7. if still failing after full restart, report failure clearly

If login is required:
- stop and tell the user manual login is needed

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
- use Web App first
- then use CLI for follow-up controls

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