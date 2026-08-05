// Commands.js
// Handles slash-command suggestions, command filtering, and count badge helpers.
// ADDED: /GameType and /ExcludeGameType commands with multi-select support
// FIXED: Search dropdown shows all commands when typing "/"

const SEARCH_COMMANDS = {
  "/Platform": "Show games with specific platform",
  "/DateBeaten": "Show games with specific date beaten",
  "/Completion": "Show games with specific completion status",
  "/NoName": "Show games with no name",
  "/NoDate": "Show games with no date",
  "/NoDescription": "Show games with no description",
  "/NoPlatform": "Show games with no platform",
  "/NoDeveloper": "Show games with no developer",
  "/NoStatus": "Show games with no status",
  "/Developer": "Search by developer name (e.g. /Developer Rockstar)",
  "/ShowAmount": "Show number of images in each tier (can combine with other commands or search)",
  "/Exclude": "Hide games whose name contains the given text (e.g. /Exclude Mario)",
  "/GameType": "Show games with specific game type: Original Game, Romhack, Fan Game, Fan Port, Mod (e.g. /GameType Romhack)",
  "/ExcludeGameType": "Hide games with specific game type: Original Game, Romhack, Fan Game, Fan Port, Mod (e.g. /ExcludeGameType Mod)",
};

// GAME_TYPES is defined in GameDetails.js - use it globally
// No need to redeclare it here

let searchCommandHighlightedIndex = -1;

function commandsLogError(context, err) {
  console.error(`[Commands] ${context}`, err);
}

function getSearchCommandsDropdown() {
  return document.getElementById("search-commands-dropdown");
}

function getSearchInputForCommands() {
  return document.getElementById("search-input");
}

function normalizeCommandText(value) {
  return String(value || "").trim().toLowerCase();
}

function getFilteredSearchCommands(query) {
  const normalized = normalizeCommandText(query);
  
  // If the query is just "/" or empty, return all commands
  if (normalized === "/" || normalized === "") {
    return Object.keys(SEARCH_COMMANDS);
  }
  
  return Object.keys(SEARCH_COMMANDS).filter((cmd) => {
    return cmd.toLowerCase().includes(normalized);
  });
}

function highlightSearchCommand(dropdown, index) {
  if (!dropdown) return;

  const items = dropdown.querySelectorAll(".search-command-item");
  items.forEach((item) => item.classList.remove("selected"));

  if (index >= 0 && index < items.length) {
    items[index].classList.add("selected");
    items[index].scrollIntoView({ block: "nearest" });
    searchCommandHighlightedIndex = index;
  } else {
    searchCommandHighlightedIndex = -1;
  }
}

function selectHighlightedSearchCommand() {
  const dropdown = getSearchCommandsDropdown();
  if (!dropdown) return;

  const items = dropdown.querySelectorAll(".search-command-item");
  if (searchCommandHighlightedIndex >= 0 && searchCommandHighlightedIndex < items.length) {
    items[searchCommandHighlightedIndex].click();
  }
}

function hideSearchCommandsDropdown() {
  const dropdown = getSearchCommandsDropdown();
  if (!dropdown) return;
  dropdown.classList.add("hidden");
  searchCommandHighlightedIndex = -1;
}

function applySearchCommand(command) {
  const input = getSearchInputForCommands();
  const dropdown = getSearchCommandsDropdown();
  if (!input || !dropdown) return;

  const currentValue = input.value || "";
  const lastSlashIndex = currentValue.lastIndexOf("/");

  if (lastSlashIndex >= 0) {
    const beforePartial = currentValue.substring(0, lastSlashIndex);
    input.value = `${beforePartial}${command}`;
  } else {
    input.value = command;
  }

  if (typeof filterImages === "function") {
    filterImages(input.value);
  }

  dropdown.classList.add("hidden");
  searchCommandHighlightedIndex = -1;
}

function createSearchCommandItem(command, index, dropdown) {
  const item = document.createElement("div");
  item.className = "search-command-item";
  item.dataset.index = String(index);

  const nameDiv = document.createElement("div");
  nameDiv.className = "search-command-name";
  nameDiv.textContent = command;

  const descDiv = document.createElement("div");
  descDiv.className = "search-command-desc";
  descDiv.textContent = SEARCH_COMMANDS[command];

  item.appendChild(nameDiv);
  item.appendChild(descDiv);

  item.addEventListener("click", () => applySearchCommand(command));
  item.addEventListener("mouseover", () => {
    highlightSearchCommand(dropdown, index);
  });

  return item;
}

