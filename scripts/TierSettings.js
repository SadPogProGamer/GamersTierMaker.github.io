// TierSettings.js
// Handles tier rows, color pickers, row menu actions, tier ordering, tier limits, and tier setting persistence.
// Designed to stay compatible with index.html, script.js, GameDetails.js, and DatabaseSyncing.js.

const defaultColors = [
  "rgb(191, 255, 127)",
  "rgb(255, 127, 127)",
  "rgb(255, 191, 127)",
  "rgb(255, 223, 127)",
  "#FFFF7F",
  "rgb(191, 255, 127)",
  "rgb(127, 255, 127)",
  "rgb(255, 127, 255)",
];

let tierOrderingStates = {};
let tierLimitStates = {};
let tierColorsArray = []; // Store tier colors in memory
let pendingDeletions = new Set(); // Track tiers marked for deletion
window.pickrInstances = window.pickrInstances || [];

const platformPriority = {
  "Arcade": 0,
  "Atari 2600": 1,
  "Atari 5200": 2,
  "Atari 7800": 3,
  "Atari Jaguar": 4,
  "V.Smile": 5,
  "Sega Genesis": 6,
  "Sega Saturn": 7,
  "Sega Dreamcast": 8,
  "NES": 9,
  "SNES": 10,
  "Nintendo 64": 11,
  "Game Boy": 12,
  "Game Boy Color": 12,
  "Game Boy Advance": 12,
  "GameCube": 13,
  "GameCube (Via Backwards Compatibility)": 13,
  "Nintendo DS": 14,
  "Nintendo 3DS": 15,
  "Nintendo Wii": 16,
  "Nintendo Wii U": 17,
  "Nintendo Switch": 18,
  "Nintendo Switch 2": 19,
  "PlayStation 1": 20,
  "PlayStation 2": 21,
  "PlayStation 3": 22,
  "PlayStation 4": 23,
  "PlayStation VR": 24,
  "PlayStation 5": 25,
  "PlayStation VR2": 26,
  "PlayStation Portable": 27,
  "PlayStation Vita": 28,
  "Xbox": 29,
  "Xbox 360": 30,
  "Xbox One": 31,
  "Xbox Series X/S": 32,
  "PC": 33,
  "PC (Via Decompilation)": 33.1,
  "PC (Via Recompilation)": 33.2,
  "Steam Deck": 33.5,
  "Meta Quest 2": 34,
  "Meta Quest 3": 34,
  "Meta Quest Pro": 34,
  "HTC Vive": 34,
  "HTC Vive Pro": 34,
  "HTC Vive Cosmos": 34,
  "Valve Index": 34,
  "Oculus Rift": 34,
  "Oculus Rift S": 34,
  "Snes9x (SNES)": 10,
  "Mesen (NES)": 9,
  "Visual Boy Advance (Game Boy Advance)": 12,
  "MelonDS (Nintendo DS)": 14,
  "Dolphin (GameCube)": 13,
  "Dolphin (Wii)": 16,
  "Dolphin (Wii / GameCube)": 13,
  "Citra (Nintendo 3DS)": 15,
  "Cemu (Wii U)": 17,
  "DuckStation (PS1)": 20,
  "PCSX2 (PS2)": 21,
  "RPCS3 (PS3)": 22,
  "PPSSPP (PSP)": 27,
  "Vita3K (PS Vita)": 28,
  "Xemu (Xbox)": 29,
  "Xenia (Xbox 360)": 30,
  "Ryujinx (Switch)": 18,
  "Yuzu (Switch)": 18,
  "NES (Nintendo Switch Online)": 9,
  "SNES (Nintendo Switch Online)": 10,
  "Nintendo 64 (Nintendo Switch Online)": 11,
  "Sega Genesis (Nintendo Switch Online)": 6,
  "Game Boy (Nintendo Switch Online)": 12,
  "Game Boy Advance (Nintendo Switch Online)": 12,
  "Mobile": 100,
};

function tierSettingsLogError(context, err) {
  console.error(`[TierSettings] ${context}`, err);
}

