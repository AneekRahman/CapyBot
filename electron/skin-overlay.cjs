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
