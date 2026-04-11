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

async function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function isLocalImageMode() {
  const hostname = window.location.hostname;
  const runningLocally = hostname === 'localhost' || hostname === '127.0.0.1';
  return runningLocally || !CLOUDINARY_CONFIG.cloudName || CLOUDINARY_CONFIG.cloudName === "YOUR_CLOUD_NAME";
}

async function getImageUploadUrl(file) {
  if (isLocalImageMode()) {
    return await readFileAsDataURL(file);
  }
  return await uploadToCloudinary(file);
}

function uploadImages(files) {
  const imagesBar = document.querySelector("#images-bar");
  const imageDataArray = [];
  let filesProcessed = 0;

  // Show loading indicator
  const loadingDiv = document.createElement("div");
  loadingDiv.id = "upload-loading";
  loadingDiv.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); color: white; padding: 20px 40px; border-radius: 8px; z-index: 10000; font-size: 16px;";
  loadingDiv.textContent = "Importing images...";
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

          return getImageUploadUrl(file)
            .then((imageUrl) => {
              const uniqueId = "img_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
              const image = document.createElement("img");
              image.src = imageUrl;
              image.className = "image";
              image.dataset.imageSrc = imageUrl;
              image.dataset.imageId = uniqueId;
              image.dataset.cloudinaryUrl = imageUrl;
              image.onclick = () => openImageModal(image);
              setupImageSelection(image);

              imagesBar.appendChild(image);

              const imageData = {
                src: imageUrl,
                tier: -1,
                id: uniqueId,
                fileHash: fileHash,
                cloudinaryUrl: imageUrl,
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
          const prefix = isLocalImageMode() ? "Failed to import any images." : "Failed to upload any images.";
          alert(`${prefix} Please try again.`);
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

// Handle drag enter event
function handleDragEnter(event) {
  event.preventDefault();
  event.stopPropagation();
  
  // Check if the dragged item contains files
  if (event.dataTransfer.types && event.dataTransfer.types.includes("Files")) {
    const imagesBar = document.getElementById("images-bar");
    imagesBar.classList.add("drag-over");
  }
}

// Handle drag over event
function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  
  // Check if the dragged item contains files
  if (event.dataTransfer.types && event.dataTransfer.types.includes("Files")) {
    event.dataTransfer.dropEffect = "copy";
    const imagesBar = document.getElementById("images-bar");
    imagesBar.classList.add("drag-over");
  }
}

// Handle drag leave event
function handleDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  
  // Only remove the class if we're leaving the document entirely
  if (event.clientX === 0 && event.clientY === 0) {
    const imagesBar = document.getElementById("images-bar");
    imagesBar.classList.remove("drag-over");
  }
}

// Handle drop event for images
function handleImageDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  
  const imagesBar = document.getElementById("images-bar");
  imagesBar.classList.remove("drag-over");
  
  // Get dropped files
  const files = event.dataTransfer.files;
  
  if (files && files.length > 0) {
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
}

// Set up drag and drop for entire document
document.addEventListener("DOMContentLoaded", function() {
  document.addEventListener("dragenter", handleDragEnter);
  document.addEventListener("dragover", handleDragOver);
  document.addEventListener("dragleave", handleDragLeave);
  document.addEventListener("drop", handleImageDrop);
});
