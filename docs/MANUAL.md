# CWASA SiGML Animator — Manual

> This is an *AI Generated Document*.

This is a from-scratch guide to how this app works, how CWASA's JavaScript
API is shaped, and how SiGML (the sign-language markup it animates) is
put together. It's written from directly reading the vendored
[`allcas.js`](../allcas.js) runtime — line references below point into that
file.

## 1. What is what

Three names get used interchangeably in the docs out there; they aren't the
same thing:

- **SiGML** ("Signing Gesture Markup Language") — the XML input language. A
  SiGML document is a sequence of *signs*, each either hand-authored
  "Gestural" SiGML (a `<hamgestural_sign>`, describing hand shape, location,
  and motion directly) or "H-SiGML" (an `<hns_sign>`, generated from
  [HamNoSys](https://www.sign-lang.uni-hamburg.de/hamnosys.html) notation).
  See [§6](#6-sigml-primer).
- **JASigning** — the older animation system this all descends from
  (originally a Java applet).
- **CWASA** ("CoffeeScript WebGL ARP Signing Avatar") — the modern
  replacement: a browser-native WebGL + WebAssembly runtime that plays
  SiGML without Java. It's compiled from CoffeeScript into a single bundled
  file — that bundle is [`allcas.js`](../allcas.js) in this repo, vendored
  from the University of East Anglia's demo server. It embeds a WASM build
  of the "animgen" engine that actually turns SiGML into per-frame joint
  data.

## 2. How this app is wired together

```
allcas.js  →  defines window.CWASA once it finishes executing
index.html →  loads allcas.js, then app.js; contains the avatar canvas
              div and CWASA's "stock component" placeholder elements
app.js     →  calls CWASA.init(), wires our custom Play/Stop buttons and
              the Examples dropdown to CWASA's API, and listens for
              CWASA's event hooks to drive the status log
cwasa.css  →  base styling for CWASA's own generated elements (canvas
              sizing, form control fonts, etc.); our own <style> block
              in index.html handles our custom layout
examples/  →  vendored local corpus of .sigml files
```

Nothing here needs a build step — it's plain HTML/CSS/JS, served as
static files. `allcas.js` self-registers `window.CWASA` at the bottom of
the file ([allcas.js:52891](../allcas.js#L52891)), so any script loaded
after it can use `CWASA` directly.

## 3. The public JS API

Everything our own code calls lives on the global `CWASA` object, assigned
in one place near the end of the file
([allcas.js:53204-53210](../allcas.js#L53204-L53210)):

```js
this.CWASA.init       = cwasaInit;
this.CWASA.playSiGMLURL = playSiGMLURL;
this.CWASA.playSiGMLText = playSiGMLText;
this.CWASA.stopSiGML   = stopSiGML;
this.CWASA.getLogger   = getLogger;
this.CWASA.addHook     = Logger.addHook;
this.CWASA.callHook    = Logger.callHook;
```

(`CWASA.ready` is also set, as a Promise — see below.)

### `CWASA.init(config?)`

Bootstraps everything: loads configuration, scans the page for avatar
panels, creates them, and starts loading the initial avatar model.
Returns a Promise, which is also stashed as `CWASA.ready`
([allcas.js:53044-53081](../allcas.js#L53044-L53081)).

Call it with **an object, even an empty one** — not with no argument at
all. Internally, `initCfg == null` is used to decide whether to try
auto-loading a `cwaclientcfg.json` file from the page's own directory
([allcas.js:53393-53398](../allcas.js#L53393-L53398)); passing `{}`
avoids a pointless 404 for apps like this one that don't use that file.

```js
CWASA.init({});
```

You can also pass real configuration here — see [§5](#5-configuration-reference).

### `CWASA.ready`

A Promise that resolves once the avatar panel(s) have been created and
the initial avatar has started loading. Don't call `playSiGMLText` before
this resolves.

```js
CWASA.ready.then(() => {
    playBtn.disabled = false;
});
```

### `CWASA.playSiGMLText(sigmlText, avIndex = 0)`

Parses and animates a SiGML string directly — this is what our "Animate"
button calls. It auto-detects whether the text is Gestural or H-SiGML by
checking for the substring `"hns_sign"`
([allcas.js:51443](../allcas.js#L51443)) and runs it through the
HamNoSys→Gestural converter first if so — you don't need to tell it which
dialect you're passing.

```js
CWASA.playSiGMLText(sigmlInput.value, 0);
```

### `CWASA.playSiGMLURL(sigmlURL, avIndex = 0)`

Fetches a `.sigml` file and plays it. The URL is resolved against the
avatar's configured `sigmlBase` (which defaults to the remote UEA
server's `sigml/` directory — see [§5](#5-configuration-reference)), so a
bare filename like `"iTakeMug.sigml"` works without a full URL if you
haven't overridden `sigmlBase`.

```js
CWASA.playSiGMLURL("iTakeMug.sigml", 0);
```

We don't use this in the app — instead we `fetch()` the example files
ourselves and load the text into the textarea, so the SiGML is visible
and editable before playing. See `loadExample()` in [`app.js`](../app.js).

### `CWASA.stopSiGML(avIndex = 0)`

Halts playback immediately.

### `CWASA.addHook(type, fn, avIndex = "*")` / `CWASA.callHook(type, msg, avIndex)`

CWASA's internal event bus. `addHook` registers a callback; `callHook` is
how CWASA itself fires events (you generally only call `addHook`). The
callback receives a single `evt` object shaped `{ typ, msg, av }`
([allcas.js:1185-1191](../allcas.js#L1185-L1191)).

| Hook type | Fires when | `evt.msg` shape |
|---|---|---|
| `"status"` | Any human-readable status/progress/error message | string |
| `"avatarloading"` | A new avatar model has started loading | avatar name (string) |
| `"avatarloaded"` | The avatar model finished loading | avatar name (string) or `null` on failure |
| `"sigmlloading"` | A SiGML text/URL has started being parsed | `null` |
| `"sigmlloaded"` | Parsing finished | `{ s: signCount, f: frameCount }`, or `null` if abandoned |
| `"animactive"` | Playback has started | `null` |
| `"animidle"` | Playback has stopped (finished, or stopped) | `null` |
| `"avatarframe"` | Every frame during playback | `{ s: signIndex, f: frameIndex }` |
| `"avatarsign"` | A new sign starts being performed | `{ g: gloss, ... }` |
| `"avatarfps"` | Frame rate updates | number |

This app registers hooks for `"status"`, `"animactive"`, and `"animidle"`
in [`app.js`](../app.js) to drive the status log and enable/disable the
Animate/Stop buttons. Example:

```js
CWASA.addHook("status", (evt) => log(evt.msg), 0);
CWASA.addHook("avatarsign", (evt) => log("Signing: " + evt.msg.g), 0);
```

The `avIndex` filter matches CWASA's internal `av${N}` panel numbering —
`0` is the first (and in this app, only) avatar panel.

## 4. The stock-component mechanism

Some controls the official demo offers — switching avatars, toggling
ambient idle motion, adjusting playback speed, pausing/resuming mid-sign,
and stepping frame-by-frame — are **not** on the public `CWASA` object at
all. They only exist as internal wiring inside CWASA's `AvatarGUI` class.

The way to reach them is architectural rather than API-based: CWASA scans
the page, at `init()` time, for specific CSS class names and auto-injects
working HTML controls into whatever element carries that class, already
wired up to itself ([allcas.js:52344-52399](../allcas.js#L52344-L52399)).
You just need the placeholder in your HTML *before* `CWASA.init()` runs.

This app uses:

| Class (on `av0`) | Renders |
|---|---|
| `CWASAAvMenu` | Avatar picker `<select>` (anna/marc/francoise) |
| `CWASAAmbBox` | Ambient idle-motion checkbox |
| `CWASASpeed` | Log₂ speed control: text readout + `-`/`+`/Reset buttons |
| `CWASAPlayExtra` | Suspend / Resume buttons (pause mid-performance) |
| `CWASAFrames` | `-1` / `+1` frame-step buttons |
| `CWASAProgress` | Live sign/frame index, current gloss, FPS readout |

We deliberately skip `CWASAStatus` (a single self-overwriting status text
field) since our own scrolling `#statusLog`, driven by the `"status"`
hook, already covers that and keeps history.

All of these self-wire independently and listen on the same event bus as
our custom Animate/Stop buttons, so e.g. Suspend/Resume/frame-step
correctly enable and disable in sync with playback even though we start
playback through `CWASA.playSiGMLText()` rather than CWASA's own
(unused, in this app) Play button
([allcas.js:52407-52515](../allcas.js#L52407-L52515)).

Other placeholders exist that this app doesn't use — `CWASASiGMLURL` and
`CWASASiGMLText` (a stock URL field / textarea + Play buttons) and
`CWASAStatus`. We use our own textarea/buttons instead so the Examples
dropdown can populate the textarea, and so submission goes through the
public API directly.

## 5. Configuration reference

`CWASA.init(config)` accepts an object whose most useful fields live
under `avSettings` (an array, one entry per avatar panel — panel `0` uses
`avSettings[0]`). Defaults, from
[`Config.load`](../allcas.js#L5296-L5323):

| Field | Default | Meaning |
|---|---|---|
| `width` / `height` | `384` / `320` | Avatar canvas size (CSS also affects this — our `.avatar-wrap` sets 400×400) |
| `initAv` | `"anna"` | Avatar shown on load |
| `avList` | `"avs"` | Name of the top-level config key listing selectable avatars |
| `initCamera` | `[0, 0.23, 3.24, 5, 18, 30, -1, -1]` | Initial camera pose |
| `initSpeed` | `0` | Initial log₂ speed offset |
| `rateSpeed` | `5` | Speed-control step granularity |
| `allowFrameSteps` | `true` | Whether frame-step buttons are generated |
| `initSiGMLURL` | `"iTakeMug.sigml"` | Default value for the stock SiGML-URL field (unused here) |
| `allowSiGMLText` | `true` | Whether the stock SiGML-text field is generated |

Top-level (outside `avSettings`):

| Field | Default | Meaning |
|---|---|---|
| `jasBase` | `https://vhg.cmp.uea.ac.uk/tech/jas/vhg2026/` | Base URL for everything else below, when not set explicitly |
| `avs` | `["anna", "marc", "francoise"]` | The avatar list `avList` points at |
| `sigmlBase` | `jasBase + "sigml/"` | Where `playSiGMLURL` resolves bare filenames against |
| `avJARBase` / `avBase` | `jasBase + "avatars/"` | Where avatar 3D models are fetched from |
| `ambMode` / `ambIdle` / `ambSign` | `"full"` / `true` / `false` | Ambient (idle fidget) motion behaviour |

We call `CWASA.init({})` — i.e. we don't override any of these — so the
app relies entirely on the defaults, including pulling avatar models and
example SiGML from the live UEA server (confirmed to allow cross-origin
requests: `Access-Control-Allow-Origin: *`). This means **the app needs
internet access** to actually render an avatar, even though our own
example files are vendored locally.

## 6. SiGML primer

A SiGML document is `<sigml>` wrapping one or more signs:

```xml
<?xml version="1.0" encoding="utf-8"?>
<sigml>
  <hamgestural_sign gloss="mug">
    ...
  </hamgestural_sign>
</sigml>
```

### Gestural SiGML (`hamgestural_sign`)

Directly describes a sign as hand configuration + location + motion.
From [`examples/iTakeMug.sigml`](../examples/iTakeMug.sigml):

```xml
<hamgestural_sign gloss="mug">
  <sign_nonmanual>
    <mouthing_tier><mouth_picture picture="mVg"/></mouthing_tier>
  </sign_nonmanual>
  <sign_manual>
    <handconfig handshape="fist" thumbpos="across"/>
    <handconfig extfidir="ol"/>
    <handconfig palmor="l"/>
    <location_bodyarm location="shoulders"/>
    <par_motion>
      <directedmotion direction="u" curve="u"/>
      <tgt_motion>
        <changeposture/>
        <handconfig extfidir="ul" palmor="dl"/>
      </tgt_motion>
    </par_motion>
  </sign_manual>
</hamgestural_sign>
```

`gloss` is just a human-readable label (shown live in the Progress
readout while it plays). `sign_manual` is the hand/arm description;
`sign_nonmanual` covers mouth shape and other non-manual features.

### H-SiGML (`hns_sign`)

Derived from HamNoSys notation — a more compact, symbol-based encoding.
From [`examples/scotland-H.sigml`](../examples/scotland-H.sigml):

```xml
<hns_sign gloss="SCOTLAND-new">
  <hamnosys_nonmanual>
    <hnm_mouthpicture picture="skQtl@nd"/>
  </hamnosys_nonmanual>
  <hamnosys_manual>
    <hamfist/>
    <hamthumbacrossmod/>
    <hamextfingero/>
    ...
  </hamnosys_manual>
</hns_sign>
```

`CWASA.playSiGMLText` detects `"hns_sign"` in the text and runs it
through an in-browser HamNoSys→Gestural converter before animating
([allcas.js:51443-51461](../allcas.js#L51443-L51461)) — you can pass
either dialect to the same function.

### `<signing_ref>` — not supported by this player

Some SiGML files (see `examples/ref-ref.sigml` and
`examples/signing-ref-local-test.sigml`) use a `<signing_ref uri="..."/>`
element to compose a performance out of other SiGML files, rather than
containing signs directly. **This app's runtime does not process that
element at all** — a text-wide search of `allcas.js` finds no handling
for it. Playing one of these files directly will report "no valid signs"
rather than animate anything; they're included in the example corpus for
reference (and because the wiki documents the mechanism), not as working
demos. To see their content animate, play the *referenced* files
(`scotland-H.sigml`, `blenderStory.sigml`) directly instead.

## 7. Examples catalog

All vendored from `https://vhg.cmp.uea.ac.uk/tech/jas/vhg2026/sigml/`
into [`examples/`](../examples/):

| File | Dialect | Plays in this app? | Notes |
|---|---|---|---|
| `iTakeMug.sigml` | Gestural | Yes | 3 signs: "mug", "take", "i". Default example on load. |
| `scotland-H.sigml` | H-SiGML | Yes | Single sign, "SCOTLAND-new", authored in HamNoSys. |
| `blenderStory.sigml` | Gestural | Yes | Longer multi-sign story, ~11KB. |
| `welkom-ngt.sigml` | Gestural | Yes | Long Dutch (NGT) welcome message, ~51KB. |
| `ref-ref.sigml` | — | No | `<signing_ref>` chain referencing the two files below; see [§6](#signing_ref--not-supported-by-this-player). |
| `signing-ref-local-test.sigml` | — | No | `<signing_ref>` referencing `scotland-H.sigml` twice; same caveat. |

## 8. Resources

- [Official CWASA demo page](https://vhg.cmp.uea.ac.uk/tech/jas/vhg2026/CWASA-plus-gui-elements.html) — the page this app's `allcas.js` was originally pulled from.
- [Configuring CWASA for HTML5 web pages](https://vh.cmp.uea.ac.uk/index.php/Configuring_CWASA_for_HTML5_web_pages) — official setup docs (script/CSS includes, class names, config object).
- [CWA Signing Avatars overview](https://vh.cmp.uea.ac.uk/index.php/CWA_Signing_Avatars) — top-level project page, links to release notes, local install instructions, logging/event hooks.
- [SiGML Tools](https://vh.cmp.uea.ac.uk/index.php/SiGML_Tools) — tools for *authoring* new SiGML by hand: the eSIGN Editor and Ham2HPSG (HamNoSys entry + animation), a HamNoSys Unicode font, and pointers to the DGS Corpus project for existing sign-language corpora.
- [`https://vhg.cmp.uea.ac.uk/tech/jas/vhg2026/sigml/`](https://vhg.cmp.uea.ac.uk/tech/jas/vhg2026/sigml/) — the live directory our `examples/` files were copied from, in case more get added.
