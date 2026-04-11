const hash = location.hash.substring(1);

window.pickrInstances = window.pickrInstances || [];
let initializationComplete = false; // Track when app is fully initialized

// Build tier list data (used for both Firebase and local save)
async function buildTierListData() {
  const tierListData = {
    header: document.getElementById("main-title").textContent,
    tiers: [],
    imagePositions: [],
    gameMetadata: {},
    tierOrderingStates: tierOrderingStates,
    tierLimitStates: tierLimitStates,
    lastUpdated: new Date()
  };

  // Collect metadata map
  let allImages = [];
  try { allImages = await getImagesFromIndexedDB(); } catch (e) { allImages = []; }
  const metadataMap = {};
  for (const image of allImages) {
    try {
      const metadata = await getImageMetadataFromIndexedDB(image.id);
      if (metadata) metadataMap[image.id] = metadata;
    } catch (e) { /* ignore */ }
  }

  const rows = document.querySelectorAll('.row');
  rows.forEach((row, tierIndex) => {
    const tierLabel = row.querySelector('.tier-label');
    const tierImages = row.children[1].querySelectorAll('.image');

    tierListData.tiers.push({
      index: tierIndex,
      name: tierLabel.querySelector('p').textContent,
      color: tierLabel.style.backgroundColor,
    });

    Array.from(tierImages).forEach((img, order) => {
      const imageId = img.dataset.imageId;
      tierListData.imagePositions.push({
        imageId,
        imageSrc: img.dataset.imageSrc,
        tier: tierIndex,
        order,
        details: metadataMap[imageId] || null,
      });
      if (metadataMap[imageId]) tierListData.gameMetadata[imageId] = metadataMap[imageId];
    });
  });

  // Images in bar
  try {
    const imagesBar = document.querySelector('#images-bar');
    const barImages = imagesBar ? imagesBar.querySelectorAll('.image') : [];
    Array.from(barImages).forEach((img, order) => {
      const imageId = img.dataset.imageId;
      tierListData.imagePositions.push({
        imageId,
        imageSrc: img.dataset.imageSrc,
        tier: -1,
        order,
        details: metadataMap[imageId] || null,
      });
      if (metadataMap[imageId]) tierListData.gameMetadata[imageId] = metadataMap[imageId];
    });
  } catch (e) { /* ignore */ }

  return tierListData;
}

// Save tier list - uses Firebase if signed in, else saves locally
async function saveTierList() {
  if (!initializationComplete || !indexedDb) {
    alert('Database not ready yet. Please wait a moment and try again.');
    return;
  }

  let data;
  try {
    data = await buildTierListData();
  } catch (err) {
    alert('Failed to prepare tierlist. See console for details.');
    return;
  }

  // Try Firebase first if signed in
  if (currentUser && firebaseDb && firebaseAvailable) {
    try {
      await saveTierListToFirebase();
      alert('Tierlist saved to your account.');
      return;
    } catch (e) {
    }
  }

  // Save locally to IndexedDB
  try {
    await saveSetting('localTierList', data);
    alert('Tierlist saved locally in this browser.');
  } catch (err) {
    // Fallback to localStorage as last resort
    try {
      localStorage.setItem('savedTierList', JSON.stringify(data));
      alert('Tierlist saved (using fallback storage).');
    } catch (fallbackErr) {
      alert('Failed to save tierlist. See console for details.');
    }
  }
}

// Initialize Firebase first, then IndexedDB
initializeFirebase().then(() => {
  return initializeIndexedDB().catch(err => {
    console.warn('IndexedDB initialization failed; continuing without IndexedDB:', err);
    indexedDb = null;
    return null;
  });
}).then(async () => {
  // Load header and tier settings from storage on page load
  loadHeaderFromStorage();
  loadTierColors();
  await Promise.all([loadTierOrderingStates(), loadTierLimitStates()]);
  
  // If a saved tierlist was selected from My Tierlists page, load it now
  if (sessionStorage && sessionStorage.my_tierlist_to_load) {
    try {
      const data = JSON.parse(sessionStorage.my_tierlist_to_load);
      delete sessionStorage.my_tierlist_to_load;
      loadTierListFromObject(data);
      initializationComplete = true;
      return;
    } catch (e) {
    }
  }

  // Check if user is already logged in from cache (will load from Firebase instead of local storage)
  if (currentUser) {
    // User is already logged in - Firebase should load the tier list
    // Give Firebase a moment to load the tier list via the promise we created in initializeFirebase()
    // If no data from Firebase after 2 seconds, mark as complete
    await new Promise(resolve => setTimeout(resolve, 500));
  } else if (hash.length <= 0) {
    // User is not logged in, so load from local storage
    loadTierListFromLocalStorage();
  } else {
    load();
  }
  
  initializationComplete = true;
  
  // Start polling for remote updates if user is logged in
  if (currentUser && firebaseDb && firebaseAvailable) {
    startSyncPolling();
  }
}).catch(err => {
  console.error('App initialization failed:', err);
  alert('Failed to initialize app. See console for details.');
});

