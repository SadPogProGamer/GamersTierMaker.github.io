// BottomButtons.js
// Handles export, download, sharing, screenshot download, and full tier list deletion.
// Designed to stay compatible with the existing HTML and the rewritten DatabaseSyncing.js / script.js.

const BUTTONS_LOADING_OVERLAY_ID = "buttons-loading-overlay";
const SHARE_UPLOAD_ENDPOINT = "https://hastebin.skyra.pw/documents";
const MAX_SHARE_CHUNK_SIZE = 10000;
const SCREENSHOT_FILENAME = "GamersTierMaker_tierlist.png";
const ZIP_FILENAME = "GamersTierMaker_images.zip";
const DETAILS_FILENAME = "GamersTierMaker_game_details.json";

function bottomButtonsLogError(context, err) {
  console.error(`[BottomButtons] ${context}`, err);
}

function getAllImagesOnPage() {
  return Array.from(document.querySelectorAll(".image"));
}

function getTierRowsForButtons() {
  return Array.from(document.querySelectorAll(".row"));
}

function getImagesBarForButtons() {
  return document.getElementById("images-bar");
}

// --- Game Key Helpers ---
function normalizeGameKeyPart(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

let manualImportState = null;

function ensureManualImportOverlay() {
  let overlay = document.getElementById("manual-import-overlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "manual-import-overlay";
  overlay.style.cssText = [
    "position: fixed",
    "right: 20px",
    "bottom: 20px",
    "width: 360px",
    "max-width: calc(100vw - 40px)",
    "background: rgba(20,20,20,0.96)",
    "color: white",
    "padding: 16px",
    "border-radius: 12px",
    "box-shadow: 0 10px 30px rgba(0,0,0,0.4)",
    "z-index: 20000",
    "font-family: sans-serif",
    "line-height: 1.4",
  ].join(";");

  overlay.innerHTML = `
    <div id="manual-import-title" style="font-size:16px;font-weight:700;margin-bottom:8px;">
      Manual import matching
    </div>
    <div id="manual-import-progress" style="font-size:13px;opacity:0.8;margin-bottom:10px;"></div>
    <div id="manual-import-entry" style="font-size:14px;margin-bottom:12px;"></div>
    <div id="manual-import-meta" style="font-size:12px;opacity:0.85;margin-bottom:12px;"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button id="manual-import-skip" type="button">Skip</button>
      <button id="manual-import-cancel" type="button">Cancel</button>
    </div>
    <div style="font-size:12px;opacity:0.75;margin-top:10px;">
      Click the correct image in your tier list to assign this entry.
    </div>
  `;

  document.body.appendChild(overlay);
  return overlay;
}

function removeManualImportOverlay() {
  const overlay = document.getElementById("manual-import-overlay");
  if (overlay) overlay.remove();
}

function buildImportedEntryMetadata(entry) {
  const normalizedStatus = normalizeImportedStatus(entry.status);

  // 👇 ADD IT HERE
  if (!normalizedStatus && entry.status) {
    console.warn("Invalid imported status:", entry.status);
  }

  return {
    name: entry.name || "",
    developer: entry.developer || "",
    date: entry.date || "",
    date100: normalizedStatus === "100% complete" ? (entry.date100 || "") : "",
    description: entry.description || "",
    platform: entry.platform || null,
    originalPlatform: entry.originalPlatform || null,
    status: normalizedStatus,
    has100Replay: normalizedStatus === "100% complete" ? !!entry.has100Replay : false,
    gameKey: entry.gameKey || makeGameKey(entry.name, entry.developer),
  };
}

async function applyImportedEntryToImage(entry, img, rows, imagesBar, metadataCache) {
  if (!img) return;

  const imageId = img.dataset.imageId;
  if (!imageId) return;

  const existingMeta = metadataCache.get(imageId) || {};
  const newMetadata = {
    ...existingMeta,
    ...buildImportedEntryMetadata(entry),
  };

  await saveImageMetadataToIndexedDB(imageId, newMetadata);
  metadataCache.set(imageId, newMetadata);

  if (typeof entry.tier === "number") {
    if (entry.tier === -1) {
      if (imagesBar) imagesBar.appendChild(img);
    } else if (rows[entry.tier] && rows[entry.tier].children[1]) {
      rows[entry.tier].children[1].appendChild(img);
    }
  }
}

function finishManualImportAssignment(cancelled = false) {
  if (!manualImportState) return;

  document.removeEventListener("click", manualImportState.handleImageClick, true);
  removeManualImportOverlay();

  const { resolve, unmatchedEntries, assignedCount, skippedCount } = manualImportState;
  manualImportState = null;

  resolve({
    cancelled,
    unmatchedEntries,
    assignedCount,
    skippedCount,
  });
}

function updateManualImportOverlay() {
  if (!manualImportState) return;

  const overlay = ensureManualImportOverlay();
  const progressEl = overlay.querySelector("#manual-import-progress");
  const entryEl = overlay.querySelector("#manual-import-entry");
  const metaEl = overlay.querySelector("#manual-import-meta");
  const skipBtn = overlay.querySelector("#manual-import-skip");
  const cancelBtn = overlay.querySelector("#manual-import-cancel");

  const { queue, index } = manualImportState;
  const current = queue[index];

  if (!current) {
    finishManualImportAssignment(false);
    return;
  }

  progressEl.textContent = `Entry ${index + 1} of ${queue.length}`;

  entryEl.innerHTML = `
    <div><strong>${current.name || "(Unnamed entry)"}</strong></div>
    <div>${current.developer || "Unknown developer"}</div>
  `;

  metaEl.innerHTML = `
    <div>Platform: ${current.platform || "Unknown"}</div>
    <div>Original Platform: ${current.originalPlatform || "Unknown"}</div>
    <div>Status: ${current.status || "Unknown"}</div>
    <div>Date: ${current.date || "Unknown"}</div>
    <div>Tier: ${typeof current.tier === "number" ? current.tier : "Unknown"}</div>
  `;

  skipBtn.onclick = () => {
    manualImportState.skippedCount += 1;
    manualImportState.unmatchedEntries.push(current);
    manualImportState.index += 1;
    updateManualImportOverlay();
  };

  cancelBtn.onclick = () => {
    finishManualImportAssignment(true);
  };
}

function startManualImportAssignment(queue, rows, imagesBar, metadataCache) {
  return new Promise((resolve) => {
    if (!Array.isArray(queue) || !queue.length) {
      resolve({
        cancelled: false,
        unmatchedEntries: [],
        assignedCount: 0,
        skippedCount: 0,
      });
      return;
    }

    manualImportState = {
      queue,
      index: 0,
      rows,
      imagesBar,
      metadataCache,
      assignedCount: 0,
      skippedCount: 0,
      unmatchedEntries: [],
      resolve,
      handleImageClick: async (event) => {
        if (!manualImportState) return;

        const img = event.target.closest(".image");
        if (!img) return;

        event.preventDefault();
        event.stopPropagation();

        const entry = manualImportState.queue[manualImportState.index];
        if (!entry) {
          finishManualImportAssignment(false);
          return;
        }

        try {
          await applyImportedEntryToImage(
            entry,
            img,
            manualImportState.rows,
            manualImportState.imagesBar,
            manualImportState.metadataCache
          );

          manualImportState.assignedCount += 1;
          manualImportState.index += 1;
          updateManualImportOverlay();
        } catch (err) {
          console.error("Failed applying manual import assignment:", err);
          alert("Failed to apply that entry to the selected image.");
        }
      },
    };

    document.addEventListener("click", manualImportState.handleImageClick, true);
    updateManualImportOverlay();
  });
}

function makeGameKey(name, developer) {
  const normalizedName = normalizeGameKeyPart(name);
  const normalizedDeveloper = normalizeGameKeyPart(developer);

  if (!normalizedName && !normalizedDeveloper) {
    return "";
  }

  if (!normalizedDeveloper) {
    return normalizedName;
  }

  return `${normalizedName}__${normalizedDeveloper}`;
}

function createLoadingOverlay(message = "Working...") {
  removeLoadingOverlay();

  const loadingDiv = document.createElement("div");
  loadingDiv.id = BUTTONS_LOADING_OVERLAY_ID;
  loadingDiv.style.cssText = [
    "position: fixed",
    "top: 50%",
    "left: 50%",
    "transform: translate(-50%, -50%)",
    "background: rgba(0,0,0,0.88)",
    "color: white",
    "padding: 16px 24px",
    "border-radius: 8px",
    "z-index: 10000",
    "font-size: 14px",
    "min-width: 220px",
    "text-align: center",
    "box-shadow: 0 8px 20px rgba(0,0,0,0.35)",
  ].join(";");
  loadingDiv.textContent = message;

  document.body.appendChild(loadingDiv);
  return loadingDiv;
}

function updateLoadingOverlay(message) {
  const loadingDiv = document.getElementById(BUTTONS_LOADING_OVERLAY_ID);
  if (loadingDiv) {
    loadingDiv.textContent = message;
  }
}

function removeLoadingOverlay() {
  const existing = document.getElementById(BUTTONS_LOADING_OVERLAY_ID);
  if (existing) existing.remove();
}

function sanitizeFileName(name, fallback = "image") {
  const cleaned = String(name || "")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function triggerBlobDownload(blob, filename) {
  if (window.saveAs) {
    window.saveAs(blob, filename);
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function blobFromImageUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image fetch failed with status ${response.status}`);
  }
  return response.blob();
}

function inferFileExtension(blob, src) {
  if (blob && blob.type) {
    const parts = blob.type.split("/");
    let ext = parts[1] ? parts[1].split(";")[0] : "";
    if (ext === "jpeg") ext = "jpg";
    if (ext) return ext;
  }

  const match = (src || "").split("?")[0].match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1] : "png";
}

async function downloadAllImagesZip() {
  if (!window.JSZip) {
    alert("Zip library not loaded.");
    return;
  }

  const images = getAllImagesOnPage();
  if (!images.length) {
    alert("No images to download.");
    return;
  }

  const loadingDiv = createLoadingOverlay("Preparing zip...");
  const zip = new JSZip();
  const nameCounts = Object.create(null);
  let addedCount = 0;

  try {
    for (let i = 0; i < images.length; i += 1) {
      const img = images[i];
      const src = img.dataset.cloudinaryUrl || img.dataset.imageSrc || img.src;
      updateLoadingOverlay(`Adding ${i + 1} of ${images.length}...`);

      try {
        const blob = await blobFromImageUrl(src);
        let metadata = null;

        try {
          metadata = await getImageMetadataFromIndexedDB(img.dataset.imageId);
        } catch (err) {
          bottomButtonsLogError(`Failed reading metadata while zipping image ${img.dataset.imageId}.`, err);
        }

        let baseName = sanitizeFileName(metadata?.name, img.dataset.imageId || `image_${i + 1}`);
        const ext = inferFileExtension(blob, src);
        let filename = `${baseName}.${ext}`;

        if (nameCounts[filename]) {
          nameCounts[filename] += 1;
          filename = `${baseName}_${nameCounts[filename]}.${ext}`;
        } else {
          nameCounts[filename] = 1;
        }

        zip.file(filename, blob);
        addedCount += 1;
      } catch (err) {
        bottomButtonsLogError(`Failed adding image ${src} to zip.`, err);
      }
    }

    if (!addedCount) {
      alert("Failed to prepare any images for download.");
      return;
    }

    updateLoadingOverlay("Finalizing zip...");
    const content = await zip.generateAsync({ type: "blob" });
    triggerBlobDownload(content, ZIP_FILENAME);
  } finally {
    loadingDiv.remove();
  }
}

function getImageDetailsFromPage() {
  const rows = getTierRowsForButtons();
  return getAllImagesOnPage().map((img) => {
    const imageId = img.dataset.imageId;
    const imageSrc = img.dataset.imageSrc || img.dataset.cloudinaryUrl || img.src || "";
    const row = img.closest(".row");
    const tierIndex = row ? rows.indexOf(row) : -1;
    return { imageId, imageSrc, tier: tierIndex };
  });
}

function getTierLayoutForExport() {
  return getTierRowsForButtons().map((row, index) => {
    const tierLabel = row.querySelector(".tier-label");
    const tierNameElement = tierLabel ? tierLabel.querySelector("p") : null;

    return {
      index,
      name: tierNameElement?.textContent || `Tier ${index + 1}`,
      color: tierLabel?.style?.backgroundColor || "lightslategray",
      orderOnPlatform: !!(typeof tierOrderingStates === "object" && tierOrderingStates && tierOrderingStates[index]),
      limitTo10: !!(typeof tierLimitStates === "object" && tierLimitStates && tierLimitStates[index]),
    };
  });
}

async function getGameDetailsForExport() {
  const entries = [];
  const imageDetails = getImageDetailsFromPage();

  for (const image of imageDetails) {
    if (!image.imageId) continue;

    let metadata = {
      name: "",
      developer: "",
      date: "",
      description: "",
      status: "",
      platform: null,
      originalPlatform: null,
      date100: "",
      has100Replay: false,
      gameKey: "",
    };

    try {
      const storedMetadata = await getImageMetadataFromIndexedDB(image.imageId);
      if (storedMetadata) {
        metadata = {
          ...metadata,
          ...storedMetadata,
        };
      }
    } catch (err) {
      bottomButtonsLogError(
        `Failed reading metadata for export on image ${image.imageId}.`,
        err
      );
    }

    const gameKey =
      metadata.gameKey ||
      makeGameKey(metadata.name, metadata.developer);

    entries.push({
      imageId: image.imageId,
      imageSrc: image.imageSrc,
      gameKey,
      tier: image.tier,
      name: metadata.name || "",
      developer: metadata.developer || "",
      date: metadata.date || "",
      description: metadata.description || "",
      platform: metadata.platform || null,
      originalPlatform: metadata.originalPlatform || null,
      status: metadata.status || "",
      date100: metadata.date100 || "",
      has100Replay: !!metadata.has100Replay,
    });
  }

  return entries;
}

function downloadGameDetailsJSON() {
  getGameDetailsForExport()
    .then((entries) => {
      if (!entries.length) {
        alert("No game details found to export.");
        return;
      }

      const payload = {
        exportedAt: new Date().toISOString(),
        layout: {
          tiers: getTierLayoutForExport(),
        },
        entries,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      triggerBlobDownload(blob, DETAILS_FILENAME);
    })
    .catch((err) => {
      bottomButtonsLogError("Failed exporting game details JSON.", err);
      alert("Failed to export game details. See console for details.");
    });
}

function convertImageToDataURL(imageElement) {
  const MAX_IMG_SIZE = 500;
  const canvas = document.createElement("canvas");
  const ratio = imageElement.naturalHeight / imageElement.naturalWidth || 1;

  if (ratio > 1) {
    canvas.height = Math.min(MAX_IMG_SIZE, imageElement.naturalHeight || MAX_IMG_SIZE);
    canvas.width = Math.round(MAX_IMG_SIZE / ratio);
  } else if (ratio < 1) {
    canvas.height = Math.round(MAX_IMG_SIZE * ratio);
    canvas.width = Math.min(MAX_IMG_SIZE, imageElement.naturalWidth || MAX_IMG_SIZE);
  } else {
    canvas.width = MAX_IMG_SIZE;
    canvas.height = MAX_IMG_SIZE;
  }

  const ctx = canvas.getContext("2d");
  ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
  const base64String = canvas.toDataURL();
  canvas.remove();
  return base64String;
}

function encodeUnicode(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function toSolidBytes(match, p1) {
      return String.fromCharCode(Number(`0x${p1}`));
    })
  );
}

function decodeUnicode(str) {
  return decodeURIComponent(
    atob(str)
      .split("")
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join("")
  );
}

async function postShareChunk(body) {
  const response = await fetch(SHARE_UPLOAD_ENDPOINT, {
    method: "POST",
    body,
  });

  if (!response.ok) {
    throw new Error(`Share upload failed with status ${response.status}`);
  }

  return response.json();
}

async function share(shareButton, sharePositions) {
  const tiers = getTierRowsForButtons();
  const imagesBar = getImagesBarForButtons();
  const barImages = imagesBar ? Array.from(imagesBar.children).filter((node) => node.classList?.contains("image")) : [];

  const oldButtonText = shareButton.innerText;
  shareButton.disabled = true;
  shareButton.innerText = "...";

  try {
    const shareJSON = {
      images: [],
      tiers: [],
    };

    tiers.forEach((tier, tierIndex) => {
      const tierName = tier.children?.[0]?.children?.[0]?.textContent || `Tier ${tierIndex + 1}`;
      const tierColor = tier.children?.[0]?.style?.backgroundColor || "lightslategray";
      const tierImages = tier.children?.[1] ? Array.from(tier.children[1].children).filter((node) => node.classList?.contains("image")) : [];

      shareJSON.tiers.push({
        index: tierIndex,
        name: tierName,
        color: tierColor,
      });

      tierImages.forEach((img) => {
        const base64String = convertImageToDataURL(img);
        shareJSON.images.push({
          img: base64String,
          tier: sharePositions ? tierIndex : -1,
        });
      });
    });

    barImages.forEach((img) => {
      const base64String = convertImageToDataURL(img);
      shareJSON.images.push({
        img: base64String,
        tier: -1,
      });
    });

    const c64 = encodeUnicode(JSON.stringify(shareJSON));
    const chunks = c64.match(new RegExp(`.{1,${MAX_SHARE_CHUNK_SIZE}}`, "g")) || [];
    if (!chunks.length) {
      throw new Error("Nothing to share.");
    }

    const values = await Promise.all(chunks.map((chunk) => postShareChunk(chunk)));
    const strings = values.map((v) => v.key);
    const hastebinResponse = await postShareChunk(encodeUnicode(JSON.stringify(strings)));

    const shareUrl = `${location.origin}${location.pathname}#${hastebinResponse.key}`;
    const shareData = {
      title: "Share tier list!",
      text: shareUrl,
      url: shareUrl,
    };

    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      await navigator.share(shareData);
      shareButton.innerText = "Shared!";
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      shareButton.innerText = "Copied!";
    } else {
      prompt("Copy this URL:", shareUrl);
      shareButton.innerText = "Ready!";
    }
  } catch (err) {
    bottomButtonsLogError("Share failed.", err);
    alert("Failed to share tier list. See console for details.");
    shareButton.innerText = oldButtonText;
    shareButton.disabled = false;
    return;
  }

  setTimeout(() => {
    shareButton.innerText = oldButtonText;
    shareButton.disabled = false;
  }, 3000);
}

async function downloadTierListImage() {
  if (!window.html2canvas) {
    alert("Screenshot library not loaded.");
    return;
  }

  const rows = Array.from(document.querySelectorAll(".row"));
  if (!rows.length) {
    alert("Could not find any tier rows to download.");
    return;
  }

  const loadingDiv = createLoadingOverlay("Rendering screenshot...");

  let captureWrapper = null;

  try {
    captureWrapper = document.createElement("div");
    captureWrapper.id = "tierlist-screenshot-capture";
    captureWrapper.style.position = "fixed";
    captureWrapper.style.left = "-99999px";
    captureWrapper.style.top = "0";
    captureWrapper.style.margin = "0";
    captureWrapper.style.padding = "0";
    captureWrapper.style.background = "transparent";
    captureWrapper.style.display = "block";
    captureWrapper.style.width = "fit-content";
    captureWrapper.style.height = "auto";

    rows.forEach((row) => {
      const clone = row.cloneNode(true);

      // remove the right-side settings/control column
      const rowChildren = Array.from(clone.children);
      if (rowChildren.length >= 3) {
        rowChildren[2].remove();
      }

      clone.style.margin = "0";
      clone.style.width = `${row.offsetWidth}px`;
      clone.style.minWidth = `${row.offsetWidth}px`;
      clone.style.maxWidth = `${row.offsetWidth}px`;
      clone.style.height = `${row.offsetHeight}px`;
      clone.style.minHeight = `${row.offsetHeight}px`;
      clone.style.maxHeight = `${row.offsetHeight}px`;

      const cloneChildren = Array.from(clone.children);

      // lock the tier label width/height
      if (cloneChildren[0]) {
        cloneChildren[0].style.width = `${row.children[0].offsetWidth}px`;
        cloneChildren[0].style.minWidth = `${row.children[0].offsetWidth}px`;
        cloneChildren[0].style.maxWidth = `${row.children[0].offsetWidth}px`;
        cloneChildren[0].style.height = `${row.children[0].offsetHeight}px`;
      }

      // lock the image area width/height
      if (cloneChildren[1]) {
        cloneChildren[1].style.width = `${row.children[1].offsetWidth}px`;
        cloneChildren[1].style.minWidth = `${row.children[1].offsetWidth}px`;
        cloneChildren[1].style.maxWidth = `${row.children[1].offsetWidth}px`;
        cloneChildren[1].style.height = `${row.children[1].offsetHeight}px`;
        cloneChildren[1].style.minHeight = `${row.children[1].offsetHeight}px`;
        cloneChildren[1].style.maxHeight = `${row.children[1].offsetHeight}px`;
      }

      captureWrapper.appendChild(clone);
    });

    document.body.appendChild(captureWrapper);

    const canvas = await window.html2canvas(captureWrapper, {
      backgroundColor: null,
      useCORS: true,
      scale: window.devicePixelRatio > 1 ? 2 : 1,
      logging: false,
      width: captureWrapper.scrollWidth,
      height: captureWrapper.scrollHeight,
      windowWidth: captureWrapper.scrollWidth,
      windowHeight: captureWrapper.scrollHeight
    });

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });

    if (!blob) {
      throw new Error("Failed to create screenshot blob.");
    }

    triggerBlobDownload(blob, SCREENSHOT_FILENAME);
  } catch (err) {
    bottomButtonsLogError("Failed downloading tier list screenshot.", err);
    alert("Failed to download the tier list image. See console for details.");
  } finally {
    if (captureWrapper) {
      captureWrapper.remove();
    }
    loadingDiv.remove();
  }
}

