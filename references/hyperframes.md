# HyperFrames：包内完整制作路径

本文件改编自 HyperFrames 0.8.42 的制作约定，已修改为本技能的培训流程；上游来源及许可证见 [第三方声明](../THIRD_PARTY_NOTICES.md)。

适用版本 hyperframes 0.8.42 / gsap 3.14.2。本指南在本包内给出所需约定，不路由到外部技能。以下示例在技能目录执行；PROJECT、INPUT、OUT 表示实际项目路径，执行前替换，不把它们当固定目录。项目路径可含中文和空格，务必加引号。

## 1. 输入与配音

输入 JSON 的顶层为 title、scenes。每镜头保留 id、chapter、title、narration、input、action、output、humanCheckpoint。id 使用原有唯一字母/数字/下划线/连字符 ID。自定义镜头不要求 visualType 或 viewer；不能为了满足旧模板验证器改变内容。

音频通过 audioPath 提供，路径相对输入 JSON；TTS 生成的 voiced-scenes.json 可以直接接入。素材可放在每镜头 assets 数组，内容为相对输入 JSON 的本地文件路径。prepare 会复制音频和 assets；旧 WorkBuddy viewer.image 的本地路径或 PNG/JPEG/WebP data URL 也会复制为本地图片，保留 imageFullscreen 意图。其他自定义字段保留为制作资料，由代理明确引用，不能把整份 storyboard.json 自动铺到画面。

## 2. 字幕先对齐声音

每镜头 captions 为 [{text, start, end}, ...]，start/end 是相对本镜头音频开头的秒数。必须有序、不重叠、在真实音频时长内，拼接 text 应等于完整 narration（只允许空白/换行差异）。保留标点及数字；不要把识别结果当作可以改写原旁白的授权。

已有准确字幕可以转换成此结构。没有时间戳时先核实当前工具的帮助和实际输出，再用词级或片段级时间合并成语义短句。不要假设封装的 transcribe 命令会透传 whisper.cpp 的所有参数；输出只有整段时间时，不能据此宣称得到了逐字时间。

Whisper CLI 可作为备用方式。先找到本机实际的 FFmpeg、whisper-cli 可执行文件及已安装的多语言模型；不要依赖某个宿主的缓存路径。以下是参数示例，路径按操作系统替换：

```sh
ffmpeg -i "shot.mp3" -ar 16000 -ac 1 "shot.wav"
"/path/to/whisper-cli" -m "/path/to/ggml-medium.bin" -f "shot.wav" -l zh --max-len 1 -oj
```

先运行所选 whisper-cli 的 `--help` 确认支持上述参数。若需要 token 对齐且版本支持 `--dtw`，使用与实际模型匹配的选项；不要盲目把模型名称或参数复制到其他版本。JSON 的分段与时间字段以本次输出为准，核实单位、起止范围和识别粒度；`--max-len 1` 本身不保证中文逐字时间准确。抽听样本确认同步后再批量处理。

模型根据本机资源选用已有的适当多语言模型，不默认下载最大模型。进程被杀时先查内存、设备和退出信息，不能仅凭退出码断言下载失败；必要时减少批次或改用受支持的CPU配置。识别文本用于对齐原稿，不替换原旁白。

**字幕分组**：避免把上一句结论与下一句问题拼到同一张字幕卡。先按语义分组，再考虑长度、阅读时间与安全区；工具可生成初稿，复核跨句、专名和过长片段，不强制手工重写全部字幕。长句可在自然语义边界拆分。拼接全部字幕应与旁白一致，再写入分镜副本。已有定稿不得为了断句擅自改字或标点。

读取命令返回的真实产物，将词级时间合并成可读短句，再与原 narration 逐句核对；专名、数字、漏词处手工修正并试听。缺少可用识别环境时明确 NEED_ALIGN，可继续画面草稿，最终导出前必须取得完整字幕时间。不得默默按字数估时并宣称精确同步。

## 3. 准备动画工程材料

```sh
node scripts/studio.mjs prepare --input "INPUT" --out "OUT"
```

输出：

- storyboard.json：保留完整分镜、动作和输入来源，补充实际开始时间及媒体信息；只给制作者读。
- timing.json：实际总时长、每镜头音频路径、起点、字幕及音频指纹。
- media.html / captions.html：已转义的音频和字幕 DOM 片段。插入 index.html 的主 composition 根内；不能仅 link HTML 文件。
- assets/audio、assets/media、assets/vendor/gsap.min.js：本地媒体和动画库。
- composition-starter.html.template：技术骨架，供复制和改写；不是成品，不会自动成为 index.html。

目录已存在时拒绝覆盖。prepare 不联网、不配音、不生成视频；缺字幕时保留 NEED_ALIGN，render 会拒绝。可在补齐输入字幕后准备新版本，再迁入已写好的动画。已有 HTML 改造也使用这些真实音频和时间，不覆盖原文件。

## 4. 代理创作实际动画

