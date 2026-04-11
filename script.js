const hash = location.hash.substring(1);

let customPlatforms = [];
let pickrInstances = [];
let indexedDb; // IndexedDB database
let initializationComplete = false; // Track when app is fully initialized

// Initialize IndexedDB
function initializeIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('TierListDB', 2);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      indexedDb = request.result;
      resolve(indexedDb);
    };
    
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains('images')) {
        database.createObjectStore('images', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains('imageMetadata')) {
        database.createObjectStore('imageMetadata', { keyPath: 'id' });
      }
    };
  });
}

// Download all images as a ZIP file
async function downloadAllImagesZip() {
  if (!window.JSZip) {
    alert('Zip library not loaded.');
    return;
  }

  const images = Array.from(document.querySelectorAll('.image'));
  if (!images.length) {
    alert('No images to download.');
    return;
  }

  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'zip-loading';
  loadingDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.85); color: white; padding: 16px 24px; border-radius: 8px; z-index: 10000; font-size: 14px;';
  loadingDiv.textContent = 'Preparing zip...';
  document.body.appendChild(loadingDiv);

  const zip = new JSZip();
  const nameCounts = {};

  try {
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const src = img.dataset.cloudinaryUrl || img.src;

      loadingDiv.textContent = `Adding ${i + 1} of ${images.length}...`;

      let resp;
      try {
        resp = await fetch(src);
      } catch (err) {
        console.error('Failed to fetch image', src, err);
        continue;
      }

      const blob = await resp.blob();

      let meta = null;
      try {
        meta = await getImageMetadataFromIndexedDB(img.dataset.imageId);
      } catch (e) {
        meta = null;
      }

      let baseName = (meta && meta.name) ? meta.name.trim() : '';
      if (!baseName) baseName = img.dataset.imageId || `image_${i+1}`;
      baseName = baseName.replace(/[\\/:*?"<>|]+/g, '').trim() || `image_${i+1}`;

      let ext = '';
      if (blob && blob.type) {
        const parts = blob.type.split('/');
        ext = parts[1] ? parts[1].split(';')[0] : '';
        if (ext === 'jpeg') ext = 'jpg';
      }
      if (!ext) {
        const m = (src || '').split('?')[0].match(/\.([a-zA-Z0-9]+)$/);
        ext = m ? m[1] : 'png';
      }

      let filename = `${baseName}.${ext}`;
      if (nameCounts[filename]) {
        nameCounts[filename] += 1;
        filename = `${baseName}_${nameCounts[filename]}.${ext}`;
      } else {
        nameCounts[filename] = 1;
      }

      zip.file(filename, blob);
    }

    loadingDiv.textContent = 'Finalizing zip...';
    const content = await zip.generateAsync({ type: 'blob' });
    if (window.saveAs) {
      saveAs(content, 'GamersTierMaker_images.zip');
    } else {
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'GamersTierMaker_images.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.error('Failed to create zip', err);
    alert('Failed to create zip. See console for details.');
  } finally {
    loadingDiv.remove();
  }
}

// Save image to IndexedDB
function saveImageToIndexedDB(imageData) {
  return new Promise((resolve, reject) => {
    const transaction = indexedDb.transaction(['images'], 'readwrite');
    const store = transaction.objectStore('images');
    const request = store.add(imageData);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Get all images from IndexedDB
function getImagesFromIndexedDB() {
  return new Promise((resolve, reject) => {
    const transaction = indexedDb.transaction(['images'], 'readonly');
    const store = transaction.objectStore('images');
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Delete image from IndexedDB
function deleteImageFromIndexedDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = indexedDb.transaction(['images'], 'readwrite');
    const store = transaction.objectStore('images');
    const request = store.delete(id);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Clear all images from IndexedDB
function clearImagesFromIndexedDB() {
  return new Promise((resolve, reject) => {
    const transaction = indexedDb.transaction(['images'], 'readwrite');
    const store = transaction.objectStore('images');
    const request = store.clear();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Save setting to IndexedDB
function saveSetting(key, value) {
  console.log('saveSetting called for key:', key);
  return new Promise((resolve, reject) => {
    if (!indexedDb) {
      const err = new Error('indexedDb not available');
      console.error('saveSetting error:', err);
      reject(err);
      return;
    }
    const transaction = indexedDb.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');
    const request = store.put({ key, value });

    request.onerror = (e) => {
      console.error('saveSetting request.onerror:', e, request.error);
      reject(request.error || e);
    };
    request.onsuccess = () => {
      console.log('saveSetting success for key:', key);
      resolve();
    };
    transaction.oncomplete = () => {
      console.log('saveSetting transaction complete for key:', key);
    };
    transaction.onerror = (e) => {
      console.error('saveSetting transaction error for key:', key, e);
    };
  });
}

// Get setting from IndexedDB
function getSetting(key) {
  console.log('getSetting called for key:', key);
  return new Promise((resolve, reject) => {
    if (!indexedDb) {
      console.warn('getSetting: indexedDb not available');
      resolve(null);
      return;
    }
    const transaction = indexedDb.transaction(['settings'], 'readonly');
    const store = transaction.objectStore('settings');
    const request = store.get(key);

    request.onerror = (e) => {
      console.error('getSetting request.onerror:', e, request.error);
      reject(request.error || e);
    };
    request.onsuccess = () => {
      console.log('getSetting success for key:', key, 'value:', request.result ? request.result.value : null);
      resolve(request.result ? request.result.value : null);
    };
  });
}

function getImageDetailsFromPage() {
  return Array.from(document.querySelectorAll('.image')).map(img => {
    const imageId = img.dataset.imageId;
    const imageSrc = img.dataset.imageSrc || img.src || '';
    const row = img.closest('.row');
    const tierIndex = row ? Array.from(document.querySelectorAll('.row')).indexOf(row) : -1;
    return { imageId, imageSrc, tier: tierIndex };
  });
}

async function getGameDetailsForExport() {
  const entries = [];
  const imageDetails = getImageDetailsFromPage();
  for (const image of imageDetails) {
    if (!image.imageId) continue;
    let metadata = { name: '', developer: '', date: '', description: '', status: '', platform: null };
    try {
      metadata = await getImageMetadataFromIndexedDB(image.imageId);
    } catch (err) {
      console.warn('Failed to load metadata for export:', image.imageId, err);
    }
    entries.push({
      imageId: image.imageId,
      imageSrc: image.imageSrc,
      tier: image.tier,
      name: metadata.name || '',
      developer: metadata.developer || '',
      date: metadata.date || '',
      description: metadata.description || '',
      platform: metadata.platform || null,
      status: metadata.status || '',
      date100: metadata.date100 || '',
      has100Replay: !!metadata.has100Replay
    });
  }
  return entries;
}

function downloadGameDetailsJSON() {
  getGameDetailsForExport().then(entries => {
    if (!entries.length) {
      alert('No game details found to export.');
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      entries
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'GamersTierMaker_game_details.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }).catch(err => {
    console.error('Failed to prepare game details export:', err);
    alert('Failed to export game details. See console for details.');
  });
}

// Save image metadata to IndexedDB
function saveImageMetadataToIndexedDB(id, metadata) {
  return new Promise((resolve, reject) => {
    const transaction = indexedDb.transaction(['imageMetadata'], 'readwrite');
    const store = transaction.objectStore('imageMetadata');
    const request = store.put({ id, ...metadata });
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Get image metadata from IndexedDB
function getImageMetadataFromIndexedDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = indexedDb.transaction(['imageMetadata'], 'readonly');
    const store = transaction.objectStore('imageMetadata');
    const request = store.get(id);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        const genres = Array.isArray(result.genres) ? result.genres.slice() : (result.genre ? [result.genre] : []);
        // Preserve 100% completion fields if present so exports/imports include them
        const date100 = result.date100 || result.date_100 || "";
        const has100Replay = !!result.has100Replay || !!result.has100 || false;
        resolve({ name: result.name || "", developer: result.developer || "", date: result.date || "", date100: date100, description: result.description || "", status: result.status || "", platform: result.platform || null, genres, has100Replay });
      } else {
        resolve({ name: "", developer: "", date: "", date100: "", description: "", status: "", platform: null, genres: [], has100Replay: false });
      }
    };
  });
}

// Get all image metadata from IndexedDB
function getAllImageMetadataFromIndexedDB() {
  return new Promise((resolve, reject) => {
    const transaction = indexedDb.transaction(['imageMetadata'], 'readonly');
    const store = transaction.objectStore('imageMetadata');
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Delete image metadata from IndexedDB
function deleteImageMetadataFromIndexedDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = indexedDb.transaction(['imageMetadata'], 'readwrite');
    const store = transaction.objectStore('imageMetadata');
    const request = store.delete(id);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Show local-only button when running locally and wire click for quick checks
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('local-check-btn');
  if (!btn) return;

  const isLocal = () => {
    try {
      return location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '';
    } catch (e) {
      return false;
    }
  };

  if (isLocal()) {
    btn.style.display = 'inline-block';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openProfileScreen();
    });
  } else {
    // Remove the button in non-local environments to avoid accidental exposure
    btn.remove();
  }
});

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
    console.error('App not fully initialized. indexedDb:', !!indexedDb, 'initComplete:', initializationComplete);
    alert('Database not ready yet. Please wait a moment and try again.');
    return;
  }

  console.log('Building tier list data...');
  let data;
  try {
    data = await buildTierListData();
    console.log('Tier list data built successfully:', data);
  } catch (err) {
    console.error('Failed to build tier list data:', err);
    alert('Failed to prepare tierlist. See console for details.');
    return;
  }

  // Try Firebase first if signed in
  if (currentUser && firebaseDb && firebaseAvailable) {
    try {
      console.log('Saving to Firebase...');
      await saveTierListToFirebase();
      alert('Tierlist saved to your account.');
      return;
    } catch (e) {
      console.warn('Firebase save failed, falling back to local save:', e);
    }
  }

  // Save locally to IndexedDB
  try {
    console.log('Saving to IndexedDB (localTierList)...');
    await saveSetting('localTierList', data);
    console.log('Successfully saved to IndexedDB');
    alert('Tierlist saved locally in this browser.');
  } catch (err) {
    console.error('Failed to save to IndexedDB, trying localStorage fallback:', err);
    // Fallback to localStorage as last resort
    try {
      localStorage.setItem('savedTierList', JSON.stringify(data));
      console.log('Saved to localStorage fallback');
      alert('Tierlist saved (using fallback storage).');
    } catch (fallbackErr) {
      console.error('All save methods failed:', fallbackErr);
      alert('Failed to save tierlist. See console for details.');
    }
  }
}

// Initialize Firebase first, then IndexedDB
initializeFirebase().then(() => {
  return initializeIndexedDB();
}).then(async () => {
  console.log('âœ“ Firebase and IndexedDB initialized successfully');
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
      console.log('âœ“ App fully initialized and tier list loaded');
      return;
    } catch (e) {
      console.warn('Failed to parse session saved tierlist:', e);
    }
  }

  // Check if user is already logged in from cache (will load from Firebase instead of local storage)
  if (currentUser) {
    // User is already logged in - Firebase should load the tier list
    console.log("User already logged in, tier list loading from Firebase...");
    // Give Firebase a moment to load the tier list via the promise we created in initializeFirebase()
    // If no data from Firebase after 2 seconds, mark as complete
    await new Promise(resolve => setTimeout(resolve, 500));
  } else if (hash.length <= 0) {
    // User is not logged in, so load from local storage
    console.log("Loading from local storage...");
    loadTierListFromLocalStorage();
  } else {
    load();
  }
  
  initializationComplete = true;
  console.log('âœ“ App fully initialized');
  
  // Start polling for remote updates if user is logged in
  if (currentUser && firebaseDb && firebaseAvailable) {
    startSyncPolling();
  }
}).catch(err => {
  console.error('âœ— INITIALIZATION FAILED:', err);
  alert('Failed to initialize app. See console for details.');
});

// (Genre UI removed) previously exposed genre helper functions

// If we're on the My Tierlists page, render saved tierlists into the page
document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.profile-page')) {
    // small timeout to allow Firebase/auth to initialize
    setTimeout(() => {
      renderSavedTierlists().catch(err => console.error(err));
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
      console.log("Flushing pending metadata before page unload...");
      try {
        saveImageMetadataToIndexedDB(imageId, imageMetadata).catch(() => {});
      } catch (e) {
        // ignore - best effort
      }
    } catch (e) {
      console.warn("Could not flush metadata before unload:", e);
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
      console.warn('Failed to load tierlist from Firebase:', e);
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
      console.error('Failed to transfer tierlist to editor:', e);
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
        console.warn(`Image failed to load: ${imageId} (${imgPos.imageSrc}). Removing from tier list.`);
        image.remove();
        deleteImageFromIndexedDB(imageId).catch(err => {
          console.warn(`Could not delete stale image ${imageId} from storage:`, err);
        });
        
        // Resync to Firebase to propagate cleanup to other devices
        if (currentUser && firebaseDb && firebaseAvailable) {
          // Add a small delay to avoid too frequent syncs
          clearTimeout(autoSaveTimeout);
          autoSaveTimeout = setTimeout(() => {
            saveTierListToFirebase().catch(err => {
              console.warn('Failed to resync after image cleanup:', err);
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
        console.warn(`Failed to save image ${imageId} to IndexedDB:`, err);
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
    console.error('Failed to save header:', err);
  });
}

function loadHeaderFromStorage() {
  getSetting("tierListHeader").then(storedHeader => {
    if (storedHeader) {
      document.getElementById("main-title").textContent = storedHeader;
    }
  }).catch(err => {
    console.error('Failed to load header:', err);
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
    console.error('Failed to load custom platforms:', err);
  });
}

function loadTierOrderingStates() {
  getSetting("tierOrderingStates").then(stored => {
    if (stored) {
      tierOrderingStates = stored;
    }
  }).catch(err => {
    console.error('Failed to load tier ordering states:', err);
  });
}

function loadTierLimitStates() {
  getSetting("tierLimitStates").then(stored => {
    if (stored) {
      tierLimitStates = stored;
    }
  }).catch(err => {
    console.error('Failed to load tier limit states:', err);
  });
}

let tierOrderingStates = {}; // Track which tiers have order-on-platform enabled
let tierLimitStates = {}; // Track which tiers have limit-to-10 enabled

const platformPriority = {
  // Arcade
  "Arcade": 0,
  
  // Atari
  "Atari 2600": 1,
  "Atari 5200": 2,
  "Atari 7800": 3,
  "Atari Jaguar": 4,
  
  // V.Smile (after arcade)
  "V.Smile": 5,
  
  // Sega
  "Sega Genesis": 6,
  "Sega Saturn": 7,
  "Sega Dreamcast": 8,
  
  // Nintendo Consoles (in release order, with Game Boy/GBA between N64 and GameCube, DS before 3DS/Wii, 3DS before Wii)
  "NES": 9,
  "SNES": 10,
  "Nintendo 64": 11,
  "Game Boy": 12,
  "Game Boy Color": 12,
  "Game Boy Advance": 12,
  "GameCube": 13,
  "GameCube (Via Backwards Compatibility)": 13,
  "Nintendo DS": 14,
  "Nintendo 3DS": 15,
  "Nintendo Wii": 16,
  "Nintendo Wii U": 17,
  "Nintendo Switch": 18,
  "Nintendo Switch 2": 19,
  
  // PlayStation Consoles
  "PlayStation 1": 20,
  "PlayStation 2": 21,
  "PlayStation 3": 22,
  "PlayStation 4": 23,
  "PlayStation 5": 25,
  
  // PlayStation Handhelds (after PSVR2)
  "PlayStation Portable": 27,
  "PlayStation Vita": 28,
  
  // PlayStation VR (after PS4 and before PS5)
  "PlayStation VR": 24,
  "PlayStation VR2": 26,
  
  // Xbox
  "Xbox": 29,
  "Xbox 360": 30,
  "Xbox One": 31,
  "Xbox Series X/S": 32,
  
  // PC and Steam Deck (share positions)
  "PC": 33,
  "PC (Via Decompilation)": 33.1,
  "PC (Via Recompilation)": 33.2,
  "Steam Deck": 33.5,
  
  // VR
  "Meta Quest 2": 34,
  "Meta Quest 3": 34,
  "Meta Quest Pro": 34,
  "HTC Vive": 34,
  "HTC Vive Pro": 34,
  "HTC Vive Cosmos": 34,
  "Valve Index": 34,
  "Oculus Rift": 34,
  "Oculus Rift S": 34,
  
  // Emulators map to their console positions
  "Snes9x (SNES)": 10,
  "Mesen (NES)": 9,
  "Visual Boy Advance (Game Boy Advance)": 12,
  "MelonDS (Nintendo DS)": 14,
  "Dolphin (Wii)": 16,
  "Dolphin (GameCube)": 13,
  "Dolphin (Wii / GameCube)": 13,
  "Citra (Nintendo 3DS)": 15,
  "Cemu (Wii U)": 17,
  "DuckStation (PS1)": 20,
  "PCSX2 (PS2)": 21,
  "RPCS3 (PS3)": 22,
  "PPSSPP (PSP)": 25,
  "Vita3K (PS Vita)": 26,
  "Xemu (Xbox)": 29,
  "Xenia (Xbox 360)": 30,
  "Ryujinx (Switch)": 18,
  "Yuzu (Switch)": 18,
  
  // Nintendo Switch Online
  "NES (Nintendo Switch Online)": 9,
  "SNES (Nintendo Switch Online)": 10,
  "Nintendo 64 (Nintendo Switch Online)": 11,
  "Sega Genesis (Nintendo Switch Online)": 6,
  "Game Boy (Nintendo Switch Online)": 12,
  "Game Boy Advance (Nintendo Switch Online)": 12,
  
  // Mobile
  "Mobile": 100,
};

// Get platform priority for an image
async function getImagePlatformPriority(imageId) {
  try {
    const metadata = await getImageMetadataFromIndexedDB(imageId);
    if (metadata && metadata.platform) {
      const priority = platformPriority[metadata.platform];
      return priority !== undefined ? priority : 999; // 999 for unknown platforms
    }
  } catch (e) {
    console.warn("Could not get platform for image:", imageId, e);
  }
  return 999;
}

// Sort images in a tier by platform priority
async function sortTierByPlatform(tierContainer) {
  const images = Array.from(tierContainer.querySelectorAll(".image"));
  console.log(`Sorting ${images.length} images by platform priority`);
  
  // Get priorities for all images
  const imagePriorities = await Promise.all(
    images.map(async (img) => {
      const priority = await getImagePlatformPriority(img.dataset.imageId);
      console.log(`Image ${img.dataset.imageId}: priority ${priority}`);
      return {
        element: img,
        priority: priority
      };
    })
  );
  
  // Sort by priority
  imagePriorities.sort((a, b) => a.priority - b.priority);
  console.log(`Priorities sorted:`, imagePriorities.map(p => p.priority));
  
  // Reorder DOM
  imagePriorities.forEach(({ element }) => {
    tierContainer.appendChild(element);
  });
  
  console.log(`Finished sorting tier`);
}

// Toggle platform ordering for a tier
async function toggleTierOrdering(tierIndex, enabled) {
  tierOrderingStates[tierIndex] = enabled;
  
  if (enabled) {
    // Get the tier container
    const rows = document.querySelectorAll(".row");
    if (rows[tierIndex]) {
      const tierContainer = rows[tierIndex].children[1];
      await sortTierByPlatform(tierContainer);
    }
  }
  
  // Save state to IndexedDB
  await saveSetting("tierOrderingStates", tierOrderingStates);
  
  // Also save to Firebase if user is logged in
  if (currentUser && firebaseDb) {
    await saveTierListToFirebase();
  }
}

// Toggle limit-to-10 for a tier
async function toggleTierLimit(tierIndex, enabled) {
  tierLimitStates[tierIndex] = enabled;
  
  // Save state to IndexedDB
  await saveSetting("tierLimitStates", tierLimitStates);
  
  // Also save to Firebase if user is logged in
  if (currentUser && firebaseDb) {
    await saveTierListToFirebase();
  }
}



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
    console.error('Failed to save image positions:', err);
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
      console.log("Loaded tier list from IndexedDB (localTierList)");
      return;
    }
  } catch (err) {
    console.warn('Failed to load tier list from IndexedDB, falling back to localStorage/images:', err);
  }

  // Backwards-compat: try older localStorage key
  try {
    const savedData = localStorage.getItem("savedTierList");
    if (savedData) {
      const tierListData = JSON.parse(savedData);
      loadTierListFromObject(tierListData);
      console.log("Loaded tier list from localStorage (savedTierList)");
      return;
    }
  } catch (err) {
    console.warn("Failed to load tier list from localStorage, falling back to images only:", err);
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
        console.log("Skipping duplicate image:", imageObj.id);
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
        console.warn(`Image failed to load: ${imageObj.id} (${imageObj.src}). Removing from tier list.`);
        image.remove();
        deleteImageFromIndexedDB(imageObj.id).catch(err => {
          console.warn(`Could not delete stale image ${imageObj.id} from storage:`, err);
        });
        
        // Resync to Firebase to propagate cleanup to other devices
        if (currentUser && firebaseDb && firebaseAvailable) {
          clearTimeout(autoSaveTimeout);
          autoSaveTimeout = setTimeout(() => {
            saveTierListToFirebase().catch(err => {
              console.warn('Failed to resync after image cleanup:', err);
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
    console.error('Failed to load images:', err);
  });
}

async function deleteTierList() {
  const confirmDelete = confirm("Are you sure you want to delete the entire tier list? This will remove all images from the tier list and Cloudinary. This action cannot be undone.");
  if (!confirmDelete) {
    return;
  }

  const confirmAgain = confirm("This will permanently delete ALL images from Cloudinary. Are you absolutely sure?");
  if (!confirmAgain) {
    return;
  }

  const loadingDiv = document.createElement("div");
  loadingDiv.id = "delete-loading";
  loadingDiv.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); color: white; padding: 20px 40px; border-radius: 8px; z-index: 10000; font-size: 16px;";
  loadingDiv.textContent = "Deleting tier list...";
  document.body.appendChild(loadingDiv);

  try {
    // Get all images from IndexedDB
    const allImages = await getImagesFromIndexedDB();
    
    // Delete all images from Cloudinary
    for (const image of allImages) {
      const cloudinaryUrl = image.cloudinaryUrl || image.src;
      await deleteFromCloudinary(cloudinaryUrl);
    }

    // Clear all images from IndexedDB
    await clearImagesFromIndexedDB();
    
    // Delete all metadata from IndexedDB
    const transaction = indexedDb.transaction(['imageMetadata'], 'readwrite');
    const store = transaction.objectStore('imageMetadata');
    await new Promise((resolve, reject) => {
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });

    // Remove all images from DOM
    document.querySelectorAll(".image").forEach(img => img.remove());
    
    // Clear Firebase tier list if user is logged in
    if (currentUser && firebaseDb) {
      try {
        await firebaseDb.collection("tierLists").doc(currentUser.uid).delete();
      } catch (error) {
        console.error('Failed to delete tierlist from Firebase:', error);
      }
    }

    loadingDiv.remove();
    alert("Tier list deleted successfully. All images have been removed from Cloudinary and your tier list.");
    
    // Optionally reload the page to reset everything
    location.reload();
  } catch (err) {
    console.error("Failed to delete tier list:", err);
    loadingDiv.remove();
    alert("Failed to delete tier list. Please try again.");
  }
}

function getImageMetadata(imageId) {
  // This function is kept for backward compatibility but uses IndexedDB asynchronously
  // For synchronous metadata access, use getImageMetadataFromIndexedDB instead
  return { name: "", date: "", description: "", status: "", platform: null };
}

function saveImageMetadata(imageId, metadata) {
  // Deprecated: Use saveImageMetadataToIndexedDB instead
  saveImageMetadataToIndexedDB(imageId, metadata).catch(err => {
    console.error('Failed to save image metadata:', err);
  });
}

function deleteImageMetadata(imageId) {
  // Deprecated: Use deleteImageMetadataFromIndexedDB instead
  deleteImageMetadataFromIndexedDB(imageId).catch(err => {
    console.error('Failed to delete image metadata:', err);
  });
}

function renderPlatformOptions() {
  const searchInput = document.getElementById("platform-search");
  const optionsContainer = document.getElementById("platform-options");
  let searchQuery = searchInput.value.toLowerCase().trim();
  let originalSearchQuery = searchQuery;

  optionsContainer.innerHTML = "";

  // Platform aliases for shortcuts
  const platformAliases = {
    "ps": "playstation",
    "psp": "playstation portable",
    "xbox": "xbox",
    "nintendo": ["nintendo", "game boy", "game boy advance", "ds", "3ds", "gamecube", "wii", "switch"],
    "switch": "switch",
    "wii": "wii",
    "n64": "nintendo 64",
    "valve": ["valve index", "steam deck"],
    "vsmile": "v.smile",
  };

  // Category aliases
  const categoryAliases = {
    "console": "Console",
    "handheld": "Handhelds",
    "mobile": "Mobile",
    "arcade": "Arcade",
    "pc": "PC",
  };

  // Check if search query matches a category alias
  let selectedCategory = null;
  if (categoryAliases[searchQuery]) {
    selectedCategory = categoryAliases[searchQuery];
  }

  // Check if search query matches a platform alias
  if (platformAliases[searchQuery]) {
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
    try { autoSaveMetadata(imageId); } catch (e) { console.error(e); }
  }, 800);
}

// Genre UI and helpers removed

let deletePlatformMode = false;
let draggedPlatform = null;
let draggedCategory = null;
let draggedPlaceholder = null;

// Search commands (ordered to match game details modal: Name, Date, Description, Platform, Status)
const SEARCH_COMMANDS = {
  "/Platform": "Show games with specific platform",
  "/DateBeaten": "Show games with specific date beaten",
  "/Completion": "Show games with specific completion status",
  "/NoName": "Show games with no name",
  "/NoDate": "Show games with no date",
  "/NoDescription": "Show games with no description",
  "/NoPlatform": "Show games with no platform",
  "/NoDeveloper": "Show games with no developer",
  "/NoStatus": "Show games with no status",
  "/Developer": "Search by developer name (e.g., /Developer Rockstar)",
  "/ShowAmount": "Show number of images in each tier (can combine with other commands or search)"
};

// State for keyboard navigation in commands dropdown
let searchCommandHighlightedIndex = -1;

function highlightSearchCommand(dropdown, index) {
  const items = dropdown.querySelectorAll('.search-command-item');
  items.forEach(it => it.classList.remove('selected'));
  if (index >= 0 && index < items.length) {
    items[index].classList.add('selected');
    items[index].scrollIntoView({ block: 'nearest' });
    searchCommandHighlightedIndex = index;
  } else {
    searchCommandHighlightedIndex = -1;
  }
}

function selectHighlightedSearchCommand() {
  const dropdown = document.getElementById('search-commands-dropdown');
  if (!dropdown) return;
  const items = dropdown.querySelectorAll('.search-command-item');
  if (searchCommandHighlightedIndex >= 0 && searchCommandHighlightedIndex < items.length) {
    items[searchCommandHighlightedIndex].click();
  }
}

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
        console.error('Failed to save custom platform:', err);
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
        console.error('Failed to save custom platform:', err);
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
      console.error('Failed to update image metadata:', err);
    });
  }).catch(err => {
    console.error('Failed to delete platform:', err);
  });
}

function updatePlatformButton() {
  const btn = document.getElementById("platform-btn");
  if (currentSelectedPlatform) {
    btn.textContent = currentSelectedPlatform + " ▼";
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

function filterImages(searchQuery) {
  const rows = document.querySelectorAll(".row");
  const imagesBar = document.querySelector("#images-bar");

  // If the user typed only "/", show all games and let the command dropdown appear.
  const rawQuery = searchQuery.trim();
  // Convert search query to lowercase for case-insensitive search
  // Replace & with "and" for interchangeability
  const query = rawQuery === "/" ? "" : searchQuery.toLowerCase().replace(/&/g, "and");

  // Common game abbreviations map
  const abbreviationsMap = {
    "gta": "grand theft auto",
    "rdr": "red dead redemption",
    "ac": "assassin's creed",
    "cod": "call of duty",
    "mw": "modern warfare",
    "bc": "battlefield",
    "halo": "halo",
    "doom": "doom",
    "tlou": "last of us",
    "ff": "final fantasy",
    "dq": "dragon quest",
    "dw": "dynasty warriors",
    "mg": "metal gear",
    "mgs": "metal gear solid",
    "re": "resident evil",
    "sf": "street fighter",
    "mk": "mortal kombat",
    "smash": "super smash bros",
    "mario": "mario",
    "zelda": "legend of zelda",
    "pokemon": "pokemon",
    "mc": "minecraft",
    "ow": "overwatch",
    "lol": "league of legends",
    "dota": "dota 2",
    "cs": "counter strike",
    "hl": "half life",
    "l4d": "left 4 dead",
    "tf": "team fortress",
    "tes": "elder scrolls",
    "oblivion": "elder scrolls oblivion",
    "skyrim": "elder scrolls skyrim",
    "witcher": "witcher",
    "rp": "road rash",
    "gow": "god of war",
    "kh": "kingdom hearts",
    "dmc": "devil may cry",
    "persona": "persona",
    "smt": "shin megami tensei",
    "fire emblem": "fire emblem",
    "fe": "fire emblem",
    "uncharted": "uncharted",
    "gears": "gears of war",
    "hg": "hunger games",
    "twd": "walking dead",
    "vsmile": "v.smile"
  };

  // Platform abbreviations map
  const platformAbbreviationsMap = {
    "ps": "playstation",
    "ps1": "PlayStation 1",
    "ps2": "PlayStation 2",
    "ps3": "PlayStation 3",
    "ps4": "PlayStation 4",
    "ps5": "PlayStation 5",
    "psp": "PlayStation Portable",
    "psvr": "PlayStation VR",
    "psvr2": "PlayStation VR2"
  };

  // Developer abbreviations map (common short forms -> full studio/publisher names)
  const developerAbbreviationsMap = {
    "ea": "electronic arts",
    "ubi": "ubisoft",
    "ubisoft": "ubisoft",
    "nd": "naughty dog",
    "ndog": "naughty dog",
    "rockstar": "rockstar games",
    "rs": "rockstar games",
    "nintendo": "nintendo",
    "valve": "valve",
    "capcom": "capcom",
    "square": "square enix",
    "sqex": "square enix",
    "konami": "konami",
    "bethesda": "bethesda",
    "blizzard": "blizzard",
    "bungee": "bungie",
    "bungie": "bungie",
    "fromsoftware": "fromsoftware",
    "from": "fromsoftware",
  };

  // Function to check if a game name matches the query (including abbreviations)
  function matchesQuery(gameName, searchQuery) {
    const nameWords = gameName.toLowerCase().replace(/&/g, "and").split(/\s+/);
    const gameNameLower = gameName.toLowerCase().replace(/&/g, "and");
    
    // Direct string match
    if (gameNameLower.includes(searchQuery)) {
      return true;
    }
    
    // Check if query is an abbreviation that matches
    if (abbreviationsMap[searchQuery]) {
      const fullName = abbreviationsMap[searchQuery].toLowerCase();
      if (gameNameLower.includes(fullName)) {
        return true;
      }
    }
    
    // Special case: SMT/Shin Megami Tensei should also show Persona games
    if ((searchQuery === "smt" || searchQuery === "shin megami tensei") && gameNameLower.includes("persona")) {
      return true;
    }
    
    // Check if any word in the game name starts with the query
    if (nameWords.some(word => word.startsWith(searchQuery))) {
      return true;
    }
    
    return false;
  }

  

  // Get all image metadata from IndexedDB
  getAllImageMetadataFromIndexedDB().then(allMetadata => {
    // Create a map of imageId to metadata for quick lookup
    const metadataMap = {};
    allMetadata.forEach(metadata => {
      metadataMap[metadata.id] = metadata;
    });

    // Determine if we should show counts
    let showCounts = false;
    let filteredQuery = query;
    if (query.includes("/showamount")) {
      showCounts = true;
      filteredQuery = query.replace("/showamount", "").trim();
    }

    // Filter images in tiers
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

        let shouldShow = false;

        // Handle special commands
        if (filteredQuery.startsWith("/platform")) {
          // Support both /platform (shows all console games) and /platform switch (filters by specific platform)
          if (filteredQuery === "/platform") {
            shouldShow = imagePlatform && imagePlatform.toLowerCase().includes("console");
          } else if (filteredQuery.startsWith("/platform ")) {
            // Search by platform name: /platform switch
            let platformQuery = filteredQuery.substring("/platform ".length).trim().toLowerCase();
            // Expand common abbreviations (e.g., ps -> playstation)
            if (platformAbbreviationsMap[platformQuery]) {
              platformQuery = platformAbbreviationsMap[platformQuery].toLowerCase();
            }
            shouldShow = imagePlatform.toLowerCase().includes(platformQuery);
          }
        } else if (filteredQuery === "/datebeaten") {
          shouldShow = imageDate && imageDate.trim() !== "";
        } else if (filteredQuery === "/completion") {
          shouldShow = imageStatus && imageStatus.trim() !== "";
        } else if (filteredQuery === "/noname") {
          shouldShow = !imageName || imageName.trim() === "";
        } else if (filteredQuery === "/nodate") {
          shouldShow = !imageDate || imageDate.trim() === "";
        } else if (filteredQuery === "/nostatus") {
          shouldShow = !imageStatus || imageStatus.trim() === "";
        } else if (filteredQuery === "/noplatform") {
          shouldShow = !imagePlatform || imagePlatform.trim() === "";
        } else if (filteredQuery === "/nodescription") {
          shouldShow = !imageDescription || imageDescription.trim() === "";
        } else if (filteredQuery === "/nodeveloper") {
          shouldShow = !imageDeveloper || imageDeveloper.trim() === "";
        } else if (filteredQuery.startsWith("/developer ")) {
          // Search by developer name: /developer rockstar
          let developerQuery = filteredQuery.substring("/developer ".length).trim().toLowerCase();
          // Expand common abbreviations (e.g., ea -> electronic arts)
          if (developerAbbreviationsMap[developerQuery]) {
            developerQuery = developerAbbreviationsMap[developerQuery].toLowerCase();
          }
          shouldShow = imageDeveloper.toLowerCase().includes(developerQuery);
        } else if (filteredQuery === "") {
          // Empty search shows all
          shouldShow = true;
        } else {
          // Regular search - only match game names, not platforms
          shouldShow = matchesQuery(imageName, filteredQuery);
        }

        img.style.display = shouldShow ? "" : "none";
      });
    });

    // After filtering, update badges (keeps counts accurate and visible when command used)
    updateTierCounts(showCounts);

    // Update total count display next to search bar when showing counts or when filtering
    try {
      const totalCountEl = document.getElementById('total-count');
      if (totalCountEl) {
        // Count visible images in tier rows, exclude images in the lower bar
        const total = Array.from(document.querySelectorAll('.row .image')).filter(img => img.style.display !== 'none').length;
        if ((showCounts || filteredQuery !== "") && total > 0) {
          totalCountEl.textContent = `Total: ${total}`;
          totalCountEl.style.display = '';
        } else {
          totalCountEl.style.display = 'none';
        }
      }
    } catch (e) {
      console.warn('Failed to update total count display', e);
    }

    // Filter images in images bar
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

      let shouldShow = false;

      // Handle special commands
      if (filteredQuery.startsWith("/platform")) {
        // Support both /platform (shows all console games) and /platform switch (filters by specific platform)
        if (filteredQuery === "/platform") {
          shouldShow = imagePlatform && imagePlatform.toLowerCase().includes("console");
        } else if (filteredQuery.startsWith("/platform ")) {
          // Search by platform name: /platform switch
          let platformQuery = filteredQuery.substring("/platform ".length).trim().toLowerCase();
          // Expand common abbreviations (e.g., ps -> playstation)
          if (platformAbbreviationsMap[platformQuery]) {
            platformQuery = platformAbbreviationsMap[platformQuery].toLowerCase();
          }
          shouldShow = imagePlatform.toLowerCase().includes(platformQuery);
        }
      } else if (filteredQuery === "/datebeaten") {
        shouldShow = imageDate && imageDate.trim() !== "";
      } else if (filteredQuery === "/completion") {
        shouldShow = imageStatus && imageStatus.trim() !== "";
      } else if (filteredQuery === "/noname") {
        shouldShow = !imageName || imageName.trim() === "";
      } else if (filteredQuery === "/nodate") {
        shouldShow = !imageDate || imageDate.trim() === "";
      } else if (filteredQuery === "/nostatus") {
        shouldShow = !imageStatus || imageStatus.trim() === "";
      } else if (filteredQuery === "/noplatform") {
        shouldShow = !imagePlatform || imagePlatform.trim() === "";
      } else if (filteredQuery === "/nodescription") {
        shouldShow = !imageDescription || imageDescription.trim() === "";
      } else if (filteredQuery === "/nodeveloper") {
        shouldShow = !imageDeveloper || imageDeveloper.trim() === "";
      } else if (filteredQuery.startsWith("/developer ")) {
        // Search by developer name: /developer rockstar
        let developerQuery = filteredQuery.substring("/developer ".length).trim().toLowerCase();
        // Expand common abbreviations (e.g., ea -> electronic arts)
        if (developerAbbreviationsMap[developerQuery]) {
          developerQuery = developerAbbreviationsMap[developerQuery].toLowerCase();
        }
          shouldShow = imageDeveloper.toLowerCase().includes(developerQuery);
      } else if (filteredQuery === "") {
        // Empty search shows all
        shouldShow = true;
      } else {
        // Regular search - only match game names, not platforms
        shouldShow = matchesQuery(imageName, filteredQuery);
      }

      img.style.display = shouldShow ? "" : "none";
    });
  }).catch(err => {
    console.error('Failed to load image metadata for filtering:', err);
  });
  
  // Update clear button visibility
  updateClearButtonVisibility();
}