function getTierRows() {
  return Array.from(document.querySelectorAll(".row"));
}

function getImagesBar() {
  return document.getElementById("images-bar");
}

function getMainElement() {
  return document.querySelector("main");
}

function getTierIndexFromRow(row) {
  return getTierRows().indexOf(row);
}

function createMenuButton(iconSrc, alt, onClick) {
  const wrapper = document.createElement("div");
  wrapper.className = "option";

  const image = document.createElement("img");
  image.className = "option-hover";
  image.src = iconSrc;
  image.alt = alt;
  image.addEventListener("click", onClick);

  wrapper.appendChild(image);
  return wrapper;
}

function createActionRow(labelText, onClick, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "row-menu-item action-item";
  if (danger) button.classList.add("delete-tier");
  button.textContent = labelText;
  button.addEventListener("click", onClick);
  return button;
}

function removeExistingRowMenu() {
  document.querySelectorAll(".row-menu-popup").forEach((menu) => menu.remove());
}

function openRowMenu(element, event) {
  event?.stopPropagation?.();

  const existingMenu = document.querySelector(".row-menu-popup");
  const existingOwner = existingMenu?.dataset?.ownerCogId || null;

  if (!element.dataset.menuCogId) {
    element.dataset.menuCogId = `cog-${Math.random().toString(36).slice(2)}`;
  }

  const clickedCogId = element.dataset.menuCogId;

  if (existingMenu && existingOwner === clickedCogId) {
    existingMenu.remove();
    return;
  }

  removeExistingRowMenu();

  const row = element.closest(".row");
  if (!row) return;
  const tierIndex = getTierIndexFromRow(row);

  const menu = document.createElement("div");
  menu.className = "row-menu-popup";
  menu.dataset.ownerCogId = clickedCogId;

  menu.appendChild(
    createActionRow("Add Tier Above", () => {
      const newRow = createNewRow("New tier", "lightslategray");
      row.parentNode.insertBefore(newRow, row);
      rebuildTierStateIndexes();
      try {
        initializeDragula?.();
      } catch (err) {
        tierSettingsLogError("Failed reinitializing dragula after adding row above.", err);
      }
      try { updateTierCounts(countsAreShown()); } catch (e) { }
      menu.remove();
      // NO save to storage
    })
  );

  menu.appendChild(
    createActionRow("Add Tier Below", () => {
      const newRow = createNewRow("New tier", "lightslategray");
      row.parentNode.insertBefore(newRow, row.nextSibling);
      rebuildTierStateIndexes();
      try {
        initializeDragula?.();
      } catch (err) {
        tierSettingsLogError("Failed reinitializing dragula after adding row below.", err);
      }
      try { updateTierCounts(countsAreShown()); } catch (e) { }
      menu.remove();
      // NO save to storage
    })
  );

  // Create checkbox for Order on platform - updates state but does NOT save to storage
  const orderCheckboxRow = document.createElement("label");
  orderCheckboxRow.className = "row-menu-item checkbox-item";
  orderCheckboxRow.style.display = "flex";
  orderCheckboxRow.style.alignItems = "center";
  orderCheckboxRow.style.gap = "8px";
  orderCheckboxRow.style.padding = "8px 10px";
  orderCheckboxRow.style.cursor = "pointer";

  const orderCheckbox = document.createElement("input");
  orderCheckbox.type = "checkbox";
  orderCheckbox.checked = !!tierOrderingStates[tierIndex];
  orderCheckbox.addEventListener("change", async (e) => {
    e.stopPropagation();
    tierOrderingStates[tierIndex] = orderCheckbox.checked;
    if (orderCheckbox.checked) {
      const rows = getTierRows();
      if (rows[tierIndex]) {
        await sortTierByPlatform(rows[tierIndex].children[1]);
      }
    }
    // NO save to storage - only update in-memory state
  });

  const orderText = document.createElement("span");
  orderText.textContent = "Order on platform";

  orderCheckboxRow.appendChild(orderCheckbox);
  orderCheckboxRow.appendChild(orderText);
  menu.appendChild(orderCheckboxRow);

  // Create checkbox for Limit to 10 - updates state but does NOT save to storage
  const limitCheckboxRow = document.createElement("label");
  limitCheckboxRow.className = "row-menu-item checkbox-item";
  limitCheckboxRow.style.display = "flex";
  limitCheckboxRow.style.alignItems = "center";
  limitCheckboxRow.style.gap = "8px";
  limitCheckboxRow.style.padding = "8px 10px";
  limitCheckboxRow.style.cursor = "pointer";

  const limitCheckbox = document.createElement("input");
  limitCheckbox.type = "checkbox";
  limitCheckbox.checked = !!tierLimitStates[tierIndex];
  limitCheckbox.addEventListener("change", async (e) => {
    e.stopPropagation();
    tierLimitStates[tierIndex] = limitCheckbox.checked;
    if (limitCheckbox.checked) {
      const rows = getTierRows();
      const imagesBar = getImagesBar();
      enforceTierLimitForRow(rows, tierIndex, imagesBar);
    }
    // NO save to storage - only update in-memory state
  });

  const limitText = document.createElement("span");
  limitText.textContent = "Limit to 10";

  limitCheckboxRow.appendChild(limitCheckbox);
  limitCheckboxRow.appendChild(limitText);
  menu.appendChild(limitCheckboxRow);

  menu.appendChild(
    createActionRow("Delete Tier", () => {
      if (typeof promptDeleteTier === "function") {
        promptDeleteTier(() => {
          deleteRowVisualOnly(row);
        });
      } else {
        deleteRowVisualOnly(row);
      }
      menu.remove();
    }, true)
  );

  document.body.appendChild(menu);

  const rect = element.getBoundingClientRect();
  menu.style.position = "absolute";
  menu.style.top = `${window.scrollY + rect.top + 20}px`;
  menu.style.left = `${window.scrollX + rect.right - menu.offsetWidth - 35}px`;

  const closeMenuOnScroll = () => {
    menu.remove();
    document.removeEventListener("click", closeMenu);
    window.removeEventListener("scroll", closeMenuOnScroll, true);
    window.removeEventListener("resize", closeMenuOnScroll);
  };

  const closeMenu = (e) => {
    if (!menu.contains(e.target) && e.target !== element) {
      menu.remove();
      document.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenuOnScroll, true);
      window.removeEventListener("resize", closeMenuOnScroll);
    }
  };

  setTimeout(() => {
    document.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenuOnScroll, true);
    window.addEventListener("resize", closeMenuOnScroll);
  }, 0);
}