function showSearchCommandsDropdown(searchQuery, dropdown = getSearchCommandsDropdown()) {
  if (!dropdown) return;

  const filteredCommands = getFilteredSearchCommands(searchQuery);
  dropdown.replaceChildren();

  if (!filteredCommands.length) {
    dropdown.classList.add("hidden");
    searchCommandHighlightedIndex = -1;
    return;
  }

  filteredCommands.forEach((command, index) => {
    dropdown.appendChild(createSearchCommandItem(command, index, dropdown));
  });

  dropdown.classList.remove("hidden");
  highlightSearchCommand(dropdown, 0);
}

function handleSearchInput(searchQuery) {
  const dropdown = getSearchCommandsDropdown();
  if (!dropdown) return;

  const trimmedQuery = String(searchQuery || "").trim();
  const lastSlashIndex = trimmedQuery.lastIndexOf("/");

  // If there's a slash in the query, show command suggestions
  if (lastSlashIndex >= 0) {
    const partialCommand = trimmedQuery.substring(lastSlashIndex);
    // If the partial is just "/" or starts with "/", show all commands or filtered
    showSearchCommandsDropdown(partialCommand, dropdown);
  } else {
    // No slash, hide the dropdown
    dropdown.classList.add("hidden");
    searchCommandHighlightedIndex = -1;
  }
}

function mapPlatformCommandAlias(value) {
  let platformQuery = normalizeCommandText(value);

  if (typeof platformAbbreviationsMap !== "undefined" && platformAbbreviationsMap[platformQuery]) {
    platformQuery = normalizeCommandText(platformAbbreviationsMap[platformQuery]);
  }

  if (typeof platformAliases !== "undefined" && platformAliases[platformQuery]) {
    const aliasValue = platformAliases[platformQuery];
    const aliasArray = Array.isArray(aliasValue) ? aliasValue : [aliasValue];
    return aliasArray.map((entry) => normalizeCommandText(entry));
  }

  return [platformQuery];
}

function mapDeveloperCommandAlias(value) {
  let developerQuery = normalizeCommandText(value);

  if (typeof developerAbbreviationsMap !== "undefined" && developerAbbreviationsMap[developerQuery]) {
    developerQuery = normalizeCommandText(developerAbbreviationsMap[developerQuery]);
  }

  return developerQuery;
}

function parseGameTypeQuery(value) {
  const normalized = normalizeCommandText(value);
  // Use the global GAME_TYPES from GameDetails.js
  const gameTypes = typeof GAME_TYPES !== 'undefined' ? GAME_TYPES : ["Original Game", "Romhack", "Fan Game", "Fan Port", "Mod"];
  const matchingTypes = gameTypes.filter(type => 
    normalizeCommandText(type).includes(normalized) || 
    normalized.includes(normalizeCommandText(type))
  );
  return matchingTypes;
}

function parseGameTypeList(query) {
  // Parse comma-separated list of game types
  const parts = query.split(',').map(s => s.trim());
  const result = [];
  for (const part of parts) {
    if (!part) continue;
    const matches = parseGameTypeQuery(part);
    for (const match of matches) {
      if (!result.includes(match)) {
        result.push(match);
      }
    }
  }
  return result;
}