// Handle search input to show/hide commands dropdown
function handleSearchInput(searchQuery) {
  const dropdown = document.getElementById("search-commands-dropdown");
  const trimmedQuery = searchQuery.trim();
  
  // Check if there's an incomplete command (starts with /)
  const lastSlashIndex = trimmedQuery.lastIndexOf("/");
  if (lastSlashIndex >= 0) {
    const partialCommand = trimmedQuery.substring(lastSlashIndex);
    showSearchCommandsDropdown(partialCommand, dropdown);
  } else {
    dropdown.classList.add("hidden");
  }
}

// Show search commands dropdown
function showSearchCommandsDropdown(searchQuery, dropdown) {
  const query = searchQuery.toLowerCase().trim();
  const filteredCommands = Object.keys(SEARCH_COMMANDS).filter(cmd => 
    cmd.toLowerCase().includes(query) || query === "/"
  );
  
  dropdown.innerHTML = "";
  
  if (filteredCommands.length === 0) {
    dropdown.classList.add("hidden");
    return;
  }
  
  filteredCommands.forEach(command => {
    const item = document.createElement("div");
    item.className = "search-command-item";
    item.dataset.index = filteredCommands.indexOf(command);
    item.innerHTML = `<div class="search-command-name">${command}</div><div class="search-command-desc">${SEARCH_COMMANDS[command]}</div>`;
    item.onclick = () => {
      const input = document.getElementById("search-input");
      const currentValue = input.value;
      const lastSlashIndex = currentValue.lastIndexOf("/");
      if (lastSlashIndex >= 0) {
        const beforePartial = currentValue.substring(0, lastSlashIndex);
        input.value = beforePartial + command;
      } else {
        input.value = command;
      }
      filterImages(input.value);
      dropdown.classList.add("hidden");
    };
    // highlight on hover
    item.addEventListener('mouseover', () => {
      highlightSearchCommand(dropdown, parseInt(item.dataset.index, 10));
    });
    dropdown.appendChild(item);
  });
  
  dropdown.classList.remove("hidden");
  // reset and highlight first item for keyboard navigation
  highlightSearchCommand(dropdown, 0);
}