function createColorPicker(colorPicker, onPreview, onSave, defaultColor) {
  if (typeof Pickr === "undefined") {
    return null;
  }

  const pickr = Pickr.create({
    el: colorPicker,
    theme: "monolith",
    default: defaultColor,
    swatches: defaultColors,
    components: {
      preview: true,
      hue: true,
      interaction: {
        input: true,
        clear: true,
        save: true,
      },
    },
  });

  let originalColor = defaultColor;
  let lastAction = "none";

  pickr.on("change", (color) => {
    const hexColor = color ? color.toHEXA().toString() : "";
    lastAction = "preview";
    onPreview(hexColor);
  });

  pickr.on("save", (color) => {
    const hexColor = color ? color.toHEXA().toString() : "";
    lastAction = "save";
    originalColor = hexColor;
    onSave(hexColor);
    pickr.hide();
  });

  pickr.on("cancel", () => {
    lastAction = "cancel";
    onPreview(originalColor);
    pickr.hide();
  });

  pickr.on("hide", () => {
    if (lastAction === "preview") {
      onPreview(originalColor);
    }
    lastAction = "none";
  });

  colorPicker._pickr = pickr;
  window.pickrInstances.push(pickr);
  return pickr;
}

function moveRow(button, direction) {
  const row = button?.closest?.(".row");
  if (!row) return;

  const main = row.parentNode;
  const rows = Array.from(main.querySelectorAll(".row"));
  const currentIndex = rows.indexOf(row);
  if (currentIndex < 0) return;

  const unassignedContainer = main.querySelector(".unassigned-container");

  if (direction === -1) {
    const prev = row.previousElementSibling;
    if (prev) {
      main.insertBefore(row, prev);
    }
  } else if (direction === 1) {
    const next = row.nextElementSibling;
    if (!next) return;

    if (next.classList.contains("unassigned-container")) {
      main.insertBefore(row, next.nextSibling);
    } else {
      main.insertBefore(next, row);
    }
  }

  try {
    initializeDragula?.();
  } catch (err) {
    console.error("Failed reinitializing dragula after moving row.", err);
  }

  // NO save - only visual update
}