// If we're on the My Tierlists page, render saved tierlists into the page
document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.profile-page')) {
    // small timeout to allow Firebase/auth to initialize
    setTimeout(() => {
    }, 200);
  }
});

// Ensure all pending auto-saves are completed before leaving the page
window.addEventListener('beforeunload', () => {
  // Clear all pending auto-save timers
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
  }
  Object.keys(autoSaveTimers).forEach(imageId => {
    clearTimeout(autoSaveTimers[imageId]);
  });
  
  // Perform final save synchronously if needed
  if (currentImageElement && initializationComplete) {
    try {
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
      // Note: IndexedDB saves in beforeunload may not work, but try anyway
      try {
        saveImageMetadataToIndexedDB(imageId, imageMetadata).catch(() => {});
      } catch (e) {
        // ignore - best effort
      }
    } catch (e) {
    }
  }
});

// Render saved tierlists into the My Tierlists page
async function renderSavedTierlists() {
  const container = document.querySelector('.templates-list');
  if (!container) return;
  container.innerHTML = '';

  // Try Firebase first if user is logged in
  let data = null;
  if (currentUser && firebaseDb) {
    try {
      const doc = await firebaseDb.collection('tierLists').doc(currentUser.uid).get();
      if (doc.exists) {
        const result = doc.data();
        data = result?.tier_data || null;
      }
    } catch (e) {
    }
  }

  // Fallback to local save
  if (!data) {
    try {
      data = await getSetting('localTierList');
    } catch (e) {
      data = null;
    }
  }

  if (!data) {
    // nothing to show
    const note = document.createElement('div');
    note.style.color = '#999';
    note.style.fontSize = '14px';
    note.textContent = 'No saved tierlists.';
    container.appendChild(note);
    return;
  }

  // Create a card for the saved tierlist
  const card = document.createElement('div');
  card.className = 'template-card';

  const preview = document.createElement('div');
  preview.className = 'template-preview';
  preview.style.display = 'flex';
  preview.style.flexDirection = 'column';
  preview.style.justifyContent = 'center';
  preview.style.alignItems = 'center';
  preview.style.color = '#fff';
  preview.style.padding = '8px';

  const title = document.createElement('div');
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '6px';
  title.textContent = data.header || 'Untitled Tierlist';

  const count = document.createElement('div');
  const imgCount = (data.imagePositions && data.imagePositions.length) || 0;
  count.textContent = `${imgCount} images`;

  preview.appendChild(title);
  preview.appendChild(count);

  const footer = document.createElement('div');
  footer.className = 'template-footer';
  footer.textContent = 'Saved';

  card.appendChild(preview);
  card.appendChild(footer);

  // Click to load this tierlist into the editor
  card.style.cursor = 'pointer';
  card.addEventListener('click', () => {
    try {
      sessionStorage.my_tierlist_to_load = JSON.stringify(data);
      window.location.href = 'index.html';
    } catch (e) {
    }
  });

  container.appendChild(card);
}