// Clear search input and show all images
function clearSearch() {
  const searchInput = document.getElementById("search-input");
  searchInput.value = "";
  document.getElementById("search-commands-dropdown").classList.add("hidden");
  filterImages("");
  searchInput.focus();
}

// Show/hide clear button based on search input value
function updateClearButtonVisibility() {
  const searchInput = document.getElementById("search-input");
  const clearBtn = document.getElementById("clear-search");
  
  if (searchInput.value.length > 0) {
    clearBtn.classList.add("visible");
  } else {
    clearBtn.classList.remove("visible");
  }
}

// Keyboard navigation for search commands dropdown
const searchInputElement = document.getElementById('search-input');
if (searchInputElement) {
  searchInputElement.addEventListener('keydown', (e) => {
    const dropdown = document.getElementById('search-commands-dropdown');
    if (!dropdown || dropdown.classList.contains('hidden')) return;

    const items = dropdown.querySelectorAll('.search-command-item');
    if (!items || items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(searchCommandHighlightedIndex + 1, items.length - 1);
      highlightSearchCommand(dropdown, next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(searchCommandHighlightedIndex - 1, 0);
      highlightSearchCommand(dropdown, prev);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectHighlightedSearchCommand();
    } else if (e.key === 'Escape') {
      dropdown.classList.add('hidden');
    }
  });
}

// Set up event listener for search input to update clear button visibility
document.addEventListener("DOMContentLoaded", function() {
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", updateClearButtonVisibility);
  }
  
  // Set up drag and drop for entire document
  document.addEventListener("dragenter", handleDragEnter);
  document.addEventListener("dragover", handleDragOver);
  document.addEventListener("dragleave", handleDragLeave);

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
  document.addEventListener("drop", handleImageDrop);
});

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

