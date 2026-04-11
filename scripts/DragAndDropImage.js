// DragAndDropImage.js
// Handles drag and drop of images into the browser and file selection.

function selectImages() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,.avif";
  input.multiple = true;

  input.click();

  input.addEventListener("change", () => uploadImages(input.files));
}

// Helper function to compute file hash for duplicate detection
async function computeFileHash(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function uploadImages(files) {
  const imagesBar = document.querySelector("#images-bar");
  const imageDataArray = [];
  let filesProcessed = 0;

  // Show loading indicator
  const loadingDiv = document.createElement("div");
  loadingDiv.id = "upload-loading";
  loadingDiv.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); color: white; padding: 20px 40px; border-radius: 8px; z-index: 10000; font-size: 16px;";
  loadingDiv.textContent = "Uploading images...";
  document.body.appendChild(loadingDiv);

  // Check if IndexedDB is ready before proceeding
  if (!indexedDb) {
    setTimeout(() => {
      if (!indexedDb) {
        loadingDiv.remove();
        alert("Database not ready. Please try again in a moment.");
        return;
      }
      uploadImages(files);
    }, 1000);
    return;
  }

  // Get all existing images to check for duplicates
  getImagesFromIndexedDB().then((existingImages) => {
    const existingHashes = new Set(existingImages.map(img => img.fileHash).filter(h => h));
    const duplicateFiles = [];
    let skippedCount = 0;

    const uploadPromises = Array.from(files).map((file) => {
      return computeFileHash(file)
        .then((fileHash) => {
          // Check if this file hash already exists
          if (existingHashes.has(fileHash)) {
            skippedCount++;
            duplicateFiles.push(file.name);
            filesProcessed++;
            return null; // Skip this image
          }

          return uploadToCloudinary(file)
            .then((cloudinaryUrl) => {
              const uniqueId = "img_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
              const image = document.createElement("img");
              image.src = cloudinaryUrl;
              image.className = "image";
              image.dataset.imageSrc = cloudinaryUrl;
              image.dataset.imageId = uniqueId;
              image.dataset.cloudinaryUrl = cloudinaryUrl;
              image.onclick = () => openImageModal(image);
              setupImageSelection(image);

              imagesBar.appendChild(image);

              const imageData = {
                src: cloudinaryUrl, // Store Cloudinary URL instead of base64
                tier: -1,
                id: uniqueId,
                fileHash: fileHash, // Store file hash for duplicate detection
                cloudinaryUrl: cloudinaryUrl, // Store for deletion later
              };

              imageDataArray.push(imageData);
              filesProcessed++;

              return imageData;
            });
        })
        .catch((err) => {
          filesProcessed++;
          // Continue processing other files even if one fails
          return null;
        });
    });

    Promise.all(uploadPromises)
      .then(() => {
        // Filter out null values (failed uploads and duplicates)
        const successfulImages = imageDataArray.filter(img => img !== null);

        if (successfulImages.length === 0 && skippedCount === 0) {
          alert("Failed to upload any images. Please check your Cloudinary configuration and try again.");
          loadingDiv.remove();
          return;
        }

        if (skippedCount > 0) {
          let message = `${skippedCount} image(s) were already imported and skipped.`;
          if (successfulImages.length > 0) {
            message += `\n${successfulImages.length} new image(s) were imported successfully.`;
          }
          alert(message);
        }

        if (successfulImages.length === 0) {
          loadingDiv.remove();
          return;
        }

        // Save all images to IndexedDB
        return Promise.all(successfulImages.map(img => saveImageToIndexedDB(img)));
      })
      .then(() => {
        // Initialize metadata entries for all new images
        return Promise.all(imageDataArray.map(img => {
          if (img) {
            const emptyMetadata = { name: "", developer: "", date: "", description: "", status: "", platform: null };
            return saveImageMetadataToIndexedDB(img.id, emptyMetadata).catch(err => {
            });
          }
        }));
      })
      .then(() => {
        loadingDiv.remove();
        initializeDragula();
        // Ensure no stray dragula mirror remains after reinitializing
        const oldMirrors = document.querySelectorAll('.gu-mirror, .gu-transit');
        oldMirrors.forEach(m => m.remove());
        // Sync to Firebase if user is logged in
        if (currentUser && firebaseDb) {
          saveTierListToFirebase().catch(err => {
          });
        }
        // Refresh counts (badges) after images are added
        try { updateTierCounts(countsAreShown()); } catch (e) { /* ignore */ }
      })
      .catch((err) => {
        loadingDiv.remove();
        alert("Failed to upload images. Please try again.");
      });
  }).catch((err) => {
    loadingDiv.remove();
    alert("Failed to check existing images. Please try again.");
  });
}

function isFileDrag(event) {
  const dataTransfer = event.dataTransfer;
  return dataTransfer && dataTransfer.types && Array.from(dataTransfer.types).includes("Files");
}

// Handle drag enter event
function handleDragEnter(event) {
  if (!isFileDrag(event)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  
  const imagesBar = document.getElementById("images-bar");
  if (imagesBar) {
    imagesBar.classList.add("drag-over");
  }
}

// Handle drag over event
function handleDragOver(event) {
  if (!isFileDrag(event)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = "copy";
  const imagesBar = document.getElementById("images-bar");
  if (imagesBar) {
    imagesBar.classList.add("drag-over");
  }
}

function removeImagesBarHighlight() {
  const imagesBar = document.getElementById("images-bar");
  if (imagesBar) {
    imagesBar.classList.remove("drag-over");
  }
}

// Handle drag leave event
function handleDragLeave(event) {
  if (!isFileDrag(event)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const imagesBar = document.getElementById("images-bar");
  const related = event.relatedTarget || document.elementFromPoint(event.clientX, event.clientY);
  if (!imagesBar || !related || !imagesBar.contains(related)) {
    removeImagesBarHighlight();
  }
}

// Handle drop event for images
function handleImageDrop(event) {
  if (!isFileDrag(event)) {
    return;
  }

  removeImagesBarHighlight();
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer || !dataTransfer.files || dataTransfer.files.length === 0) {
    return;
  }

  const imagesBar = document.getElementById("images-bar");

  event.preventDefault();
  event.stopPropagation();

  // Get dropped files
  const files = dataTransfer.files;

  // Filter for image files
  const imageFiles = Array.from(files).filter(file =>
    file.type.startsWith("image/") || file.type === "image/avif"
  );

  if (imageFiles.length > 0) {
    uploadImages(imageFiles);
  } else {
    alert("Please drop image files only.");
  }
}

// Set up drag and drop for whole document
// Only handle actual file drops so dragula image dragging is not interfered with.
document.addEventListener("DOMContentLoaded", function() {
  document.addEventListener("dragenter", handleDragEnter);
  document.addEventListener("dragover", handleDragOver);
  document.addEventListener("dragleave", handleDragLeave);
  document.addEventListener("drop", removeImagesBarHighlight);
  document.addEventListener("drop", handleImageDrop);
  document.addEventListener("dragend", removeImagesBarHighlight);
});