// Load a tierlist object into the editor (index.html)
async function loadTierListFromObject(tierListData) {
  if (!tierListData) return;

  // Set header
  if (tierListData.header) document.getElementById('main-title').textContent = tierListData.header;

  // Ensure there are enough rows for all saved tiers. If the saved tierlist has more 
  // tiers than the default 8, we need to create the extra rows so dragula can recognize them.
  if (tierListData.tiers && tierListData.tiers.length) {
    const existingRows = document.querySelectorAll('.row');
    const neededCount = tierListData.tiers.length;
    
    // Add missing tiers if necessary
    for (let i = existingRows.length; i < neededCount; i++) {
      addRow("New tier", "lightslategray");
    }
  }

  // Now update tiers with correct names and colors
  let rows = document.querySelectorAll('.row');
  if (tierListData.tiers && tierListData.tiers.length) {
    tierListData.tiers.forEach((tier, index) => {
      if (rows[index]) {
        const tierLabel = rows[index].querySelector('.tier-label');
        if (tier.name) tierLabel.querySelector('p').textContent = tier.name;
        if (tier.color) tierLabel.style.backgroundColor = tier.color;
      }
    });
  }

  // Clear existing images
  document.querySelectorAll('.image').forEach(img => img.remove());

  // Place images and collect metadata save promises
  const imagesBar = document.querySelector('#images-bar');
  const metadataSavePromises = [];
  
  if (tierListData.imagePositions && tierListData.imagePositions.length) {
    const sortedImagePositions = [...tierListData.imagePositions].sort((a, b) => {
      const tierA = a.tier === -1 ? Number.MAX_SAFE_INTEGER : a.tier;
      const tierB = b.tier === -1 ? Number.MAX_SAFE_INTEGER : b.tier;
      if (tierA !== tierB) return tierA - tierB;
      return (a.order || 0) - (b.order || 0);
    });
    for (const imgPos of sortedImagePositions) {
      const imageId = imgPos.imageId || ('img_' + Math.random().toString(36).slice(2));
      const image = document.createElement('img');
      image.src = imgPos.imageSrc;
      image.className = 'image';
      image.dataset.imageSrc = imgPos.imageSrc;
      image.dataset.imageId = imageId;
      image.dataset.cloudinaryUrl = imgPos.imageSrc;
      image.onclick = () => openImageModal(image);
      setupImageSelection(image);
      // Remove stale Cloudinary files (404s) from DOM and storage
      // Also trigger resync to Firebase to propagate cleanup to other devices
      image.onerror = () => {
        image.remove();
        deleteImageFromIndexedDB(imageId).catch(err => {
        });
        
        // Resync to Firebase to propagate cleanup to other devices
        if (currentUser && firebaseDb && firebaseAvailable) {
          // Add a small delay to avoid too frequent syncs
          clearTimeout(autoSaveTimeout);
          autoSaveTimeout = setTimeout(() => {
            saveTierListToFirebase().catch(err => {
            });
          }, 1000);
        }
      };

      if (typeof imgPos.tier === 'number' && imgPos.tier >= 0 && rows[imgPos.tier]) {
        rows[imgPos.tier].children[1].appendChild(image);
      } else {
        imagesBar.appendChild(image);
      }

      // Save image to IndexedDB images store (needed for buildTierListData to find it later)
      const imageData = {
        src: imgPos.imageSrc,
        tier: imgPos.tier,
        id: imageId,
        order: imgPos.order || 0,
        cloudinaryUrl: imgPos.imageSrc,
      };
      saveImageToIndexedDB(imageData).catch(err => {
      });

      // Restore metadata to IndexedDB from either the old gameMetadata map or new details field
      const imageDetails = imgPos.details || (tierListData.gameMetadata && tierListData.gameMetadata[imageId]);
      if (imageDetails) {
        metadataSavePromises.push(
          saveImageMetadataToIndexedDB(imageId, imageDetails).catch(e => { /* ignore */ })
        );
      }
    }
  }

  // Wait for all metadata saves to complete before reinitializing dragula
  await Promise.all(metadataSavePromises);
  
  // Restore tier ordering states
  if (tierListData.tierOrderingStates) {
    tierOrderingStates = tierListData.tierOrderingStates;
    // Apply platform sorting to any tiers that need it
    const rows = document.querySelectorAll('.row');
    for (let i = 0; i < rows.length; i++) {
      if (tierOrderingStates[i]) {
        const tierContainer = rows[i].children[1];
        await sortTierByPlatform(tierContainer);
      }
    }
  }
  
  // Restore tier limit states
  if (tierListData.tierLimitStates) {
    tierLimitStates = tierListData.tierLimitStates;
  }
  
  // Reinitialize dragula/dragging
  try { initializeDragula(); } catch (e) { /* ignore */ }
  try { updateTierCounts(countsAreShown()); } catch (e) {}
}

// Set up header save event listener
document.getElementById("main-title").addEventListener("blur", saveHeaderToStorage);

