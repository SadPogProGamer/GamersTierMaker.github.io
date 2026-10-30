// GameDetails.js
// Handles the game details modal, platform picker, metadata management, and deleting a single image.
// ADDED: Game Type dropdown with Original Game, Romhack, Fan Game, Fan Port, Fan Remake, Mod options
// ADDED: Original Game text field that appears when non-Original Game type is selected

const platformOptions = {
  "PC": [
    "PC",
    "PC (Via Decompilation)",
    "PC (Via Recompilation)",
    "PC (Via Custom Emulator)"
  ],
  "Console": [
    "PlayStation 1",
    "PlayStation 2",
    "PlayStation 3",
    "PlayStation 4",
    "PlayStation 5",
    "Xbox",
    "Xbox 360",
    "Xbox One",
    "Xbox Series X/S",
    "NES",
    "SNES",
    "Nintendo 64",
    "GameCube",
    "GameCube (Via Backwards Compatibility)",
    "Nintendo Wii",
    "Nintendo Wii U",
    "Nintendo Switch",
    "Nintendo Switch (Via Backwards Compatibility)",
    "Nintendo Switch 2",
    "Sega Genesis",
    "Sega Saturn",
    "Sega Dreamcast",
    "Atari 2600",
    "Atari 5200",
    "Atari 7800",
    "Atari Jaguar",
    "V.Smile"
  ],
  "Handhelds": [
    "Game Boy",
    "Game Boy (Via Backwards Compatibility)",
    "Game Boy Color",
    "Game Boy Color (Via Backwards Compatibility)",
    "Game Boy Advance",
    "Nintendo DS",
    "Nintendo DS (Via Backwards Compatibility)",
    "Nintendo 3DS",
    "PlayStation Portable",
    "PlayStation Vita",
    "Sega Game Gear",
    "Atari Lynx",
    "Steam Deck"
  ],
  "Emulators": [
    "Snes9x (SNES)",
    "Mesen (NES)",
    "Visual Boy Advance (Game Boy Advance)",
    "MelonDS (Nintendo DS)",
    "Dolphin (GameCube)",
    "Dolphin (Wii)",
    "Citra (Nintendo 3DS)",
    "Cemu (Wii U)",
    "DuckStation (PS1)",
    "PCSX2 (PS2)",
    "RPCS3 (PS3)",
    "PPSSPP (PSP)",
    "Vita3K (PS Vita)",
    "Xemu (Xbox)",
    "Xenia (Xbox 360)",
    "Ryujinx (Switch)",
    "Yuzu (Switch)"
  ],
  "Nintendo Switch Online": [
    "NES (Nintendo Switch Online)",
    "SNES (Nintendo Switch Online)",
    "Nintendo 64 (Nintendo Switch Online)",
    "Sega Genesis (Nintendo Switch Online)",
    "Game Boy (Nintendo Switch Online)",
    "Game Boy Advance (Nintendo Switch Online)"
  ],
  "VR": [
    "Meta Quest 2",
    "Meta Quest 3",
    "Meta Quest Pro",
    "PlayStation VR",
    "PlayStation VR2",
    "HTC Vive",
    "HTC Vive Pro",
    "HTC Vive Cosmos",
    "Valve Index",
    "Oculus Rift",
    "Oculus Rift S"
  ],
  "Arcade": [
    "Arcade"
  ],
  "Mobile": [
    "Mobile"
  ]
};

const GAME_TYPES = ["Original Game", "Romhack", "Fan Game", "Fan Port", "Fan Remake", "Mod"];

let currentImageElement = null;
let currentSelectedPlatform = null;
let currentSelectedOriginalPlatform = null;
let currentHas100Replay = false;
let currentGameType = "Original Game";
let currentOriginalGame = "";
let currentOriginalDeveloper = "";
let modalBindingsInitialized = false;
let currentModalEscapeHandler = null;
let currentOriginalPublisher = "";

function gameDetailsLogError(context, err) {
  console.error(`[GameDetails] ${context}`, err);
}

function getModalElement() {
  return document.getElementById("image-modal");
}

function getField(id) {
  return document.getElementById(id);
}