async function clearAllStoredImagesAndMetadata() {
  const images = indexedDb ? await getImagesFromIndexedDB().catch((err) => {
    bottomButtonsLogError("Failed reading stored images during full delete.", err);
    return [];
  }) : [];

  await Promise.all(
    images.map((image) => {
      return Promise.all([
        deleteImageFromIndexedDB(image.id).catch((err) => {
          bottomButtonsLogError(`Failed deleting stored image ${image.id}.`, err);
        }),
        deleteImageMetadataFromIndexedDB(image.id).catch((err) => {
          bottomButtonsLogError(`Failed deleting metadata for image ${image.id}.`, err);
        }),
      ]);
    })
  );
}

async function deleteTierList() {
  if (typeof confirmDeleteTierList === "function" && !confirmDeleteTierList()) {
    return;
  }

  const loadingDiv = createLoadingOverlay("Deleting tier list...");
  const allImages = getAllImagesOnPage();
  const cloudinaryUrls = allImages
    .map((img) => img.dataset.cloudinaryUrl || img.dataset.imageSrc || img.src)
    .filter(Boolean);

  try {
    updateLoadingOverlay("Removing local data...");

    document.querySelectorAll(".image").forEach((img) => img.remove());
    const imagesBar = getImagesBarForButtons();
    const hint = document.getElementById("drop-zone-hint");
    if (imagesBar && hint && !imagesBar.contains(hint)) {
      imagesBar.appendChild(hint);
    }

    await clearAllStoredImagesAndMetadata();
    await clearImagesFromIndexedDB().catch((err) => {
      bottomButtonsLogError("Failed clearing images store after delete loop.", err);
    });
    await saveSetting("localTierList", null).catch((err) => {
      bottomButtonsLogError("Failed clearing saved local tier list setting.", err);
    });
    localStorage.removeItem("savedTierList");

    if (currentUser && firebaseDb && firebaseAvailable) {
      updateLoadingOverlay("Finishing delete...");

      const firebaseClearPromise = saveTierListToFirebase().catch((err) => {
        bottomButtonsLogError("Failed syncing empty tier list after delete.", err);
      });

      const timeoutPromise = new Promise((resolve) => {
        setTimeout(resolve, 5000);
      });

      await Promise.race([firebaseClearPromise, timeoutPromise]);
    }


    if (cloudinaryUrls.length) {
      updateLoadingOverlay("Requesting remote image deletes...");
      const results = await Promise.allSettled(
        cloudinaryUrls.map((url) => deleteFromCloudinary(url))
      );

      const failedDeletes = results.filter((result) => result.status === "rejected");
      if (failedDeletes.length) {
        console.warn(`[BottomButtons] ${failedDeletes.length} remote image deletes failed.`);
      }
    }

    if (typeof updateTierCounts === "function") {
      try {
        updateTierCounts(false);
      } catch (err) {
        bottomButtonsLogError("Failed updating tier counts after delete.", err);
      }
    }

    if (typeof setDropHintVisibility === "function") {
      try {
        setDropHintVisibility();
      } catch (err) {
        bottomButtonsLogError("Failed restoring drop hint visibility after delete.", err);
      }
    }

    alert("Tier list deleted.");
  } catch (err) {
    bottomButtonsLogError("Failed deleting tier list.", err);
    alert("Failed to delete the tier list completely. See console for details.");
  } finally {
    loadingDiv.remove();
  }
}

