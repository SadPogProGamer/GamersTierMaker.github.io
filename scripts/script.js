// script.js
// Core app logic for uploads, selection, drag/drop, local save/load, and bootstrapping.

const hash = location.hash.substring(1);

window.pickrInstances = window.pickrInstances || [];
let initializationComplete = false;
let drake = null;
let scrollable = true;
let suppressNextLeftClick = false;
let selectedImages = new Set();
let isDraggingImages = false;

const MAX_FILE_SIZE_MB = 10;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);

function scriptLogError(context, err) {
  console.error(`[script.js] ${context}`, err);
}

function countsAreShown() {
  return document.querySelector(".tier-count") !== null;
}

function getMainElement() {
  return document.querySelector("main");
}

function getRows() {
  return Array.from(document.querySelectorAll(".row"));
}

function getImagesBar() {
  return document.querySelector("#images-bar");
}

function getDropZoneHint() {
  return document.getElementById("drop-zone-hint");
}

function getSearchInput() {
  return document.getElementById("search-input");
}

function isMobileDevice() {
  return window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
}

function setDropHintVisibility() {
  const imagesBar = getImagesBar();
  const hint = getDropZoneHint();
  if (!imagesBar || !hint) return;

  const hasImages = imagesBar.querySelector(".image");
  hint.style.display = hasImages ? "none" : "block";
}

function createImageElement({ src, id, cloudinaryUrl }) {
  const image = document.createElement("img");
  image.src = src;
  image.className = "image";
  image.dataset.imageSrc = src;
  image.dataset.imageId = id;
  image.dataset.cloudinaryUrl = cloudinaryUrl || src;

  image.addEventListener("click", () => openImageModal(image));
  setupImageSelection(image);

  image.addEventListener(
    "error",
    () => {
      image.remove();
      deleteImageFromIndexedDB(id).catch((err) => {
        scriptLogError(`Failed removing broken image ${id} from IndexedDB.`, err);
      });
      setDropHintVisibility();
    },
    { once: true }
  );

  return image;
}

function setUploadStatus(message, type = "loading") {
  const el = document.getElementById("upload-status");
  if (!el) return;

  el.textContent = message;
  el.className = `upload-status ${type}`;
  el.classList.remove("hidden");
}

function clearUploadStatus(delay = 3000) {
  setTimeout(() => {
    const el = document.getElementById("upload-status");
    if (el) el.classList.add("hidden");
  }, delay);
}

function hasDraggedFiles(event) {
  const types = event?.dataTransfer?.types;
  return !!types && Array.from(types).includes("Files");
}

function setGlobalDropActive(isActive) {
  const imagesBar = getImagesBar();
  if (imagesBar) {
    imagesBar.classList.toggle("drag-over", isActive);
  }
  document.body.classList.toggle("global-file-drag", isActive);
}

