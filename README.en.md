# OpenReel

<div align="center">

**Gather scattered sources into your own library.**

Cross-platform media aggregator and personal library client · iOS / Android / macOS / Windows

</div>

---

## What it is

OpenReel is a self-hosted media aggregator and playback client. Plug in the sources you like — it handles scraping, cataloguing, classification and recommendations, then builds a library that belongs to you.

One database across three platforms: browse on the desktop, pick up on your phone.

## Features

**Multi-source aggregation**
Bring in custom sources through a unified scraper interface. Covers movies, TV series, variety shows, anime and documentaries. Add or remove sources at any time, or import shared source configurations in one click.

**Automatic updates**
Subscribe and new episodes are fetched on schedule without manual checking. A visible task queue shows progress and failures at a glance.

**Your library**
Full metadata: artwork, synopsis, cast, episode list, per-episode duration and playback progress. Full-text search (FTS5) returns results in milliseconds, ready to play. Supports favourites, watch history, dislikes and hidden categories.

**Recommendations**
An interest profile is built from your favourites, watch history, ratings and dislikes, then scored per title for personalised ranking. The longer your library grows, the sharper the recommendations get.

**Playback on three platforms**
Desktop supports picture-in-picture, mini-player, prefetch acceleration and keyboard shortcuts. Mobile supports DLNA / AirPlay casting and picture-in-picture. Playback runs through hls.js, handling HLS/m3u8 streams and direct links.

**Interface**
Light and dark themes, 48 colour schemes, adjustable font size, frosted glass surfaces and a sidebar layout — all available in both light and dark form.

**Parental controls**
A kid lock disables playback and purchase entry points so children can't reach them by accident.

## Tech stack

| Layer | Choice |
|---|---|
| Desktop | React 19 · TypeScript · Vite · Tauri 2 (Rust) · Vidstack · hls.js · Radix UI · Tailwind |
| Mobile | React Native · Expo · expo-sqlite · expo-video · React Navigation |
| Shared core | TypeScript · Zustand · Axios |
| Data | SQLite (16 tables) · FTS5 full-text index · versioned migrations |
| Tooling | pnpm monorepo · shared `@openreel/core` business layer |
| Release | GitHub Actions builds installers for all platforms |

Desktop and mobile share the entire business layer in `packages/core` (scraping, metadata, recommendations, rating, scheduling), so behaviour is consistent across platforms and a single change applies to both.

## Data storage

Everything stays on your device, in a local SQLite file. Nothing is uploaded. Uninstalling removes the data; upgrading over an existing install keeps it.

## Installation

**Desktop (macOS / Windows)**

Grab the installer for your platform from [Releases](https://github.com/roma007/openreel/releases).

**Mobile (iOS / Android)**

Build and install yourself (see below).

## Build from source

Prerequisites: Node.js 20+, pnpm 10+, Rust, and the native toolchain for your target platform.

```bash
git clone git@github.com:roma007/openreel.git
cd openreel
pnpm install
```

```bash
# Desktop
pnpm desktop:dev            # dev
pnpm --filter @openreel/desktop tauri build   # package

# Mobile
pnpm mobile                # Metro / iOS Simulator
```

Android release APK:

```bash
cd apps/mobile/android && ./gradlew :app:assembleRelease
# Output: app/build/outputs/apk/release/app-release-v<version>.apk
```

> Deploying to a physical iPhone requires Xcode 26.6 — see the "移动端真机部署" section of `AGENTS.md`.

## Project layout

```
openreel/
├── apps/
│   ├── desktop/          # Desktop (Tauri + React)
│   └── mobile/           # Mobile (Expo + React Native)
├── packages/
│   ├── core/             # Shared business layer (scrape/metadata/recommend/rate/schedule)
│   └── expo-dlna-cast/   # DLNA casting
└── scripts/              # Engineering scripts (version bump, etc.)
```

## Notes

- Sources are supplied by the user. The application ships with, and distributes, no content resources of its own.
- Use within the bounds of applicable local law.
- `com.movie.app` (Android), `com.mengfeng.movieapp` (iOS) and `com.movie.app.desktop` (desktop) are the application identifiers and are permanently fixed — they determine how upgrades are installed over an existing copy. Do not change them.

## License

All rights reserved.