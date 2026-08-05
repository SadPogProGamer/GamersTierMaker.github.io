// SearchFunction.js
// Handles plain search filtering, slash-command-aware filtering, and clear-button UI.
// UPDATED: Pass gameType and originalGame to processCommandFilter
// Designed to stay compatible with the existing HTML and Commands.js.

let latestSearchRequestId = 0;

function searchLogError(context, err) {
  console.error(`[SearchFunction] ${context}`, err);
}

function getSearchInputElement() {
  return document.getElementById("search-input");
}

function getSearchDropdownElement() {
  return document.getElementById("search-commands-dropdown");
}

function getClearSearchButton() {
  return document.getElementById("clear-search");
}

function getSearchRows() {
  return Array.from(document.querySelectorAll(".row"));
}

function getSearchImagesBar() {
  return document.querySelector("#images-bar");
}

function getDefaultSearchMetadata() {
  return {
    name: "",
    developer: "",
    date: "",
    description: "",
    status: "",
    platform: null,
    date100: "",
    has100Replay: false,
    gameType: "Original Game",
    originalGame: "",
  };
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .trim();
}

function hideSearchCommandDropdown() {
  const dropdown = getSearchDropdownElement();
  if (dropdown) {
    dropdown.classList.add("hidden");
  }
}

function clearSearch() {
  const searchInput = getSearchInputElement();
  if (!searchInput) return;

  searchInput.value = "";
  hideSearchCommandDropdown();
  filterImages("");
  updateClearButtonVisibility();
  searchInput.focus();
}

function updateClearButtonVisibility() {
  const searchInput = getSearchInputElement();
  const clearBtn = getClearSearchButton();
  if (!searchInput || !clearBtn) return;

  clearBtn.classList.toggle("visible", searchInput.value.length > 0);
}

function matchesAliasQuery(searchableName, normalizedQuery) {
  if (!normalizedQuery) return false;

  if (typeof abbreviationsMap !== "undefined" && abbreviationsMap[normalizedQuery]) {
    const aliasFullName = normalizeSearchText(abbreviationsMap[normalizedQuery]);
    if (aliasFullName && searchableName.includes(aliasFullName)) {
      return true;
    }
  }

  if (
    (normalizedQuery === "smt" || normalizedQuery === "shin megami tensei") &&
    searchableName.includes("persona")
  ) {
    return true;
  }

  if (normalizedQuery === "persona" && searchableName.includes("shin megami tensei")) {
    return true;
  }

  return false;
}

function matchesQuery(gameName, searchQuery) {
  const searchableName = normalizeSearchText(gameName);
  const normalizedQuery = normalizeSearchText(searchQuery);

  if (!normalizedQuery) {
    return true;
  }

  if (searchableName.includes(normalizedQuery)) {
    return true;
  }

  return matchesAliasQuery(searchableName, normalizedQuery);
}

function extractMetadataForSearch(imageElement, metadataMap) {
  const imageId = imageElement?.dataset?.imageId;
  const metadata = (imageId && metadataMap[imageId]) || getDefaultSearchMetadata();

  return {
    imageId: imageId || null,
    imageName: metadata.name || "",
    imagePlatform: metadata.platform || "",
    imageDescription: metadata.description || "",
    imageDate: metadata.date || "",
    imageStatus: metadata.status || "",
    imageDeveloper: metadata.developer || "",
    imageGameType: metadata.gameType || "Original Game",
    imageOriginalGame: metadata.originalGame || "",
  };
}

function evaluateImageAgainstQuery(metadata, filteredQuery) {
  if (!filteredQuery) {
    return true;
  }

  if (filteredQuery.startsWith("/")) {
    if (typeof processCommandFilter !== "function") {
      return true;
    }

    return processCommandFilter(
      filteredQuery,
      metadata.imageName,
      metadata.imagePlatform,
      metadata.imageDescription,
      metadata.imageDate,
      metadata.imageStatus,
      metadata.imageDeveloper,
      metadata.imageGameType,
      metadata.imageOriginalGame
    );
  }

  return matchesQuery(metadata.imageName, filteredQuery);
}

function applySearchVisibilityToContainer(container, metadataMap, filteredQuery) {
  if (!container) return;

  const images = Array.from(container.querySelectorAll(".image"));
  images.forEach((img) => {
    const metadata = extractMetadataForSearch(img, metadataMap);
    const shouldShow = evaluateImageAgainstQuery(metadata, filteredQuery);
    img.style.display = shouldShow ? "" : "none";
  });
}

function updateSearchResultCount(showCounts, filteredQuery) {
  const totalCountEl = document.getElementById("total-count");
  if (!totalCountEl) return;

  const visibleTierImages = Array.from(document.querySelectorAll(".row .image")).filter(
    (img) => img.style.display !== "none"
  );

  const visibleCount = visibleTierImages.length;
  const shouldShowTotal = (showCounts || filteredQuery !== "") && visibleCount > 0;

  if (shouldShowTotal) {
    totalCountEl.textContent = `Total: ${visibleCount}`;
    totalCountEl.style.display = "";
  } else {
    totalCountEl.style.display = "none";
  }
}

function parseSearchQuery(searchQuery) {
  const rawQuery = String(searchQuery || "").trim();
  const normalizedQuery = rawQuery === "/" ? "" : normalizeSearchText(rawQuery);

  let showCounts = false;
  let filteredQuery = normalizedQuery;

  if (filteredQuery.includes("/showamount")) {
    showCounts = true;
    filteredQuery = filteredQuery.replace("/showamount", "").trim();
  }

  return {
    rawQuery,
    normalizedQuery,
    filteredQuery,
    showCounts,
  };
}

async function getSearchMetadataMap() {
  const allMetadata = await getAllImageMetadataFromIndexedDB();
  const metadataMap = Object.create(null);

  allMetadata.forEach((metadata) => {
    if (!metadata || !metadata.id) return;
    metadataMap[metadata.id] = metadata;
  });

  return metadataMap;
}

async function filterImages(searchQuery) {
  const requestId = ++latestSearchRequestId;
  const rows = getSearchRows();
  const imagesBar = getSearchImagesBar();
  const { filteredQuery, showCounts } = parseSearchQuery(searchQuery);

  try {
    const metadataMap = await getSearchMetadataMap();

    if (requestId !== latestSearchRequestId) {
      return;
    }

    rows.forEach((row) => {
      const tierContainer = row.children?.[1];
      applySearchVisibilityToContainer(tierContainer, metadataMap, filteredQuery);
    });

    applySearchVisibilityToContainer(imagesBar, metadataMap, filteredQuery);

    if (typeof updateTierCounts === "function") {
      updateTierCounts(showCounts);
    }

    updateSearchResultCount(showCounts, filteredQuery);
  } catch (err) {
    if (requestId !== latestSearchRequestId) {
      return;
    }

    searchLogError("Failed filtering images.", err);

    rows.forEach((row) => {
      const tierImages = row.children?.[1]?.querySelectorAll?.(".image") || [];
      tierImages.forEach((img) => {
        img.style.display = "";
      });
    });

    imagesBar?.querySelectorAll?.(".image")?.forEach?.((img) => {
      img.style.display = "";
    });

    if (typeof updateTierCounts === "function") {
      updateTierCounts(false);
    }

    updateSearchResultCount(false, "");
  } finally {
    updateClearButtonVisibility();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = getSearchInputElement();
  if (searchInput) {
    searchInput.addEventListener("input", updateClearButtonVisibility);
  }

  updateClearButtonVisibility();
});