function getCurrentImageId() {
  return currentImageElement?.dataset?.imageId || null;
}

function getSearchQueryValue() {
  return getField("search-input")?.value || "";
}

function buildCombinedDateFromDropdowns(monthId, yearId) {
  const month = (getField(monthId)?.value || "").trim();
  const year = (getField(yearId)?.value || "").trim();

  if (!month && !year) return "";
  if (!month) return year;
  if (!year) return month;
  return `${month} ${year}`;
}

function parseCombinedDate(combinedDate) {
  if (!combinedDate) return { month: "", year: "" };

  const trimmed = String(combinedDate).trim();

  // Drop stray placeholder words (e.g. a literal "Year" option label) so
  // they can never be mistaken for a month name.
  const parts = trimmed
    .split(/\s+/)
    .filter((part) => part && !/^(year|month)$/i.test(part));

  if (parts.length >= 2) {
    // Format: "June 2024" or similar
    return { month: parts[0], year: parts[1] };
  } else if (parts.length === 1) {
    // Could be just month or just year
    const firstPart = parts[0];
    if (/^\d{4}$/.test(firstPart)) {
      return { month: "", year: firstPart };
    } else {
      return { month: firstPart, year: "" };
    }
  }

  return { month: "", year: "" };
}

// Puts a "Year" placeholder option (value "") at the top of the year
// dropdowns, so an untouched year box reads as "Year" rather than silently
// showing the first real year. Skips any select that already has a
// blank-valued first option, relabelling it to "Year" instead of duplicating.
function ensureYearPlaceholderOptions() {
  ["image-date-year", "image-date-100-year"].forEach((id) => {
    const select = getField(id);
    if (!select) return;

    const firstOption = select.options && select.options[0];

    if (firstOption && firstOption.value === "") {
      if ((firstOption.textContent || "").trim() !== "Year") {
        firstOption.textContent = "Year";
      }
      return;
    }

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Year";
    select.insertBefore(placeholder, select.firstChild);
  });
}

function getCurrentMetadataFromForm() {
  const dateMonth = getField("image-date-month")?.value || "";
  const dateYear = getField("image-date-year")?.value || "";
  const date100Month = getField("image-date-100-month")?.value || "";
  const date100Year = getField("image-date-100-year")?.value || "";

  return {
    name: (getField("image-name")?.value || "").trim(),
    developer: (getField("image-developer")?.value || "").trim(),
    publisher: (getField("image-publisher")?.value || "").trim(),
    date: buildCombinedDateFromDropdowns("image-date-month", "image-date-year"),
    date100: buildCombinedDateFromDropdowns("image-date-100-month", "image-date-100-year"),
    description: (getField("image-description")?.value || "").trim(),
    status: getField("image-status")?.value || "",
    platform: currentSelectedPlatform || null,
    originalPlatform: shouldUseOriginalPlatform() ? (currentSelectedOriginalPlatform || null) : null,
    has100Replay: !!currentHas100Replay,
    gameType: currentGameType || "Original Game",
    originalGame: (currentOriginalGame || "").trim(),
    originalDeveloper: (currentOriginalDeveloper || "").trim(),
    originalPublisher: (currentOriginalPublisher || "").trim()  // ← ADD THIS
  };
}

function lockBackgroundScroll() {
  if (isMobileDevice()) return;

  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = "hidden";

  if (scrollbarWidth > 0) {
    document.body.style.paddingRight = `${scrollbarWidth}px`;
  }
}

function unlockBackgroundScroll() {
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
}