async function applyImportedTierLayout(layout) {
  if (!layout || !Array.isArray(layout.tiers) || !layout.tiers.length) return;

  const main = document.querySelector("main");
  const imagesBar = getImagesBarForButtons();
  if (!main || !imagesBar) return;

  const orderedTiers = layout.tiers
    .slice()
    .sort((a, b) => Number(a?.index ?? 0) - Number(b?.index ?? 0));

  const existingRows = getTierRowsForButtons();
  existingRows.forEach((row) => {
    const tierContainer = row.children?.[1];
    Array.from(tierContainer?.querySelectorAll(".image") || []).forEach((img) => {
      imagesBar.appendChild(img);
    });
    row.remove();
  });

  if (typeof tierOrderingStates === "object") {
    tierOrderingStates = {};
  }

  if (typeof tierLimitStates === "object") {
    tierLimitStates = {};
  }

  let insertBeforeElement = main.querySelector(".unassigned-container") || imagesBar.parentElement || null;

  orderedTiers.forEach((tier, index) => {
    if (typeof createNewRow !== "function") return;

    const newRow = createNewRow(
      tier?.name || `Tier ${index + 1}`,
      tier?.color || "lightslategray"
    );

    main.insertBefore(newRow, insertBeforeElement);

    if (typeof tierOrderingStates === "object") {
      tierOrderingStates[index] = !!tier?.orderOnPlatform;
    }

    if (typeof tierLimitStates === "object") {
      tierLimitStates[index] = !!tier?.limitTo10;
    }
  });

  if (typeof rebuildTierStateIndexes === "function") {
    rebuildTierStateIndexes();
  }

  if (typeof updateTierColorsInMemory === "function") {
    updateTierColorsInMemory();
  }

  if (typeof initializeDragula === "function") {
    try {
      initializeDragula();
    } catch (err) {
      bottomButtonsLogError("Failed reinitializing dragula after importing tier layout.", err);
    }
  }

  if (typeof saveTierSettingsToStorage === "function") {
    await saveTierSettingsToStorage().catch((err) => {
      bottomButtonsLogError("Failed saving imported tier settings.", err);
    });
  }
}

