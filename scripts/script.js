const hash = location.hash.substring(1);

let customPlatforms = [];
let pickrInstances = [];
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
  return initializeIndexedDB();
}).then(async () => {
  // Load header from storage on page load
  loadHeaderFromStorage();
  loadCustomPlatforms();
  loadTierColors();
  loadTierOrderingStates();
  loadTierLimitStates();
  
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

function loadCustomPlatforms() {
  getSetting("customPlatforms").then(stored => {
    if (stored) {
      const parsed = Array.isArray(stored) ? stored : JSON.parse(stored);
      // Handle migration from old format (array of strings) to new format (array of objects)
      customPlatforms = parsed.map(p => typeof p === 'string' ? { name: p, category: "Uncategorized" } : p);
    }
  }).catch(err => {
  });
}

function loadTierOrderingStates() {
  getSetting("tierOrderingStates").then(stored => {
    if (stored) {
      tierOrderingStates = stored;
    }
  }).catch(err => {
  });
}

function loadTierLimitStates() {
  getSetting("tierLimitStates").then(stored => {
    if (stored) {
      tierLimitStates = stored;
    }
  }).catch(err => {
  });
}

function saveImagePositions() {
  const imagePositions = [];
  const rows = document.querySelectorAll(".row");
  const imagesBar = document.querySelector("#images-bar");

  // Get images from tiers
  rows.forEach((row, tierIndex) => {
    const tierImages = row.children[1].querySelectorAll(".image");
    tierImages.forEach((img, order) => {
      imagePositions.push({
        id: img.dataset.imageId,
        tier: tierIndex,
        order,
      });
    });
  });

  // Get images from images bar
  const barImages = imagesBar.querySelectorAll(".image");
  barImages.forEach((img, order) => {
    imagePositions.push({
      id: img.dataset.imageId,
      tier: -1,
      order,
    });
  });

  // Update IndexedDB with new positions
  return getImagesFromIndexedDB().then((images) => {
    const updatePromises = images.map((image) => {
      const position = imagePositions.find(p => p.id === image.id);
      if (position) {
        image.tier = position.tier;
        image.order = position.order;
        // Update in IndexedDB
        const transaction = indexedDb.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        return new Promise((resolve, reject) => {
          const request = store.put(image);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      }
    }).filter(p => p);
    return Promise.all(updatePromises);
  }).then(() => {
    // Also save to Firebase if user is logged in
    if (currentUser && firebaseDb) {
      return saveTierListToFirebase();
    }
  }).catch(err => {
  });
}

// Global helper: Update or create a small count badge left of each tier label
function updateTierCounts(show) {
  const rows = document.querySelectorAll('.row');
  rows.forEach((row) => {
    const label = row.querySelector('.tier-label');
    if (!label) return;
    let badge = label.querySelector('.tier-count');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'tier-count';
      // insert before the first child (so it appears left)
      label.insertBefore(badge, label.firstChild);
    }
    const count = Array.from(row.children[1].querySelectorAll('.image')).filter(img => img.style.display !== 'none').length;
    badge.textContent = count;
    badge.style.display = show ? 'block' : 'none';
  });
  // Also update total-count element if present
  try {
    const totalEl = document.getElementById('total-count');
    if (totalEl) {
      // Only count images in tier rows, exclude images in the lower bar
      const total = Array.from(document.querySelectorAll('.row .image')).filter(img => img.style.display !== 'none').length;
      totalEl.textContent = `Total: ${total}`;
      totalEl.style.display = show ? '' : 'none';
    }
  } catch (e) {
    // ignore
  }
}

// Returns true if tier counts or total-count are currently visible
function countsAreShown() {
  try {
    const totalEl = document.getElementById('total-count');
    if (totalEl && window.getComputedStyle(totalEl).display !== 'none') return true;
    const badge = document.querySelector('.tier-count');
    if (badge && window.getComputedStyle(badge).display !== 'none') return true;
  } catch (e) {
    // ignore
  }
  return false;
}

function dynamicStyle(checkbox, css) {
  const style = document.querySelector("#dynamic-styles");

  if (checkbox.checked) {
    style.innerHTML += css;
  } else {
    style.innerHTML = style.innerHTML.replace(css, "");
  }
}

// Load tier list from localStorage including all metadata
async function loadTierListFromLocalStorage() {
  // Try IndexedDB settings store first (key: 'localTierList')
  try {
    const data = await getSetting('localTierList');
    if (data) {
      loadTierListFromObject(data);
      return;
    }
  } catch (err) {
  }

  // Backwards-compat: try older localStorage key
  try {
    const savedData = localStorage.getItem("savedTierList");
    if (savedData) {
      const tierListData = JSON.parse(savedData);
      loadTierListFromObject(tierListData);
      return;
    }
  } catch (err) {
  }

  // Fallback to loading just images
  loadImagesFromStorage();
}

function loadImagesFromStorage() {
  const imagesBar = document.querySelector("#images-bar");
  const rows = document.querySelectorAll(".row");

  getImagesFromIndexedDB().then((storedImages) => {
    // Get all currently displayed images to avoid duplicates
    const displayedImageIds = new Set();
    document.querySelectorAll(".image").forEach(img => {
      displayedImageIds.add(img.dataset.imageId);
    });

    storedImages.sort((a, b) => {
      const tierA = a.tier === -1 ? Number.MAX_SAFE_INTEGER : a.tier;
      const tierB = b.tier === -1 ? Number.MAX_SAFE_INTEGER : b.tier;
      if (tierA !== tierB) return tierA - tierB;
      return (a.order || 0) - (b.order || 0);
    });

    for (const imageObj of storedImages) {
      // Skip if this image is already displayed
      if (displayedImageIds.has(imageObj.id)) {
        continue;
      }

      const image = document.createElement("img");
      image.src = imageObj.src;
      image.className = "image";
      image.dataset.imageSrc = imageObj.src;
      image.dataset.imageId = imageObj.id;
      image.dataset.cloudinaryUrl = imageObj.cloudinaryUrl || imageObj.src;
      image.onclick = () => openImageModal(image);
      setupImageSelection(image);
      // Remove stale images if they fail to load, and resync to propagate changes
      image.onerror = () => {
        image.remove();
        deleteImageFromIndexedDB(imageObj.id).catch(err => {
        });
        
        // Resync to Firebase to propagate cleanup to other devices
        if (currentUser && firebaseDb && firebaseAvailable) {
          clearTimeout(autoSaveTimeout);
          autoSaveTimeout = setTimeout(() => {
            saveTierListToFirebase().catch(err => {
            });
          }, 1000);
        }
      };

      if (imageObj.tier === -1) {
        imagesBar.appendChild(image);
      } else if (rows[imageObj.tier]) {
        rows[imageObj.tier].children[1].appendChild(image);
      }
    }

    initializeDragula();
  }).catch(err => {
  });
}

function getImageMetadata(imageId) {
  // This function is kept for backward compatibility but uses IndexedDB asynchronously
  // For synchronous metadata access, use getImageMetadataFromIndexedDB instead
  return { name: "", date: "", description: "", status: "", platform: null };
}

function saveImageMetadata(imageId, metadata) {
  // Deprecated: Use saveImageMetadataToIndexedDB instead
  saveImageMetadataToIndexedDB(imageId, metadata).catch(err => {
  });
}

function deleteImageMetadata(imageId) {
  // Deprecated: Use deleteImageMetadataFromIndexedDB instead
  deleteImageMetadataFromIndexedDB(imageId).catch(err => {
  });
}

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

  // Flatten default platforms from categories
  const defaultPlatforms = [];
  for (const category in platformOptions) {
    defaultPlatforms.push(...platformOptions[category]);
  }

  // Combine default and custom platforms
  const defaultPlatformsFlat = [];
  defaultPlatforms.forEach(p => defaultPlatformsFlat.push(p));
  const customPlatformsFlat = customPlatforms.map(p => p.name);
  const allPlatforms = [...defaultPlatformsFlat, ...customPlatformsFlat];
  const filteredPlatforms = allPlatforms.filter((platform) =>
    platform.toLowerCase().includes(searchQuery) || platform.toLowerCase().includes(originalSearchQuery)
  );

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

    // Also include custom platforms in this category
    const customInCategory = customPlatforms.filter(
      (cp) => cp.category === category && (cp.name.toLowerCase().includes(searchQuery) || cp.name.toLowerCase().includes(originalSearchQuery))
    );
    const allInCategory = [...filteredCategory, ...customInCategory.map(cp => ({ isCustom: true, name: cp.name }))];

    if (allInCategory.length > 0) {
      // Add category header
      const categoryHeader = document.createElement("div");
      categoryHeader.className = "platform-category-header";
      categoryHeader.textContent = category;
      categoryHeader.ondragover = (e) => handlePlatformDragOver(e);
      categoryHeader.ondragleave = (e) => handlePlatformDragLeave(e);
      categoryHeader.ondrop = (e) => handlePlatformDropOnCategory(e, category);
      optionsContainer.appendChild(categoryHeader);

      // Add default platforms in this category
      filteredCategory.forEach((platform) => {
        const option = document.createElement("div");
        option.className = "platform-option";
        option.dataset.platform = platform;
        option.ondragover = (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          showPlaceholder(category);
        };
        option.ondrop = (e) => handlePlatformDropOnCategory(e, category);
        if (currentSelectedPlatform === platform) {
          option.classList.add("selected");
        }
        option.textContent = platform;
        option.onclick = () => {
          selectPlatform(platform);
        };
        optionsContainer.appendChild(option);
      });

      // Add custom platforms in this category
      customInCategory.forEach((cp) => {
        const option = document.createElement("div");
        option.className = "platform-option draggable";
        option.draggable = true;
        option.dataset.platform = cp.name;
        option.dataset.isCustom = "true";
        if (currentSelectedPlatform === cp.name) {
          option.classList.add("selected");
        }
        if (deletePlatformMode) {
          option.classList.add("delete-mode");
        }
        option.textContent = cp.name;
        option.ondragstart = (e) => handlePlatformDragStart(e, cp.name, category);
        option.ondragover = (e) => handlePlatformDragOver(e);
        option.ondragleave = (e) => handlePlatformDragLeave(e);
        option.ondrop = (e) => handlePlatformDrop(e, cp.name, category);
        option.ondragend = (e) => handlePlatformDragEnd(e);
        option.onclick = () => {
          if (deletePlatformMode) {
            deletePlatform(cp.name);
          } else {
            selectPlatform(cp.name);
          }
        };
        optionsContainer.appendChild(option);
      });

      // Add drop zone after platforms in this category
      const dropZone = document.createElement("div");
      dropZone.className = "platform-drop-zone";
      dropZone.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        showPlaceholder(category);
      };
      dropZone.ondrop = (e) => handlePlatformDropOnCategory(e, category);
      optionsContainer.appendChild(dropZone);
    }
  }

  // Add custom platforms in Uncategorized section if there are any
  const uncategorizedCustom = customPlatforms.filter(
    (cp) => cp.category === "Uncategorized" && cp.name.toLowerCase().includes(searchQuery)
  );
  if (uncategorizedCustom.length > 0) {
    const customHeader = document.createElement("div");
    customHeader.className = "platform-category-header";
    customHeader.textContent = "Uncategorized";
    customHeader.ondragover = (e) => handlePlatformDragOver(e);
    customHeader.ondragleave = (e) => handlePlatformDragLeave(e);
    customHeader.ondrop = (e) => handlePlatformDropOnCategory(e, "Uncategorized");
    optionsContainer.appendChild(customHeader);

    uncategorizedCustom.forEach((cp) => {
        const option = document.createElement("div");
        option.className = "platform-option draggable";
        option.draggable = true;
        option.dataset.platform = cp.name;
        option.dataset.isCustom = "true";
        if (currentSelectedPlatform === cp.name) {
          option.classList.add("selected");
        }
        if (deletePlatformMode) {
          option.classList.add("delete-mode");
        }
        option.textContent = cp.name;
        option.ondragstart = (e) => handlePlatformDragStart(e, cp.name, "Uncategorized");
        option.ondragover = (e) => handlePlatformDragOver(e);
        option.ondragleave = (e) => handlePlatformDragLeave(e);
        option.ondrop = (e) => handlePlatformDrop(e, cp.name, "Uncategorized");
        option.ondragend = (e) => handlePlatformDragEnd(e);
        option.onclick = () => {
          if (deletePlatformMode) {
            deletePlatform(cp.name);
          } else {
            selectPlatform(cp.name);
          }
        };
        optionsContainer.appendChild(option);
      });

      // Add drop zone for Uncategorized section
      const uncategorizedDropZone = document.createElement("div");
      uncategorizedDropZone.className = "platform-drop-zone";
      uncategorizedDropZone.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        showPlaceholder("Uncategorized");
      };
      uncategorizedDropZone.ondrop = (e) => handlePlatformDropOnCategory(e, "Uncategorized");
      optionsContainer.appendChild(uncategorizedDropZone);
  }

  const addContainer = document.createElement("div");
  addContainer.className = "platform-add-container";
  addContainer.innerHTML = `
    <button class="platform-delete-btn" onclick="enterDeletePlatformMode()">Delete</button>
  `;
  optionsContainer.appendChild(addContainer);
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