function setFormFromMetadata(metadata) {
  getField("image-name").value = metadata.name || "";
  getField("image-developer").value = metadata.developer || "";
  getField("image-publisher").value = metadata.publisher || ""; // NEW
  // Parse and set Date Beaten dropdowns
  const dateParsed = parseCombinedDate(metadata.date || "");
  if (getField("image-date-month")) {
    getField("image-date-month").value = dateParsed.month || "";
  }
  if (getField("image-date-year")) {
    getField("image-date-year").value = dateParsed.year || "";
  }

  // Parse and set Date 100% dropdowns
  const date100Parsed = parseCombinedDate(metadata.date100 || "");
  if (getField("image-date-100-month")) {
    getField("image-date-100-month").value = date100Parsed.month || "";
  }
  if (getField("image-date-100-year")) {
    getField("image-date-100-year").value = date100Parsed.year || "";
  }
  getField("image-description").value = metadata.description || "";
  getField("image-status").value = metadata.status || "";

  currentSelectedPlatform = metadata.platform || null;
  currentSelectedOriginalPlatform = metadata.originalPlatform || null;
  currentHas100Replay = !!metadata.has100Replay;
  currentGameType = metadata.gameType || "Original Game";
  currentOriginalGame = metadata.originalGame || "";
  currentOriginalDeveloper = metadata.originalDeveloper || "";
  currentOriginalPublisher = metadata.originalPublisher || "";  // ← ADD THIS

  const platformSearch = getField("platform-search");
  const dropdown = getField("platform-dropdown-menu");
  const originalPlatformSearch = getField("original-platform-search");
  const originalDropdown = getField("original-platform-dropdown-menu");
  if (platformSearch) platformSearch.value = "";
  if (dropdown) dropdown.classList.add("hidden");
  if (originalPlatformSearch) originalPlatformSearch.value = "";
  if (originalDropdown) originalDropdown.classList.add("hidden");

  updateReplayVisibility();
  updatePlatformButton();
  renderPlatformOptions();
  renderOriginalPlatformOptions();
  updateOriginalPlatformVisibility();
  updateDateLabel();
  updateGameTypeUI();
}


function updateDateLabel() {
  const status = getField("image-status")?.value || "";
  const dateLabel = document.querySelector('label[for="image-date-month"]');

  if (!dateLabel) return;

  if (status === "Played") {
    dateLabel.parentElement.querySelector("label").textContent = "Date Last Played:";
  } else if (status === "Dropped") {
    dateLabel.parentElement.querySelector("label").textContent = "Date Dropped:";
  } else {
    dateLabel.parentElement.querySelector("label").textContent = "Date Finished:";
  }
}

function updateReplayVisibility() {
  const statusSelect = getField("image-status");
  const replayGroup = getField("replay-group");
  const replayButton = getField("replay-button");
  const date100Group = getField("date-100-group");

  if (!statusSelect || !replayGroup || !replayButton || !date100Group) return;

  const is100Percent = statusSelect.value === "100% complete";

  if (is100Percent) {
    replayGroup.classList.remove("hidden");
    replayButton.classList.toggle("green", currentHas100Replay);
    replayButton.classList.toggle("red", !currentHas100Replay);
    date100Group.classList.toggle("hidden", !currentHas100Replay);
  } else {
    replayGroup.classList.add("hidden");
    date100Group.classList.add("hidden");
    currentHas100Replay = false;
    replayButton.classList.remove("green", "red");
  }
}

function toggleReplayStatus() {
  currentHas100Replay = !currentHas100Replay;
  updateReplayVisibility();
}

// Fan Remake puts Developer above Original Game / Original Developer,
// since for a remake the "developer" is the team that made the remake
// itself, and it reads more naturally before the original-game context.
// Every other game type keeps Developer in its normal spot (below
// Original Game / Original Developer, right above the date field).
function reorderDeveloperFieldForGameType(isFanRemake) {
  const modalBody = document.querySelector(".modal-body");
  const developerGroup = getField("image-developer")?.closest(".form-group");
  const originalGameGroup = getField("original-game-group");
  const dateGroup = document.querySelector('label[for="image-date"]')?.closest(".form-group");

  if (!modalBody || !developerGroup) return;

  if (isFanRemake) {
    if (originalGameGroup && developerGroup.nextElementSibling !== originalGameGroup) {
      modalBody.insertBefore(developerGroup, originalGameGroup);
    }
  } else if (dateGroup && developerGroup.nextElementSibling !== dateGroup) {
    modalBody.insertBefore(developerGroup, dateGroup);
  }
}