async function buildTierListData() {
  const tierListData = {
    header: document.getElementById("main-title")?.textContent || "Untitled Tierlist",
    tiers: [],
    imagePositions: [],
    gameMetadata: {},
    tierOrderingStates: typeof tierOrderingStates === "object" && tierOrderingStates ? { ...tierOrderingStates } : {},
    tierLimitStates: typeof tierLimitStates === "object" && tierLimitStates ? { ...tierLimitStates } : {},
    lastUpdated: new Date().toISOString(),
  };

  let allImages = [];
  try {
    allImages = indexedDb ? await getImagesFromIndexedDB() : [];
  } catch (err) {
    scriptLogError("Failed reading images for tier list build.", err);
  }

  const metadataMap = {};
  for (const image of allImages) {
    try {
      const metadata = await getImageMetadataFromIndexedDB(image.id);
      if (metadata) metadataMap[image.id] = metadata;
    } catch (err) {
      scriptLogError(`Failed reading metadata for image ${image?.id}.`, err);
    }
  }

  const rows = getRows();
  rows.forEach((row, tierIndex) => {
    const tierLabel = row.querySelector(".tier-label");
    const tierImages = row.children[1] ? Array.from(row.children[1].querySelectorAll(".image")) : [];

    tierListData.tiers.push({
      index: tierIndex,
      name: tierLabel?.querySelector("p")?.textContent || `Tier ${tierIndex + 1}`,
      color: tierLabel?.style.backgroundColor || "lightslategray",
    });

    tierImages.forEach((img, order) => {
      const imageId = img.dataset.imageId;
      const details = metadataMap[imageId] || null;

      tierListData.imagePositions.push({
        imageId,
        imageSrc: img.dataset.imageSrc || img.dataset.cloudinaryUrl || img.src || "",
        tier: tierIndex,
        order,
        details,
      });

      if (details) {
        tierListData.gameMetadata[imageId] = details;
      }
    });
  });

  const imagesBar = getImagesBar();
  const barImages = imagesBar ? Array.from(imagesBar.querySelectorAll(".image")) : [];
  barImages.forEach((img, order) => {
    const imageId = img.dataset.imageId;
    const details = metadataMap[imageId] || null;

    tierListData.imagePositions.push({
      imageId,
      imageSrc: img.dataset.imageSrc || img.dataset.cloudinaryUrl || img.src || "",
      tier: -1,
      order,
      details,
    });

    if (details) {
      tierListData.gameMetadata[imageId] = details;
    }
  });

  return tierListData;
}

async function saveTierListLocally() {
  if (!initializationComplete || isDraggingImages) return;

  try {
    const data = await buildTierListData();
    await saveSetting("localTierList", data);
    localStorage.setItem("savedTierList", JSON.stringify(data));
  } catch (err) {
    scriptLogError("Failed saving tier list locally.", err);
  }
}

function updateTierCounts(showCounts) {
  document.querySelectorAll(".tier-count").forEach((count) => count.remove());

  if (!showCounts) return;

  getRows().forEach((row) => {
    const label = row.querySelector(".tier-label");
    const tier = row.children[1];
    if (!label || !tier) return;

    const count = document.createElement("div");
    count.className = "tier-count";
    count.textContent = String(tier.querySelectorAll(".image").length);
    label.appendChild(count);
  });

  const totalCount = document.getElementById("total-count");
  if (totalCount) {
    totalCount.style.display = "block";
    totalCount.textContent = `${document.querySelectorAll(".image").length} total`;
  }
}

function clearImageSelection() {
  selectedImages.forEach((img) => img.classList.remove("selected"));
  selectedImages.clear();
}

function selectImage(image) {
  if (!image) return;
  image.classList.add("selected");
  selectedImages.add(image);
}

function deselectImage(image) {
  if (!image) return;
  image.classList.remove("selected");
  selectedImages.delete(image);
}

function toggleImageSelection(image) {
  if (!image) return;
  if (selectedImages.has(image)) {
    deselectImage(image);
  } else {
    selectImage(image);
  }
}

function handleImageContextMenu(event, image) {
  const isMultiSelect = event.ctrlKey || event.metaKey || event.shiftKey;

  if (!isMultiSelect) {
    return;
  }

  event.preventDefault();
  suppressNextLeftClick = true;

  if (!selectedImages.has(image)) {
    selectImage(image);
    return;
  }

  toggleImageSelection(image);
}

function updateDragMirror() {
  const mirror = document.querySelector(".gu-mirror");
  if (!mirror) return;

  if (selectedImages.size <= 1) {
    mirror.classList.remove("selected-group");
    return;
  }

  mirror.classList.add("selected-group");
  mirror.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.gap = "8px";
  wrapper.style.alignItems = "center";
  wrapper.style.padding = "4px";

  selectedImages.forEach((img) => {
    const clone = img.cloneNode(true);
    clone.classList.remove("selected");
    clone.style.margin = "0";
    clone.style.outline = "none";
    clone.style.maxHeight = "85px";
    clone.style.width = getComputedStyle(img).width;
    clone.style.height = getComputedStyle(img).height;
    wrapper.appendChild(clone);
  });

  mirror.appendChild(wrapper);
}