let deletePlatformMode = false;
let draggedPlatform = null;
let draggedCategory = null;
let draggedPlaceholder = null;

function handlePlatformDragStart(e, platform, category) {
  draggedPlatform = platform;
  draggedCategory = category;
  e.dataTransfer.effectAllowed = "move";
  e.target.style.opacity = "0.5";
  
  // Enable auto-scroll on drag
  document.addEventListener("dragover", autoScrollDuringDrag);
}

function autoScrollDuringDrag(e) {
  const dropdownMenu = document.getElementById("platform-dropdown-menu");
  if (!dropdownMenu || dropdownMenu.classList.contains("hidden")) {
    document.removeEventListener("dragover", autoScrollDuringDrag);
    return;
  }
  
  const rect = dropdownMenu.getBoundingClientRect();
  const scrollThreshold = 30;
  
  // Scroll up if near top
  if (e.clientY < rect.top + scrollThreshold) {
    dropdownMenu.scrollTop -= 10;
  }
  // Scroll down if near bottom
  else if (e.clientY > rect.bottom - scrollThreshold) {
    dropdownMenu.scrollTop += 10;
  }
}

function handlePlatformDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  
  // Add visual indicator for drop zone
  if (e.target.classList.contains("platform-option") || e.target.classList.contains("platform-category-header")) {
    e.target.classList.add("drag-over");
  }
}

