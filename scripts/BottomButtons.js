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
      date100: "",
      has100Replay: false,
    };

    try {
      metadata = await getImageMetadataFromIndexedDB(image.imageId);
    } catch (err) {
      bottomButtonsLogError(`Failed reading metadata for export on image ${image.imageId}.`, err);
    }

    entries.push({
      imageId: image.imageId,
      imageSrc: image.imageSrc,
      tier: image.tier,
      name: metadata.name || "",
      developer: metadata.developer || "",
      date: metadata.date || "",
      description: metadata.description || "",
      platform: metadata.platform || null,
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

  const target = document.getElementById("htmlContent");
  if (!target) {
    alert("Could not find the tier list content to download.");
    return;
  }

  const loadingDiv = createLoadingOverlay("Rendering screenshot...");

  try {
    const canvas = await window.html2canvas(target, {
      backgroundColor: null,
      useCORS: true,
      scale: Math.max(1, window.devicePixelRatio || 1),
      logging: false,
    });

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      throw new Error("Failed to create screenshot blob.");
    }

    triggerBlobDownload(blob, SCREENSHOT_FILENAME);
  } catch (err) {
    bottomButtonsLogError("Failed downloading tier list screenshot.", err);
    alert("Failed to download the tier list image. See console for details.");
  } finally {
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
      updateLoadingOverlay("Clearing synced tier list...");
      await saveTierListToFirebase().catch((err) => {
        bottomButtonsLogError("Failed syncing empty tier list after delete.", err);
      });
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

  let notFound = 0;


  for (const entry of entries) {
    if (!entry.imageId && !entry.imageSrc) continue;

    // 🔍 Find matching image
    let img = allImages.find(i => i.dataset.imageId === entry.imageId);

    if (!img) {
      img = allImages.find(i =>
        (i.dataset.imageSrc || i.src) === entry.imageSrc
      );
    }

    if (!img) {
      notFound++;
      continue;
    }

    if (notFound > 0) {
      alert(`${notFound} images from the import were not found in your tierlist.`);
    }

    const imageId = img.dataset.imageId;

    // ✅ Restore metadata
    await saveImageMetadataToIndexedDB(imageId, {
      name: entry.name,
      developer: entry.developer,
      date: entry.date,
      date100: entry.date100,
      description: entry.description,
      platform: entry.platform,
      status: entry.status,
      has100Replay: entry.has100Replay
    });

    // ✅ Move to correct tier
    if (typeof entry.tier === "number") {
      if (entry.tier === -1) {
        imagesBar.appendChild(img);
      } else if (rows[entry.tier]) {
        rows[entry.tier].children[1].appendChild(img);
      }
    }
  }

  // ✅ Re-save positions (important)
  await saveImagePositions();

  // ✅ Apply tier rules again
  if (typeof applyTierSettingsToRows === "function") {
    await applyTierSettingsToRows();
  }

  // ✅ Update UI
  if (typeof updateTierCounts === "function") {
    updateTierCounts(typeof countsAreShown === "function" ? countsAreShown() : false);
  }

  if (typeof setDropHintVisibility === "function") {
    setDropHintVisibility();
  }

  // ✅ Sync
  await saveTierListLocally().catch(() => { });
  if (currentUser && firebaseDb && firebaseAvailable) {
    await saveTierListToFirebase().catch(() => { });
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