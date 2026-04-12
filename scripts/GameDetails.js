// GameDetails.js
// Handles the game details modal, platform picker, metadata autosave, and deleting a single image.
// Designed to stay compatible with the existing HTML and the rewritten DatabaseSyncing.js / script.js.

const platformOptions = {
  "PC": [
    "PC",
    "PC (Via Decompilation)",
    "PC (Via Recompilation)"
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
    "Game Boy Color",
    "Game Boy Advance",
    "Nintendo DS",
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

let currentImageElement = null;
let currentSelectedPlatform = null;
let currentHas100Replay = false;
let modalBindingsInitialized = false;
let currentModalEscapeHandler = null;

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

function getCurrentMetadataFromForm() {
  return {
    name: getField("image-name")?.value || "",
    developer: getField("image-developer")?.value || "",
    date: getField("image-date")?.value || "",
    date100: getField("image-date-100")?.value || "",
    description: getField("image-description")?.value || "",
    status: getField("image-status")?.value || "",
    platform: currentSelectedPlatform || null,
    has100Replay: !!currentHas100Replay
  };
}

function setFormFromMetadata(metadata) {
  getField("image-name").value = metadata.name || "";
  getField("image-developer").value = metadata.developer || "";
  getField("image-date").value = metadata.date || "";
  getField("image-date-100").value = metadata.date100 || "";
  getField("image-description").value = metadata.description || "";
  getField("image-status").value = metadata.status || "";

  currentSelectedPlatform = metadata.platform || null;
  currentHas100Replay = !!metadata.has100Replay;

  const platformSearch = getField("platform-search");
  const dropdown = getField("platform-dropdown-menu");
  if (platformSearch) platformSearch.value = "";
  if (dropdown) dropdown.classList.add("hidden");

  updateDateLabel();
  updateReplayVisibility();
  updatePlatformButton();
  renderPlatformOptions();
}

function updateDateLabel() {
  const statusSelect = getField("image-status");
  const dateLabel = document.querySelector('label[for="image-date"]');
  if (!statusSelect || !dateLabel) return;

  const status = statusSelect.value;
  dateLabel.textContent = status === "In Progress" ? "Date Started" : "Date Beaten";
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
  triggerMetadataAutosaveDebounced();
}

function updatePlatformButton() {
  const btn = getField("platform-btn");
  if (!btn) return;
  btn.textContent = currentSelectedPlatform || "Select Platform";
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
  updatePlatformButton();
  renderPlatformOptions();
  const dropdown = getField("platform-dropdown-menu");
  if (dropdown) dropdown.classList.add("hidden");
  triggerMetadataAutosaveDebounced();
}

function clearSelectedPlatform() {
  currentSelectedPlatform = null;
  updatePlatformButton();
  renderPlatformOptions();
  triggerMetadataAutosaveDebounced();
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

function triggerMetadataAutosaveDebounced(imageId) {
  const resolvedImageId = imageId || getCurrentImageId();
  if (!resolvedImageId) return;

  if (autoSaveTimers[resolvedImageId]) {
    clearTimeout(autoSaveTimers[resolvedImageId]);
  }

  autoSaveTimers[resolvedImageId] = setTimeout(() => {
    autoSaveMetadata(resolvedImageId);
  }, 800);
}

async function sortCurrentImageTierIfOrdered(imageElement) {
  if (!imageElement) return;

  const row = imageElement.closest(".row");
  if (!row) return;

  const rows = Array.from(document.querySelectorAll(".row"));
  const tierIndex = rows.indexOf(row);
  if (tierIndex < 0) return;
  if (!tierOrderingStates || !tierOrderingStates[tierIndex]) return;

  try {
    await sortTierByPlatform(row.children[1]);
    await saveImagePositions();
  } catch (err) {
    gameDetailsLogError(`Failed sorting ordered tier ${tierIndex} after metadata update.`, err);
  }
}

async function autoSaveMetadata(imageId) {
  if (!currentImageElement) return;
  if (getCurrentImageId() !== imageId) return;

  const metadata = getCurrentMetadataFromForm();

  try {
    await saveImageMetadataToIndexedDB(imageId, metadata);
    await sortCurrentImageTierIfOrdered(currentImageElement);
    await saveTierListLocally().catch((err) => {
      gameDetailsLogError("Best-effort local save after metadata autosave failed.", err);
    });

    if (currentUser && firebaseDb && firebaseAvailable) {
      await saveTierListToFirebase();
    }
  } catch (err) {
    gameDetailsLogError(`Metadata autosave failed for ${imageId}.`, err);
  } finally {
    if (autoSaveTimers[imageId]) {
      clearTimeout(autoSaveTimers[imageId]);
      delete autoSaveTimers[imageId];
    }
  }
}

function autoSaveMetadataWrapper() {
  const imageId = getCurrentImageId();
  if (imageId) {
    autoSaveMetadata(imageId);
  }
}

function bindModalFieldEvents() {
  if (modalBindingsInitialized) return;
  modalBindingsInitialized = true;

  const inputIds = [
    "image-name",
    "image-developer",
    "image-date",
    "image-date-100",
    "image-description"
  ];

  inputIds.forEach((id) => {
    const field = getField(id);
    if (!field) return;
    field.addEventListener("input", () => triggerMetadataAutosaveDebounced());
  });

  const statusField = getField("image-status");
  if (statusField) {
    statusField.addEventListener("change", () => {
      updateDateLabel();
      updateReplayVisibility();
      triggerMetadataAutosaveDebounced();
    });
  }

  const platformSearch = getField("platform-search");
  if (platformSearch) {
    platformSearch.addEventListener("input", renderPlatformOptions);
    platformSearch.addEventListener("keyup", renderPlatformOptions);
  }

  const modal = getModalElement();
  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeImageModal();
      }
    });
  }
}