function createNewRow(name = "New tier", color = "lightslategray") {
  const newRow = document.createElement("div");
  newRow.className = "row";

  const tierLabelDiv = document.createElement("div");
  tierLabelDiv.className = "tier-label";
  tierLabelDiv.style.backgroundColor = color;
  tierLabelDiv.setAttribute("contenteditable", true);

  const paragraph = document.createElement("p");
  paragraph.textContent = name;
  paragraph.setAttribute("spellcheck", false);

  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  tooltip.setAttribute("contenteditable", false);

  const colorPicker = document.createElement("div");
  colorPicker.className = "color-picker";
  tooltip.appendChild(colorPicker);

  createColorPicker(
    colorPicker,
    (hexColor) => {
      tierLabelDiv.style.backgroundColor = hexColor;
    },
    (hexColor) => {
      tierLabelDiv.style.backgroundColor = hexColor;
      // Only update in-memory tier colors array, NO save to storage
      updateTierColorsInMemory();
    },
    color
  );

  tierLabelDiv.appendChild(paragraph);
  tierLabelDiv.appendChild(tooltip);

  const tierDiv = document.createElement("div");
  tierDiv.className = "tier sort";

  const optionsDiv = document.createElement("div");
  optionsDiv.className = "tier-options";

  const optionsContainer = document.createElement("div");
  optionsContainer.className = "options-container";

  const cog = document.createElement("div");
  cog.className = "option delete";
  const cogImg = document.createElement("img");
  cogImg.className = "option-hover";
  cogImg.src = "assets/Cog.png";
  cogImg.alt = "Menu";
  cogImg.onclick = (event) => openRowMenu(cogImg, event);
  cog.appendChild(cogImg);

  const up = document.createElement("div");
  up.className = "option up";
  const upImg = document.createElement("img");
  upImg.className = "option-hover";
  upImg.src = "assets/chevron-up.svg";
  upImg.alt = "Up";
  upImg.onclick = () => moveRow(upImg, -1);
  up.appendChild(upImg);

  const down = document.createElement("div");
  down.className = "option down";
  const downImg = document.createElement("img");
  downImg.className = "option-hover";
  downImg.src = "assets/chevron-down.svg";
  downImg.alt = "Down";
  downImg.onclick = () => moveRow(downImg, 1);
  down.appendChild(downImg);

  optionsContainer.appendChild(cog);
  optionsContainer.appendChild(up);
  optionsContainer.appendChild(down);
  optionsDiv.appendChild(optionsContainer);

  newRow.appendChild(tierLabelDiv);
  newRow.appendChild(tierDiv);
  newRow.appendChild(optionsDiv);

  return newRow;
}

function addRow(name = "New tier", color = "lightslategray") {
  const main = getMainElement();
  if (!main) return null;

  const newRow = createNewRow(name, color);
  const unassignedContainer = main.querySelector(".unassigned-container");

  if (unassignedContainer) {
    main.insertBefore(newRow, unassignedContainer);
  } else {
    main.appendChild(newRow);
  }

  try {
    initializeDragula?.();
  } catch (err) {
    tierSettingsLogError("Failed reinitializing dragula after adding row.", err);
  }

  updateTierColorsInMemory();
  return newRow;
}