function updateGameTypeUI() {
  const gameTypeSelect = getField("image-game-type");
  const originalGameGroup = getField("original-game-group");
  const originalGameInput = getField("image-original-game");
  const originalGameLabel = document.querySelector('label[for="image-original-game"]');
  const originalDeveloperGroup = getField("original-developer-group");
  const originalDeveloperInput = getField("image-original-developer");
  const originalPublisherInput = getField("image-original-publisher");
  const dpGroup = getField("developer-publisher-group");
  const developerInput = getField("image-developer");
  const developerLabelSpan = document.querySelector("#developer-publisher-group .dp-label-dev");

  if (!gameTypeSelect) return;

  gameTypeSelect.value = currentGameType || "Original Game";

  const isOriginal = currentGameType === "Original Game";
  const isFanPort = currentGameType === "Fan Port";
  const isFanGame = currentGameType === "Fan Game";
  const isFanRemake = currentGameType === "Fan Remake";

  // The Developer/Porter box moves above the original-game context for
  // Fan Remake and Fan Port, since whoever made the fan version reads
  // more naturally before the original game's details.
  reorderDeveloperFieldForGameType(isFanRemake || isFanPort);

  // Original Game box is irrelevant for the base "Original Game" type,
  // and also for "Fan Port" (a fan port is the same game, just ported
  // to a new platform, not a different original game).
  const shouldHideOriginalGame = isOriginal || isFanPort;

  if (originalGameGroup) {
    originalGameGroup.classList.toggle("hidden", shouldHideOriginalGame);
  }

  if (shouldHideOriginalGame) {
    currentOriginalGame = "";
  }

  if (originalGameInput) {
    originalGameInput.value = currentOriginalGame || "";
    originalGameInput.placeholder = isFanGame
      ? "Enter the original IP name"
      : "Enter the original game name";
  }

  if (originalGameLabel) {
    originalGameLabel.textContent = isFanGame ? "Original IP:" : "Original Game:";
  }

  // Original Developer/Publisher row applies to Fan Remake AND Fan Port -
  // both are fan-made versions of someone else's game, so the original
  // studio and publisher are worth recording.
  const shouldShowOriginalRow = isFanRemake || isFanPort;

  if (originalDeveloperGroup) {
    originalDeveloperGroup.classList.toggle("hidden", !shouldShowOriginalRow);
  }

  if (!shouldShowOriginalRow) {
    currentOriginalDeveloper = "";
    currentOriginalPublisher = "";
  }

  if (originalDeveloperInput) {
    originalDeveloperInput.value = currentOriginalDeveloper || "";
  }

  if (originalPublisherInput) {
    originalPublisherInput.value = currentOriginalPublisher || "";
  }

  // Fan Port calls the main box "Porter"; every other type says "Developer".
  if (developerLabelSpan) {
    developerLabelSpan.textContent = isFanPort ? "Porter:" : "Developer:";
  }

  if (developerInput) {
    developerInput.placeholder = isFanPort ? "Enter porter" : "Enter developer";
  }

  // Single-column mode: hide the Publisher box.
  // - Original Game = two columns (Developer + Publisher)
  // - Romhack / Fan Game / Fan Port / Fan Remake / Mod = one column
  const shouldUseSingleColumn = !isOriginal;

  if (dpGroup) {
    dpGroup.classList.toggle("single-column", shouldUseSingleColumn);
    if (shouldUseSingleColumn) {
      const pub = getField("image-publisher");
      if (pub) pub.value = "";
    }
  }
}

function handleGameTypeChange() {
  const gameTypeSelect = getField("image-game-type");
  if (!gameTypeSelect) return;

  currentGameType = gameTypeSelect.value || "Original Game";
  updateGameTypeUI();
}

function handleOriginalGameInput() {
  const input = getField("image-original-game");
  if (input) {
    currentOriginalGame = input.value || "";
  }
}

function handleOriginalDeveloperInput() {
  const input = getField("image-original-developer");
  if (input) {
    currentOriginalDeveloper = input.value || "";
  }
}

function updatePlatformButton() {
  const btn = getField("platform-btn");
  if (!btn) return;
  btn.textContent = currentSelectedPlatform || "-- Select Platform --";
}

function shouldUseOriginalPlatform(platform = currentSelectedPlatform) {
  return (
    platform === "PC (Via Decompilation)" ||
    platform === "PC (Via Recompilation)" ||
    platform === "PC (Via Custom Emulator)"
  );
}

