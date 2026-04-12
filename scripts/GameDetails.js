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
    "V.Smile",
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
    "Steam Deck",
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
    "Yuzu (Switch)",
  ],
  "Nintendo Switch Online": [
    "NES (Nintendo Switch Online)",
    "SNES (Nintendo Switch Online)",
    "Nintendo 64 (Nintendo Switch Online)",
    "Sega Genesis (Nintendo Switch Online)",
    "Game Boy (Nintendo Switch Online)",
    "Game Boy Advance (Nintendo Switch Online)",
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
    "Oculus Rift S",
  ],
    "Arcade": [
    "Arcade"
  ],
  "Mobile": [
    "Mobile"
  ],
};

let currentImageElement = null;
let currentSelectedPlatform = null;
let currentHas100Replay = false;

function openImageModal(imgElement) {
  currentImageElement = imgElement;
  const modal = document.getElementById("image-modal");
  const imageId = imgElement.dataset.imageId;

  // Show sync notification if not logged in
  const syncNotification = document.getElementById("sync-notification");
  if (syncNotification) {
    if (!currentUser || !firebaseDb) {
      syncNotification.classList.remove("hidden");
    } else {
      syncNotification.classList.add("hidden");
    }
  }

  getImageMetadataFromIndexedDB(imageId).then(imageMetadata => {
    document.getElementById("image-name").value = imageMetadata.name || "";
    document.getElementById("image-developer").value = imageMetadata.developer || "";
    document.getElementById("image-date").value = imageMetadata.date || "";
    document.getElementById("image-date-100").value = imageMetadata.date100 || "";
    document.getElementById("image-description").value = imageMetadata.description || "";
    document.getElementById("image-status").value = imageMetadata.status || "";
    currentHas100Replay = !!imageMetadata.has100Replay;

    // Update the date label based on status and show/hide replay fields
    updateDateLabel();
    updateReplayVisibility();

    // Load platform
    currentSelectedPlatform = imageMetadata.platform || null;
    document.getElementById("platform-search").value = "";
    document.getElementById("platform-dropdown-menu").classList.add("hidden");
    updatePlatformButton();
    renderPlatformOptions();

    // Set up auto-save listeners for metadata fields
    setupMetadataAutoSave(imageId);

    // Enable Escape key to close modal (same behavior as tapping the X)
    if (window.currentModalEscapeHandler) {
      document.removeEventListener("keydown", window.currentModalEscapeHandler);
    }
    window.currentModalEscapeHandler = (e) => {
      if (e.key === "Escape") {
        closeImageModal();
      }
    };
    document.addEventListener("keydown", window.currentModalEscapeHandler);

    modal.classList.remove("hidden");
  }).catch(err => {
  });
}

function setupMetadataAutoSave(imageId) {
  try {
    const descriptionField = document.getElementById("image-description");
    const dateField = document.getElementById("image-date");
    const statusField = document.getElementById("image-status");
    const nameField = document.getElementById("image-name");
    const developerField = document.getElementById("image-developer");

    if (!descriptionField || !dateField || !statusField || !nameField || !developerField) {
      return;
    }

    const currentValues = {
      description: descriptionField.value,
      date: dateField.value,
      status: statusField.value,
      name: nameField.value,
      developer: developerField.value,
    };

    const newDescription = descriptionField.cloneNode(true);
    const newDate = dateField.cloneNode(true);
    const newStatus = statusField.cloneNode(true);
    const newName = nameField.cloneNode(true);
    const newDeveloper = developerField.cloneNode(true);

    descriptionField.parentNode.replaceChild(newDescription, descriptionField);
    dateField.parentNode.replaceChild(newDate, dateField);
    statusField.parentNode.replaceChild(newStatus, statusField);
    nameField.parentNode.replaceChild(newName, nameField);
    developerField.parentNode.replaceChild(newDeveloper, developerField);

    document.getElementById("image-description").value = currentValues.description;
    document.getElementById("image-date").value = currentValues.date;
    document.getElementById("image-status").value = currentValues.status;
    document.getElementById("image-name").value = currentValues.name;
    document.getElementById("image-developer").value = currentValues.developer;

    const createDebouncedHandler = (currentImageId) => (e) => {
      if (autoSaveTimers[currentImageId]) {
        clearTimeout(autoSaveTimers[currentImageId]);
      }
      autoSaveTimers[currentImageId] = setTimeout(() => {
        autoSaveMetadata(currentImageId);
      }, 800);
    };

    document.getElementById("image-description").addEventListener("input", createDebouncedHandler(imageId));
    document.getElementById("image-date").addEventListener("input", createDebouncedHandler(imageId));
    document.getElementById("image-name").addEventListener("input", createDebouncedHandler(imageId));
    document.getElementById("image-developer").addEventListener("input", createDebouncedHandler(imageId));
    document.getElementById("image-status").addEventListener("change", createDebouncedHandler(imageId));
    document.getElementById("image-date-100").addEventListener("input", createDebouncedHandler(imageId));
  } catch (err) {
  }
}