function addRowAbove(referenceRow, name = "New tier", color = "lightslategray") {
  const row = referenceRow?.classList?.contains("row")
    ? referenceRow
    : referenceRow?.closest?.(".row");

  if (!row) return null;

  const newRow = createNewRow(name, color);
  row.parentNode.insertBefore(newRow, row);

  try {
    initializeDragula?.();
  } catch (err) {
    tierSettingsLogError("Failed reinitializing dragula after adding row above.", err);
  }

  rebuildTierStateIndexes();
  updateTierColorsInMemory();
  return newRow;
}

function addRowBelow(referenceRow, name = "New tier", color = "lightslategray") {
  const row = referenceRow?.classList?.contains("row")
    ? referenceRow
    : referenceRow?.closest?.(".row");

  if (!row) return null;

  const newRow = createNewRow(name, color);
  row.parentNode.insertBefore(newRow, row.nextSibling);

  try {
    initializeDragula?.();
  } catch (err) {
    tierSettingsLogError("Failed reinitializing dragula after adding row below.", err);
  }

  rebuildTierStateIndexes();
  updateTierColorsInMemory();
  return newRow;
}

function destroyRowPickers(row) {
  const tooltips = row.querySelectorAll(".tooltip");
  tooltips.forEach((tooltip) => {
    const colorPickerDiv = tooltip.querySelector(".color-picker");
    if (colorPickerDiv && colorPickerDiv._pickr) {
      colorPickerDiv._pickr.destroy();
      window.pickrInstances = window.pickrInstances.filter((p) => p !== colorPickerDiv._pickr);
      delete colorPickerDiv._pickr;
    }
  });
}

function rebuildTierStateIndexes() {
  const rows = getTierRows();
  const nextOrdering = {};
  const nextLimits = {};

  rows.forEach((row, index) => {
    const previousIndex = Number(row.dataset.tierIndexSnapshot ?? index);
    nextOrdering[index] = !!tierOrderingStates[previousIndex];
    nextLimits[index] = !!tierLimitStates[previousIndex];
    row.dataset.tierIndexSnapshot = String(index);
  });

  tierOrderingStates = nextOrdering;
  tierLimitStates = nextLimits;
}

// Visual-only delete - NO saving to storage
function deleteRowVisualOnly(element) {
  const row = element?.classList?.contains("row") ? element : element?.closest?.(".row");
  if (!row) return;

  const imagesBar = getImagesBar();
  const tierContainer = row.children?.[1];
  const imagesInTier = tierContainer ? Array.from(tierContainer.querySelectorAll(".image")) : [];

  imagesInTier.forEach((img) => {
    if (img && imagesBar) {
      imagesBar.appendChild(img);
    }
  });

  destroyRowPickers(row);
  row.remove();

  rebuildTierStateIndexes();

  try {
    initializeDragula?.();
  } catch (err) {
    tierSettingsLogError("Failed reinitializing dragula after deleting row.", err);
  }

  updateTierColorsInMemory();
}

function saveTierColorsToStorage() {
  const tiers = getTierRows().map((row) => {
    const tierLabel = row.querySelector(".tier-label");
    return {
      name: tierLabel?.querySelector("p")?.textContent || "New tier",
      color: tierLabel?.style?.backgroundColor || "lightslategray",
    };
  });

  saveSetting("tierColors", tiers).catch((err) => {
    tierSettingsLogError("Failed saving tier colors.", err);
  });
}

function updateTierColorsInMemory() {
  // Just update in-memory array - no save to storage
  tierColorsArray = getTierRows().map((row) => {
    const tierLabel = row.querySelector(".tier-label");
    return {
      name: tierLabel?.querySelector("p")?.textContent || "New tier",
      color: tierLabel?.style?.backgroundColor || "lightslategray",
    };
  });
}

