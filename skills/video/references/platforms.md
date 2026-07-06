# Platform presets — resolution, duration, and render flags

Pick ONE before composing (Stage 1). Numbers are the practical sweet spots, not theoretical maxima.

| Platform | Aspect | Canvas | fps | Duration sweet spot | Notes |
|---|---|---|---|---|---|
| 抖音 / 快手 | 9:16 | 1080×1920 | 30 | 15–60s(完播率优先,越短越稳) | 前 3 秒定生死;字幕必开(静音刷) |
| 微信视频号 | 9:16 | 1080×1920 | 30 | 30–90s | 中老年占比高 → 字幕更大、节奏稍缓 |
| 小红书 | 3:4 或 9:16 | 1080×1440 / 1080×1920 | 30 | 30–90s | 封面权重极高,单独出封面帧 |
| B站(横屏) | 16:9 | 1920×1080 | 30/60 | 1–10min | 开头 10s 讲清"这期讲什么";弹幕文化,留互动钩子 |
| B站竖屏 / Story | 9:16 | 1080×1920 | 30 | ≤60s | |
| YouTube | 16:9 | 1920×1080 | 30/60 | 3–12min | 章节化(时间戳);英文字幕单独轨 |
| YouTube Shorts | 9:16 | 1080×1920 | 30 | ≤60s | 循环结构加分(结尾接回开头) |

## Render flags per tier
- 竖屏短视频:`--fps 30 --quality high --crf 20`
- B站/YouTube 横屏:`--fps 30 --quality high --crf 19`(动效重的用 `--fps 60`)
- 任何中间检查:`--quality draft`(快 ~2×,别用它交付)

## Composition canvas
Set `data-width`/`data-height` to the canvas above — do NOT compose at one aspect and letterbox to
another; re-layout per aspect (vertical is a different design, not a crop).