确认本章 timing.json 对应本次选定声音的真实音频与字幕，再读取本包 video-direction.md、分镜和 timing.json。将 composition-starter.html.template 复制为 index.html，设置真实总 data-duration，插入媒体/字幕片段，按内容设计完整的场景和连续动作。没有 index.html 就还没有动画工程；素材准备成功不能当成出片成功。

技术约定：

- 顶层根直接放在 body，使用 data-composition-id、data-width、data-height、data-duration；不包在 template 中。根 CSS width/height 使用 100%，画幅由 data 属性给出。
- 引用本地 assets/vendor/gsap.min.js。每个 composition 只有一个 gsap.timeline({paused:true})，所有动画创建完再写入 window.__timelines[同一个 composition ID]。不要调用 play() 驱动渲染。
- 本包默认在一份 index.html 编排一个章节，场景用带唯一 id、data-start、data-duration 的 section.clip；场景内动画时间使用相对章节开头的绝对秒数。长课按章节工程组织，避免整课塞成超大单文件。用每镜 start 加局部动作偏移表达时间，复用已验证的布局/动作工具，避免到处散落手写全局秒数。
- HyperFrames 根据时间定位每一帧。不得用 Date.now、随机数、setTimeout、滚动事件或无限循环作为成片动作时钟。必须能从任意时刻直接定位到相同画面。
- 可对字段移动、行列重排、表单填入、状态反馈、聚焦与镜头移动设计动作；不要把“每张卡淡入”当作内容动作。用显式 fromTo 让起止状态稳定；同元素后续 fromTo 通常设 immediateRender:false。
- 片段可见性由框架控制；不要在 .clip 上动画 display、visibility 或 autoAlpha。需要淡入时动画内层节点。不要将 CSS 初始 transform 与 GSAP 同一属性动画混用。
- 每个 audio 必须有唯一 id、真实 src、data-start 和 data-duration；框架负责播放，不能手动 play/pause/seek。video 使用 muted、playsinline，声音另放 audio。不要添加 crossorigin；不要把有 data-start 的 video 放进另一个普通带 data-start 的父元素。
- 字幕放在独立最高可读图层，所有旁白有对应字幕，短句按语义分组。字体、字号和安全边距应按画幅验收，不用持续抖动的字幕抢教学主体。
- 具名字体使用有再分发许可的本地字体及 @font-face；中文字体必须实际检查缺字。别把系统字体存在当作伙伴电脑也有。字体和其他素材不能依赖成片运行时联网加载。
- productionNote、input/action/output 制作描述不直接渲染。画面只放明确给观众看的文案；真实截图、长图与录屏按讲解节奏取景，不降低成静态文字复述。

## 5. 预览、检查、导出

所有命令都经过包内入口，以防全局版本漂移或外部技能自动安装：

```sh
node scripts/studio.mjs cli --project "PROJECT" -- lint
node scripts/studio.mjs cli --project "PROJECT" -- check
node scripts/studio.mjs cli --project "PROJECT" -- preview --background
node scripts/studio.mjs cli --project "PROJECT" -- render --quality looks --output "sample.mp4"
node scripts/studio.mjs cli --project "PROJECT" -- render --quality delivery --output "final.mp4"
node scripts/video.mjs verify --file "PROJECT/final.mp4"
```

命令是分阶段参考，不是一键全部执行的清单。按用户当前请求执行，样片确认前不批量生成整课。check 失败先修复，不以命令输出了文件就跳过错误。lint 错误可能让浏览器检查采样数为零，零采样不能算布局通过。检查和修复的结束条件见 workflow.md；不要求清零所有警告，也不要求每个章节重复探索已验证的环境或 CLI 参数。

render 前入口检查字幕完整与音频未变更，但不能自动证明这些字幕已经正确插入实际 HTML，也不能证明动画好看；代理必须通过预览/代表帧核验。检查章节交接、最长字幕、开始和结束，确认真实音轨内容与源文一致。

已有多章时，按明确顺序、相同参数输出分段，使用 FFmpeg concat 清单合并到最终 MP4，核验总时长和各交接点；清单只列这次有效的文件，不能使用目录通配符。修改某章节只重做相应动画和导出，未变配音继续复用。

## 依据与边界

技术约定改编自 HeyGen HyperFrames 的 v0.8.42（commit 71b274bbfdfce9080d8a25e4ad096bfcfab6ef4c）core/minimal-composition、data-attributes、variables-and-media、determinism 及 GSAP adapter。上游 Apache-2.0 归属见包内 THIRD_PARTY_NOTICES.md。本包用自有流程替代外部技能的路由、安装和反馈提交行为，不自动发布素材或发送社区反馈。

https://github.com/heygen-com/hyperframes/tree/v0.8.42
https://hyperframes.heygen.com/guides/voice-and-audio

本包支持代理自主创作网页动画及本地工具调用，不附带 AI 模型、语音额度、所有字体或离线模型权重。提供完整的制作入口与接入流程不等于保证每次自动成片都无需审阅。