function handlePlatformDragLeave(e) {
  e.target.classList.remove("drag-over");
}

function handlePlatformDrop(e, targetPlatform, targetCategory) {
  e.preventDefault();
  e.target.classList.remove("drag-over");
  removePlaceholder();
  if (draggedPlatform && draggedPlatform !== targetPlatform) {
    const draggedCustomIndex = customPlatforms.findIndex(p => p.name === draggedPlatform);
    
    if (draggedCustomIndex > -1) {
      // Moving custom platform to a different category
      customPlatforms[draggedCustomIndex].category = targetCategory;
      saveSetting("customPlatforms", customPlatforms).then(() => {
        renderPlatformOptions();
      }).catch(err => {
      });
    }
  }
}

function handlePlatformDropOnCategory(e, targetCategory) {
  e.preventDefault();
  e.target.classList.remove("drag-over");
  removePlaceholder();
  if (draggedPlatform) {
    const draggedCustomIndex = customPlatforms.findIndex(p => p.name === draggedPlatform);
    
    if (draggedCustomIndex > -1) {
      // Moving custom platform to a different category
      customPlatforms[draggedCustomIndex].category = targetCategory;
      saveSetting("customPlatforms", customPlatforms).then(() => {
        renderPlatformOptions();
      }).catch(err => {
      });
    }
  }
}

