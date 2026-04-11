// Commands.js
// Handles slash-command suggestions and command filter processing.

// Search commands (ordered to match game details modal: Name, Date, Description, Platform, Status)
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
  "/Developer": "Search by developer name (e.g., /Developer Rockstar)",
  "/ShowAmount": "Show number of images in each tier (can combine with other commands or search)"
};

let searchCommandHighlightedIndex = -1;

const abbreviationsMap = {
  "gta": "grand theft auto",
  "rdr": "red dead redemption",
  "ac": "assassin's creed",
  "cod": "call of duty",
  "mw": "modern warfare",
  "bc": "battlefield",
  "halo": "halo",
  "doom": "doom",
  "tlou": "last of us",
  "ff": "final fantasy",
  "dq": "dragon quest",
  "dw": "dynasty warriors",
  "mg": "metal gear",
  "mgs": "metal gear solid",
  "re": "resident evil",
  "sf": "street fighter",
  "mk": "mortal kombat",
  "smash": "super smash bros",
  "mario": "mario",
  "zelda": "legend of zelda",
  "pokemon": "pokemon",
  "mc": "minecraft",
  "ow": "overwatch",
  "lol": "league of legends",
  "dota": "dota 2",
  "cs": "counter strike",
  "hl": "half life",
  "l4d": "left 4 dead",
  "tf": "team fortress",
  "tes": "elder scrolls",
  "oblivion": "elder scrolls oblivion",
  "skyrim": "elder scrolls skyrim",
  "witcher": "witcher",
  "rp": "road rash",
  "gow": "god of war",
  "kh": "kingdom hearts",
  "dmc": "devil may cry",
  "persona": "persona",
  "smt": "shin megami tensei",
  "fire emblem": "fire emblem",
  "fe": "fire emblem",
  "uncharted": "uncharted",
  "gears": "gears of war",
  "hg": "hunger games",
  "twd": "walking dead",
  "vsmile": "v.smile"
};

const platformAbbreviationsMap = {
  "ps": "playstation",
  "ps1": "PlayStation 1",
  "ps2": "PlayStation 2",
  "ps3": "PlayStation 3",
  "ps4": "PlayStation 4",
  "ps5": "PlayStation 5",
  "psp": "PlayStation Portable",
  "psvr": "PlayStation VR",
  "psvr2": "PlayStation VR2"
};

const developerAbbreviationsMap = {
  "ea": "electronic arts",
  "ubi": "ubisoft",
  "ubisoft": "ubisoft",
  "nd": "naughty dog",
  "ndog": "naughty dog",
  "rockstar": "rockstar games",
  "rs": "rockstar games",
  "nintendo": "nintendo",
  "valve": "valve",
  "capcom": "capcom",
  "square": "square enix",
  "sqex": "square enix",
  "konami": "konami",
  "bethesda": "bethesda",
  "blizzard": "blizzard",
  "bungee": "bungie",
  "bungie": "bungie",
  "fromsoftware": "fromsoftware",
  "from": "fromsoftware"
};

function highlightSearchCommand(dropdown, index) {
  const items = dropdown.querySelectorAll('.search-command-item');
  items.forEach(it => it.classList.remove('selected'));
  if (index >= 0 && index < items.length) {
    items[index].classList.add('selected');
    items[index].scrollIntoView({ block: 'nearest' });
    searchCommandHighlightedIndex = index;
  } else {
    searchCommandHighlightedIndex = -1;
  }
}

function selectHighlightedSearchCommand() {
  const dropdown = document.getElementById('search-commands-dropdown');
  if (!dropdown) return;
  const items = dropdown.querySelectorAll('.search-command-item');
  if (searchCommandHighlightedIndex >= 0 && searchCommandHighlightedIndex < items.length) {
    items[searchCommandHighlightedIndex].click();
  }
}

function handleSearchInput(searchQuery) {
  const dropdown = document.getElementById("search-commands-dropdown");
  const trimmedQuery = searchQuery.trim();

  const lastSlashIndex = trimmedQuery.lastIndexOf("/");
  if (lastSlashIndex >= 0) {
    const partialCommand = trimmedQuery.substring(lastSlashIndex);
    showSearchCommandsDropdown(partialCommand, dropdown);
  } else {
    dropdown.classList.add("hidden");
  }
}

