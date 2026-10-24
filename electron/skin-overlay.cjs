// The native chrome CSS cannot reach (the Windows caption-button overlay accepts no alpha, so opaque hex).
// Keep in step with src/styles.css and src/lib/skins.ts.
"use strict";

const SKIN_CHROME = Object.freeze({
  pop: Object.freeze({ color: "#fdf5ea", symbolColor: "#3a322d" }),
  midnight: Object.freeze({ color: "#070707", symbolColor: "#b5b5b5" }),
  graphite: Object.freeze({ color: "#111214", symbolColor: "#b3b8c2" }),
  meadow: Object.freeze({ color: "#ffffff", symbolColor: "#4d5a52" }),
  mocha: Object.freeze({ color: "#11111b", symbolColor: "#c1c7df" }),
  stealth: Object.freeze({ color: "#000000", symbolColor: "#bcc0cc" }),
  dracula: Object.freeze({ color: "#282a36", symbolColor: "#c6c9db" }),
  "rose-pine": Object.freeze({ color: "#191724", symbolColor: "#c7c3df" }),
  synthwave: Object.freeze({ color: "#201b2d", symbolColor: "#d5bfe8" }),
  vesper: Object.freeze({ color: "#101010", symbolColor: "#c0c0c0" }),
  kanagawa: Object.freeze({ color: "#1f1f28", symbolColor: "#c8c4af" }),
  halloween: Object.freeze({ color: "#110d16", symbolColor: "#c2b3cc" }),
});

const DEFAULT_SKIN = "midnight";

function skinChrome(skin) {
  return Object.hasOwn(SKIN_CHROME, skin) ? SKIN_CHROME[skin] : SKIN_CHROME[DEFAULT_SKIN];
}

function isKnownSkin(skin) {
  return Object.hasOwn(SKIN_CHROME, skin);
}

module.exports = { SKIN_CHROME, DEFAULT_SKIN, skinChrome, isKnownSkin };
