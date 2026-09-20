# 旧版 WorkBuddy/Canvas 路线（兼容保留）

仅用于接续旧工程或用户明确选用。新课默认读 hyperframes.md。以下记录保留 0.4.0 工具的原有行为，不代表新路线的画面限制。

# 本地出片工具（0.4.0）

支持已有音频 → 独立 HTML → WebM → MP4 → 媒体检查。在线配音由 scripts/tts.mjs 提供，见 [配音与首次配置](tts.md)。没有包含完整课程分批合片工具；先用小样验证。

## 环境

Node.js 20+、Chrome 或 Chromium。首次在技能目录执行 `npm ci`，根据 lockfile 安装 Playwright、ffmpeg-static、ffprobe-static；依赖留在本机，不随 ZIP 携带。会联网下载依赖及适用于操作系统的二进制程序。

```sh
node scripts/video.mjs doctor
```

默认使用安装的 Chrome。也可 `--browser /path/to/browser` 或 `--channel chromium`；若 Chromium 未安装，在技能目录运行 `npx playwright install chromium`。FFmpeg/ffprobe 优先读取 `FFMPEG_BIN` / `FFPROBE_BIN`，其次 PATH，再使用 npm 包提供的可执行程序。环境检查不代表中文字体视觉检查通过。

所有命令可以在任意工作目录调用；将 scripts/video.mjs 换成技能内该脚本的实际绝对路径。分镜和输出通过参数给出，不依赖宿主缓存路径。

## 输入 JSON

顶层含 title 和 scenes 数组。每个镜头：

- id、chapter、title、narration：保留原身份与完整旁白。
- input、action、output、humanCheckpoint：教学设计记录；不直接渲染。
- sourceRef、productionNote：可选的制作记录，不进入画面。
- audioPath：相对该 JSON 文件的本地音频路径（当前支持 MP3/WAV）。
- audioContentCheck：实际内容核验说明；没试听或转写验证则写 NEED_CONFIRM，不伪造确认。
- visualType：extract / pipeline / boundary。
- viewer：明确允许上屏的 headline、leftTitle、rightTitle、inputText、items、result、checkpoint。均为字符串，items 为 1–6 个非空字符串。
- viewer.image（可选）：真实截图的 data URL（`data:image/png;base64,...`）。extract 布局把它画进左栏（inputText 不再上屏，leftTitle 作为图注）；有原始产物截图时优先用实物，不要用文字复述替代。
- viewer.imageFullscreen（可选，布尔）：设 true 时该镜头进入全屏展示模式——宽图整体呈现，长图（显示高超出版面 35% 以上）随播放进度纵向自动滚动，适合整卡/长截图的成果展示。leftTitle 作为图上标签条。

extract 适用于输入文本逐步转成字段列表；pipeline 适用于逐步推进的链路；boundary 适用于禁止动作列表。模板为进度驱动的确定性动画（同进度必出同帧，布局校验可复算）：标题入场、元素错峰浮现、连线生长、字幕分段淡入；动画只影响观感，不影响字幕与布局校验。复杂表格和代码仍不要强行塞入，截图用 viewer.image 承载。

## 命令

```sh
node scripts/video.mjs build --input /project/scenes.json --out /project/production/samples/sample-v1
node scripts/video.mjs render --input /project/scenes.json --out /project/production/samples/sample-v1
node scripts/video.mjs verify --file /project/production/samples/sample-v1/sample.mp4
```

`build` 生成 index.html 和报告，不录制；HTML 内嵌音频，双击打开可播放、切换镜头或手动录制。`render` 自动录制并转码，生成 sample.mp4、recording.webm、report.json、每镜头布局截图与实际 MP4 截图。样片固定 1280×720 / 30fps / H.264 + AAC；需要其他规格应先改工具并验收，不能仅在提示词写“1080p”就宣称已实现。

字幕保留所有旁白文字，按标点分段并限制长度；时间按字符数比例估算，尚未用语音强制对齐。必须试听复核节奏；报告明确保留 humanReview: NEED_CONFIRM。实际音轨正确性也不会由文件指纹自动证明。

## 中断恢复

可先 `render ... --record-only` 只录制 WebM。之后使用相同 input/out 运行 render，自动检查输入和 WebM 指纹，再接着转码。已通过媒体检查且未变化的 MP4 会复用。

输入、音频或模板变更时拒绝覆盖旧目录，请使用新的输出目录。这样不会把改动悄悄混进已确认版本。中断发生在 WebM 保存前则需要重新录制；不声称支持帧级续录。

所有 HTML 和截图都包含课程内容，分享时按项目授权处理。打包 Skill 只携带方法和工具，不打包用户的课程、配音和生成视频。