function showSearchCommandsDropdown(searchQuery, dropdown) {
  const query = searchQuery.toLowerCase().trim();
  const filteredCommands = Object.keys(SEARCH_COMMANDS).filter(cmd =>
    cmd.toLowerCase().includes(query) || query === "/"
  );

  dropdown.innerHTML = "";

  if (filteredCommands.length === 0) {
    dropdown.classList.add("hidden");
    return;
  }

  filteredCommands.forEach(command => {
    const item = document.createElement("div");
    item.className = "search-command-item";
    item.dataset.index = filteredCommands.indexOf(command);
    item.innerHTML = `<div class="search-command-name">${command}</div><div class="search-command-desc">${SEARCH_COMMANDS[command]}</div>`;
    item.onclick = () => {
      const input = document.getElementById("search-input");
      const currentValue = input.value;
      const lastSlashIndex = currentValue.lastIndexOf("/");
      if (lastSlashIndex >= 0) {
        const beforePartial = currentValue.substring(0, lastSlashIndex);
        input.value = beforePartial + command;
      } else {
        input.value = command;
      }
      filterImages(input.value);
      dropdown.classList.add("hidden");
    };
    item.addEventListener('mouseover', () => {
      highlightSearchCommand(dropdown, parseInt(item.dataset.index, 10));
    });
    dropdown.appendChild(item);
  });

  dropdown.classList.remove("hidden");
  highlightSearchCommand(dropdown, 0);
}

function processCommandFilter(filteredQuery, imageName, imagePlatform, imageDescription, imageDate, imageStatus, imageDeveloper) {
  let shouldShow = false;

  if (filteredQuery.startsWith("/platform")) {
    if (filteredQuery === "/platform") {
      shouldShow = imagePlatform && imagePlatform.toLowerCase().includes("console");
    } else if (filteredQuery.startsWith("/platform ")) {
      let platformQuery = filteredQuery.substring("/platform ".length).trim().toLowerCase();
      if (platformAbbreviationsMap[platformQuery]) {
        platformQuery = platformAbbreviationsMap[platformQuery].toLowerCase();
      }
      shouldShow = imagePlatform.toLowerCase().includes(platformQuery);
    }
  } else if (filteredQuery === "/datebeaten") {
    shouldShow = imageDate && imageDate.trim() !== "";
  } else if (filteredQuery === "/completion") {
    shouldShow = imageStatus && imageStatus.trim() !== "";
  } else if (filteredQuery === "/noname") {
    shouldShow = !imageName || imageName.trim() === "";
  } else if (filteredQuery === "/nodate") {
    shouldShow = !imageDate || imageDate.trim() === "";
  } else if (filteredQuery === "/nostatus") {
    shouldShow = !imageStatus || imageStatus.trim() === "";
  } else if (filteredQuery === "/noplatform") {
    shouldShow = !imagePlatform || imagePlatform.trim() === "";
  } else if (filteredQuery === "/nodescription") {
    shouldShow = !imageDescription || imageDescription.trim() === "";
  } else if (filteredQuery === "/nodeveloper") {
    shouldShow = !imageDeveloper || imageDeveloper.trim() === "";
  } else if (filteredQuery.startsWith("/developer ")) {
    let developerQuery = filteredQuery.substring("/developer ".length).trim().toLowerCase();
    if (developerAbbreviationsMap[developerQuery]) {
      developerQuery = developerAbbreviationsMap[developerQuery].toLowerCase();
    }
    shouldShow = imageDeveloper.toLowerCase().includes(developerQuery);
  } else {
    shouldShow = true;
  }

  return shouldShow;
}

// Keyboard navigation for command dropdown
document.addEventListener("DOMContentLoaded", function() {
  const searchInputElement = document.getElementById('search-input');
  if (searchInputElement) {
    searchInputElement.addEventListener('keydown', (e) => {
      const dropdown = document.getElementById('search-commands-dropdown');
      if (!dropdown || dropdown.classList.contains('hidden')) return;

      const items = dropdown.querySelectorAll('.search-command-item');
      if (!items || items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(searchCommandHighlightedIndex + 1, items.length - 1);
        highlightSearchCommand(dropdown, next);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = Math.max(searchCommandHighlightedIndex - 1, 0);
        highlightSearchCommand(dropdown, prev);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectHighlightedSearchCommand();
      } else if (e.key === 'Escape') {
        dropdown.classList.add('hidden');
      }
    });
  }
});
