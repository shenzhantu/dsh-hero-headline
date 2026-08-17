// Client half of the dsh-hero-headline plugin (browser).
//
// The DeepSeek Harness empty-state hero renders the i18n snippet
//   <span class="...headlineText">探索未至之境</span>
//   <span class="...previewBadge">预览版</span>
// as siblings inside the hero headline grid. There is no public slot or
// locale-override seam for that copy, so this plugin does a pure DOM swap:
//   1. find a leaf <span> whose text is exactly the shipped headline
//      ("探索未至之境" / "Into the Unknown") and replace it with NEW_HEADLINE;
//   2. hide the sibling <span> carrying the badge text ("预览版" / "Preview").
//
// A MutationObserver re-applies the swap whenever the hero is (re)rendered,
// so it survives locale switches, session teardown and re-mounts. It never
// touches locale internals or hashed CSS-module class names, so it keeps
// working across minor builds. It is idempotent: the rewritten text is not a
// source string, so it cannot loop.

window.__ModuleLoader__.load({ id: 'dsh-hero-headline', factory: (require) => {
  var module = { exports: {} }
  var exports = module.exports

  // The word shown instead of the shipped headline. Change this one constant
  // to customize the text (e.g. your own quote / brand line).
  var NEW_HEADLINE = '与你的日常，便是奇迹'

  // --- 艺术字 + 彩虹渐变样式（想调效果就改这些常量）---
  // 彩虹渐变：按需改色标/角度。
  var ART_GRADIENT = 'linear-gradient(90deg,#ff3b30,#ff9500,#ffcc00,#34c759,#00c7be,#007aff,#af52de)'
  // 字体栈：优先楷体/圆体等“艺术”感字体，缺失则优雅回退到系统字体。
  var ART_FONT_FAMILY = "'Kaiti SC','KaiTi','STKaiti','楷体','LXGW WenKai','YouYuan','幼圆','PingFang SC','Microsoft YaHei',sans-serif"
  var ART_FONT_WEIGHT = 'bold'
  var ART_LETTER_SPACING = '2px'
  var ART_STROKE = '0.8px rgba(255,255,255,0.75)' // 白描边（艺术字轮廓）
  var ART_GLOW = '0 2px 16px rgba(0,0,0,0.35)'     // 投影/光晕
  var ART_BG_SIZE = '100% 100%'                    // 想流动彩虹可改 '200% 100%'

  // --- 鱼图标颜色：DS 官方小鲸鱼蓝（theme 的 --dsw-static-deepseek-500）---
  var FISH_COLOR = '#4176E6'

  // --- 莫奈取色联动（从 ui-theme-background-custom 的背景自动取主色调）---
  var PALETTE_COUNT = 6                      // 渐变用多少个主色
  var BG_IMAGE_ROUTE = '/ui-theme-background-custom/background'
  var VIDEO_SELECTOR = 'video.dsh-ubc-video' // 背景插件视频背景用的元素
  var PALETTE_REFRESH_MS = 6000              // 视频背景跟随刷新的间隔
  var currentGradient = ART_GRADIENT         // 取不到色时回退到默认彩虹
  var currentHeadlineEl = null               // 当前已改写的标题元素
  var lastImageBgKey = null
  var imageTriedOnce = false
  var paletteTimer = null

  // Exact shipped strings. Kept as a list so both locales are covered even if
  // the active language is switched.
  var HEADLINE_SOURCES = ['探索未至之境', 'Into the Unknown']
  var BADGE_SOURCES = ['预览版', 'Preview']

  function textOf(el) {
    if (!el || el.nodeType !== 1) return ''
    return (el.textContent || '').replace(/\s+/g, ' ').trim()
  }

  function isLeaf(el) {
    return !!el && el.nodeType === 1 && el.children.length === 0
  }

  // Apply the 艺术字 / rainbow-gradient look to the headline span.
  // background-clip: text with a transparent fill makes the gradient show
  // through the glyphs; the stroke + glow give it the "art text" depth.
  function applyArtStyle(el) {
    el.style.display = 'inline-block'
    el.style.fontFamily = ART_FONT_FAMILY
    el.style.fontWeight = ART_FONT_WEIGHT
    el.style.letterSpacing = ART_LETTER_SPACING
    el.style.backgroundImage = currentGradient
    el.style.backgroundSize = ART_BG_SIZE
    el.style.webkitBackgroundClip = 'text'
    el.style.backgroundClip = 'text'
    el.style.color = 'transparent'
    el.style.webkitTextFillColor = 'transparent'
    el.style.webkitTextStroke = ART_STROKE
    el.style.textShadow = ART_GLOW
  }

  // Recolor the hero fish logo to the official DeepSeek blue. Only the fill is
  // swapped (currentColor -> FISH_COLOR); the shape, classes and transform
  // stay untouched, so the hover swim/jump animation keeps working.
  function applyFishGradient(parent) {
    if (!parent || !parent.querySelectorAll) return
    var svgs = parent.querySelectorAll('svg')
    for (var i = 0; i < svgs.length; i++) {
      var paths = svgs[i].querySelectorAll('path,ellipse,circle,rect,polygon,polyline')
      for (var j = 0; j < paths.length; j++) {
        if (paths[j].getAttribute('fill') === 'currentColor') {
          paths[j].setAttribute('fill', FISH_COLOR)
        }
      }
    }
  }

  // --- 莫奈取色：从背景源（图片 / 视频当前帧）提取主色调 ---
  function rgbToHue(r, g, b) {
    var mx = Math.max(r, g, b)
    var mn = Math.min(r, g, b)
    var d = mx - mn
    var h
    if (d === 0) h = 0
    else if (mx === r) h = ((g - b) / d) % 6
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    return h < 0 ? h + 360 : h
  }

  function channelSpread(box) {
    var minR = 255, minG = 255, minB = 255
    var maxR = 0, maxG = 0, maxB = 0
    for (var i = 0; i < box.length; i++) {
      var p = box[i]
      if (p[0] < minR) minR = p[0]
      if (p[0] > maxR) maxR = p[0]
      if (p[1] < minG) minG = p[1]
      if (p[1] > maxG) maxG = p[1]
      if (p[2] < minB) minB = p[2]
      if (p[2] > maxB) maxB = p[2]
    }
    return Math.max(maxR - minR, maxG - minG, maxB - minB)
  }

  function bestChannel(box) {
    var minR = 255, minG = 255, minB = 255
    var maxR = 0, maxG = 0, maxB = 0
    for (var i = 0; i < box.length; i++) {
      var p = box[i]
      if (p[0] < minR) minR = p[0]
      if (p[0] > maxR) maxR = p[0]
      if (p[1] < minG) minG = p[1]
      if (p[1] > maxG) maxG = p[1]
      if (p[2] < minB) minB = p[2]
      if (p[2] > maxB) maxB = p[2]
    }
    var dr = maxR - minR, dg = maxG - minG, db = maxB - minB
    if (dr >= dg && dr >= db) return 0
    if (dg >= db) return 1
    return 2
  }

  // Median-cut palette from an image/video source. Skips near-gray and
  // near-black/white pixels so the result stays "vibrant" (Monet-ish); falls
  // back to all opaque pixels when few vibrant ones exist. Returns up to
  // `count` colors sorted by hue for a smooth text gradient.
  function extractPalette(source, count) {
    var W = 48
    var H = 48
    var vw = source.videoWidth || source.naturalWidth || source.width || 0
    var vh = source.videoHeight || source.naturalHeight || source.height || 0
    if (vw > 0 && vh > 0) {
      var scale = Math.min(1, 48 / Math.max(vw, vh))
      W = Math.max(2, Math.round(vw * scale))
      H = Math.max(2, Math.round(vh * scale))
    }
    var cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    var ctx = cv.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(source, 0, 0, W, H)
    var data = ctx.getImageData(0, 0, W, H).data
    var pts = []
    for (var i = 0; i < data.length; i += 4) {
      var r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
      if (a < 128) continue
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      var sat = mx === 0 ? 0 : (mx - mn) / mx
      var lum = (mx + mn) / 510
      if (sat < 0.18 || lum < 0.10 || lum > 0.90) continue
      pts.push([r, g, b])
    }
    if (pts.length < count * 4) {
      pts = []
      for (var j = 0; j < data.length; j += 4) {
        if (data[j + 3] < 128) continue
        pts.push([data[j], data[j + 1], data[j + 2]])
      }
    }
    if (pts.length === 0) return []
    var boxes = [pts]
    while (boxes.length < count) {
      var bi = -1, best = -1
      for (var k = 0; k < boxes.length; k++) {
        var sp = channelSpread(boxes[k])
        if (sp > best) { best = sp; bi = k }
      }
      if (bi === -1 || best <= 1) break
      var target = boxes[bi]
      var ch = bestChannel(target)
      target.sort(function (p, q) { return p[ch] - q[ch] })
      var mid = Math.floor(target.length / 2)
      if (mid === 0 || mid === target.length) break
      boxes.splice(bi, 1, target.slice(0, mid), target.slice(mid))
    }
    var palette = []
    for (var m = 0; m < boxes.length; m++) {
      var sum = [0, 0, 0]
      for (var n = 0; n < boxes[m].length; n++) {
        sum[0] += boxes[m][n][0]
        sum[1] += boxes[m][n][1]
        sum[2] += boxes[m][n][2]
      }
      var len = boxes[m].length
      palette.push({ r: Math.round(sum[0] / len), g: Math.round(sum[1] / len), b: Math.round(sum[2] / len), n: len })
    }
    palette.sort(function (a, b2) { return b2.n - a.n })
    palette = palette.slice(0, count)
    palette.sort(function (a, b2) { return rgbToHue(a.r, a.g, a.b) - rgbToHue(b2.r, b2.g, b2.b) })
    return palette
  }

  function gradientFromPalette(palette) {
    if (!palette || palette.length < 2) return null
    var stops = []
    for (var i = 0; i < palette.length; i++) {
      var c = palette[i]
      var offset = Math.round((i / (palette.length - 1)) * 100)
      stops.push('rgb(' + c.r + ',' + c.g + ',' + c.b + ') ' + offset + '%')
    }
    return 'linear-gradient(90deg,' + stops.join(',') + ')'
  }

  function applyPalette(palette) {
    var grad = gradientFromPalette(palette)
    if (grad) currentGradient = grad
    if (currentHeadlineEl) applyArtStyle(currentHeadlineEl)
  }

  function extractFromVideo(video) {
    if (!video || video.readyState < 2 || !video.videoWidth) return
    try {
      var palette = extractPalette(video, PALETTE_COUNT)
      if (palette && palette.length > 0) applyPalette(palette)
    } catch (e) { /* keep current gradient */ }
  }

  function extractFromImage() {
    var img = new Image()
    img.onload = function () {
      try {
        var palette = extractPalette(img, PALETTE_COUNT)
        if (palette && palette.length > 0) applyPalette(palette)
      } catch (e) { /* keep current gradient */ }
    }
    img.onerror = function () { /* keep current gradient */ }
    img.src = BG_IMAGE_ROUTE + '?v=' + Date.now()
  }

  function backgroundImageUrl() {
    try {
      var bg = getComputedStyle(document.body, '::before').backgroundImage
      return (bg && bg !== 'none') ? bg : null
    } catch (e) { return null }
  }

  // Video backgrounds follow live (frames change); image backgrounds are
  // extracted once and again only when the background URL changes.
  function refreshPalette() {
    var video = document.querySelector(VIDEO_SELECTOR)
    if (video && video.readyState >= 2 && video.videoWidth) {
      extractFromVideo(video)
      return
    }
    var key = backgroundImageUrl()
    if (!imageTriedOnce) {
      imageTriedOnce = true
      lastImageBgKey = key
      extractFromImage()
      return
    }
    if (key !== null && key !== lastImageBgKey) {
      lastImageBgKey = key
      extractFromImage()
    }
  }

  // Rewrite a headline span (if it is one) and hide its sibling badge.
  function tryRewrite(el) {
    if (!isLeaf(el)) return false
    var txt = textOf(el)
    if (HEADLINE_SOURCES.indexOf(txt) === -1) return false

    if (el.textContent !== NEW_HEADLINE) el.textContent = NEW_HEADLINE
    currentHeadlineEl = el
    applyArtStyle(el)

    var parent = el.parentElement
    if (parent) {
      var kids = parent.children
      for (var i = 0; i < kids.length; i++) {
        var sib = kids[i]
        if (sib !== el && isLeaf(sib) && BADGE_SOURCES.indexOf(textOf(sib)) !== -1) {
          if (sib.style.display !== 'none') sib.style.display = 'none'
        }
      }
      applyFishGradient(parent)
    }
    return true
  }

  function scan(node) {
    if (!node || node.nodeType !== 1) return
    tryRewrite(node)
    var spans = node.querySelectorAll('span')
    for (var i = 0; i < spans.length; i++) tryRewrite(spans[i])
  }

  function onMutations(records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i]
      if (r.type === 'childList') {
        for (var j = 0; j < r.addedNodes.length; j++) scan(r.addedNodes[j])
      } else if (r.type === 'characterData') {
        var p = r.target && r.target.parentNode
        if (p && p.nodeType === 1) tryRewrite(p)
      }
    }
  }

  function apply(ctx) {
    var observer = null

    function start() {
      if (observer) return
      observer = new MutationObserver(onMutations)
      observer.observe(document.documentElement, {
        childList: true,
        characterData: true,
        subtree: true
      })
      if (document.body) scan(document.body)
      refreshPalette()
      if (paletteTimer === null) {
        paletteTimer = setInterval(refreshPalette, PALETTE_REFRESH_MS)
      }
    }

    ctx.effect(function () {
      if (document.body) {
        start()
      } else {
        document.addEventListener('DOMContentLoaded', start, { once: true })
      }
      return function () {
        document.removeEventListener('DOMContentLoaded', start)
        if (paletteTimer !== null) { clearInterval(paletteTimer); paletteTimer = null }
        if (observer) { observer.disconnect(); observer = null }
      }
    })
  }

  exports.apply = apply
  exports.inject = []
  return module.exports
} })