function updateOriginalPlatformVisibility() {
  const group = getField("original-platform-group");
  if (!group) return;

  const shouldShow = shouldUseOriginalPlatform();
  group.classList.toggle("hidden", !shouldShow);

  if (!shouldShow) {
    currentSelectedOriginalPlatform = null;
    const search = getField("original-platform-search");
    const dropdown = getField("original-platform-dropdown-menu");
    if (search) search.value = "";
    if (dropdown) dropdown.classList.add("hidden");
  }

  updateOriginalPlatformButton();
}

function updateOriginalPlatformButton() {
  const btn = getField("original-platform-btn");
  if (!btn) return;
  btn.textContent = currentSelectedOriginalPlatform || "-- Select Original Platform --";
}

function togglePlatformDropdown() {
  const dropdownMenu = getField("platform-dropdown-menu");
  if (!dropdownMenu) return;

  dropdownMenu.classList.toggle("hidden");
  if (!dropdownMenu.classList.contains("hidden")) {
    getField("platform-search")?.focus();
    renderPlatformOptions();
  }
}

function selectPlatform(platform) {
  currentSelectedPlatform = platform || null;
  if (!shouldUseOriginalPlatform(currentSelectedPlatform)) {
    currentSelectedOriginalPlatform = null;
  }
  updatePlatformButton();
  updateOriginalPlatformVisibility();
  renderPlatformOptions();
  renderOriginalPlatformOptions();

  const dropdown = getField("platform-dropdown-menu");
  if (dropdown) dropdown.classList.add("hidden");
}

function clearSelectedPlatform() {
  currentSelectedPlatform = null;
  currentSelectedOriginalPlatform = null;
  updatePlatformButton();
  updateOriginalPlatformVisibility();
  renderPlatformOptions();
  renderOriginalPlatformOptions();

  const dropdown = getField("platform-dropdown-menu");
  if (dropdown) dropdown.classList.add("hidden");
}

function getPlatformSearchTerms(rawQuery) {
  const originalSearchQuery = (rawQuery || "").trim().toLowerCase();
  let searchQuery = originalSearchQuery;
  let selectedCategory = null;

  if (typeof categoryAliases !== "undefined" && categoryAliases[searchQuery]) {
    selectedCategory = categoryAliases[searchQuery];
  }

  if (typeof platformAliases !== "undefined" && platformAliases[searchQuery]) {
    const aliasValue = platformAliases[searchQuery];
    const aliasArray = Array.isArray(aliasValue) ? aliasValue : [aliasValue];
    searchQuery = aliasArray[0].toLowerCase();
  }

  return {
    originalSearchQuery,
    searchQuery,
    selectedCategory
  };
}

function renderPlatformOptions() {
  const optionsContainer = getField("platform-options");
  const searchField = getField("platform-search");
  if (!optionsContainer) return;

  const searchValue = searchField?.value || "";
  const { originalSearchQuery, searchQuery, selectedCategory } = getPlatformSearchTerms(searchValue);

  optionsContainer.innerHTML = "";

  const clearOption = document.createElement("div");
  clearOption.className = "platform-option clear-platform-option";
  clearOption.textContent = "No Platform";
  if (!currentSelectedPlatform) {
    clearOption.classList.add("selected");
  }
  clearOption.addEventListener("click", clearSelectedPlatform);
  optionsContainer.appendChild(clearOption);

  Object.entries(platformOptions).forEach(([category, platforms]) => {
    if (selectedCategory && category !== selectedCategory) {
      return;
    }

    const filteredPlatforms = platforms.filter((platform) => {
      const lower = platform.toLowerCase();
      if (!searchQuery && !originalSearchQuery) return true;
      return lower.includes(searchQuery) || lower.includes(originalSearchQuery);
    });

    if (!filteredPlatforms.length) return;

    const categoryHeader = document.createElement("div");
    categoryHeader.className = "platform-category-header";
    categoryHeader.textContent = category;
    optionsContainer.appendChild(categoryHeader);

    filteredPlatforms.forEach((platform) => {
      const option = document.createElement("div");
      option.className = "platform-option";
      option.dataset.platform = platform;

      if (currentSelectedPlatform === platform) {
        option.classList.add("selected");
      }

      option.textContent = platform;
      option.addEventListener("click", () => selectPlatform(platform));
      optionsContainer.appendChild(option);
    });
  });
}

