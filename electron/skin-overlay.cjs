// The native chrome CSS cannot reach (the Windows caption-button overlay accepts no alpha, so opaque hex).
// Keep in step with src/styles.css and src/lib/skins.ts.
"use strict";

const SKIN_CHROME = Object.freeze({
  pop: Object.freeze({ color: "#fdf5ea", symbolColor: "#3a322d" }),
  cyberpop: Object.freeze({ color: "#13101c", symbolColor: "#c8bde3" }),
  comic: Object.freeze({ color: "#f7f4ed", symbolColor: "#3e3b38" }),
  clay: Object.freeze({ color: "#f0edf9", symbolColor: "#494164" }),
  blueprint: Object.freeze({ color: "#0a2238", symbolColor: "#bae6fd" }),
  arcade: Object.freeze({ color: "#17161c", symbolColor: "#d6d2e6" }),
  outrun: Object.freeze({ color: "#140a24", symbolColor: "#e0b0ff" }),
  gameboy: Object.freeze({ color: "#c8e830", symbolColor: "#0f380f" }),
  manga: Object.freeze({ color: "#0c0c10", symbolColor: "#c8c8d4" }),
  terminal: Object.freeze({ color: "#060d08", symbolColor: "#00e65c" }),
  radar: Object.freeze({ color: "#051622", symbolColor: "#99f6e4" }),
  acid: Object.freeze({ color: "#0b1409", symbolColor: "#c2fcae" }),
  glitch: Object.freeze({ color: "#0a0a0f", symbolColor: "#ccd8f5" }),
  eldritch: Object.freeze({ color: "#08060e", symbolColor: "#d6c7f8" }),
  circus: Object.freeze({ color: "#fcf6ea", symbolColor: "#483a30" }),
  glitz: Object.freeze({ color: "#fbeaff", symbolColor: "#562775" }),
  midnight: Object.freeze({ color: "#070707", symbolColor: "#b5b5b5" }),
  graphite: Object.freeze({ color: "#111214", symbolColor: "#b3b8c2" }),
  meadow: Object.freeze({ color: "#ffffff", symbolColor: "#4d5a52" }),
  mocha: Object.freeze({ color: "#11111b", symbolColor: "#c1c7df" }),
  stealth: Object.freeze({ color: "#000000", symbolColor: "#bcc0cc" }),
  dracula: Object.freeze({ color: "#282a36", symbolColor: "#c6c9db" }),
  synthwave: Object.freeze({ color: "#201b2d", symbolColor: "#d5bfe8" }),
  vesper: Object.freeze({ color: "#101010", symbolColor: "#c0c0c0" }),
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
