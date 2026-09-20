# 安装与分发：只安装这一个技能

ZIP 顶层只有 training-video-producer/，内部仅一个 SKILL.md。导入 WorkBuddy 或放入 Codex 的技能目录后，代理按本入口工作，不需要另外安装 HyperFrames 技能。已有同名技能先备份，比较本地自定义内容后再替换；不要直接覆盖伙伴的修改版。

## 首次配置

使用能运行本地 Node 命令的宿主环境。需要 Node.js 22+（含 npm）。Node 不存在时，用 https://nodejs.org/ 的适用安装包或本机已有包管理器安装，再继续。不要默默改动系统默认 Node 或删除旧版本。

在技能目录运行：

```sh
node scripts/studio.mjs doctor
node scripts/studio.mjs setup
```

setup 使用 package-lock.json 执行 npm ci，联网安装固定版 HyperFrames、GSAP、FFmpeg/ffprobe、旧工具所需 Playwright 及它们的依赖，再寻找/下载 HyperFrames 使用的 Chrome，最后检查环境。下载量取决于系统和已有缓存，通常数百 MB 以上；不会调用付费配音，不会生成视频，不会在其他宿主目录安装技能。

doctor 缺 Node、HyperFrames、FFmpeg/ffprobe 或 Chrome 时返回非零；检查上游报告中的实际必需项，不把进程退出码 0 当作成功。Docker、本地配音、背景音乐模型属于其他路线，不影响本包的本地渲染判断。配音凭证单独报告，使用已有音频不需要 MiniMax 密钥。doctor 是依赖诊断，不代表实际视频或中文字体已验收。

- 浏览器可由 HYPERFRAMES_BROWSER_PATH 或 VIDEO_BROWSER_PATH 指定本机可执行文件。
- FFmpeg/ffprobe 可由 FFMPEG_BIN、FFPROBE_BIN 指定绝对路径；未设置时使用本包 npm 依赖。HyperFrames 专用环境变量也可使用。
- Windows 路径含空格时加引号。脚本使用 Node 及参数数组启动子进程，不依赖 bash、macOS Keychain 或 npx 的交互式技能选择器。
- 浏览器被宿主沙箱阻止启动时，报告确切错误，使用宿主允许的执行方式；不要因此重新制作画面或悄悄切换付费云服务。
- 企业代理/网络阻止 npm 或 Chrome 下载时保留诊断，按本机网络要求处理；不要关闭 TLS 校验或绕过安全检测。

## 配音配置

见 [tts.md](tts.md)。用户可选择免费 Edge TTS（额外 Python 依赖、无需密钥），或配置自己的 MINIMAX_API_KEY / 私密 key 文件使用 MiniMax。已有 MP3/WAV 可以直接接入，配音服务不是必装模型。

首次可对代理说：“配置这个培训视频技能，检查环境；只配置，不调用配音、不制作视频。”以后制作时直接给资料即可。Skill 文件只是完整制作能力的说明和工具包，Node、浏览器、程序依赖仍需首次下载；不声称 ZIP 是完全离线的可执行应用。

## 分发与升级

只分发发布 ZIP；不复制 node_modules、密钥、_user_meta.json、个人绝对路径或课程媒体。依赖按各电脑系统安装。HyperFrames 固定为 0.8.42；升级要同时更新依赖锁、核验 CLI 约定并测试，不能自动漂移到 latest。

本包不运行 HyperFrames 的 skills update/init，也不依赖其外部技能树；官方程序的自动技能安装、自动升级和遥测在本包调用中关闭。开源归属和许可证见 ../THIRD_PARTY_NOTICES.md。

## 公开版许可与数据范围

本项目自有代码和文档采用 Apache-2.0，见包根目录 LICENSE、NOTICE；依赖许可另见 THIRD_PARTY_NOTICES.md。升级时保留这些声明，不把本项目许可证套用到全部第三方库。

公开包只含通用技能、脚本、示例及依赖清单。不要把个人密钥、音色ID、录音、项目材料、字体、模型权重或node_modules重新打包分发。外发自己制作的课程和工程时，另核对所用素材的使用/再分发权限。

安装与联网/费用边界、快速使用示例见包根目录 README.md。发布到技能市场采用本ZIP；package.json保留private=true，以避免将内部运行工具误发为npm包，不影响Skill ZIP的公开分享。