function autoSaveMetadataWrapper() {
  if (currentImageElement) {
    autoSaveMetadata(currentImageElement.dataset.imageId);
  }
}

function autoSaveMetadata(imageId) {
  if (!currentImageElement) {
    return;
  }

  if (currentImageElement.dataset.imageId !== imageId) {
    return;
  }

  const imageMetadata = {
    name: document.getElementById("image-name").value || "",
    developer: document.getElementById("image-developer").value || "",
    date: document.getElementById("image-date").value || "",
    date100: document.getElementById("image-date-100").value || "",
    description: document.getElementById("image-description").value || "",
    status: document.getElementById("image-status").value || "",
    platform: currentSelectedPlatform,
    has100Replay: currentHas100Replay
  };


  saveImageMetadataToIndexedDB(imageId, imageMetadata)
    .then(async () => {
      await sortCurrentImageTierIfOrdered(currentImageElement).catch(() => {});
      await saveTierListLocally().catch(() => {});

      if (currentUser && firebaseDb) {
        showSyncStatus("syncing", "Syncing...");

        const nowMs = Date.now();
        const lastSyncMs = lastFirebaseSyncTime[imageId] || 0;
        const timeSinceLastSync = nowMs - lastSyncMs;

        if (autoSaveTimers[imageId]) {
          clearTimeout(autoSaveTimers[imageId]);
        }

        if (timeSinceLastSync > 5000) {
          lastFirebaseSyncTime[imageId] = nowMs;
          saveTierListToFirebase()
            .then(() => {
              showSyncStatus("synced", "Synced");
              setTimeout(() => hideSyncStatus(), 2000);
            })
            .catch(err => {
              showSyncStatus("error", "Sync failed!");
              setTimeout(() => hideSyncStatus(), 3000);
            });
        } else {
          autoSaveTimers[imageId] = setTimeout(() => {
            lastFirebaseSyncTime[imageId] = Date.now();
            saveTierListToFirebase()
              .then(() => {
                showSyncStatus("synced", "Synced");
                setTimeout(() => hideSyncStatus(), 2000);
              })
              .catch(err => {
                showSyncStatus("error", "Sync failed!");
                setTimeout(() => hideSyncStatus(), 3000);
              });
          }, 1500);
        }
      }
    })
    .catch(err => {
    });
}

function showSyncStatus(status, message) {
  const syncStatusDiv = document.getElementById("sync-status");
  const syncStatusText = document.getElementById("sync-status-text");

  if (syncStatusDiv) {
    syncStatusDiv.style.display = "flex";
    syncStatusDiv.className = "sync-status " + status;
    syncStatusText.textContent = message;
  }
}

function hideSyncStatus() {
  const syncStatusDiv = document.getElementById("sync-status");
  if (syncStatusDiv) {
    syncStatusDiv.style.display = "none";
    syncStatusDiv.className = "sync-status";
  }
}