function showPlaceholder(targetCategory) {
  removePlaceholder();
  
  const optionsContainer = document.getElementById("platform-options");
  const placeholder = document.createElement("div");
  placeholder.className = "platform-option draggable placeholder";
  placeholder.textContent = draggedPlatform;
  placeholder.id = "drag-placeholder";
  
  // Find the right position to insert placeholder
  let inserted = false;
  const children = optionsContainer.querySelectorAll(".platform-category-header");
  
  for (let header of children) {
    if (header.textContent === targetCategory) {
      // Insert after this header
      let nextSibling = header.nextElementSibling;
      while (nextSibling && !nextSibling.classList.contains("platform-category-header") && !nextSibling.classList.contains("platform-drop-zone")) {
        if (nextSibling.classList.contains("platform-drop-zone")) {
          header.parentNode.insertBefore(placeholder, nextSibling);
          inserted = true;
          break;
        }
        nextSibling = nextSibling.nextElementSibling;
      }
      if (!inserted) {
        if (nextSibling) {
          header.parentNode.insertBefore(placeholder, nextSibling);
        } else {
          header.parentNode.appendChild(placeholder);
        }
      }
      break;
    }
  }
  
  draggedPlaceholder = placeholder;
}

function removePlaceholder() {
  if (draggedPlaceholder) {
    draggedPlaceholder.remove();
    draggedPlaceholder = null;
  }
}

