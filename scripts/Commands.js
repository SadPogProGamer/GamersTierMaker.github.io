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

// Global helper: Update or create a small count badge left of each tier label
function updateTierCounts(show) {
  const rows = document.querySelectorAll('.row');
  rows.forEach((row) => {
    const label = row.querySelector('.tier-label');
    if (!label) return;
    let badge = label.querySelector('.tier-count');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'tier-count';
      // insert before the first child (so it appears left)
      label.insertBefore(badge, label.firstChild);
    }
    const count = Array.from(row.children[1].querySelectorAll('.image')).filter(img => img.style.display !== 'none').length;
    badge.textContent = count;
    badge.style.display = show ? 'block' : 'none';
  });
  // Also update total-count element if present
  try {
    const totalEl = document.getElementById('total-count');
    if (totalEl) {
      // Only count images in tier rows, exclude images in the lower bar
      const total = Array.from(document.querySelectorAll('.row .image')).filter(img => img.style.display !== 'none').length;
      totalEl.textContent = `Total: ${total}`;
      totalEl.style.display = show ? '' : 'none';
    }
  } catch (e) {
    // ignore
  }
}

// Returns true if tier counts or total-count are currently visible
function countsAreShown() {
  try {
    const totalEl = document.getElementById('total-count');
    if (totalEl && window.getComputedStyle(totalEl).display !== 'none') return true;
    const badge = document.querySelector('.tier-count');
    if (badge && window.getComputedStyle(badge).display !== 'none') return true;
  } catch (e) {
    // ignore
  }
  return false;
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