function toggleOriginalPlatformDropdown() {
  const dropdownMenu = getField("original-platform-dropdown-menu");
  if (!dropdownMenu || !shouldUseOriginalPlatform()) return;

  dropdownMenu.classList.toggle("hidden");
  if (!dropdownMenu.classList.contains("hidden")) {
    getField("original-platform-search")?.focus();
    renderOriginalPlatformOptions();
  }
}

function selectOriginalPlatform(platform) {
  currentSelectedOriginalPlatform = platform || null;
  updateOriginalPlatformButton();
  renderOriginalPlatformOptions();

  const dropdown = getField("original-platform-dropdown-menu");
  if (dropdown) dropdown.classList.add("hidden");
}

function clearSelectedOriginalPlatform() {
  currentSelectedOriginalPlatform = null;
  updateOriginalPlatformButton();
  renderOriginalPlatformOptions();

  const dropdown = getField("original-platform-dropdown-menu");
  if (dropdown) dropdown.classList.add("hidden");
}

function renderOriginalPlatformOptions() {
  const optionsContainer = getField("original-platform-options");
  const searchField = getField("original-platform-search");
  if (!optionsContainer) return;

  const searchValue = searchField?.value || "";
  const { originalSearchQuery, searchQuery, selectedCategory } = getPlatformSearchTerms(searchValue);

  optionsContainer.innerHTML = "";

  const clearOption = document.createElement("div");
  clearOption.className = "platform-option clear-platform-option";
  clearOption.textContent = "No Original Platform";
  if (!currentSelectedOriginalPlatform) {
    clearOption.classList.add("selected");
  }
  clearOption.addEventListener("click", clearSelectedOriginalPlatform);
  optionsContainer.appendChild(clearOption);

  Object.entries(platformOptions).forEach(([category, platforms]) => {
    if (category === "PC") return;
    if (selectedCategory && category !== selectedCategory) return;

    const filteredPlatforms = platforms.filter((platform) => {
      const lower = platform.toLowerCase();
      if (!searchQuery && !originalSearchQuery) return true;
      return lower.includes(searchQuery) || lower.includes(originalSearchQuery);
    });

    if (!filteredPlatforms.length) return;

    const categoryHeader = document.createElement("div");
    categoryHeader.className = "platform-category-header";
    categoryHeader.textContent = category;
    optionsContainer.appendChild(categoryHeader);

    filteredPlatforms.forEach((platform) => {
      const option = document.createElement("div");
      option.className = "platform-option";
      option.dataset.platform = platform;

      if (currentSelectedOriginalPlatform === platform) {
        option.classList.add("selected");
      }

      option.textContent = platform;
      option.addEventListener("click", () => selectOriginalPlatform(platform));
      optionsContainer.appendChild(option);
    });
  });
}

function isImageModalOpen() {
  const modal = getModalElement?.();
  return !!modal && !modal.classList.contains("hidden");
}

function updateSyncNotification() {
  const syncNotification = getField("sync-notification");
  if (!syncNotification) return;

  if (!currentUser || !firebaseDb || !firebaseAvailable) {
    syncNotification.classList.remove("hidden");
  } else {
    syncNotification.classList.add("hidden");
  }
}

function finalizeModalClose() {
  const modal = getModalElement();
  if (modal) {
    modal.classList.add("hidden");
  }

  unlockBackgroundScroll();
  removeModalEscapeHandler();
  currentImageElement = null;
  currentSelectedPlatform = null;
  currentSelectedOriginalPlatform = null;
  currentHas100Replay = false;
  currentGameType = "Original Game";
  currentOriginalGame = "";
  currentOriginalDeveloper = "";
  currentOriginalPublisher = "";
  // Publisher doesn't need special reset - handled via form read

  if (typeof flushPendingRealtimeSync === "function") {
    flushPendingRealtimeSync().catch((err) => {
      gameDetailsLogError("Failed flushing pending realtime sync after modal close.", err);
    });
  }
}

