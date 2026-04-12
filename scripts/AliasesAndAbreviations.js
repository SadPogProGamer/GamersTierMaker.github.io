// AliasesAndAbreviations.js
// Centralized alias + abbreviation maps used across SearchFunction.js and Commands.js
// Safe, normalized, and easy to extend.

// ---- GAME NAME ABBREVIATIONS ----
// Used in SearchFunction.js (matchesAliasQuery)
const abbreviationsMap = {
  "gta": "grand theft auto",
  "rdr": "red dead redemption",
  "cod": "call of duty",
  "ac": "assassin's creed",
  "botw": "breath of the wild",
  "totk": "tears of the kingdom",
  "sm": "spider man",
  "gow": "god of war",
  "tlou": "the last of us",
  "hl": "half life",
  "tf2": "team fortress 2",
  "cs": "counter strike",
  "csgo": "counter strike global offensive",
  "mc": "minecraft",
  "pkmn": "pokemon",
  "ff": "final fantasy",
  "mgs": "metal gear solid",
  "re": "resident evil",
  "dmc": "devil may cry",
  "kh": "kingdom hearts",
  "bf": "battlefield",
  "nfs": "need for speed",
};

// ---- PLATFORM ALIASES ----
// Used in GameDetails.js + Commands.js
const platformAliases = {
  "pc": ["pc"],
  "computer": ["pc"],

  "ps1": ["playstation 1"],
  "ps2": ["playstation 2"],
  "ps3": ["playstation 3"],
  "ps4": ["playstation 4"],
  "ps5": ["playstation 5"],

  "xbox": ["xbox"],
  "x360": ["xbox 360"],
  "xone": ["xbox one"],
  "xsx": ["xbox series x/s"],

  "switch": ["nintendo switch"],
  "switch2": ["nintendo switch 2"],

  "gba": ["game boy advance"],
  "gb": ["game boy"],
  "gbc": ["game boy color"],
  "ds": ["nintendo ds"],
  "3ds": ["nintendo 3ds"],

  "wii": ["nintendo wii"],
  "wiiu": ["nintendo wii u"],

  "gc": ["gamecube"],
  "n64": ["nintendo 64"],

  "psp": ["playstation portable"],
  "vita": ["playstation vita"],

  "vr": ["meta quest 2", "meta quest 3", "valve index"],

  "mobile": ["mobile"],
};

// ---- PLATFORM ABBREVIATIONS ----
// Short → normalized key before alias expansion
const platformAbbreviationsMap = {
  "ps": "ps1",
  "playstation": "ps1",
  "xb": "xbox",
};

// ---- DEVELOPER ABBREVIATIONS ----
const developerAbbreviationsMap = {
  "r*": "rockstar",
  "rs": "rockstar",
  "cdpr": "cd projekt red",
  "valve": "valve",
  "ea": "electronic arts",
  "ubisoft": "ubisoft",
  "nintendo": "nintendo",
  "square": "square enix",
  "se": "square enix",
};

// ---- CATEGORY ALIASES (FOR PLATFORM SEARCH UI) ----
const categoryAliases = {
  "pc": "PC",
  "console": "Console",
  "handheld": "Handhelds",
  "emulator": "Emulators",
  "vr": "VR",
  "mobile": "Mobile",
};

// ---- OPTIONAL HELPERS (SAFE GLOBAL UTILS) ----
function normalizeAliasValue(value) {
  return String(value || "").toLowerCase().trim();
}

function resolvePlatformAlias(input) {
  const normalized = normalizeAliasValue(input);

  const abbrev = platformAbbreviationsMap[normalized] || normalized;
  const alias = platformAliases[abbrev];

  if (!alias) return [abbrev];
  return Array.isArray(alias) ? alias : [alias];
}

function resolveDeveloperAlias(input) {
  const normalized = normalizeAliasValue(input);
  return developerAbbreviationsMap[normalized] || normalized;
}