function saveHeaderToStorage() {
  const headerTitle = document.getElementById("main-title").textContent;
  saveSetting("tierListHeader", headerTitle).catch(err => {
  });
}

function loadHeaderFromStorage() {
  getSetting("tierListHeader").then(storedHeader => {
    if (storedHeader) {
      document.getElementById("main-title").textContent = storedHeader;
    }
  }).catch(err => {
  });
}

function loadTierOrderingStates() {
  return getSetting("tierOrderingStates").then(stored => {
    if (stored) {
      tierOrderingStates = stored;
    }
  }).catch(err => {
  });
}

function loadTierLimitStates() {
  return getSetting("tierLimitStates").then(stored => {
    if (stored) {
      tierLimitStates = stored;
    }
  }).catch(err => {
  });
}

function dynamicStyle(checkbox, css) {
  const style = document.querySelector("#dynamic-styles");

  if (checkbox.checked) {
    style.innerHTML += css;
  } else {
    style.innerHTML = style.innerHTML.replace(css, "");
  }
}

let scrollable = true;
let drake;
let selectedImages = new Set();
let lastSelectedImage = null;
let suppressNextLeftClick = false;

function clearImageSelection() {
  selectedImages.forEach(img => img.classList.remove('selected'));
  selectedImages.clear();
}

function selectImage(image, preserve = false) {
  if (!preserve) {
    clearImageSelection();
  }
  image.classList.add('selected');
  selectedImages.add(image);
  lastSelectedImage = image;
}

function toggleImageSelection(image) {
  if (selectedImages.has(image)) {
    image.classList.remove('selected');
    selectedImages.delete(image);
  } else {
    image.classList.add('selected');
    selectedImages.add(image);
    lastSelectedImage = image;
  }
}

function selectImageRange(image) {
  if (!lastSelectedImage || lastSelectedImage === image || image.parentNode !== lastSelectedImage.parentNode) {
    selectImage(image);
    return;
  }

  const container = image.parentNode;
  const images = Array.from(container.querySelectorAll('.image'));
  const startIndex = images.indexOf(lastSelectedImage);
  const endIndex = images.indexOf(image);

  if (startIndex < 0 || endIndex < 0) {
    selectImage(image);
    return;
  }

  const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  clearImageSelection();
  for (let i = from; i <= to; i++) {
    images[i].classList.add('selected');
    selectedImages.add(images[i]);
  }
  lastSelectedImage = image;
}

function moveSelectedImagesToTarget(el, target, sibling) {
  if (!selectedImages.has(el) || selectedImages.size <= 1) return;

  const imagesToMove = Array.from(selectedImages).filter(img => img !== el);
  if (!imagesToMove.length) return;

  const referenceNode = sibling && sibling.parentNode === target ? sibling : null;
  for (const image of imagesToMove) {
    if (image === el) continue;
    if (image.parentNode === target && image.nextSibling === referenceNode) {
      continue;
    }
    target.insertBefore(image, referenceNode);
  }
}

function handleImageContextMenu(event, image) {
  const isCtrl = event.ctrlKey || event.metaKey;
  const isShift = event.shiftKey;

  if (!isCtrl && !isShift) {
    suppressNextLeftClick = true;
    return;
  }

  event.preventDefault();

  if (isShift) {
    selectImageRange(image);
    return;
  }

  if (isCtrl) {
    toggleImageSelection(image);
    return;
  }
}

function updateDragMirror() {
  const mirror = document.querySelector('.gu-mirror');
  if (!mirror) return;

  if (selectedImages.size <= 1) {
    mirror.classList.remove('selected-group');
    return;
  }

  mirror.classList.add('selected-group');
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.gap = '8px';
  wrapper.style.alignItems = 'center';
  wrapper.style.padding = '4px';

  mirror.innerHTML = '';

  selectedImages.forEach((img) => {
    const clone = img.cloneNode(true);
    clone.classList.remove('selected');
    clone.style.margin = '0';
    clone.style.outline = 'none';
    clone.style.maxHeight = '85px';
    clone.style.width = getComputedStyle(img).width;
    clone.style.height = getComputedStyle(img).height;
    wrapper.appendChild(clone);
  });

  mirror.appendChild(wrapper);
}

