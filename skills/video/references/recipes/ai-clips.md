# Recipe: AI 生成片段(素材通道)—— v1.x 钩子

AI 文生视频(Seedance / Kling / 即梦 / 用户的供应商,BYO key)产出的片段是**素材**,
永远作为 `<video>` 元素进入 HTML 合成 —— 生成不是成片,合成才是。

## 现阶段(手动通道)
1. 用户自己的生成工具产出 mp4 → 放进项目 `assets/`。
2. 合成里引用:`<video class="clip" data-start=".." data-duration=".." src="assets/clip.mp4" muted playsinline>`。
3. 生成片段的纪律:每段 ≤ 5s、只当"氛围/空镜/转场"用;叙事主体永远是字幕+排版(AI 片段的手/字/logo 细节经不起停留)。

## 规划中(自动通道,等 provider 抽象移植)
`hara-video gen "<prompt>" --provider seedance --duration 5` → 生成→落 assets/ → 返回可直接粘贴的 <video> 片段。
Provider 抽象已存在于内部产线,移植时带上:分辨率映射、失败重试、成本提示(按秒计费,生成前必须报价给用户确认)。