// Helper function to encode non UTF-8 characters to Base64
function encodeUnicode(str) {
  return btoa(
    encodeURIComponent(str).replace(
      /%([0-9A-F]{2})/g,
      function toSolidBytes(match, p1) {
        return String.fromCharCode(`0x${p1}`);
      }
    )
  );
}

// Helper function to decode non UTF-8 characters from Base64
function decodeUnicode(str) {
  return decodeURIComponent(
    atob(str)
      .split("")
      .map((c) => {
        return `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`;
      })
      .join("")
  );
}

function convertImageToDataURL(imageElement) {
  const MAX_IMG_SIZE = 500;
  const c = document.createElement("canvas");
  const ratio = imageElement.naturalHeight / imageElement.naturalWidth;

  if (ratio > 1) {
    c.height = Math.min(MAX_IMG_SIZE, imageElement.naturalHeight);
    c.width = Math.round(MAX_IMG_SIZE / ratio);
  } else if (ratio < 1) {
    c.height = Math.round(MAX_IMG_SIZE * ratio);
    c.width = Math.min(MAX_IMG_SIZE, imageElement.naturalWidth);
  } else {
    c.width = MAX_IMG_SIZE;
    c.height = MAX_IMG_SIZE;
  }

  const ctx = c.getContext("2d");
  ctx.drawImage(imageElement, 0, 0, c.width, c.height);
  const base64String = c.toDataURL();
  c.remove();

  return base64String;
}