function loadTierColors() {
  getSetting("tierColors")
    .then((storedTiers) => {
      if (!Array.isArray(storedTiers) || !storedTiers.length) return;

      const rows = getTierRows();
      const defaultTierCount = rows.length;

      storedTiers.forEach((tier, index) => {
        if (rows[index]) {
          const tierLabel = rows[index].querySelector(".tier-label");
          const tierNameElement = tierLabel?.querySelector("p");
          if (tierNameElement) tierNameElement.textContent = tier.name || `Tier ${index + 1}`;
          if (tierLabel) tierLabel.style.backgroundColor = tier.color || "lightslategray";
        }
      });

      for (let i = defaultTierCount; i < storedTiers.length; i += 1) {
        const tier = storedTiers[i];
        addRow(tier.name || "New tier", tier.color || "lightslategray");
      }
      
      updateTierColorsInMemory();
    })
    .catch((err) => {
      tierSettingsLogError("Failed loading tier colors.", err);
    });
}

function getSortingPlatformFromMetadata(metadata) {
  if (!metadata) return null;

  const isPcDecompOrRecomp =
    metadata.platform === "PC (Via Decompilation)" ||
    metadata.platform === "PC (Via Recompilation)";

  if (isPcDecompOrRecomp && metadata.originalPlatform) {
    return metadata.originalPlatform;
  }

  return metadata.platform || null;
}

async function getImagePlatformPriority(imageId) {
  try {
    const metadata = await getImageMetadataFromIndexedDB(imageId);
    const sortingPlatform = getSortingPlatformFromMetadata(metadata);
    if (sortingPlatform) {
      const priority = platformPriority[sortingPlatform];
      return priority !== undefined ? priority : 999;
    }
  } catch (err) {
    tierSettingsLogError(`Failed getting platform priority for ${imageId}.`, err);
  }
  return 999;
}

async function sortTierByPlatform(tierContainer) {
  if (!tierContainer) return;

  const images = Array.from(tierContainer.querySelectorAll(".image"));
  const imagePriorities = await Promise.all(
    images.map(async (img, index) => {
      const priority = await getImagePlatformPriority(img.dataset.imageId);
      return {
        element: img,
        priority,
        originalIndex: index,
      };
    })
  );

  imagePriorities.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.originalIndex - b.originalIndex;
  });

  imagePriorities.forEach(({ element }) => {
    tierContainer.appendChild(element);
  });
}

function enforceTierLimitForRow(rows, tierIndex, imagesBar) {
  const row = rows[tierIndex];
  const tierContainer = row?.children?.[1];
  if (!tierContainer) return;

  const tierImages = Array.from(tierContainer.querySelectorAll(".image"));
  if (tierImages.length <= 10) return;

  const overflow = tierImages.slice(10);
  const nextRow = rows[tierIndex + 1];
  const nextTierContainer = nextRow?.children?.[1];

  if (nextTierContainer) {
    overflow.reverse().forEach((img) => {
      nextTierContainer.insertBefore(img, nextTierContainer.firstChild);
    });
  } else if (imagesBar) {
    overflow.forEach((img) => {
      imagesBar.appendChild(img);
    });
  }
}

// These functions now only update in-memory state - NO saving to storage
async function toggleTierOrdering(tierIndex, enabled) {
  tierOrderingStates[tierIndex] = !!enabled;

  if (enabled) {
    const rows = getTierRows();
    if (rows[tierIndex]) {
      await sortTierByPlatform(rows[tierIndex].children[1]);
    }
  }
}

async function toggleTierLimit(tierIndex, enabled) {
  tierLimitStates[tierIndex] = !!enabled;

  const rows = getTierRows();
  const imagesBar = getImagesBar();
  if (enabled) {
    enforceTierLimitForRow(rows, tierIndex, imagesBar);
  }
}

function loadTierOrderingStates() {
  return getSetting("tierOrderingStates")
    .then((stored) => {
      if (stored && typeof stored === "object") {
        tierOrderingStates = stored;
      }
    })
    .catch((err) => {
      tierSettingsLogError("Failed loading tier ordering states.", err);
    });
}

function loadTierLimitStates() {
  return getSetting("tierLimitStates")
    .then((stored) => {
      if (stored && typeof stored === "object") {
        tierLimitStates = stored;
      }
    })
    .catch((err) => {
      tierSettingsLogError("Failed loading tier limit states.", err);
    });
}

