// SearchFunction.js
// Handles plain game search filtering logic.

function clearSearch() {
  const searchInput = document.getElementById("search-input");
  searchInput.value = "";
  document.getElementById("search-commands-dropdown").classList.add("hidden");
  filterImages("");
  searchInput.focus();
}

function updateClearButtonVisibility() {
  const searchInput = document.getElementById("search-input");
  const clearBtn = document.getElementById("clear-search");

  if (searchInput.value.length > 0) {
    clearBtn.classList.add("visible");
  } else {
    clearBtn.classList.remove("visible");
  }
}

function matchesQuery(gameName, searchQuery) {
  const gameNameLower = gameName.toLowerCase().replace(/&/g, "and");

  if (gameNameLower.includes(searchQuery)) {
    return true;
  }

  if (typeof abbreviationsMap !== 'undefined' && abbreviationsMap[searchQuery]) {
    const fullName = abbreviationsMap[searchQuery].toLowerCase();
    if (gameNameLower.includes(fullName)) {
      return true;
    }
  }

  if ((searchQuery === "smt" || searchQuery === "shin megami tensei") && gameNameLower.includes("persona")) {
    return true;
  }

  if (searchQuery === "persona" && gameNameLower.includes("shin megami tensei")) {
    return true;
  }

  return false;
}

function filterImages(searchQuery) {
  const rows = document.querySelectorAll(".row");
  const imagesBar = document.querySelector("#images-bar");

  const rawQuery = searchQuery.trim();
  const query = rawQuery === "/" ? "" : searchQuery.toLowerCase().replace(/&/g, "and");

  getAllImageMetadataFromIndexedDB().then(allMetadata => {
    const metadataMap = {};
    allMetadata.forEach(metadata => {
      metadataMap[metadata.id] = metadata;
    });

    let showCounts = false;
    let filteredQuery = query;
    if (query.includes("/showamount")) {
      showCounts = true;
      filteredQuery = query.replace("/showamount", "").trim();
    }

    rows.forEach((row) => {
      const tierImages = row.children[1].querySelectorAll(".image");
      tierImages.forEach((img) => {
        const imageId = img.dataset.imageId;
        const metadata = metadataMap[imageId] || { name: "", date: "", description: "", status: "", platform: null, developer: "" };
        const imageName = metadata.name;
        const imagePlatform = metadata.platform ? metadata.platform : "";
        const imageDescription = metadata.description || "";
        const imageDate = metadata.date || "";
        const imageStatus = metadata.status || "";
        const imageDeveloper = metadata.developer || "";

        let shouldShow;
        if (filteredQuery.startsWith("/")) {
          shouldShow = processCommandFilter(filteredQuery, imageName, imagePlatform, imageDescription, imageDate, imageStatus, imageDeveloper);
        } else {
          shouldShow = matchesQuery(imageName, filteredQuery);
        }

        img.style.display = shouldShow ? "" : "none";
      });
    });

    updateTierCounts(showCounts);

    try {
      const totalCountEl = document.getElementById('total-count');
      if (totalCountEl) {
        const total = Array.from(document.querySelectorAll('.row .image')).filter(img => img.style.display !== 'none').length;
        if ((showCounts || filteredQuery !== "") && total > 0) {
          totalCountEl.textContent = `Total: ${total}`;
          totalCountEl.style.display = '';
        } else {
          totalCountEl.style.display = 'none';
        }
      }
    } catch (e) {
    }

    const barImages = imagesBar.querySelectorAll(".image");
    barImages.forEach((img) => {
      const imageId = img.dataset.imageId;
      const metadata = metadataMap[imageId] || { name: "", date: "", description: "", status: "", platform: null, developer: "" };
      const imageName = metadata.name;
      const imagePlatform = metadata.platform ? metadata.platform : "";
      const imageDescription = metadata.description || "";
      const imageDate = metadata.date || "";
      const imageStatus = metadata.status || "";
      const imageDeveloper = metadata.developer || "";

      let shouldShow;
      if (filteredQuery.startsWith("/")) {
        shouldShow = processCommandFilter(filteredQuery, imageName, imagePlatform, imageDescription, imageDate, imageStatus, imageDeveloper);
      } else {
        shouldShow = matchesQuery(imageName, filteredQuery);
      }

      img.style.display = shouldShow ? "" : "none";
    });
  }).catch(err => {
  });

  updateClearButtonVisibility();
}

document.addEventListener("DOMContentLoaded", function() {
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", updateClearButtonVisibility);
  }
});