function handlePlatformDragEnd(e) {
  e.target.style.opacity = "1";
  draggedPlatform = null;
  draggedCategory = null;
  removePlaceholder();
  
  // Remove auto-scroll listener
  document.removeEventListener("dragover", autoScrollDuringDrag);
  
  // Remove all drag-over indicators
  document.querySelectorAll(".platform-option.drag-over, .platform-category-header.drag-over").forEach(el => {
    el.classList.remove("drag-over");
  });
}

function enterDeletePlatformMode() {
  deletePlatformMode = !deletePlatformMode;
  const deleteBtn = document.querySelector(".platform-delete-btn");
  if (deletePlatformMode) {
    deleteBtn.textContent = "Cancel";
    deleteBtn.style.backgroundColor = "#ff6b6b";
  } else {
    deleteBtn.textContent = "Delete";
    deleteBtn.style.backgroundColor = "";
  }
  renderPlatformOptions();
}

function deletePlatform(platform) {
  // Check if platform is a default platform
  let isDefaultPlatform = false;
  for (const category in platformOptions) {
    if (platformOptions[category].indexOf(platform) > -1) {
      isDefaultPlatform = true;
      break;
    }
  }
  
  // Only allow deletion of custom platforms
  if (isDefaultPlatform) {
    return;
  }
  
  // Remove from customPlatforms
  customPlatforms = customPlatforms.filter(p => p.name !== platform);
  saveSetting("customPlatforms", customPlatforms).then(() => {
    // Remove from any image metadata that references this platform
    getAllImageMetadataFromIndexedDB().then(allMetadata => {
      allMetadata.forEach(metadata => {
        if (metadata.platform === platform) {
          saveImageMetadataToIndexedDB(metadata.id, {
            name: metadata.name || "",
            date: metadata.date || "",
            description: metadata.description || "",
            status: metadata.status || "",
            platform: null
          });
        }
      });
      deletePlatformMode = false;
      renderPlatformOptions();
    }).catch(err => {
    });
  }).catch(err => {
  });
}

function updatePlatformButton() {
  const btn = document.getElementById("platform-btn");
  if (currentSelectedPlatform) {
    btn.textContent = currentSelectedPlatform + " ?";
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