function openImageModal(imgElement) {
  if (!imgElement) return;

  currentImageElement = imgElement;
  setModalHeaderImage(imgElement);
  const modal = getModalElement();
  const imageId = imgElement.dataset.imageId;
  if (!modal || !imageId) return;

  updateSyncNotification();

  getImageMetadataFromIndexedDB(imageId)
    .then((imageMetadata) => {
      setFormFromMetadata(imageMetadata || {});
      setModalEscapeHandler();
      lockBackgroundScroll();
      modal.classList.remove("hidden");
    })
    .catch((err) => {
      gameDetailsLogError(`Failed loading metadata for ${imageId}.`, err);
      setFormFromMetadata({});
      setModalEscapeHandler();
      lockBackgroundScroll();
      modal.classList.remove("hidden");
    });
}

function closeImageModal() {
  const imageId = getCurrentImageId();
  const imageElement = currentImageElement;
  const currentQuery = getSearchQueryValue();
  const metadata = getCurrentMetadataFromForm();

  finalizeModalClose();

  if (!imageId || !imageElement) return;

  saveImageMetadataToIndexedDB(imageId, metadata)
    .then(async () => {
      const row = imageElement.closest(".row");
      const rows = typeof getRows === "function" ? getRows() : Array.from(document.querySelectorAll(".row"));
      const tierIndex = rows.indexOf(row);
      if (tierIndex >= 0) {
        if (typeof applyTierRulesFromIndex === "function") {
          await applyTierRulesFromIndex(tierIndex);
        } else if (tierOrderingStates?.[tierIndex] && row?.children?.[1]) {
          await sortTierByPlatform(row.children[1]);
        }
      }
      if (typeof saveImagePositions === "function") {
        await saveImagePositions().catch(() => { });
      }
      await saveTierListLocally().catch(() => { });
    })
    .finally(() => {
      try {
        if (typeof filterImages === "function") {
          filterImages(currentQuery);
        }
      } catch (_) { }
    });
}

function setModalHeaderImage(imgElement) {
  const headerImage = document.getElementById("modal-header-image");
  if (!headerImage) return;

  if (imgElement?.src) {
    headerImage.src = imgElement.dataset.imageSrc || imgElement.dataset.cloudinaryUrl || imgElement.src;
    headerImage.classList.remove("hidden");
  } else {
    headerImage.src = "";
    headerImage.classList.add("hidden");
  }
}

function setModalEscapeHandler() {
  if (currentModalEscapeHandler) {
    document.removeEventListener("keydown", currentModalEscapeHandler);
  }

  currentModalEscapeHandler = (event) => {
    if (event.key === "Escape") {
      closeImageModal();
    }
  };

  document.addEventListener("keydown", currentModalEscapeHandler);
}

function removeModalEscapeHandler() {
  if (!currentModalEscapeHandler) return;
  document.removeEventListener("keydown", currentModalEscapeHandler);
  currentModalEscapeHandler = null;
}

function deleteImageFromModal() {
  if (!currentImageElement) return;

  promptDeleteImage(() => {
    const imageId = getCurrentImageId();
    if (!imageId) {
      finalizeModalClose();
      return;
    }

    const imageElement = currentImageElement;
    const cloudinaryUrl =
      imageElement.dataset.cloudinaryUrl ||
      imageElement.dataset.imageSrc ||
      imageElement.src;
    const currentQuery = getSearchQueryValue();

    finalizeModalClose();

    (async () => {
      try {
        await deleteImageMetadataFromIndexedDB(imageId).catch((err) => {
          gameDetailsLogError(`Failed deleting metadata for ${imageId}.`, err);
        });

        await deleteImageFromIndexedDB(imageId).catch((err) => {
          gameDetailsLogError(`Failed deleting IndexedDB image for ${imageId}.`, err);
        });

        await deleteFromCloudinary(cloudinaryUrl).catch((err) => {
          gameDetailsLogError(`Remote delete failed for ${imageId}.`, err);
        });

        imageElement.remove();

        await saveImagePositions().catch((err) => {
          gameDetailsLogError("Failed saving image positions after deleting image.", err);
        });

        await saveTierListLocally().catch((err) => {
          gameDetailsLogError("Failed local save after deleting image.", err);
        });

        if (typeof updateTierCounts === "function") {
          try {
            updateTierCounts(typeof countsAreShown === "function" ? countsAreShown() : false);
          } catch (err) {
            gameDetailsLogError("Failed updating tier counts after deleting image.", err);
          }
        }

        if (typeof setDropHintVisibility === "function") {
          try {
            setDropHintVisibility();
          } catch (err) {
            gameDetailsLogError("Failed updating drop hint visibility after deleting image.", err);
          }
        }

        try {
          if (typeof filterImages === "function") {
            filterImages(currentQuery);
          }
        } catch (err) {
          gameDetailsLogError("Failed re-running search after deleting image.", err);
        }
      } catch (err) {
        gameDetailsLogError("Unexpected error while deleting image.", err);
      }
    })();
  });
}

