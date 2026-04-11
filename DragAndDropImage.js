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

// Helper function to check if running locally
function isRunningLocally() {
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || window.location.protocol === 'file:';
}

// Helper function to convert file to data URL
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
    console.warn("IndexedDB not ready, waiting...");
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
            console.warn(`Image already imported: ${file.name}`);
            skippedCount++;
            duplicateFiles.push(file.name);
            filesProcessed++;
            return null; // Skip this image
          }

          // Check if running locally
          if (isRunningLocally()) {
            // Use data URL for local storage
            return fileToDataURL(file)
              .then((dataUrl) => {
                const uniqueId = "img_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
                const image = document.createElement("img");
                image.src = dataUrl;
                image.className = "image";
                image.dataset.imageSrc = dataUrl;
                image.dataset.imageId = uniqueId;
                image.dataset.cloudinaryUrl = dataUrl;
                image.onclick = () => openImageModal(image);
                setupImageSelection(image);

                imagesBar.appendChild(image);

                const imageData = {
                  src: dataUrl,
                  tier: -1,
                  id: uniqueId,
                  fileHash: fileHash,
                  cloudinaryUrl: dataUrl,
                  isLocalStorage: true, // Mark as local storage
                };

                imageDataArray.push(imageData);
                filesProcessed++;

                return imageData;
              });
          } else {
            // Use Cloudinary for remote storage
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
          }
        })
        .catch((err) => {
          console.error(`Failed to process ${file.name}:`, err);
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
          const errorMsg = isRunningLocally() 
            ? "Failed to load any images. Please try again." 
            : "Failed to upload any images. Please check your Cloudinary configuration and try again.";
          alert(errorMsg);
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
              console.warn(`Failed to initialize metadata for image ${img.id}:`, err);
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
            console.error('Failed to sync new images to Firebase:', err);
          });
        }
        // Refresh counts (badges) after images are added
        try { updateTierCounts(countsAreShown()); } catch (e) { /* ignore */ }
      })
      .catch((err) => {
        console.error("Failed to save images:", err);
        loadingDiv.remove();
        alert("Failed to upload images. Please try again.");
      });
  }).catch((err) => {
    console.error("Failed to check existing images:", err);
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