function importGameDetails() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";

  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.entries || !Array.isArray(data.entries)) {
        alert("Invalid file format.");
        return;
      }

      await applyImportedTierLayout(data.layout);
      await applyImportedGameDetails(data.entries);
      alert("Game details imported successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to import game details.");
    }
  });

  input.click();
}

async function applyImportedGameDetails(entries) {
  const rows = getTierRowsForButtons();
  const imagesBar = getImagesBarForButtons();
  const allImages = Array.from(document.querySelectorAll(".image"));

  const metadataCache = new Map();

  await Promise.all(
    allImages.map(async (img) => {
      const imageId = img.dataset.imageId;
      if (!imageId) return;

      try {
        const metadata = await getImageMetadataFromIndexedDB(imageId);
        metadataCache.set(imageId, metadata || {});
      } catch (err) {
        console.error(`Failed reading metadata for ${imageId}:`, err);
        metadataCache.set(imageId, {});
      }
    })
  );

  function getImageGameKey(img) {
    const imageId = img.dataset.imageId;
    const meta = metadataCache.get(imageId) || {};
    return meta.gameKey || makeGameKey(meta.name, meta.developer);
  }

  function findMatch(entry) {
    if (entry.imageId) {
      const byId = allImages.find((i) => i.dataset.imageId === entry.imageId);
      if (byId) return byId;
    }

    if (entry.gameKey) {
      const byGameKey = allImages.find((i) => getImageGameKey(i) === entry.gameKey);
      if (byGameKey) return byGameKey;
    }

    const derivedKey = makeGameKey(entry.name, entry.developer);
    if (derivedKey) {
      const byDerivedKey = allImages.find((i) => getImageGameKey(i) === derivedKey);
      if (byDerivedKey) return byDerivedKey;
    }

    const byMetadata = allImages.find((i) => {
      const meta = metadataCache.get(i.dataset.imageId) || {};

      const sameName =
        String(meta.name || "").trim().toLowerCase() ===
        String(entry.name || "").trim().toLowerCase();

      const sameDeveloper =
        String(meta.developer || "").trim().toLowerCase() ===
        String(entry.developer || "").trim().toLowerCase();

      const samePlatform =
        String(meta.platform || "").trim().toLowerCase() ===
        String(entry.platform || "").trim().toLowerCase();

      if (entry.name && entry.developer) return sameName && sameDeveloper;
      if (entry.name && entry.platform) return sameName && samePlatform;
      if (entry.name) return sameName;

      return false;
    });

    if (byMetadata) return byMetadata;

    if (entry.imageSrc) {
      const bySrc = allImages.find((i) => {
        const currentSrc = i.dataset.imageSrc || i.dataset.cloudinaryUrl || i.src || "";
        return currentSrc === entry.imageSrc;
      });
      if (bySrc) return bySrc;
    }

    return null;
  }

  const unmatchedQueue = [];

  for (const entry of entries) {
    if (!entry) continue;

    const img = findMatch(entry);

    if (!img) {
      unmatchedQueue.push(entry);
      continue;
    }

    try {
      await applyImportedEntryToImage(entry, img, rows, imagesBar, metadataCache);
    } catch (err) {
      console.error("Failed applying imported entry automatically:", err);
      unmatchedQueue.push(entry);
    }
  }

  let manualResult = {
    cancelled: false,
    unmatchedEntries: unmatchedQueue,
    assignedCount: 0,
    skippedCount: 0,
  };

  if (unmatchedQueue.length) {
    alert(
      `${unmatchedQueue.length} entries could not be matched automatically. ` +
      `You can now click the correct image for each one.`
    );

    manualResult = await startManualImportAssignment(
      unmatchedQueue,
      rows,
      imagesBar,
      metadataCache
    );
  }

  await saveImagePositions();

  if (typeof applyTierSettingsToRows === "function") {
    await applyTierSettingsToRows();
  }

  if (typeof updateTierCounts === "function") {
    updateTierCounts(typeof countsAreShown === "function" ? countsAreShown() : false);
  }

  if (typeof setDropHintVisibility === "function") {
    setDropHintVisibility();
  }

  await saveTierListLocally().catch((err) => {
    console.error("Failed to save tier list locally after import:", err);
  });

  if (currentUser && firebaseDb && firebaseAvailable) {
    await saveTierListToFirebase().catch((err) => {
      console.error("Failed to sync tier list to Firebase after import:", err);
    });
  }

  if (manualResult.cancelled) {
    alert(
      `Manual import stopped. Assigned ${manualResult.assignedCount} entries, skipped ${manualResult.skippedCount}.`
    );
    return;
  }

  if (manualResult.unmatchedEntries.length) {
    alert(
      `Import finished. Assigned ${manualResult.assignedCount} manually, ` +
      `${manualResult.unmatchedEntries.length} still unmatched.`
    );
    return;
  }

  if (manualResult.assignedCount > 0) {
    alert(`Import finished. ${manualResult.assignedCount} entries were assigned manually.`);
  }
}