async function share(shareButton, sharePositions) {
  const tiers = document.querySelectorAll(".row");
  const imagesBar = document.querySelector("#images-bar");
  const barImages = Array.from(imagesBar.children);

  const oldButtonText = shareButton.innerText;
  shareButton.disabled = true;
  shareButton.innerText = "...";

  const shareJSON = {
    images: [],
    tiers: [],
  };

  console.log(`Sharing with${sharePositions ? "" : "out"} positions...`);

  tiers.forEach((tier, tierIndex) => {
    const betterTier = {
      index: tierIndex,
      name: tier.children[0].children[0].textContent,
      color: tier.children[0].style.backgroundColor,
      images: Array.from(tier.children[1].children),
    };

    shareJSON.tiers.push({
      index: betterTier.index,
      name: betterTier.name,
      color: betterTier.color,
    });

    betterTier.images.forEach((img, imgIndex) => {
      const betterImage = {
        index: imgIndex,
        element: img,
        src: img.src,
      };

      const base64String = convertImageToDataURL(betterImage.element);

      shareJSON.images.push({
        img: base64String,
        tier: sharePositions ? betterTier.index : -1,
      });
    });
  });

  console.log(shareJSON);

  barImages.forEach((img, imgIndex) => {
    const betterImage = {
      index: imgIndex,
      element: img,
      src: img.src,
    };

    const base64String = convertImageToDataURL(betterImage.element);

    shareJSON.images.push({
      img: base64String,
      tier: -1,
    });
  });

  const c64 = encodeUnicode(JSON.stringify(shareJSON));
  const chunks = c64.match(/.{1,10000}/g);

  const values = await Promise.all(
    chunks.map(async (chunk) => {
      const response = await fetch("https://hastebin.skyra.pw/documents", {
        method: "POST",
        body: chunk,
      });
      return await response.json();
    })
  );

  const strings = values.map((v) => v.key);
  const res = await fetch("https://hastebin.skyra.pw/documents", {
    method: "POST",
    body: encodeUnicode(JSON.stringify(strings)),
  });
  const hastebinResponse = await res.json();

  console.log(hastebinResponse);

  const shareData = {
    title: "Share tier list!",
    text: `${location.origin}${location.pathname}#${hastebinResponse.key}`,
    url: `${location.origin}${location.pathname}#${hastebinResponse.key}`,
  };

  if (navigator.canShare(shareData)) {
    try {
      navigator.share(shareData);
    } finally {
      shareButton.innerText = "Shared!";
      setTimeout(() => {
        shareButton.innerText = oldButtonText;
        shareButton.disabled = false;
      }, 3000);
    }
  } else {
    await navigator.clipboard.writeText(shareData.url);

    shareButton.innerText = "Copied!";
    setTimeout(() => {
      shareButton.innerText = oldButtonText;
      shareButton.disabled = false;
    }, 5000);
  }
}

async function load() {
  console.log(`Loading with the id "${hash}"...`);

  // Get the chunks
  const response = await fetch(`https://hastebin.skyra.pw/raw/${hash}`);
  const text = await response.text();
  const chunks = JSON.parse(decodeUnicode(text));

  // Get the content of the chunks
  const chunksData = await Promise.all(
    chunks.map(async (chunk) => {
      const chunkResponse = await fetch(
        `https://hastebin.skyra.pw/raw/${chunk}`
      );
      return chunkResponse.text();
    })
  );

  const res = chunksData.join(""); // Merge all chunks
  const data = JSON.parse(decodeUnicode(res));
  console.log(data); // Print readable data

  for (const row of document.querySelectorAll(".row")) {
    deleteRow(row);
  }

  for (const tier of data.tiers) {
    addRow(tier.name, tier.color || "lightslategray");
  }

  const imagesBar = document.querySelector("#images-bar");
  const rows = document.querySelectorAll(".row");

  for (const img of data.images) {
    const image = document.createElement("img");
    image.src = img.img;
    image.className = "image";

    if (img.tier === -1) {
      imagesBar.appendChild(image);
    } else {
      rows[img.tier].children[1].appendChild(image);
    }
  }
}


