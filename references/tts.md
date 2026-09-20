# 从旁白生成配音

此技能包含 MiniMax 在线语音合成（TTS）：把每个镜头的完整旁白变成 MP3，再交给视频渲染工具。伙伴无需部署或训练语音模型。WorkBuddy 的对话模型与配音服务是不同能力；不要假定安装 WorkBuddy 就拥有 MiniMax API 配额。

## 首次使用

1. 在 [MiniMax 中国平台](https://platform.minimaxi.com/) 开通 API 账号，取得 API Key 并确保语音服务可用、有余额。国际账号使用对应国际平台并传 `--region global`。费用按账号的当前语音模型价格计收；网页会员、编程套餐与语音 API 额度不要混为一谈。
2. 凭证优先由宿主安全配置提供环境变量 `MINIMAX_API_KEY`。另一种跨系统方式：用户自行把密钥保存为仅含密钥的一行文本，放在个人私密目录，用 `--key-file` 指向该文件。不要放在技能目录、共享项目、云盘或聊天记录里。macOS 已有钥匙串凭证可显式传 `--keychain-service 服务名`；Windows 无需钥匙串。
3. `node scripts/tts.mjs doctor --key-file /private/path/minimax-key.txt` 只检查凭证存在，不联网、不验证余额、不打印密钥。缺凭证时说明这是首次配置缺失，不让用户自己“找一个模型”。
4. 默认标准音色 `Chinese (Mandarin)_Warm_Bestie`，默认模型 `speech-2.8-hd`、语速 1。可以先用 `voices` 列出当前账号系统音色，再传 `--voice ID` 选择。不要把开发者私人克隆音色作为默认。先小样试听，用户选定后保持声音不变。

CLI 路径相对技能目录；实际执行时可使用绝对路径。Windows 的 `--key-file` 可以是 `C:\Users\用户名\私密目录\minimax-key.txt`，带空格时加引号。首次安装依赖及浏览器检查见 runtime.md。

## 接入制作流程

输入使用 project-contract.md 的公共分镜字段，无须 visualType/viewer，生成前省略 audioPath；其余字段包括原始旁白全部保留。旧版分镜也兼容。源文件不覆盖。若已有配音直接渲染；若用户要求重新配音，另建不含 audioPath 的分镜副本并说明范围，不删除旧音频。

```sh
# 预检：不联网、不收费，列出镜头、字符数、声音与模型
node scripts/tts.mjs plan --input /project/production/storyboards/scenes.json

# 真实配音：逐镜头生成，按 MiniMax 账号计费
node scripts/tts.mjs generate --input /project/production/storyboards/scenes.json --out /project/production/audio/voice-v1 --key-file /private/path/minimax-key.txt

# 下一步按 hyperframes.md 补齐字幕时间，再整理动画工程材料
node scripts/studio.mjs prepare --input /project/production/audio/voice-v1/voiced-scenes.json --out /project/production/html/chapter-v1
```

若使用环境变量，省略 `--key-file`。plan 和 generate 必须传相同的 voice、model、speed、region 参数，否则预检与实际配置不一致。首次小样费用纳入用户的制作授权范围；若账号归属、费用承担或调用范围不明确，先明确再调用。不以一次样片授权推断可无限量重试或批量生成整课。

## 配音停顿与旁白断句

中英混排、标点和短句密度可能影响合成停顿，具体表现随音色、模型和文本变化，不把单次经验当作统一数值标准。新稿阶段可用少量对照试听检查英文词两侧空格、冒号和过密逗号的影响，保留必要的语义与自然换气。

已有定稿先提出修改建议，用户同意后再生成新的旁白副本与配音；不能擅自删除空格、替换标点或重写原稿。字幕仍对应本次实际采用的完整旁白。

先生成并试听代表性音频。听到不自然停顿时，可在已有音频上辅助查看静音区间，无需为了检查重复调用付费接口：

```sh
ffmpeg -i "shot.mp3" -af "silencedetect=noise=-35dB:d=0.18" -f null -
```

阈值只是诊断示例；静音检测不能判断语义是否自然。结合实际播放确认问题后，只修改获授权的文本和受影响音频。不把所有停顿剪除，也不按固定节拍机械处理全片。

## 复用已确认的克隆音色

用户已有授权、试听通过且可调用的克隆音色时，读取其项目私密配置，用创建音色的同一账号和地区传 `--voice 已确认ID`；不重新克隆或重复激活。既有音色确认可以复用，但仍需检查本课读音和内容。若只做一镜验证接口，成功后在本次授权内继续余下配音，不把接口验证当成必须再等一次用户确认；音色或听感实质变化时再验证受影响部分。

音色 ID 和凭证留在个人配置，不写入通用技能或分发包。首次创建音色另走已经验证的克隆工具流程；本包此版本只接入已有音色，不声称包含克隆接口。

## 可直接试跑的例子

包内 `assets/demo-scenes.json` 是三镜头通用演示，不含原项目课程或音频。替换上面 input 路径即可从文字生成约二十秒的有声视频。它也是跨电脑验收样例：对照原文听完三句、查看字幕与画面、检查报告。Windows/Linux 尚需真实电脑验收，不能因源码可移植就写成已通过测试。

## 中断和质量

每个音频记录原文指纹、声音与模型配置、文件指纹、服务追踪号、实际时长与用量。同输入同配置重复执行会检查并复用已经生成的音频；改变原文或声音要求新输出目录。完整分镜只在所有音频生成并通过解码检查后写入 `voiced-scenes.json`。新音频会清除输出副本中的旧 captions 时间、标记 NEED_ALIGN；原始输入文件不变，字幕需按新音频重新对齐。

请求中断可能已经计费，脚本不自动重试。报告里的 `request_pending` 或 `needs_review` 需要核对服务结果，再决定是否用新输出目录重做；保留成功音频。`.tts.lock` 防止并发重复扣费；进程异常退出后先确认没有运行中的任务，再清理该锁。不要批量删除报告以强行绕过保护。

生成成功及完整解码只说明链路可用。音频内容、专有名词读法、声音与字幕节奏仍须试听；报告保留 `humanReview: NEED_CONFIRM`。旧版 Canvas 字幕按字符比例估时；新 HyperFrames 路线必须补齐真实音频对应的字幕时间，见 hyperframes.md。

接口依据：[MiniMax 同步语音合成](https://platform.minimax.io/docs/api-reference/speech-t2a-http)。代码不含私有音色、密钥或用户声音样本，也不调用声音克隆接口。
