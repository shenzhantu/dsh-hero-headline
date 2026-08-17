# dsh-hero-headline

一个纯客户端的 DeepSeek Harness Web 插件：把空会话页 hero 的标题「探索未至之境（预览版）」替换成自定义文案（默认「与你的日常，便是奇迹」），并配上艺术字样式与「从背景自动取色」的莫奈式联动。

A client-only DeepSeek Harness Web plugin that replaces the empty-state hero headline（"探索未至之境 / Into the Unknown"）with custom text, styles it as art text, and dynamically picks its gradient from the current background — Material-You/Monet style.

## 功能 / Features

- **改写标题文案** — 把 hero 标题替换成 `NEW_HEADLINE`（默认「与你的日常，便是奇迹」），中英文均命中。
- **隐藏「预览版」徽章** — 同步隐藏旁边的 `预览版 / Preview` 小徽章。
- **艺术字样式** — 渐变/彩虹文字（`background-clip: text`）、白色描边、柔光投影、加粗、字距，书法/圆体字体栈优雅回退。
- **鱼图标官方蓝** — 把 hero 的 DeepSeek 小鲸鱼图标染成官方鲸鱼蓝（`--dsw-static-deepseek-500` = `#4176E6`）；只改 fill，**hover「跳一下」的动画保留**。
- **莫奈取色联动** — 读取自定义背景插件（`ui-theme-background-custom`）正在展示的画面，中位切分（median-cut）提取主色调作为标题文字渐变；视频背景随播放刷新、图片背景在更换时重取；取不到色自动回退默认渐变。

## 工作原理 / How it works

- **纯浏览器端**：宿主半体（`index.js`）是空操作，一切在 `client.js` 完成；不触碰核心源码、locale 内部实现或哈希过的 CSS-Module 类名，跨小版本构建更稳。
- **DOM 替换**：用 `MutationObserver` 找到文案恰为 `探索未至之境 / Into the Unknown` 的叶子 `<span>`，改写文字、应用样式，并隐藏其兄弟「预览版」徽章；hero 重渲染会自动重新套用，幂等无死循环。
- **取色**：把背景缩到 ~48px 画布 → 中位切分聚类出 6 个「鲜活」主色（跳过偏灰/纯黑/纯白）→ 按色相排序生成文字渐变。视频背景取 `video.dsh-ubc-video` 当前帧（每 `PALETTE_REFRESH_MS` 刷新），图片背景走 `/ui-theme-background-custom/background` 并在 URL 变化时重取。
- **回退**：取不到色（无背景插件 / 透明占位 / 全灰）时保持默认彩虹渐变，不报错。

## 自定义 / Customize

打开 `client.js` 顶部常量：

```js
var NEW_HEADLINE = '与你的日常，便是奇迹' // 标题文案
// ART_*：艺术字样式（ART_GRADIENT / ART_FONT_FAMILY / ART_STROKE / ART_GLOW ...）
var FISH_COLOR = '#4176E6'               // 鱼图标颜色
// PALETTE_COUNT / PALETTE_REFRESH_MS     // 取色数量 / 视频背景跟随刷新间隔
```

## 安装 / Install

bundle 插件，装进目标 profile（如 `web`）：

```sh
cd <dsh-source>
pnpm dsh plugin --profile web add 'github:shenzhantu/dsh-hero-headline'
```

或手工等价操作：

1. `$DSH_HOME/profiles/<profile>/package.json` 的 `dependencies` 加
   `"dsh-hero-headline": "github:shenzhantu/dsh-hero-headline"`；
2. 同文件 `dsh.profile.bundles` 末尾追加 `"dsh-hero-headline"`；
3. 在 profile 目录执行 `pnpm install`，重启 `dsh-web`。

## 兼容 / Compatibility

- 取色联动**依赖** `ui-theme-background-custom`（提供背景画面）；没有它时，改文案 / 艺术字 / 鱼色仍可独立工作。
- 纯 DOM 实现，若未来 DSH 改动标题文案或 DOM 结构，本插件会静默不生效而不是报错/崩溃。

## License

MIT