function processCommandFilter(filteredQuery, imageName, imagePlatform, imageDescription, imageDate, imageStatus, imageDeveloper, imageGameType, imageOriginalGame) {
  const command = normalizeCommandText(filteredQuery);
  const normalizedName = String(imageName || "").trim();
  const normalizedPlatform = normalizeCommandText(imagePlatform);
  const normalizedDescription = String(imageDescription || "").trim();
  const normalizedDate = String(imageDate || "").trim();
  const normalizedStatus = String(imageStatus || "").trim();
  const normalizedDeveloper = normalizeCommandText(imageDeveloper);
  const normalizedGameType = String(imageGameType || "").trim();
  const normalizedOriginalGame = String(imageOriginalGame || "").trim();

  if (!command) return true;

  if (command.startsWith("/platform")) {
    if (command === "/platform") {
      return normalizedPlatform !== "";
    }

    if (command.startsWith("/platform ")) {
      const rawPlatformQuery = command.substring("/platform ".length).trim();
      const candidateQueries = mapPlatformCommandAlias(rawPlatformQuery);
      return candidateQueries.some((candidate) => candidate && normalizedPlatform.includes(candidate));
    }
  }

  if (command.startsWith("/datebeaten")) {

  // Just "/DateBeaten"
  if (command === "/datebeaten") {
    return normalizedDate !== "";
  }

  // "/DateBeaten something"
  if (command.startsWith("/datebeaten ")) {
    const dateQuery = command
      .substring("/datebeaten ".length)
      .trim()
      .toLowerCase();

    return normalizedDate.toLowerCase().includes(dateQuery);
  }
}

if (command.startsWith("/completion")) {

  // Just "/Completion"
  if (command === "/completion") {
    return normalizedStatus !== "";
  }

  // "/Completion something"
  if (command.startsWith("/completion ")) {

    const statusQuery = command
      .substring("/completion ".length)
      .trim()
      .toLowerCase();

    return normalizedStatus.toLowerCase().includes(statusQuery);
  }
}

  if (command === "/noname") {
    return normalizedName === "";
  }

  if (command === "/nodate") {
    return normalizedDate === "";
  }

  if (command === "/nodescription") {
    return normalizedDescription === "";
  }

  if (command === "/noplatform") {
    return normalizedPlatform === "";
  }

  if (command === "/nodeveloper") {
    return normalizedDeveloper === "";
  }

  if (command === "/nostatus") {
    return normalizedStatus === "";
  }

  if (command.startsWith("/developer ")) {
    const rawDeveloperQuery = command.substring("/developer ".length).trim();
    const developerQuery = mapDeveloperCommandAlias(rawDeveloperQuery);
    return developerQuery ? normalizedDeveloper.includes(developerQuery) : true;
  }

if (command.startsWith("/exclude")) {

  // Just "/Exclude"
  if (command === "/exclude") {
    return true;
  }

  // "/Exclude something"
  if (command.startsWith("/exclude ")) {
    const excludeQuery = command
      .substring("/exclude ".length)
      .trim()
      .toLowerCase();

    return !normalizedName.toLowerCase().includes(excludeQuery);
  }
}

  // NEW: /GameType command - show games with specific game type
  if (command.startsWith("/gametype")) {
    if (command === "/gametype") {
      return normalizedGameType !== "";
    }

    if (command.startsWith("/gametype ")) {
      const rawGameTypeQuery = command.substring("/gametype ".length).trim();
      const gameTypes = parseGameTypeList(rawGameTypeQuery);
      if (gameTypes.length === 0) return true;
      return gameTypes.some(type => 
        normalizeCommandText(normalizedGameType) === normalizeCommandText(type)
      );
    }
  }

  // NEW: /ExcludeGameType command - hide games with specific game type
  if (command.startsWith("/excludegametype")) {
    if (command === "/excludegametype") {
      return true;
    }

    if (command.startsWith("/excludegametype ")) {
      const rawExcludeQuery = command.substring("/excludegametype ".length).trim();
      const excludeTypes = parseGameTypeList(rawExcludeQuery);
      if (excludeTypes.length === 0) return true;
      return !excludeTypes.some(type => 
        normalizeCommandText(normalizedGameType) === normalizeCommandText(type)
      );
    }
  }

  return true;
}

function updateTierCounts(show) {
  const rows = document.querySelectorAll(".row");

  rows.forEach((row) => {
    const label = row.querySelector(".tier-label");
    const tierContainer = row.children?.[1];
    if (!label || !tierContainer) return;

    let badge = label.querySelector(".tier-count");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "tier-count";
      label.insertBefore(badge, label.firstChild);
    }

    const count = Array.from(tierContainer.querySelectorAll(".image")).filter(
      (img) => img.style.display !== "none"
    ).length;

    badge.textContent = String(count);
    badge.style.display = show ? "block" : "none";
  });

  try {
    const totalEl = document.getElementById("total-count");
    if (totalEl) {
      const total = Array.from(document.querySelectorAll(".row .image")).filter(
        (img) => img.style.display !== "none"
      ).length;
      totalEl.textContent = `Total: ${total}`;
      totalEl.style.display = show ? "" : "none";
    }
  } catch (err) {
    commandsLogError("Failed updating total search count.", err);
  }
}

function countsAreShown() {
  try {
    const totalEl = document.getElementById("total-count");
    if (totalEl && window.getComputedStyle(totalEl).display !== "none") return true;

    const badge = document.querySelector(".tier-count");
    if (badge && window.getComputedStyle(badge).display !== "none") return true;
  } catch (err) {
    commandsLogError("Failed checking count visibility.", err);
  }

  return false;
}

function bindSearchCommandKeyboardNavigation() {
  const searchInputElement = getSearchInputForCommands();
  if (!searchInputElement) return;

  searchInputElement.addEventListener("keydown", (event) => {
    const dropdown = getSearchCommandsDropdown();
    if (!dropdown || dropdown.classList.contains("hidden")) return;

    const items = dropdown.querySelectorAll(".search-command-item");
    if (!items.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = Math.min(searchCommandHighlightedIndex + 1, items.length - 1);
      highlightSearchCommand(dropdown, next);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const prev = Math.max(searchCommandHighlightedIndex - 1, 0);
      highlightSearchCommand(dropdown, prev);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      selectHighlightedSearchCommand();
      return;
    }

    if (event.key === "Escape") {
      dropdown.classList.add("hidden");
      searchCommandHighlightedIndex = -1;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindSearchCommandKeyboardNavigation();
});