function setupImageSelection(image) {
  image.addEventListener("contextmenu", (event) => handleImageContextMenu(event, image));
  image.addEventListener("mousedown", (event) => {
    if (event.button === 0 && suppressNextLeftClick) {
      suppressNextLeftClick = false;
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

function moveSelectedImagesToTarget(primaryElement, target, sibling = null) {
  if (!target || !primaryElement) return;

  const extraImages = Array.from(selectedImages).filter((img) => {
    return (
      img !== primaryElement &&
      img &&
      img.isConnected &&
      img.classList.contains("image")
    );
  });

  if (sibling && extraImages.includes(sibling)) {
    sibling = null;
  }

  extraImages.forEach((img) => {
    target.insertBefore(img, sibling || null);
  });
}

async function handlePostDrop(target) {
  const targetRow = target?.parentNode;
  if (targetRow && targetRow.classList.contains("row")) {
    const rows = getRows();
    const tierIndex = rows.indexOf(targetRow);

    if (tierIndex >= 0 && tierLimitStates[tierIndex]) {
      const tierImages = Array.from(target.querySelectorAll(".image"));
      if (tierImages.length > 10 && tierIndex < rows.length - 1) {
        const overflow = tierImages.slice(10);
        const tierBelow = rows[tierIndex + 1]?.children?.[1];
        if (tierBelow) {
          overflow.reverse().forEach((img) => {
            tierBelow.insertBefore(img, tierBelow.firstChild);
          });
        }
      }
    }

    if (tierIndex >= 0 && tierOrderingStates[tierIndex]) {
      try {
        await sortTierByPlatform(target);
      } catch (err) {
        scriptLogError("Failed sorting tier by platform after drop.", err);
      }
    }
  }

  try {
    await saveImagePositions();
  } catch (err) {
    scriptLogError("Failed saving image positions after drop.", err);
  }

  await saveTierListLocally().catch((err) => {
    scriptLogError("Failed local save after drop.", err);
  });

  updateTierCounts(countsAreShown());
  setDropHintVisibility();
}

function initializeDragula() {
  const containers = Array.from(document.querySelectorAll(".sort"));

  if (drake) {
    try {
      drake.destroy();
    } catch (err) {
      scriptLogError("Dragula destroy failed during reinit.", err);
    } finally {
      drake = null;
    }
  }

  if (!containers.length || typeof dragula !== "function") {
    return;
  }

  drake = dragula(containers, {
    removeOnSpill: false,
    mirrorContainer: document.body,
    accepts: (el, target) => !!target && target.classList.contains("sort"),
  });

  drake
    .on("drag", (el) => {
      isDraggingImages = true;
      scrollable = false;

      if (!selectedImages.has(el)) {
        clearImageSelection();
        selectImage(el);
      }

      updateDragMirror();
    })

    .on("drop", async (el, target, source, sibling) => {
      try {
        if (!target) {
          return;
        }

        if (selectedImages.has(el) && selectedImages.size > 1) {
          moveSelectedImagesToTarget(el, target, sibling);
        }

        clearImageSelection();

        await new Promise((resolve) => requestAnimationFrame(resolve));

        scrollable = true;
        isDraggingImages = false;

        await handlePostDrop(target);

        if (typeof flushPendingRealtimeSync === "function") {
          await flushPendingRealtimeSync();
        }
      } catch (err) {
        scriptLogError("Dragula drop handling failed.", err);
      } finally {
        scrollable = true;
        isDraggingImages = false;
        clearImageSelection();
      }
    })

    .on("cancel", async () => {
      scrollable = true;
      isDraggingImages = false;
      clearImageSelection();

      if (typeof flushPendingRealtimeSync === "function") {
        await flushPendingRealtimeSync();
      }
    })

    .on("dragend", async () => {
      scrollable = true;
      isDraggingImages = false;

      if (typeof flushPendingRealtimeSync === "function") {
        await flushPendingRealtimeSync();
      }
    })

    .on("over", (el, container) => {
      if (container && container.classList.contains("sort")) {
        container.style.backgroundColor = "rgba(127, 255, 255, 0.1)";
      }
    })

    .on("out", (el, container) => {
      if (container && container.classList.contains("sort")) {
        container.style.backgroundColor = "";
      }
    });
}

document.addEventListener(
  "touchmove",
  (event) => {
    if (!scrollable) {
      event.preventDefault();
    }
  },
  { passive: false }
);

function selectImages() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = Array.from(ALLOWED_IMAGE_TYPES).join(",");
  input.multiple = true;

  input.addEventListener("change", () => uploadImages(input.files));
  input.click();
}

async function computeFileHash(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function validateUploadFile(file) {
  if (!file) {
    throw new Error("Missing file.");
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.name}`);
  }

  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw new Error(`File too large: ${file.name}`);
  }
}

const activeUploadIds = new Set();

async function uploadImages(fileList) {
  const files = Array.from(fileList || []);
  const imagesBar = getImagesBar();
  if (!imagesBar || !files.length) return;

  let skippedCount = 0;
  let uploadedCount = 0;
  let failedCount = 0;

  setUploadStatus(`Uploading 0 / ${files.length}`, "loading");

  const existingImages = indexedDb
    ? await getImagesFromIndexedDB().catch((err) => {
      scriptLogError("Failed loading existing images before upload.", err);
      return [];
    })
    : [];

  const existingIds = new Set(existingImages.map((img) => img.id));

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    setUploadStatus(`Uploading ${i + 1} / ${files.length}`, "loading");

    try {
      validateUploadFile(file);

      const imageId = await computeFileHash(file);

      if (existingIds.has(imageId) || activeUploadIds.has(imageId)) {
        skippedCount += 1;
        continue;
      }

      activeUploadIds.add(imageId);

      try {
        const uploadedUrl = await uploadToCloudinary(file);
        const image = createImageElement({
          src: uploadedUrl,
          id: imageId,
          cloudinaryUrl: uploadedUrl,
        });

        imagesBar.appendChild(image);

        await saveImageToIndexedDB({
          id: imageId,
          src: uploadedUrl,
          cloudinaryUrl: uploadedUrl,
          tier: -1,
          order: imagesBar.querySelectorAll(".image").length - 1,
        });

        existingIds.add(imageId);
        uploadedCount += 1;
      } finally {
        activeUploadIds.delete(imageId);
      }
    } catch (err) {
      failedCount += 1;
      scriptLogError(`Failed uploading file ${file?.name || "unknown"}.`, err);
    }
  }

  setDropHintVisibility();

  saveTierListLocally().catch((err) => {
    scriptLogError("Failed saving tier list locally after upload.", err);
  });

  if (failedCount > 0) {
    setUploadStatus(
      `Uploaded ${uploadedCount}, skipped ${skippedCount}, failed ${failedCount}`,
      "error"
    );
  } else {
    setUploadStatus(
      `Uploaded ${uploadedCount}, skipped ${skippedCount}`,
      "success"
    );
  }

  clearUploadStatus();
}

function handleDragOver(event) {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  event.stopPropagation();
  setGlobalDropActive(true);
}

function handleDragLeave(event) {
  if (!hasDraggedFiles(event)) return;
  event.stopPropagation();

  const imagesBar = getImagesBar();
  if (!imagesBar) {
    setGlobalDropActive(false);
    return;
  }

  if (!imagesBar.contains(event.relatedTarget)) {
    setGlobalDropActive(false);
  }
}

function handleImageDrop(event) {
  if (!hasDraggedFiles(event)) return;

  event.preventDefault();
  event.stopPropagation();
  setGlobalDropActive(false);

  const files = event.dataTransfer?.files;
  if (files && files.length) {
    uploadImages(files).catch((err) => {
      scriptLogError("Drop upload failed.", err);
    });
  }
}

function createTemplateCard(container, data) {
  if (!container || !data) return;

  const card = document.createElement("div");
  card.className = "template-card";

  const preview = document.createElement("div");
  preview.className = "template-preview";
  preview.style.display = "flex";
  preview.style.flexDirection = "column";
  preview.style.justifyContent = "center";
  preview.style.alignItems = "center";
  preview.style.color = "#fff";
  preview.style.padding = "8px";

  const title = document.createElement("div");
  title.style.fontWeight = "bold";
  title.style.marginBottom = "6px";
  title.textContent = data.header || "Untitled Tierlist";

  const count = document.createElement("div");
  const imgCount = (data.imagePositions && data.imagePositions.length) || 0;
  count.textContent = `${imgCount} images`;

  const footer = document.createElement("div");
  footer.className = "template-footer";
  footer.textContent = "Saved";

  preview.appendChild(title);
  preview.appendChild(count);
  card.appendChild(preview);
  card.appendChild(footer);

  card.style.cursor = "pointer";
  card.addEventListener("click", () => {
    try {
      sessionStorage.my_tierlist_to_load = JSON.stringify(data);
      window.location.href = "index.html";
    } catch (err) {
      scriptLogError("Failed preparing tierlist load from template card.", err);
    }
  });

  container.appendChild(card);
}

async function loadTierListFromObject(tierListData) {
  if (!tierListData) return;

  const title = document.getElementById("main-title");
  if (title && tierListData.header) {
    title.textContent = tierListData.header;
  }

  if (Array.isArray(tierListData.tiers) && tierListData.tiers.length) {
    const existingRows = getRows();
    for (let i = existingRows.length; i < tierListData.tiers.length; i += 1) {
      addRow("New tier", "lightslategray");
    }
  }

  let rows = getRows();
  if (Array.isArray(tierListData.tiers)) {
    tierListData.tiers.forEach((tier, index) => {
      const row = rows[index];
      if (!row) return;

      const tierLabel = row.querySelector(".tier-label");
      const paragraph = tierLabel?.querySelector("p");

      if (paragraph && tier.name) paragraph.textContent = tier.name;
      if (tierLabel && tier.color) tierLabel.style.backgroundColor = tier.color;
    });
  }

  document.querySelectorAll(".image").forEach((img) => img.remove());

  const imagesBar = getImagesBar();
  const metadataSavePromises = [];
  const imageSavePromises = [];

  if (Array.isArray(tierListData.imagePositions) && tierListData.imagePositions.length) {
    const sortedImagePositions = [...tierListData.imagePositions].sort((a, b) => {
      const tierA = a.tier === -1 ? Number.MAX_SAFE_INTEGER : a.tier;
      const tierB = b.tier === -1 ? Number.MAX_SAFE_INTEGER : b.tier;
      if (tierA !== tierB) return tierA - tierB;
      return (a.order || 0) - (b.order || 0);
    });

    for (const imgPos of sortedImagePositions) {
      const imageId = imgPos.imageId || `img_${Math.random().toString(36).slice(2)}`;
      const imageSrc = imgPos.imageSrc || "";
      if (!imageSrc) continue;

      const image = createImageElement({
        src: imageSrc,
        id: imageId,
        cloudinaryUrl: imageSrc,
      });

      if (typeof imgPos.tier === "number" && imgPos.tier >= 0 && rows[imgPos.tier]) {
        rows[imgPos.tier].children[1].appendChild(image);
      } else if (imagesBar) {
        imagesBar.appendChild(image);
      }

      imageSavePromises.push(
        saveImageToIndexedDB({
          id: imageId,
          src: imageSrc,
          cloudinaryUrl: imageSrc,
          tier: typeof imgPos.tier === "number" ? imgPos.tier : -1,
          order: imgPos.order || 0,
        }).catch((err) => {
          scriptLogError(`Failed saving restored image ${imageId} to IndexedDB.`, err);
        })
      );

      const imageDetails = imgPos.details || (tierListData.gameMetadata && tierListData.gameMetadata[imageId]);
      if (imageDetails) {
        metadataSavePromises.push(
          saveImageMetadataToIndexedDB(imageId, imageDetails).catch((err) => {
            scriptLogError(`Failed saving restored metadata for ${imageId}.`, err);
          })
        );
      }
    }
  }

  await Promise.all([...metadataSavePromises, ...imageSavePromises]);

  if (tierListData.tierOrderingStates && typeof tierListData.tierOrderingStates === "object") {
    tierOrderingStates = { ...tierListData.tierOrderingStates };
    rows = getRows();
    for (let i = 0; i < rows.length; i += 1) {
      if (tierOrderingStates[i]) {
        try {
          await sortTierByPlatform(rows[i].children[1]);
        } catch (err) {
          scriptLogError(`Failed applying saved tier ordering for tier ${i}.`, err);
        }
      }
    }
  }

  if (tierListData.tierLimitStates && typeof tierListData.tierLimitStates === "object") {
    tierLimitStates = { ...tierListData.tierLimitStates };
  }

  try {
    await applyTierSettingsToRows();
  } catch (err) {
    scriptLogError("Failed applying tier settings after restore.", err);
  }

  initializeDragula();
  setDropHintVisibility();
  updateTierCounts(countsAreShown());
}

function bindCoreUiEvents() {
  const title = document.getElementById("main-title");
  if (title) {
    title.addEventListener("input", () => {
      saveTierListLocally().catch((err) => scriptLogError("Failed saving title change.", err));
    });
  }
}

async function bootstrapApp() {
  try {
    await initializeFirebase();
  } catch (err) {
    scriptLogError("Firebase bootstrap failed.", err);
  }

  try {
    await initializeIndexedDB();
  } catch (err) {
    scriptLogError("IndexedDB bootstrap failed.", err);
    alert("This browser could not initialize local storage for the tier list.");
  }

  try {
    if (typeof loadHeaderFromStorage === "function") loadHeaderFromStorage();
    if (typeof loadTierOrderingStates === "function") await loadTierOrderingStates();
    if (typeof loadTierLimitStates === "function") await loadTierLimitStates();
    if (typeof loadTierColors === "function") loadTierColors();
  } catch (err) {
    scriptLogError("Failed loading saved tier settings during bootstrap.", err);
  }

  try {
    if (sessionStorage && sessionStorage.my_tierlist_to_load) {
      const data = JSON.parse(sessionStorage.my_tierlist_to_load);
      delete sessionStorage.my_tierlist_to_load;
      await loadTierListFromObject(data);
    } else if (currentUser) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    } else if (hash.length <= 1) {
      await loadTierListFromLocalStorage();
    }
  } catch (err) {
    scriptLogError("Bootstrap data restore failed.", err);
  }

  try {
    if (typeof cleanupBrokenImages === "function") {
      await cleanupBrokenImages();
    }
  } catch (err) {
    scriptLogError("Broken image cleanup failed during bootstrap.", err);
  }

  initializeDragula();
  bindCoreUiEvents();
  setDropHintVisibility();
  updateTierCounts(countsAreShown());

  initializationComplete = true;

  if (currentUser && firebaseDb && firebaseAvailable) {
    startRealtimeSync();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bootstrapApp().catch((err) => {
    scriptLogError("Unhandled bootstrap failure.", err);
  });
});

document.addEventListener("dragenter", (event) => {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  setGlobalDropActive(true);
});

document.addEventListener("dragover", (event) => {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  setGlobalDropActive(true);
});

document.addEventListener("dragleave", (event) => {
  if (!hasDraggedFiles(event)) return;

  const related = event.relatedTarget;
  if (!related || related === document.documentElement || related === document.body) {
    setGlobalDropActive(false);
  }
});

document.addEventListener("drop", (event) => {
  if (!hasDraggedFiles(event)) return;

  const imagesBar = getImagesBar();

  if (imagesBar && event.target instanceof Node && imagesBar.contains(event.target)) {
    return;
  }

  event.preventDefault();
  setGlobalDropActive(false);

  const files = event.dataTransfer?.files;
  if (files && files.length) {
    uploadImages(files).catch((err) => {
      scriptLogError("Global drop upload failed.", err);
    });
  }
});

function applyDeviceClass() {
  if (isMobileDevice()) {
    document.body.classList.add("mobile");
  } else {
    document.body.classList.remove("mobile");
  }
}

applyDeviceClass();
window.addEventListener("resize", applyDeviceClass);