function saveHeaderToStorage() {
  const headerTitle = document.getElementById("main-title")?.textContent || "Untitled Tierlist";
  saveSetting("tierListHeader", headerTitle).catch((err) => {
    tierSettingsLogError("Failed saving header.", err);
  });
}

function loadHeaderFromStorage() {
  getSetting("tierListHeader")
    .then((storedHeader) => {
      if (storedHeader) {
        const header = document.getElementById("main-title");
        if (header) header.textContent = storedHeader;
      }
    })
    .catch((err) => {
      tierSettingsLogError("Failed loading header.", err);
    });
}

// Save all tier settings to storage (called by manual save button)
async function saveTierSettingsToStorage() {
  await saveSetting("tierOrderingStates", tierOrderingStates).catch((err) => {
    tierSettingsLogError("Failed saving tier ordering states.", err);
  });
  await saveSetting("tierLimitStates", tierLimitStates).catch((err) => {
    tierSettingsLogError("Failed saving tier limit states.", err);
  });
  await saveTierColorsToStorage();
}

async function applyTierSettingsToRows() {
  const rows = getTierRows();
  const imagesBar = getImagesBar();

  for (let tierIndex = 0; tierIndex < rows.length; tierIndex += 1) {
    const tierContainer = rows[tierIndex].children?.[1];

    if (tierOrderingStates[tierIndex]) {
      try {
        await sortTierByPlatform(tierContainer);
      } catch (err) {
        tierSettingsLogError(`Failed sorting tier ${tierIndex} while applying settings.`, err);
      }
    }

    if (tierLimitStates[tierIndex]) {
      enforceTierLimitForRow(rows, tierIndex, imagesBar);
    }
  }
}

function bindTierSettingsBootEvents() {
  const mainTitle = document.getElementById("main-title");
  if (mainTitle) {
    mainTitle.addEventListener("blur", saveHeaderToStorage);
  }

  document.querySelectorAll(".tooltip").forEach((tooltip) => {
    const tierLabel = tooltip.parentNode;
    const defaultColor = tierLabel.style.backgroundColor || defaultColors[0];
    const colorPicker = tooltip.querySelector(".color-picker");

    if (!colorPicker || colorPicker._pickr) return;

    createColorPicker(
      colorPicker,
      (hexColor) => {
        tierLabel.style.backgroundColor = hexColor;
      },
      (hexColor) => {
        tierLabel.style.backgroundColor = hexColor;
        updateTierColorsInMemory();
      },
      defaultColor
    );
  });

  document.querySelectorAll(".tier-label").forEach((tierLabel) => {
    attachTierLabelKeydownListener(tierLabel);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindTierSettingsBootEvents();
});

function insertRowAbove(referenceElement, name = "New tier", color = "lightslategray") {
  const referenceRow = referenceElement?.closest?.(".row");
  if (!referenceRow) return null;

  const newRow = createNewRow(name, color);
  referenceRow.parentNode.insertBefore(newRow, referenceRow);

  try {
    initializeDragula?.();
  } catch (err) {
    console.error("Failed reinitializing dragula after inserting row above.", err);
  }

  updateTierColorsInMemory();
  return newRow;
}

function insertRowBelow(referenceElement, name = "New tier", color = "lightslategray") {
  const referenceRow = referenceElement?.closest?.(".row");
  if (!referenceRow) return null;

  const newRow = createNewRow(name, color);
  referenceRow.parentNode.insertBefore(newRow, referenceRow.nextSibling);

  try {
    initializeDragula?.();
  } catch (err) {
    console.error("Failed reinitializing dragula after inserting row below.", err);
  }

  updateTierColorsInMemory();
  return newRow;
}

function attachTierLabelKeydownListener(tierLabel) {
  tierLabel.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        e.preventDefault();
        document.execCommand("insertLineBreak");
        setTimeout(() => {
          updateTierColorsInMemory();
        }, 0);
      } else {
        e.preventDefault();
        updateTierColorsInMemory();
        tierLabel.blur();
      }
    }
  });

  tierLabel.addEventListener("blur", () => {
    updateTierColorsInMemory();
  });
}