function normalizeImportedStatus(rawStatus) {
  const value = String(rawStatus || "").trim().toLowerCase();

  if (!value) return "";

  // --- EXACT ALLOWED VALUES (case-insensitive) ---

  if (value === "completed") return "Completed";
  if (value === "100% complete") return "100% complete";
  if (value === "played") return "Played";
  if (value === "dropped") return "Dropped";

  // --- VERY LIMITED SAFE ALIASES ---

  if (value === "finished" || value === "beaten") return "Completed";

  // ❌ EVERYTHING ELSE IS INVALID
  return "";
}

// BottomButtons.js - Update the saveTierList function at the bottom

// BottomButtons.js - Update saveTierList function

async function saveTierList() {
  if (!initializationComplete) {
    alert("Tier list is still loading, please wait...");
    return;
  }

  const button = document.getElementById("save-tierlist-btn");
  const originalText = button?.textContent || "Save Tierlist";
  
  if (button) {
    button.textContent = "Saving...";
    button.disabled = true;
  }

  try {
    // Save tier ordering and limit states to storage
    if (typeof saveTierSettingsToStorage === "function") {
      await saveTierSettingsToStorage();
    }
    
    await saveTierListLocally();
    
    if (currentUser && firebaseDb && firebaseAvailable) {
      await saveTierListToFirebase();
      alert("Tierlist saved to your account and locally!");
    } else {
      alert("Tierlist saved locally! Sign in with Google to save to the cloud.");
    }
  } catch (err) {
    console.error("Failed to save tierlist:", err);
    alert("Failed to save tierlist. See console for details.");
  } finally {
    if (button) {
      button.textContent = originalText;
      button.disabled = false;
    }
  }
}

(function bindBottomButtons() {
  document.addEventListener("DOMContentLoaded", () => {
    const screenshotButton = document.getElementById("btn");
    if (screenshotButton) {
      screenshotButton.addEventListener("click", downloadTierListImage);
    }
  });
})();