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

## Global Rules

1. If the task requires searching media, use Web App.
2. If the task is only control-related, use CLI directly.
3. For locked-screen execution, prefer CLI whenever possible.
4. Never claim success without checking result.
5. Default maximum volume is 50 unless the user explicitly requests a higher value.
6. If a room is specified, always switch CLI context to that room before control.
7. If Web playback is triggered successfully, subsequent volume / transport / grouping should use CLI, not Web UI.

---

## Action: play_music

### When to use
Use this action when the user wants to:
- search by mood / keyword
- play a playlist
- find music in Sonos Web App

### Step A: Open Sonos Web App
1. Open Chrome normally
2. Open `https://play.sonos.com/zh-cn/web-app`
3. Wait for page to load

### Step B: Verify Relay Attach
Use browser tabs check.
Attach is considered successful only if:
- a Chrome tab URL contains `play.sonos.com`
- and that tab has `wsUrl`

If attach fails:
- reload the Sonos tab once
- if still fails, restart Chrome and reopen Sonos page
- if still fails, report attach failure clearly

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
6. Prefer playlist-like results
   - first choice: 播放列表
   - second choice: radio / mix / collection
   - avoid single-song detail pages if possible
7. Click 随机播放 if available, otherwise click 播放

### Step E: Verify Playback
Playback is successful only if at least 3 of 4 signals are true, and progress movement is required:
1. target room is correct, if specified
2. now playing content changed
3. UI state indicates playing
4. playback progress is moving

If verification fails:
- retry current click once
- refresh snapshot and retry
- reload tab and retry
- if still failing, report that playback could not be confirmed

### Step F: Optional CLI Room Control
If target_room is specified after Web playback begins:
run:
`sonos room <target_room>`

Then verify:
`sonos status`

If needed, run:
`sonos play`

---

## Action: adjust_volume

### Principle
All volume operations must use Sonos CLI.
Do not use Web UI slider.

### If target_room is specified
Run:
`sonos room <target_room>`

### If user provided exact volume
Run:
`sonos volume <volume_level>`

### If user said relative change only
Use safe small-step adjustment:
- "大一点" = increase slightly
- "小一点" = decrease slightly

If CLI supports relative volume adjustment, use it.
If not, first read current volume from:
`sonos status`
Then calculate a nearby safe target and set it.

### Safety Rule
If requested volume > 50 and user did not explicitly authorize high volume:
- cap at 50
- tell the user you used the safe limit

### Verification
Run:
`sonos status`

Confirm:
- target room is correct
- volume reflects the intended target or expected relative change

---

## Action: group_rooms

### Principle
All grouping and ungrouping must use Sonos CLI.

### Grouping
1. Select anchor room:
`sonos room <target_room>`

2. For each room in rooms:
`sonos join <room_name>`

3. Verify:
`sonos status`

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
Run:
`sonos room <target_room>`

### Execute by transport value

If transport = play:
`sonos play`

If transport = pause:
`sonos pause`

If transport = next:
`sonos next`

If transport = prev:
`sonos prev`

### Verification
Run:
`sonos status`

Confirm:
- play => state becomes playing
- pause => state becomes paused
- next / prev => track info changes if available

---

## Recovery Flow

### Web Layer Recovery
Use this only for search / playlist selection / playback triggering:
1. retry current action once
2. refresh browser snapshot and relocate elements
3. reload Sonos tab
4. restart Chrome and reopen Sonos page

If login is required:
- stop and tell the user manual login is needed

### CLI Layer Recovery
Use this for volume / grouping / transport:
1. reselect target room
2. retry command once
3. run `sonos status`
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