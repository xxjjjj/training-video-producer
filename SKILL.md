---
name: training-video-producer
description: 将培训资料、SOP、完整旁白、截图或已有动态 HTML 制作为真正有动作的动画培训视频，保留完整配音与字幕。单包包含 HyperFrames 接入、MiniMax 配音、字幕衔接、环境配置与旧版项目工具；也用于局部修复、迁移或分发技能。用于教学和操作培训。
metadata:
  version: "0.5.3"
  display_name: "培训视频制作 · 一体版"
  engine: "hyperframes@0.8.42"
---

# 培训视频制作 · 一体版

一个入口完成资料核对、动作分镜、配音、字幕、动画网页预览与 MP4 输出。所有必要制作说明和工具均在本包；不要求宿主发现、安装或调用其他技能。HyperFrames 是固定版本的程序依赖，由本包脚本调用。

## 范围与原则

先读项目规则、原资料、现有状态和已生成文件，不声称记得未读取的历史。

- 用户仅研究方案、修改、安装或分发技能时，只做相应工作及工具检查，不生成配音、不录制、不重新出片。
- 已确认的原文、旁白、镜头 ID 和顺序保持原样；不为适应画面模板删减。新稿需先形成明确的内容基线。来源冲突标记 NEED_CONFIRM。
- 保留完整字幕与配音。主体要有具体动作、状态变化和镜头推进；只有卡片淡入、进度条、装饰漂移不算完成动画。制作前读 [视频表现要求](references/video-direction.md)。
- 每镜头记录输入、动作、输出和业务人工确认点；不适用写“不适用”。制作说明不上屏，示意操作不冒充实测录屏。
- 全课生产前确认代表性样片；已有适用授权和确认可复用。调整画面不重复生成未变更的配音。
- 密钥由使用者单独配置，不进技能、项目媒体、日志或分发包。配音是否可用不能从 WorkBuddy/Codex 的聊天模型或会员推断。

## 单包执行路径

下面的路径均相对本 SKILL.md。宿主使用自己的文件和终端工具即可，无需特定 MCP。命令在技能目录执行，或把脚本换为本包内的绝对路径。

1. **首次配置或迁移**：读 [安装与分发](references/install.md)，运行 `node scripts/studio.mjs doctor`。缺环境时按已授权范围运行 `node scripts/studio.mjs setup`。此步骤只配置程序，不制作内容。
2. **资料与分镜**：读 [制作与验收](references/workflow.md) 及 [镜头记录](references/project-contract.md)。设计发生的事情及镜头节奏，长课按章节组织。可用 `assets/hyperframes-scenes.example.json` 理解自由分镜结构，不把示例当固定布局。
3. **配音**：先确定本次声音和原稿；已有正确音频直接复用；否则读 [配音配置](references/tts.md)，用 `scripts/tts.mjs plan` 预检、`generate` 按授权生成。支持自由画面分镜，不要求旧版 visualType/viewer。全课已获授权时，先完成选定音色的配音批次，再编排依赖该批次时长的正式动画；等待音频期间可整理素材和设计动作草图。
4. **字幕与动画**：读本包 [HyperFrames 制作指南](references/hyperframes.md)。按真实音频取得字幕时间、对照完整原稿纠错；用 `scripts/studio.mjs prepare` 整理音频、字幕片段及时间轴，再由代理按分镜编写 `index.html` 的实际动画。prepare 只整理素材，不会自动创作或宣称完成视频。
5. **检查与交付**：通过本包 `studio.mjs cli` 调用固定版本的 lint、check、preview、render。确认代表性样片后分章节完成整课；核验真实音轨、字幕和动作，并保存可编辑工程及最终 MP4。具体命令见 HyperFrames 指南。检查按 workflow.md 的收口规则执行；通过后转入下一阶段，不为清零非阻断警告反复重写。

配音供应商可以替换为用户已有的服务，但本包目前只有 MiniMax 的在线生成脚本；其他服务先取得真实音频再接入同一 audioPath，不宣称已经实现其他供应商 API。

## 旧项目兼容

WorkBuddy 已有的截图、全屏长图、三类 Canvas 动画和录制代码原样保留在 `assets/player.html` 与 `scripts/video.mjs`。仅当用户接续原工程或明确选择旧路线时读 [旧版运行说明](references/runtime.md)。新课默认 HyperFrames；遇到依赖问题不得静默退回卡片模板或把静态页当成成片。

迁移已有动画 HTML 时保留有效动作，按本包的可定位时间线约定改造；不能假设任意网页零改动可渲染。不覆盖 source/ 或唯一的已确认产物。

## 产物与状态

沿用项目约定；默认分镜放 production/storyboards、动画工程放 production/html、配音放 production/audio、样片放 production/samples、成片放 production/exports。技能包只带工具与通用示例，不带课程或用户媒体。

每完成一章或遇到阻塞就保存状态；如使用子任务，按 workflow.md 核验实际文件后接收结果。结束时记录输入版本、产物、实际检查、确认状态及未决项。区分“素材已准备”“网页可预览”“视频已导出”“用户已确认”；不可互相代替。跨宿主规则见 [环境适配](references/portability.md)。
