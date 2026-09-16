# PTS Super HTML Next

> Next-generation single-file playable ads builder for **Cocos Creator 3.8.8** (Web Mobile).

## Key Features

- **True Base122 Encoding**: Full KevinAlbs 7-bit packing avoiding HTML-unsafe characters, yielding **12.6% - 14.3% smaller** HTML playable files compared to Base64.
- **Dual Format Switcher**: Built-in Panel UI selector allowing users to switch between **Base64** and **Base122** payloads with persistent configuration.
- **Cocos Creator 3.8.8 Native Support**:
  - Full WASM and native binary asset loading.
  - Zero `getError` crashes on textures.
  - Intercepted `fetch` returning genuine `Response` objects (`.ok`, `.status`, `.headers`).
  - Safe SystemJS boot sequencing avoiding premature inline script execution.
  - Intercepted Cocos bundle preload imports (`virtual:///prerequisite-imports/*`).
- **All Top Ad Networks Supported**:
  - Standalone Common HTML
  - AppLovin (with MRAID preview fallback)
  - Google Ads (HTML + ZIP wrapper)
  - Facebook (HTML + ZIP wrapper)
  - Mintegral (HTML + ZIP wrapper)
  - ironSource (2025 modern & legacy)
  - Unity Ads (HTML + ZIP wrapper)
  - TikTok (HTML + ZIP wrapper)
  - Liftoff, Vungle, Snapchat, Pangle, Kwai, and more.

## Installation into Cocos Creator

1. Copy or symlink `_temps/pts-super-html-next` to `extensions/pts-super-html-next` in your project root.
2. In Cocos Creator, navigate to **Extensions -> Extension Manager**, click **Installed**, and enable **PTS Super HTML Next**.
3. Open the panel via **Extensions -> PTS Super HTML Next**.

## Building from Source

```bash
# Compile TypeScript and bundle runtime loader
npm run build

# Run unit tests (codec verification) and pack tests
npm test

# Run CLI pack on latest build
npm run pack
```

## CLI Usage

You can build playables directly from terminal:

```bash
node dist/tools/pack-cli.js [inputDir] [outDir] [encoding]

# Example:
node dist/tools/pack-cli.js ../../build/web-mobile-007 ../../build/super-html base122
```

## Project Topology

```text
_temps/pts-super-html-next/
├── src/
│   ├── codecs/
│   │   └── base122.ts       # True KevinAlbs Base122 codec + HTML escaping
│   ├── core/
│   │   ├── types.ts          # Core TypeScript interfaces
│   │   ├── channels.ts       # Channel registry & snippet reader
│   │   ├── settings.ts       # Settings persistence
│   │   └── pack.ts           # Packaging engine (ZIP + inlining + channels)
│   ├── runtime/
│   │   └── bootstrap.ts      # Client-side loader (fetch/XHR hook, SystemJS boot)
│   ├── panel/
│   │   └── index.ts          # Cocos Creator 3.8 native Panel UI
│   ├── tools/
│   │   ├── build-runtime.ts  # Combines JSZip + bootstrap into dist/runtime/loader.js
│   │   └── pack-cli.ts       # Command-line pack runner
│   ├── main.ts               # Extension main process
│   ├── builder.ts            # Build plugin registration
│   ├── hooks.ts              # onAfterBuild hook
│   └── tests/
│       ├── codec.test.ts     # Base122 roundtrip & size benchmark
│       ├── pack.test.ts      # Asset packing & extraction byte-fidelity test
│       └── browser.test.js   # Headless Edge CDP verification
├── dist/                     # Compiled JavaScript files
├── static/                   # Channel templates & metadata
├── package.json
└── tsconfig.json
```