function updateDateLabel() {
  const statusSelect = document.getElementById("image-status");
  const dateLabel = document.getElementById("image-date-label");
  const status = statusSelect.value;

  if (status === "dropped") {
    dateLabel.textContent = "Date Dropped:";
  } else if (status === "Played") {
    dateLabel.textContent = "Date Last Played:";
  } else if (status === "") {
    dateLabel.textContent = "Date Beaten:";
  } else {
    dateLabel.textContent = "Date Beaten:";
  }

  updateReplayVisibility();
}

function toggleReplayFlag() {
  currentHas100Replay = !currentHas100Replay;
  updateReplayVisibility();
  autoSaveMetadataWrapper();
}

function updateReplayVisibility() {
  const statusSelect = document.getElementById("image-status");
  const replayGroup = document.getElementById("replay-toggle-group");
  const replayButton = document.getElementById("replay-toggle-btn");
  const date100Group = document.getElementById("image-date-100-group");

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
  }
}

function closeImageModal() {
  const modal = document.getElementById("image-modal");

  if (!currentImageElement) {
    modal.classList.add("hidden");
    return;
  }

  const imageId = currentImageElement.dataset.imageId;
  const imageMetadata = {
    name: document.getElementById("image-name").value || "",
    developer: document.getElementById("image-developer").value || "",
    date: document.getElementById("image-date").value || "",
    date100: document.getElementById("image-date-100").value || "",
    description: document.getElementById("image-description").value || "",
    status: document.getElementById("image-status").value || "",
    platform: currentSelectedPlatform,
    has100Replay: currentHas100Replay
  };


  if (autoSaveTimers[imageId]) {
    clearTimeout(autoSaveTimers[imageId]);
    delete autoSaveTimers[imageId];
  }
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;
  }

  const searchInput = document.getElementById('search-input');
  const currentQuery = searchInput ? searchInput.value : '';

  saveImageMetadataToIndexedDB(imageId, imageMetadata)
    .then(async () => {
      await sortCurrentImageTierIfOrdered(currentImageElement).catch(() => {});
      await saveTierListLocally().catch(() => {});

      if (currentUser && firebaseDb) {
        return saveTierListToFirebase();
      }
    })
    .catch(err => {
    })
    .finally(() => {
      try {
        filterImages(currentQuery);
      } catch (e) {
      }

      if (window.currentModalEscapeHandler) {
        document.removeEventListener("keydown", window.currentModalEscapeHandler);
        window.currentModalEscapeHandler = null;
      }

      modal.classList.add("hidden");
      currentImageElement = null;
      currentSelectedPlatform = null;
    });
}


async function sortCurrentImageTierIfOrdered(imageElement) {
  if (!imageElement) return;
  const row = imageElement.closest('.row');
  if (!row) return;

  const rows = Array.from(document.querySelectorAll('.row'));
  const tierIndex = rows.indexOf(row);
  if (tierIndex < 0) return;
  if (!tierOrderingStates[tierIndex]) return;

  try {
    await sortTierByPlatform(row.children[1]);
    await saveImagePositions().catch(() => {});
  } catch (err) {
  }
}

function deleteImageFromModal() {
  if (currentImageElement) {
    promptDeleteImage(() => {
      const imageId = currentImageElement.dataset.imageId;
      const cloudinaryUrl = currentImageElement.dataset.cloudinaryUrl || currentImageElement.src;

      deleteImageMetadataFromIndexedDB(imageId);
      deleteFromCloudinary(cloudinaryUrl).then(() => {
        return deleteImageFromIndexedDB(imageId);
      })
        .then(() => {
          currentImageElement.remove();
          closeImageModal();
          saveImagePositions();

          if (currentUser && firebaseDb) {
            saveTierListToFirebase().catch(err => {
            });
          }
        })
        .catch(err => {
        });
    });
  }
}

function togglePlatformDropdown() {
  const dropdownMenu = document.getElementById("platform-dropdown-menu");
  dropdownMenu.classList.toggle("hidden");
  if (!dropdownMenu.classList.contains("hidden")) {
    document.getElementById("platform-search").focus();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const platformSearch = document.getElementById("platform-search");
  if (platformSearch) {
    platformSearch.addEventListener("keyup", renderPlatformOptions);
  }
});
