# DM Voice · 豆包音色试听

一个无需登录的豆包音色试听目录，用官方示例帮你快速选声音。

**在线访问：[yoleax.github.io/DMVoicePreview](https://yoleax.github.io/DMVoicePreview/)**

- 564 条试听记录，548 个独立音色 ID；445 条豆包 2.0，119 条豆包 1.0。
- 支持关键词、模型版本、语言／口音、性别、年龄感、场景、特色标签组合筛选。
- 本地收藏、音色详情、复制 ID、单音色分享链接。
- 单播放器支持进度拖动、倍速、音量、上一首／下一首与可选连续试听。
- 响应式布局，手机可用；音频按点击加载，首页不会下载整个音色库。
- HTML / CSS / JavaScript，无运行时依赖、无服务端、无 API Key。

## 本地运行

需要 Node.js 22 或更高版本。正常开发与部署不需要 FFmpeg。

```sh
npm test
npm run build
npm run dev
```

打开 http://127.0.0.1:4173/DMVoicePreview/ 。修改 `web/` 后重新运行构建并刷新浏览器。

## 项目结构

```text
web/                       页面与交互源代码
public/data/voices.json     浏览器使用的规范化音色目录
public/assets/audio/       已转换的官方试听音频
public/assets/avatars/     已缩放的官方头像
data/source-catalog.json    仅保留音色字段的原始目录快照
data/asset-manifest.json    来源 URL、尺寸、时长与采集状态
scripts/                   资源处理、构建、本地服务
test/                      数据完整性与筛选行为测试
dist/                      构建输出（不提交）
```

## 数据与更新

来源：[火山引擎官方音色库](https://console.volcengine.com/speech/new/voices)，快照日期 **2026-10-02**。数据保留页面的官方音色 ID、名称、描述、分类、标签与试听链接。没有包含登录 Cookie、请求头、API Key、账户 ID 或调用用量。

同一音色 ID 可能有不同语言的试听版本，所以保留所有 564 条记录，用单独的预览 key 区分。558 个独立音频文件共享引用，避免重复下载。场景、语言与情感标签描述音色能力；本站只播放官方固定示例，不提供实时文本合成，也不承诺示例覆盖每种语言／情感。

如需更新，先通过已获授权的官方音色库页面获得新目录，按 `data/source-catalog.json` 的白名单结构保存。不要保存原始网络抓包或账户凭据。安装官方 FFmpeg / FFprobe 后运行：

```sh
npm run assets
npm test
npm run build
```

资源脚本仅下载目录中 `lf3-static.bytednsdoc.com` 的公开示例 URL，使用 6 个并发请求和有限重试。原始文件缓存于 `.cache/`；音频转换为 128 kbps MP3，头像缩放为 160 px WebP。输出文件使用 URL 哈希命名，已存在资源会跳过。示例不裁剪，生成的文件随站点托管。脚本在有音频失败时返回非零状态。

## GitHub Pages

仓库的 Pages 设置使用 **GitHub Actions**，默认分支推送后自动测试、构建和发布 `dist/`。资源路径均为相对路径，支持 `/DMVoicePreview/` 项目站点。首次启用需在仓库 Settings → Pages 中选择 GitHub Actions。

当前素材约 93.4 MB，完整构建约 94 MB，低于 [GitHub Pages 的 1 GB 站点限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)。GitHub 另有每月 100 GB 的软带宽上限；实际访问容量取决于播放次数与浏览器缓存。应关注仓库后续资源增长与站点使用情况。

## 权利与来源

本站是非官方索引，与火山引擎、豆包无隶属关系。示例音频、头像、音色名称和官方描述的相关权利归原权利人。收录仅用于音色试听参考；不对这些素材另行授予使用许可，音色服务的使用条件以官方说明为准。

本仓库原创程序代码采用 MIT 许可。`public/assets/`、`public/data/` 和 `data/` 中的第三方内容不适用该代码许可。素材权利问题请通过仓库 Issue 联系维护者。