function setupMetadataAutoSave() {
  bindModalFieldEvents();
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

function updateSyncNotification() {
  const syncNotification = getField("sync-notification");
  if (!syncNotification) return;

  if (!currentUser || !firebaseDb || !firebaseAvailable) {
    syncNotification.classList.remove("hidden");
  } else {
    syncNotification.classList.add("hidden");
  }
}

function openImageModal(imgElement) {
  if (!imgElement) return;

  currentImageElement = imgElement;
  const modal = getModalElement();
  const imageId = imgElement.dataset.imageId;
  if (!modal || !imageId) return;

  setupMetadataAutoSave();
  updateSyncNotification();

  getImageMetadataFromIndexedDB(imageId)
    .then((imageMetadata) => {
      setFormFromMetadata(imageMetadata || {});
      setModalEscapeHandler();
      modal.classList.remove("hidden");
    })
    .catch((err) => {
      gameDetailsLogError(`Failed loading metadata for ${imageId}.`, err);
      setFormFromMetadata({});
      setModalEscapeHandler();
      modal.classList.remove("hidden");
    });
}

function finalizeModalClose() {
  const modal = getModalElement();
  if (modal) {
    modal.classList.add("hidden");
  }

  removeModalEscapeHandler();
  currentImageElement = null;
  currentSelectedPlatform = null;
  currentHas100Replay = false;
}

function closeImageModal() {
  const imageId = getCurrentImageId();
  if (!imageId) {
    finalizeModalClose();
    return;
  }

  if (autoSaveTimers[imageId]) {
    clearTimeout(autoSaveTimers[imageId]);
    delete autoSaveTimers[imageId];
  }
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;
  }

  const metadata = getCurrentMetadataFromForm();
  const currentQuery = getSearchQueryValue();

  saveImageMetadataToIndexedDB(imageId, metadata)
    .then(async () => {
      await sortCurrentImageTierIfOrdered(currentImageElement);
      await saveTierListLocally().catch((err) => {
        gameDetailsLogError("Failed local save while closing modal.", err);
      });

      if (currentUser && firebaseDb && firebaseAvailable) {
        await saveTierListToFirebase();
      }
    })
    .catch((err) => {
      gameDetailsLogError(`Failed saving metadata while closing modal for ${imageId}.`, err);
    })
    .finally(() => {
      try {
        if (typeof filterImages === "function") {
          filterImages(currentQuery);
        }
      } catch (err) {
        gameDetailsLogError("Failed re-running search filter after closing modal.", err);
      }

      finalizeModalClose();
    });
}

function deleteImageFromModal() {
  if (!currentImageElement) return;

  promptDeleteImage(async () => {
    const imageId = getCurrentImageId();
    if (!imageId) {
      finalizeModalClose();
      return;
    }

    const imageElement = currentImageElement;
    const cloudinaryUrl = imageElement.dataset.cloudinaryUrl || imageElement.dataset.imageSrc || imageElement.src;
    const currentQuery = getSearchQueryValue();

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

      if (currentUser && firebaseDb && firebaseAvailable) {
        await saveTierListToFirebase().catch((err) => {
          gameDetailsLogError("Failed syncing deletion to Firebase.", err);
        });
      }

      try {
        if (typeof filterImages === "function") {
          filterImages(currentQuery);
        }
      } catch (err) {
        gameDetailsLogError("Failed re-running search after deleting image.", err);
      }
    } finally {
      finalizeModalClose();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindModalFieldEvents();
  renderPlatformOptions();
  updatePlatformButton();
  updateReplayVisibility();
});