// Simple field update function that only updates metadata when modal closes
function updateMetadataField() {
  // No auto-save - metadata only saves when modal closes
}

function bindTrimmedTextField(inputElement, onChange) {
  if (!inputElement) return;

  // No live stripping while typing - a leading space is left alone so
  // it's still possible to type a space first and then fill in text
  // before it. Both ends only get trimmed once the field loses focus.
  if (typeof onChange === "function") {
    inputElement.addEventListener("input", onChange);
  }

  inputElement.addEventListener("blur", () => {
    const trimmedValue = inputElement.value.trim();
    if (trimmedValue !== inputElement.value) {
      inputElement.value = trimmedValue;
      if (typeof onChange === "function") onChange();
    }
  });
}

function bindModalFieldEvents() {
  if (modalBindingsInitialized) return;
  modalBindingsInitialized = true;

  // No auto-save event listeners - we only save on modal close
  // Just bind platform search functionality
  const platformSearch = getField("platform-search");
  if (platformSearch) {
    platformSearch.addEventListener("input", renderPlatformOptions);
    platformSearch.addEventListener("keyup", renderPlatformOptions);
  }

  const originalPlatformSearch = getField("original-platform-search");
  if (originalPlatformSearch) {
    originalPlatformSearch.addEventListener("input", renderOriginalPlatformOptions);
    originalPlatformSearch.addEventListener("keyup", renderOriginalPlatformOptions);
  }

  const statusField = getField("image-status");
  if (statusField) {
    statusField.addEventListener("change", () => {
      updateDateLabel();
      updateReplayVisibility();
    });
  }

  const gameTypeSelect = getField("image-game-type");
  if (gameTypeSelect) {
    gameTypeSelect.addEventListener("change", handleGameTypeChange);
  }

  const originalGameInput = getField("image-original-game");
  if (originalGameInput) {
    bindTrimmedTextField(originalGameInput, handleOriginalGameInput);
  }

  const originalDeveloperInput = getField("image-original-developer");
  if (originalDeveloperInput) {
    bindTrimmedTextField(originalDeveloperInput, handleOriginalDeveloperInput);
  }

  const originalPublisherInput = getField("image-original-publisher");
  if (originalPublisherInput) {
    bindTrimmedTextField(originalPublisherInput, () => {
      currentOriginalPublisher = originalPublisherInput.value || "";
    });
  }

  // Same live-trim behavior for the rest of the modal's free-text
  // fields. They don't have their own change handlers - the final
  // values are simply read (and trimmed again defensively) when the
  // modal closes and metadata is saved.
  ["image-name", "image-developer", "image-publisher", "image-description"].forEach((id) => {
    bindTrimmedTextField(getField(id));
  });
  // Add change listeners for date dropdowns (no trim needed for selects)
  ["image-date-month", "image-date-year", "image-date-100-month", "image-date-100-year"].forEach((id) => {
    const field = getField(id);
    if (field) {
      field.addEventListener("change", () => {
        // Trigger save on modal close, no immediate action
      });
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  ensureYearPlaceholderOptions();
  bindModalFieldEvents();
  renderPlatformOptions();
  renderOriginalPlatformOptions();
  updatePlatformButton();
  updateOriginalPlatformVisibility();
  updateReplayVisibility();
  updateDateLabel();
  updateGameTypeUI();
});