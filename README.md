# OpenReel

<div align="center">

**把散落的片源，收进自己的片库。**

跨平台影视聚合与私人片库客户端 · iOS / Android / macOS / Windows

</div>

---

## 这是什么

OpenReel 是一个自托管的影视聚合播放客户端。你把自己喜欢的片源接进来，它负责采集、刮削、归类、推荐，然后把片子收进一个属于你自己的片库。

三端同一套数据，桌面端看片库大屏，手机随手接着看。

## 主要功能

**多源聚合**
接入自定义片源，统一适配采集接口，支持电影、电视剧、综艺、动漫、纪录片五类内容。片源可随时增删，支持一键导入他人分享的源配置。

**自动追更**
订阅后自动按计划采集新剧集，无需手动点开。支持任务队列可视化，进度失败一目了然。

**私人片库**
完整元数据：封面、简介、演员、剧集表、分集时长、播放进度。全文索引（FTS5）支撑毫秒级搜索，搜到即可播放。支持收藏、历史记录、不喜欢、隐藏类型。

**智能推荐**
基于你的收藏、观看历史、评分、不喜欢记录构建兴趣画像，为每部片子计算个性化分数并排序。你的片库越长，推荐越准。

**三端播放**
桌面端支持画中画、小窗播放、预读加速与键盘快捷键；移动端支持 DLNA / AirPlay 投屏与画中画。播放器统一走 hls.js，支持 HLS/m3u8 与直链。

**界面**
亮暗双主题、48 组配色方案、字号缩放、磨砂毛玻璃、侧栏布局。所有界面均支持浅色与深色。

**家长控制**
儿童锁，一键锁定播放与购买入口，避免小孩误触。

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面端 | React 19 · TypeScript · Vite · Tauri 2（Rust）· Vidstack · hls.js · Radix UI · Tailwind |
| 移动端 | React Native · Expo · expo-sqlite · expo-video · React Navigation |
| 共享核心 | TypeScript · Zustand · Axios |
| 数据 | SQLite（16 张表）· FTS5 全文索引 · 版本化迁移 |
| 工程 | pnpm monorepo · 共享 `@openreel/core` 业务层 |
| 发行 | GitHub Actions 自动构建三平台安装包 |

桌面端与移动端共用 `packages/core` 中的全部业务逻辑（采集、刮削、推荐、评分、任务调度），两端行为一致，改一处两端生效。

## 数据存储

所有数据只存在你自己的设备上：本地 SQLite 文件，不上传任何服务器。删掉应用即删掉数据，升级安装保留数据。

## 安装

**桌面端（macOS / Windows）**

前往 [Releases](https://github.com/roma007/openreel/releases) 下载对应平台安装包。

**移动端（iOS / Android）**

自行构建安装（见下）。

## 从源码构建

前置依赖：Node.js 20+、pnpm 10+、Rust、平台对应原生工具链。

```bash
git clone git@github.com:roma007/openreel.git
cd openreel
pnpm install
```

```bash
# 桌面端
pnpm desktop:dev            # 开发
pnpm --filter @openreel/desktop tauri build   # 打包

# 移动端
pnpm mobile                # 启动 Metro / iOS 模拟器
```

安卓 release 包：

```bash
cd apps/mobile/android && ./gradlew :app:assembleRelease
# 产物：app/build/outputs/apk/release/app-release-v<version>.apk
```

> iOS 真机部署需要 Xcode 26.6，详见 `AGENTS.md`「移动端真机部署」一节。

## 项目结构

```
openreel/
├── apps/
│   ├── desktop/          # 桌面端（Tauri + React）
│   └── mobile/           # 移动端（Expo + React Native）
├── packages/
│   ├── core/             # 双端共享业务层（采集/刮削/推荐/评分/调度）
│   └── expo-dlna-cast/   # DLNA 投屏
└── scripts/              # 版本 bump 等工程脚本
```

## 注意事项

- 片源由使用者自行添加，应用本身不内置、不分发任何内容资源。
- 请在所在地区法律允许的范围内使用。
- `com.movie.app`（Android）、`com.mengfeng.movieapp`（iOS）、`com.movie.app.desktop`（桌面）为应用标识符，永久不变——这是升级覆盖安装的判定依据，不要修改。

## License

[MIT](LICENSE) · Copyright © 2026 roma