function setupImageSelection(image) {
  image.addEventListener('contextmenu', (event) => handleImageContextMenu(event, image));
  image.addEventListener('mousedown', (event) => {
    if (event.button === 0 && suppressNextLeftClick) {
      suppressNextLeftClick = false;
      event.preventDefault();
      event.stopPropagation();
    }
  });
}


function initializeDragula() {
  const containers = Array.from(document.querySelectorAll('.sort'));

  if (drake) {
    drake.destroy();
  }
  
  if (containers.length === 0) {
    return;
  }
  
  drake = dragula(containers, {
    removeOnSpill: false,
    mirrorContainer: document.body,
    accepts: (el, target) => {
      return target && target.classList.contains('sort');
    }
  });
  
  drake
    .on('drag', (el, source) => {
      scrollable = false;
      if (!selectedImages.has(el)) {
        selectImage(el);
      }
      updateDragMirror();
    })
    .on('drop', (el, target, source, sibling) => {
      scrollable = true;
      moveSelectedImagesToTarget(el, target, sibling);
      
      const targetRow = target.parentNode;
      if (targetRow && targetRow.classList.contains('row')) {
        const rows = document.querySelectorAll('.row');
        const tierIndex = Array.from(rows).indexOf(targetRow);
        
        if (tierLimitStates[tierIndex]) {
          const tierImages = target.querySelectorAll('.image');
          if (tierImages.length > 10 && tierIndex < rows.length - 1) {
            const lastImage = tierImages[tierImages.length - 1];
            const tierBelowIndex = tierIndex + 1;
            const tierBelow = rows[tierBelowIndex].children[1];
            tierBelow.insertBefore(lastImage, tierBelow.firstChild);
          }
        }
        
        if (tierOrderingStates[tierIndex]) {
        }
      }
      
      try {
        const p = saveImagePositions();
        if (p && typeof p.then === 'function') {
          p.then(() => updateTierCounts(countsAreShown())).catch(() => updateTierCounts(countsAreShown()));
        } else {
          updateTierCounts(countsAreShown());
        }
      } catch (e) {
        updateTierCounts(countsAreShown());
      }
      clearImageSelection();
    })
    .on('cancel', (el) => {
      scrollable = true;
      clearImageSelection();
    })
    .on('over', (el, container) => {
      if (container.classList.contains('sort')) {
        container.style.backgroundColor = 'rgba(127, 255, 255, 0.1)';
      }
    })
    .on('out', (el, container) => {
      if (container.classList.contains('sort')) {
        container.style.backgroundColor = '';
      }
    });
}

document.addEventListener(
  'touchmove',
  (event) => {
    if (!scrollable) {
      event.preventDefault();
    }
  },
  {
    passive: false,
  }
);

function selectImages() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,.avif";
  input.multiple = true;

  input.click();

  input.addEventListener("change", () => uploadImages(input.files));
}

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

  const loadingDiv = document.createElement("div");
  loadingDiv.id = "upload-loading";
  loadingDiv.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); color: white; padding: 20px 40px; border-radius: 8px; z-index: 10000; font-size: 16px;";
  loadingDiv.textContent = "Uploading images...";
  document.body.appendChild(loadingDiv);

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

  getImagesFromIndexedDB().then((existingImages) => {
    const existingHashes = new Set(existingImages.map(img => img.fileHash).filter(h => h));
    const duplicateFiles = [];
    let skippedCount = 0;

    const uploadPromises = Array.from(files).map((file) => {
      return computeFileHash(file)
        .then((fileHash) => {
          if (existingHashes.has(fileHash)) {
            skippedCount++;
            duplicateFiles.push(file.name);
            filesProcessed++;
            return null;
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
                src: cloudinaryUrl,
                tier: -1,
                id: uniqueId,
                fileHash: fileHash,
                cloudinaryUrl: cloudinaryUrl,
              };

              imageDataArray.push(imageData);
              filesProcessed++;

              return imageData;
            });
        })
        .catch((err) => {
          filesProcessed++;
          return null;
        });
    });

    Promise.all(uploadPromises)
      .then(() => {
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

        return Promise.all(successfulImages.map(img => saveImageToIndexedDB(img)));
      })
      .then(() => {
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
        if (currentUser && firebaseDb) {
          saveTierListToFirebase().catch(err => {
          });
        }
        try { updateTierCounts(countsAreShown()); } catch (e) { }
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

function handleDragEnter(event) {
  event.preventDefault();
  event.stopPropagation();
  
  if (event.dataTransfer.types && event.dataTransfer.types.includes("Files")) {
    const imagesBar = document.getElementById("images-bar");
    imagesBar.classList.add("drag-over");
  }
}

function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  
  if (event.dataTransfer.types && event.dataTransfer.types.includes("Files")) {
    event.dataTransfer.dropEffect = "copy";
    const imagesBar = document.getElementById("images-bar");
    imagesBar.classList.add("drag-over");
  }
}

function handleDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  
  if (event.clientX === 0 && event.clientY === 0) {
    const imagesBar = document.getElementById("images-bar");
    imagesBar.classList.remove("drag-over");
  }
}

function handleImageDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  
  const imagesBar = document.getElementById("images-bar");
  imagesBar.classList.remove("drag-over");
  
  const files = event.dataTransfer.files;
  
  if (files && files.length > 0) {
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

document.addEventListener("DOMContentLoaded", function() {
  document.addEventListener("dragenter", handleDragEnter);
  document.addEventListener("dragover", handleDragOver);
  document.addEventListener("dragleave", handleDragLeave);
  document.addEventListener("drop", handleImageDrop);
});

function renderPlatformOptions() {
  const searchInput = document.getElementById("platform-search");
  const optionsContainer = document.getElementById("platform-options");
  let searchQuery = searchInput.value.toLowerCase().trim();
  let originalSearchQuery = searchQuery;

  optionsContainer.innerHTML = "";

  // Alias maps are defined in AliasesAndAbreviations.js

  // Check if search query matches a category alias
  let selectedCategory = null;
  if (categoryAliases && categoryAliases[searchQuery]) {
    selectedCategory = categoryAliases[searchQuery];
  }

  // Check if search query matches a platform alias
  if (platformAliases && platformAliases[searchQuery]) {
    const aliasValue = platformAliases[searchQuery];
    // Convert alias to array if it's not already
    const aliasArray = Array.isArray(aliasValue) ? aliasValue : [aliasValue];
    // Update searchQuery to match the alias pattern
    searchQuery = aliasArray[0];
  }

  // Show organized by categories (works with or without search query)
  for (const category in platformOptions) {
    // Skip categories that don't match the selected category filter
    if (selectedCategory && category !== selectedCategory) {
      continue;
    }

    const categoryPlatforms = platformOptions[category];
    const filteredCategory = categoryPlatforms.filter((platform) =>
      platform.toLowerCase().includes(searchQuery) || platform.toLowerCase().includes(originalSearchQuery)
    );

    if (filteredCategory.length > 0) {
      // Add category header
      const categoryHeader = document.createElement("div");
      categoryHeader.className = "platform-category-header";
      categoryHeader.textContent = category;
      optionsContainer.appendChild(categoryHeader);

      filteredCategory.forEach((platform) => {
        const option = document.createElement("div");
        option.className = "platform-option";
        option.dataset.platform = platform;
        if (currentSelectedPlatform === platform) {
          option.classList.add("selected");
        }
        option.textContent = platform;
        option.onclick = () => {
          selectPlatform(platform);
        };
        optionsContainer.appendChild(option);
      });
    }
  }

}

// Trigger a debounced metadata autosave for the current image
function triggerMetadataAutosaveDebounced(imageId) {
  if (!imageId) imageId = currentImageElement && currentImageElement.dataset && currentImageElement.dataset.imageId;
  if (!imageId) return;
  if (autoSaveTimers[imageId]) clearTimeout(autoSaveTimers[imageId]);
  autoSaveTimers[imageId] = setTimeout(() => {
  }, 800);
}

// Genre UI and helpers removed
function updatePlatformButton() {
  const btn = document.getElementById("platform-btn");
  if (currentSelectedPlatform) {
    btn.textContent = currentSelectedPlatform;
  } else {
    btn.textContent = "Select Platform";
  }
}

function selectPlatform(platform) {
  currentSelectedPlatform = platform;
  updatePlatformButton();
  renderPlatformOptions();
  document.getElementById("platform-dropdown-menu").classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", function() {
  // prevent copying of tier background color by forcing plain text
  document.addEventListener('copy', function(e) {
    try {
      const text = window.getSelection().toString();
      e.clipboardData.setData('text/plain', text);
      e.preventDefault();
    } catch (err) {
      // fall back gracefully
    }
  });
});
