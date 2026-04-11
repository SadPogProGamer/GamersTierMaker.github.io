const defaultColors = [
  "rgb(191, 255, 127)",
  "rgb(255, 127, 127)",
  "rgb(255, 191, 127)",
  "rgb(255, 223, 127)",
  "#FFFF7F",
  "rgb(191, 255, 127)",
  "rgb(127, 255, 127)",
  "rgb(255, 127, 255)",
];

const hash = location.hash.substring(1);

// Firebase globals
let firebaseApp;
let firebaseAuth;
let firebaseDb;
let currentUser = null;
let firebaseAvailable = true;

const platformOptions = {
  "PC": [
    "PC", 
    "PC (Via Decompilation)", 
    "PC (Via Recompilation)"
  ],
  "Console": [
    "PlayStation 1",
    "PlayStation 2",
    "PlayStation 3",
    "PlayStation 4",
    "PlayStation 5",
    "Xbox",
    "Xbox 360",
    "Xbox One",
    "Xbox Series X/S",
    "NES",
    "SNES",
    "Nintendo 64",
    "GameCube",
    "GameCube (Via Backwards Compatibility)",
    "Nintendo Wii",
    "Nintendo Wii U",
    "Nintendo Switch",
    "Nintendo Switch 2",
    "Sega Genesis",
    "Sega Saturn",
    "Sega Dreamcast",
    "Atari 2600",
    "Atari 5200",
    "Atari 7800",
    "Atari Jaguar",
    "V.Smile",
  ],
  "Handhelds": [
    "Game Boy",
    "Game Boy Color",
    "Game Boy Advance",
    "Nintendo DS",
    "Nintendo 3DS",
    "PlayStation Portable",
    "PlayStation Vita",
    "Sega Game Gear",
    "Atari Lynx",
    "Steam Deck",
  ],
    "Emulators": [
    "Snes9x (SNES)",
    "Mesen (NES)",
    "Visual Boy Advance (Game Boy Advance)",
    "MelonDS (Nintendo DS)",
    "Dolphin (GameCube)",
    "Dolphin (Wii)",
    "Citra (Nintendo 3DS)",
    "Cemu (Wii U)",
    "DuckStation (PS1)",
    "PCSX2 (PS2)",
    "RPCS3 (PS3)",
    "PPSSPP (PSP)",
    "Vita3K (PS Vita)",
    "Xemu (Xbox)",
    "Xenia (Xbox 360)",
    "Ryujinx (Switch)",
    "Yuzu (Switch)",
  ],
  "Nintendo Switch Online": [
    "NES (Nintendo Switch Online)",
    "SNES (Nintendo Switch Online)",
    "Nintendo 64 (Nintendo Switch Online)",
    "Sega Genesis (Nintendo Switch Online)",
    "Game Boy (Nintendo Switch Online)",
    "Game Boy Advance (Nintendo Switch Online)",
  ],
    "VR": [
    "Meta Quest 2",
    "Meta Quest 3",
    "Meta Quest Pro",
    "PlayStation VR",
    "PlayStation VR2",
    "HTC Vive",
    "HTC Vive Pro",
    "HTC Vive Cosmos",
    "Valve Index",
    "Oculus Rift",
    "Oculus Rift S",
  ],
    "Arcade": [
    "Arcade"
  ],
  "Mobile": [
    "Mobile"
  ],
};

let customPlatforms = [];
let pickrInstances = [];

let scrollable = true;
let drake;
let currentImageElement = null;
let currentSelectedPlatform = null;
let currentHas100Replay = false;
let selectedImages = new Set();
let lastSelectedImage = null;
let suppressNextLeftClick = false;
let indexedDb; // IndexedDB database
let initializationComplete = false; // Track when app is fully initialized
let autoSaveTimeout = null; // Debounce timer for Firebase sync
let autoSaveTimers = {}; // Track separate timers per image for faster saves
let lastFirebaseSyncTime = {}; // Track last sync time per image to force periodic syncs
let lastRemoteSyncTime = null; // Track last time we synced FROM Firebase
let syncPollInterval = null; // IntervalID for polling remote Firebase for updates

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
    return; // allow default right-click behavior
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

// Initialize Firebase
async function initializeFirebase() {
  if (!FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey === "YOUR_API_KEY") {
    console.warn("Firebase not configured. Syncing across devices will not work.");
    firebaseAvailable = false;
    return null;
  }

  try {
    firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    firebaseAuth = firebase.auth();
    firebaseDb = firebase.firestore();

    firebaseAuth.onAuthStateChanged(async (user) => {
      currentUser = user;
      updateAuthUI();

      if (currentUser) {
        console.log("User logged in:", currentUser.email);
        console.log("Firebase initialized:", !!firebaseApp);
        await loadTierListFromFirebase().catch(err => {
          console.error("Failed to load from Firebase:", err);
        });

        // Start polling for updates from other devices
        if (initializationComplete) {
          startSyncPolling();
        }
      } else {
        // User logged out
        stopSyncPolling();
      }
    });

    return true;
  } catch (err) {
    console.error("Firebase initialization failed:", err);
    firebaseAvailable = false;
    return null;
  }
}

// Update auth UI
function updateAuthUI() {
  const loginBtn = document.getElementById("login-btn");
  const profileDropdown = document.getElementById("profile-dropdown");
  const profileAvatar = document.getElementById("profile-avatar");
  const userName = document.getElementById("user-name");

  if (currentUser) {
    loginBtn.style.display = "none";
    profileDropdown.classList.remove("hidden");
    
    const userMeta = currentUser.user_metadata || {};
    const rawMeta = currentUser.raw_user_meta_data || {};
    const avatarUrl = userMeta.avatar_url || userMeta.picture || rawMeta.avatar_url || rawMeta.picture || "";
    if (avatarUrl) {
      profileAvatar.src = avatarUrl;
    }
    
    userName.textContent = userMeta.full_name || userMeta.name || rawMeta.full_name || rawMeta.name || currentUser.email || "Signed in";
    userName.style.display = "block";
  } else {
    loginBtn.style.display = "block";
    profileDropdown.classList.add("hidden");
    userName.style.display = "none";
  }
}

// Toggle profile dropdown menu
function toggleProfileDropdown() {
  const profileMenu = document.getElementById("profile-menu");
  profileMenu.classList.toggle("hidden");
  
  // Close menu when clicking outside
  document.addEventListener("click", function closeMenu(e) {
    const profileDropdown = document.getElementById("profile-dropdown");
    if (!profileDropdown.contains(e.target)) {
      profileMenu.classList.add("hidden");
      document.removeEventListener("click", closeMenu);
    }
  });
}

// Open the profile screen overlay
function openProfileScreen() {
  // Navigate to a full page for "My Tierlists" instead of an overlay
  try {
    window.location.href = 'my-tierlists.html';
  } catch (e) {
    console.error('Failed to navigate to My Tierlists page', e);
  }
}

function closeProfileScreen() {
  const screen = document.getElementById('profile-screen');
  if (screen) screen.classList.add('hidden');
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

// Sign in with Google
async function signInWithGoogle() {
  try {
    if (!firebaseAuth) {
      throw new Error("Firebase auth is not initialized.");
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    await firebaseAuth.signInWithPopup(provider);
  } catch (err) {
    console.error("Sign in error:", err);
    alert("Failed to sign in. Make sure Firebase is configured and Google auth is enabled.");
  }
}

// Sign out
async function signOut() {
  try {
    stopSyncPolling();
    if (!firebaseAuth) {
      throw new Error("Firebase auth is not initialized.");
    }
    await firebaseAuth.signOut();
  } catch (err) {
    console.error("Sign out error:", err);
  }
}

// Save tier list to Firebase
async function saveTierListToFirebase() {
  if (!currentUser || !firebaseDb || !firebaseAvailable) return;

  try {
    const tierListData = {
      header: document.getElementById("main-title").textContent,
      tiers: [],
      imagePositions: [],
      gameMetadata: {},
      lastUpdated: new Date().toISOString()
    };

    // Get all image metadata from IndexedDB
    const allImages = await getImagesFromIndexedDB();
    const metadataMap = {};
    
    for (const image of allImages) {
      try {
        const metadata = await getImageMetadataFromIndexedDB(image.id);
        if (metadata) {
          metadataMap[image.id] = metadata;
        }
      } catch (err) {
        console.warn(`Failed to get metadata for image ${image.id}:`, err);
      }
    }

    // Save tier data
    const rows = document.querySelectorAll(".row");
    rows.forEach((row, tierIndex) => {
      const tierLabel = row.querySelector(".tier-label");
      const tierImages = row.children[1].querySelectorAll(".image");
      
      tierListData.tiers.push({
        index: tierIndex,
        name: tierLabel.querySelector("p").textContent,
        color: tierLabel.style.backgroundColor,
      });

      Array.from(tierImages).forEach((img, order) => {
        const imageId = img.dataset.imageId;
        const imageSrc = img.dataset.imageSrc;
        
        tierListData.imagePositions.push({
          imageId: imageId,
          imageSrc: imageSrc,
          tier: tierIndex,
          order,
          details: metadataMap[imageId] || null,
        });

        if (metadataMap[imageId]) {
          tierListData.gameMetadata[imageId] = metadataMap[imageId];
        }
      });
    });

    // Save images from bar
    const imagesBar = document.querySelector("#images-bar");
    const barImages = imagesBar.querySelectorAll(".image");
    Array.from(barImages).forEach((img, order) => {
      const imageId = img.dataset.imageId;
      const imageSrc = img.dataset.imageSrc;
      
      tierListData.imagePositions.push({
        imageId: imageId,
        imageSrc: imageSrc,
        tier: -1,
        order,
        details: metadataMap[imageId] || null,
      });
      
      if (metadataMap[imageId]) {
        tierListData.gameMetadata[imageId] = metadataMap[imageId];
      }
    });

    await firebaseDb.collection("tierLists").doc(currentUser.uid).set({
      tier_data: tierListData,
      updated_at: new Date().toISOString()
    }, { merge: true });

    console.log("Tier list saved to Firebase");
  } catch (err) {
    console.error("Failed to save tier list to Firebase:", err);
    throw err;
  }
}

// Validate image URL and check if it's accessible
async function validateImageUrl(url, timeoutMs = 5000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    // For CORS-protected URLs, any status < 500 is acceptable
    return response.status < 500;
  } catch (err) {
    // Network errors or timeout mean image is not accessible
    console.warn(`Image URL validation failed for ${url}:`, err.message);
    return false;
  }
}

// Clean up broken images from DOM and IndexedDB
async function cleanupBrokenImages() {
  const brokenImageIds = [];
  
  // Find all image elements in DOM
  const allImageElements = document.querySelectorAll('.image');
  
  for (const img of allImageElements) {
    const imageId = img.dataset.imageId;
    const url = img.dataset.imageSrc || img.src;
    
    // Check if URL is valid (skip data: URLs and local storage URLs)
    if (url && url.startsWith('http')) {
      const isValid = await validateImageUrl(url);
      if (!isValid) {
        console.warn(`Removing broken image: ${imageId} (${url})`);
        img.remove();
        brokenImageIds.push(imageId);
      }
    }
  }
  
  // Remove broken images from IndexedDB
  for (const imageId of brokenImageIds) {
    await deleteImageFromIndexedDB(imageId).catch(err => {
      console.warn(`Could not delete image ${imageId} from IndexedDB:`, err);
    });
  }
  
  return brokenImageIds;
}

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

// Load tier list from Firebase
async function loadTierListFromFirebase() {
  if (!currentUser || !firebaseDb || !firebaseAvailable) return;

  try {
    const doc = await firebaseDb.collection("tierLists").doc(currentUser.uid).get();
    if (!doc.exists) {
      console.log("No saved tier list found in Firebase. Checking local storage...");
      loadTierListFromLocalStorage();
      return;
    }

    const data = doc.data();
    if (!data || !data.tier_data) {
      console.log("No saved tier list found in Firebase. Checking local storage...");
      loadTierListFromLocalStorage();
      return;
    }

    await loadTierListFromObject(data.tier_data);
    lastRemoteSyncTime = new Date(data.updated_at || new Date()).getTime();
    console.log("âœ“ Tier list loaded from Firebase");
  } catch (err) {
    console.error("Failed to load tier list from Firebase:", err);
    console.log("Falling back to local storage...");
    loadTierListFromLocalStorage();
  }
}

// Poll for updates from Firebase periodically
async function pollFirebaseForUpdates() {
  if (!currentUser || !firebaseDb || !firebaseAvailable) return;

  try {
    const doc = await firebaseDb.collection("tierLists").doc(currentUser.uid).get();
    if (!doc.exists) return;

    const data = doc.data();
    if (!data || !data.tier_data) return;

    // Check if remote data is newer than what we have locally
    const remoteUpdatedAt = new Date(data.updated_at).getTime();
    if (lastRemoteSyncTime === null || remoteUpdatedAt > lastRemoteSyncTime) {
      // Remote data is newer - load it
      console.log("ðŸ“¥ Remote updates detected - syncing tier list...");
      await loadTierListFromObject(data.tier_data);
      lastRemoteSyncTime = remoteUpdatedAt;
      console.log("âœ“ Synced with remote tier list");
    }
  } catch (err) {
    console.warn("Error polling Firebase for updates:", err);
  }
}

// Start polling for remote updates
function startSyncPolling() {
  if (syncPollInterval) return; // Already polling

  if (!currentUser || !firebaseDb || !firebaseAvailable) return;

  console.log("ðŸ”„ Starting real-time sync polling (10 second interval)");
  syncPollInterval = setInterval(pollFirebaseForUpdates, 10000);
}

// Stop polling
function stopSyncPolling() {
  if (syncPollInterval) {
    clearInterval(syncPollInterval);
    syncPollInterval = null;
    console.log("â¸ Stopped sync polling");
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

// Set up platform search listener
document.addEventListener("DOMContentLoaded", () => {
  const platformSearch = document.getElementById("platform-search");
  if (platformSearch) {
    platformSearch.addEventListener("keyup", renderPlatformOptions);
  }
});

function togglePlatformDropdown() {
  const dropdownMenu = document.getElementById("platform-dropdown-menu");
  dropdownMenu.classList.toggle("hidden");
  if (!dropdownMenu.classList.contains("hidden")) {
    document.getElementById("platform-search").focus();
  }
}

function saveHeaderToStorage() {
  const headerTitle = document.getElementById("main-title").textContent;
  saveSetting("tierListHeader", headerTitle).catch(err => {
    console.error('Failed to save header:', err);
  });
}

function saveTierColors() {
  const tiers = [];
  document.querySelectorAll(".row").forEach((row) => {
    const tierLabel = row.querySelector(".tier-label");
    tiers.push({
      name: tierLabel.querySelector("p").textContent,
      color: tierLabel.style.backgroundColor,
    });
  });
  saveSetting("tierColors", tiers).catch(err => {
    console.error('Failed to save tier colors:', err);
  });

  // Also save to Firebase if user is logged in
  if (currentUser) {
    saveTierListToFirebase();
  }
}

function loadTierColors() {
  getSetting("tierColors").then(storedTiers => {
    if (storedTiers) {
      const rows = document.querySelectorAll(".row");
      const defaultTierCount = rows.length;
      
      // Update existing rows with stored names and colors
      storedTiers.forEach((tier, index) => {
        if (rows[index]) {
          const tierLabel = rows[index].querySelector(".tier-label");
          const tierNameElement = tierLabel.querySelector("p");
          tierNameElement.textContent = tier.name;
          tierLabel.style.backgroundColor = tier.color;
        }
      });
      
      // Add any new tiers that don't exist in the HTML
      for (let i = defaultTierCount; i < storedTiers.length; i++) {
        const tier = storedTiers[i];
        addRow(tier.name, tier.color);
      }
    }
  }).catch(err => {
    console.error('Failed to load tier colors:', err);
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

document.querySelectorAll(".tooltip").forEach((tooltip) => {
  const tierLabel = tooltip.parentNode;
  const defaultColor = tierLabel.style.backgroundColor || defaultColors[0];
  const colorPicker = tooltip.querySelector(".color-picker");

  createColorPicker(
    colorPicker,
    (hexColor) => {
      tierLabel.style.backgroundColor = hexColor;
    },
    (hexColor) => {
      tierLabel.style.backgroundColor = hexColor;
      saveTierColors();
    },
    defaultColor
  );
});

// Attach keydown listener to tier labels for Enter/Shift+Enter handling
function attachTierLabelKeydownListener(tierLabel) {
  tierLabel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift+Enter: insert line break and save
        e.preventDefault();
        document.execCommand('insertLineBreak');
        setTimeout(() => {
          saveTierColors();
        }, 0);
      } else {
        // Enter: save to Firebase and blur
        e.preventDefault();
        saveTierColors();
        tierLabel.blur();
      }
    }
  });

  tierLabel.addEventListener('blur', () => {
    saveTierColors();
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

document.addEventListener(
  "touchmove",
  (event) => {
    if (!scrollable) {
      event.preventDefault();
    }
  },
  {
    passive: false,
  }
);

function createColorPicker(colorPicker, onPreview, onSave, defaultColor) {
  const pickr = Pickr.create({
    el: colorPicker,
    theme: "monolith",
    default: defaultColor,
    swatches: defaultColors,
    components: {
      preview: true,
      hue: true,
      interaction: {
        input: true,
        clear: true,
        save: true,
      },
    },
  });

  let originalColor = defaultColor;
  let lastAction = "none";

  pickr.on("change", (color) => {
    const hexColor = color ? color.toHEXA().toString() : "";
    lastAction = "preview";
    onPreview(hexColor);
  });

  pickr.on("save", (color) => {
    const hexColor = color ? color.toHEXA().toString() : "";
    lastAction = "save";
    originalColor = hexColor;
    onSave(hexColor);
    pickr.hide();
  });

  pickr.on("cancel", () => {
    lastAction = "cancel";
    onPreview(originalColor);
    pickr.hide();
  });

  pickr.on("hide", () => {
    if (lastAction === "preview") {
      onPreview(originalColor);
    }
    lastAction = "none";
  });

  // Store reference to this Pickr instance on the element
  colorPicker._pickr = pickr;
  pickrInstances.push(pickr);
}

function addRow(tierName = "New tier", defaultColor = "lightslategray") {
  const mainContainer = document.querySelector("main");
  const newRow = document.createElement("div");
  newRow.className = "row";

  // Labels and colors (i.e. left)
  const tierLabelDiv = document.createElement("div");
  tierLabelDiv.className = "tier-label";
  tierLabelDiv.style.backgroundColor = defaultColor;
  tierLabelDiv.setAttribute("contenteditable", true);

  const paragraph = document.createElement("p");
  paragraph.textContent = tierName;
  paragraph.setAttribute("spellcheck", false);

  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  tooltip.setAttribute("contenteditable", false);

  const colorPicker = document.createElement("div");
  colorPicker.className = "color-picker";

  // Tiers (i.e. center)
  const tierDiv = document.createElement("div");
  tierDiv.className = "tier sort";

  // Options (i.e. right)
  const optionsDiv = document.createElement("div");
  optionsDiv.className = "tier-options";

  const optionsContainer = document.createElement("div");
  optionsContainer.className = "options-container";

  const deleteButton = document.createElement("div");
  deleteButton.className = "option delete";

  const deleteImage = document.createElement("img");
  deleteImage.className = "option-hover";
  deleteImage.src = "assets/Cog.png";
  deleteImage.alt = "Menu";
  deleteImage.setAttribute("onclick", "openRowMenu(this, event)");

  const upButton = document.createElement("div");
  upButton.className = "option";

  const upImage = document.createElement("img");
  upImage.className = "option-hover";
  upImage.src = "assets/chevron-up.svg";
  upImage.alt = "Up";
  upImage.setAttribute("onclick", "moveRow(this, -1)");

  const downButton = document.createElement("div");
  downButton.className = "option";

  const downImage = document.createElement("img");
  downImage.className = "option-hover";
  downImage.src = "assets/chevron-down.svg";
  downImage.alt = "Down";
  downImage.setAttribute("onclick", "moveRow(this, 1)");

  // Add divs to the row / main container
  tooltip.appendChild(colorPicker);

  createColorPicker(
    colorPicker,
    (hexColor) => {
      tooltip.parentNode.style.backgroundColor = hexColor;
    },
    (hexColor) => {
      tooltip.parentNode.style.backgroundColor = hexColor;
      saveTierColors();
    },
    defaultColor
  );

  tierLabelDiv.appendChild(paragraph);
  tierLabelDiv.appendChild(tooltip);

  deleteButton.appendChild(deleteImage);
  upButton.appendChild(upImage);
  downButton.appendChild(downImage);

  optionsContainer.appendChild(deleteButton);
  optionsContainer.appendChild(upButton);
  optionsContainer.appendChild(downButton);

  optionsDiv.appendChild(optionsContainer);

  newRow.appendChild(tierLabelDiv);
  newRow.appendChild(tierDiv);
  newRow.appendChild(optionsDiv);

  const unassignedContainer = mainContainer.querySelector('.unassigned-container');
  if (unassignedContainer) {
    mainContainer.insertBefore(newRow, unassignedContainer);
  } else {
    mainContainer.appendChild(newRow);
  }

  // Attach keydown listener to the newly created tier label
  attachTierLabelKeydownListener(tierLabelDiv);

  initializeDragula();
  saveTierColors();
  try { updateTierCounts(countsAreShown()); } catch (e) {}
  try { updateTierCounts(countsAreShown()); } catch (e) {}
}

function openRowMenu(element, event) {
  event.stopPropagation();
  
  // Close any existing menus
  document.querySelectorAll('.row-menu').forEach(menu => menu.remove());
  
  const row = element.closest(".row");
  const currentIndex = Array.from(row.parentNode.children).indexOf(row);
  
  // Create menu container
  const menu = document.createElement("div");
  menu.className = "row-menu";
  
  // Add tier above button
  const addAboveBtn = document.createElement("button");
  addAboveBtn.className = "row-menu-btn";
  addAboveBtn.textContent = "Add Tier Above";
  addAboveBtn.onclick = () => {
    row.parentNode.insertBefore(createNewRow(), row);
    initializeDragula();
    saveTierColors();
    menu.remove();
  };
  
  // Add tier below button
  const addBelowBtn = document.createElement("button");
  addBelowBtn.className = "row-menu-btn";
  addBelowBtn.textContent = "Add Tier Below";
  addBelowBtn.onclick = () => {
    row.parentNode.insertBefore(createNewRow(), row.nextSibling);
    initializeDragula();
    saveTierColors();
    menu.remove();
  };
  
  // Delete tier button
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "row-menu-btn delete";
  deleteBtn.textContent = "Delete Tier";
  deleteBtn.onclick = () => {
    if (confirm("Are you sure you want to delete this tier? All images in it will be moved to the uncategorized section.")) {
      deleteRow(element);
      menu.remove();
    }
  };
  
  // Order on console toggle
  const orderCheckboxContainer = document.createElement("div");
  orderCheckboxContainer.style.display = "flex";
  orderCheckboxContainer.style.alignItems = "center";
  orderCheckboxContainer.style.padding = "8px 12px";
  orderCheckboxContainer.style.borderTop = "1px solid #ddd";
  
  const orderCheckbox = document.createElement("input");
  orderCheckbox.type = "checkbox";
  orderCheckbox.id = "order-on-platform-" + currentIndex;
  orderCheckbox.style.marginRight = "8px";
  orderCheckbox.checked = tierOrderingStates[currentIndex] === true;
  orderCheckbox.onchange = () => {
    toggleTierOrdering(currentIndex, orderCheckbox.checked);
  };
  
  const orderLabel = document.createElement("label");
  orderLabel.htmlFor = orderCheckbox.id;
  orderLabel.textContent = "Order on platform";
  orderLabel.style.cursor = "pointer";
  orderLabel.style.userSelect = "none";
  orderLabel.style.color = "white";
  
  orderCheckboxContainer.appendChild(orderCheckbox);
  orderCheckboxContainer.appendChild(orderLabel);
  
  // Limit to 10 toggle
  const limitCheckboxContainer = document.createElement("div");
  limitCheckboxContainer.style.display = "flex";
  limitCheckboxContainer.style.alignItems = "center";
  limitCheckboxContainer.style.padding = "8px 12px";
  limitCheckboxContainer.style.borderTop = "1px solid #ddd";
  
  const limitCheckbox = document.createElement("input");
  limitCheckbox.type = "checkbox";
  limitCheckbox.id = "limit-to-10-" + currentIndex;
  limitCheckbox.style.marginRight = "8px";
  limitCheckbox.checked = tierLimitStates[currentIndex] === true;
  limitCheckbox.onchange = () => {
    toggleTierLimit(currentIndex, limitCheckbox.checked);
  };
  
  const limitLabel = document.createElement("label");
  limitLabel.htmlFor = limitCheckbox.id;
  limitLabel.textContent = "Limit to 10";
  limitLabel.style.cursor = "pointer";
  limitLabel.style.userSelect = "none";
  limitLabel.style.color = "white";
  
  limitCheckboxContainer.appendChild(limitCheckbox);
  limitCheckboxContainer.appendChild(limitLabel);
  
  menu.appendChild(addAboveBtn);
  menu.appendChild(addBelowBtn);
  menu.appendChild(orderCheckboxContainer);
  menu.appendChild(limitCheckboxContainer);
  menu.appendChild(deleteBtn);
  
  // Position menu near the cog icon
  const cogRect = element.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.right = (window.innerWidth - cogRect.right) + "px";
  
  document.body.appendChild(menu);
  
  // Check if menu would go off-screen, if so position it above
  const menuRect = menu.getBoundingClientRect();
  const menuHeight = menuRect.height;
  const spaceBelow = window.innerHeight - cogRect.bottom;
  
  if (spaceBelow < menuHeight + 10) {
    // Position above the cog icon
    menu.style.bottom = (window.innerHeight - cogRect.top) + "px";
    menu.style.top = "auto";
  } else {
    // Position below the cog icon
    menu.style.top = cogRect.bottom + "px";
    menu.style.bottom = "auto";
  }
  
  // Close menu when clicking outside
  const closeMenu = (e) => {
    if (!menu.contains(e.target) && e.target !== element) {
      menu.remove();
      document.removeEventListener("click", closeMenu);
    }
  };
  
  document.addEventListener("click", closeMenu);
}

function createNewRow() {
  const newRow = document.createElement("div");
  newRow.className = "row";

  const tierLabelDiv = document.createElement("div");
  tierLabelDiv.className = "tier-label";
  tierLabelDiv.style.backgroundColor = "lightslategray";
  tierLabelDiv.setAttribute("contenteditable", true);

  const paragraph = document.createElement("p");
  paragraph.textContent = "New tier";
  paragraph.setAttribute("spellcheck", false);

  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  tooltip.setAttribute("contenteditable", false);

  const colorPicker = document.createElement("div");
  colorPicker.className = "color-picker";

  const tierDiv = document.createElement("div");
  tierDiv.className = "tier sort";

  const optionsDiv = document.createElement("div");
  optionsDiv.className = "tier-options";

  const optionsContainer = document.createElement("div");
  optionsContainer.className = "options-container";

  const deleteButton = document.createElement("div");
  deleteButton.className = "option delete";

  const deleteImage = document.createElement("img");
  deleteImage.className = "option-hover";
  deleteImage.src = "assets/Cog.png";
  deleteImage.alt = "Menu";
  deleteImage.setAttribute("onclick", "openRowMenu(this, event)");

  const upButton = document.createElement("div");
  upButton.className = "option";

  const upImage = document.createElement("img");
  upImage.className = "option-hover";
  upImage.src = "assets/chevron-up.svg";
  upImage.alt = "Up";
  upImage.setAttribute("onclick", "moveRow(this, -1)");

  const downButton = document.createElement("div");
  downButton.className = "option";

  const downImage = document.createElement("img");
  downImage.className = "option-hover";
  downImage.src = "assets/chevron-down.svg";
  downImage.alt = "Down";
  downImage.setAttribute("onclick", "moveRow(this, 1)");

  tooltip.appendChild(colorPicker);

  createColorPicker(
    colorPicker,
    (hexColor) => {
      tooltip.parentNode.style.backgroundColor = hexColor;
    },
    (hexColor) => {
      tooltip.parentNode.style.backgroundColor = hexColor;
      saveTierColors();
    },
    "lightslategray"
  );

  tierLabelDiv.appendChild(paragraph);
  tierLabelDiv.appendChild(tooltip);

  deleteButton.appendChild(deleteImage);
  upButton.appendChild(upImage);
  downButton.appendChild(downImage);

  optionsContainer.appendChild(deleteButton);
  optionsContainer.appendChild(upButton);
  optionsContainer.appendChild(downButton);

  optionsDiv.appendChild(optionsContainer);

  newRow.appendChild(tierLabelDiv);
  newRow.appendChild(tierDiv);
  newRow.appendChild(optionsDiv);

  // Attach keydown listener to the newly created tier label
  attachTierLabelKeydownListener(tierLabelDiv);
  
  return newRow;
}

function deleteRow(element) {
  const row = element.closest(".row");
  const imagesBar = document.getElementById("images-bar");
  
  // Get all images from this tier and move them to uncategorized
  const tierContainer = row.children[1]; // The tier div is the second child
  const imagesInTier = Array.from(tierContainer.querySelectorAll(".image"));
  
  // Move each image to the images bar
  imagesInTier.forEach(img => {
    if (img && imagesBar) {
      imagesBar.appendChild(img);
    }
  });
  
  // Destroy any Pickr instances in this row
  const tooltips = row.querySelectorAll(".tooltip");
  tooltips.forEach(tooltip => {
    const colorPickerDiv = tooltip.querySelector(".color-picker");
    if (colorPickerDiv && colorPickerDiv._pickr) {
      colorPickerDiv._pickr.destroy();
      pickrInstances = pickrInstances.filter(p => p !== colorPickerDiv._pickr);
    }
  });
  
  row.remove();
  
  // Re-initialize dragula with updated containers
  initializeDragula();
  saveTierColors();
  saveImagePositions();
}

function moveRow(button, direction) {
  const row = button.closest(".row");
  const parent = row.parentNode;
  const rows = Array.from(parent.children).filter((child) => child.classList.contains("row"));
  const currentIndex = rows.indexOf(row);
  const newIndex = currentIndex + direction;

  if (newIndex < 0 || newIndex >= rows.length) {
    return;
  }

  const referenceRow = direction === 1 ? rows[newIndex].nextElementSibling : rows[newIndex];
  parent.insertBefore(row, referenceRow);
  initializeDragula();
  saveTierColors();
}

function selectImages() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,.avif";
  input.multiple = true;

  input.click();

  input.addEventListener("change", () => uploadImages(input.files));
}

function getCloudinaryFolder() {
  return CLOUDINARY_CONFIG.folder || null;
}

// Upload image to Cloudinary
async function uploadToCloudinary(file) {
  if (!CLOUDINARY_CONFIG.cloudName || CLOUDINARY_CONFIG.cloudName === "YOUR_CLOUD_NAME") {
    throw new Error("Cloudinary is not configured. Please set your Cloud Name and Upload Preset in the script.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
  const cloudinaryFolder = getCloudinaryFolder();
  if (cloudinaryFolder) {
    formData.append("folder", cloudinaryFolder);
  }

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to upload image to Cloudinary");
    }

    const data = await response.json();
    return data.secure_url; // Return the HTTPS URL
  } catch (err) {
    console.error("Cloudinary upload error:", err);
    throw err;
  }
}

// Delete image from Cloudinary
async function deleteFromCloudinary(cloudinaryUrl) {
  if (!CLOUDINARY_CONFIG.cloudName || CLOUDINARY_CONFIG.cloudName === "YOUR_CLOUD_NAME") {
    console.warn("Cloudinary is not configured. Skipping remote deletion.");
    return;
  }

  const publicId = extractCloudinaryPublicId(cloudinaryUrl);
  if (!publicId) {
    console.warn("Unable to derive Cloudinary public_id from URL. Skipping remote deletion.", cloudinaryUrl);
    return;
  }

  if (CLOUDINARY_CONFIG.apiKey && CLOUDINARY_CONFIG.apiSecret && CLOUDINARY_CONFIG.apiKey !== "YOUR_API_KEY" && CLOUDINARY_CONFIG.apiSecret !== "YOUR_API_SECRET") {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await sha1(`public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_CONFIG.apiSecret}`);
      const body = new URLSearchParams();
      body.append("api_key", CLOUDINARY_CONFIG.apiKey);
      body.append("timestamp", timestamp.toString());
      body.append("public_id", publicId);
      body.append("signature", signature);

      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/destroy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Cloudinary delete request failed ${response.status}: ${errorText}`);
        return;
      }

      const result = await response.json();
      if (result.result !== "ok" && result.result !== "not found") {
        console.warn("Cloudinary delete response returned unexpected result:", result);
        return;
      }

      console.log("Image deleted from Cloudinary:", cloudinaryUrl, publicId);
      return;
    } catch (err) {
      console.warn("Cloudinary delete request failed:", err);
      // Continue to fallback logic below if configured
    }
  }

  const endpoint = CLOUDINARY_CONFIG.deleteEndpoint;
  if (!endpoint) {
    console.warn("Cloudinary delete is not configured. Skipping remote deletion.");
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cloudinaryUrl }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Cloudinary delete endpoint returned ${response.status}: ${errorText}`);
      return;
    }

    console.log("Image deleted via Cloudinary endpoint:", cloudinaryUrl);
  } catch (err) {
    console.warn("Cloudinary delete endpoint request failed:", err);
  }
}

async function sha1(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function extractCloudinaryPublicId(cloudinaryUrl) {
  try {
    const url = new URL(cloudinaryUrl);
    const match = url.pathname.match(/\/(?:image|video|raw)\/upload\/(?:v\d+\/)?(.+)/);
    if (!match || !match[1]) return null;
    return decodeURIComponent(match[1].replace(/\.[^/.]+$/, ""));
  } catch (err) {
    return null;
  }
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

function initializeDragula() {
  const containers = Array.from(document.querySelectorAll(".sort"));

  if (drake) {
    drake.destroy();
  }
  
  if (containers.length === 0) {
    console.warn("No containers found for dragula");
    return;
  }
  
  drake = dragula(containers, {
    removeOnSpill: false,
    mirrorContainer: document.body,
    accepts: (el, target) => {
      // Allow dropping images into any tier
      return target && target.classList.contains('sort');
    }
  });
  
  drake
    .on("drag", (el, source) => {
      scrollable = false;
      if (!selectedImages.has(el)) {
        selectImage(el);
      }
      updateDragMirror();
    })
    .on("drop", (el, target, source, sibling) => {
      scrollable = true;
      moveSelectedImagesToTarget(el, target, sibling);
      
      // Check if the target tier has limit-to-10 enabled
      const targetRow = target.parentNode;
      if (targetRow && targetRow.classList.contains("row")) {
        const rows = document.querySelectorAll(".row");
        const tierIndex = Array.from(rows).indexOf(targetRow);
        
        // If this tier has limit enabled and has more than 10 images, move the last to the tier below
        if (tierLimitStates[tierIndex]) {
          const tierImages = target.querySelectorAll(".image");
          if (tierImages.length > 10 && tierIndex < rows.length - 1) {
            const lastImage = tierImages[tierImages.length - 1];
            const tierBelowIndex = tierIndex + 1;
            const tierBelow = rows[tierBelowIndex].children[1];
            tierBelow.insertBefore(lastImage, tierBelow.firstChild);
            console.log(`Moved last image from tier ${tierIndex} to tier ${tierBelowIndex} due to limit`);
          }
        }
        
        // If this tier has ordering enabled, re-sort it after the drop to maintain platform grouping
        if (tierOrderingStates[tierIndex]) {
          sortTierByPlatform(target).catch(err => console.warn("Failed to re-sort tier:", err));
        }
      }
      
      // Save positions and then refresh tier counts
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
    .on("cancel", (el) => {
      scrollable = true;
      clearImageSelection();
    })
    .on("over", (el, container) => {
      if (container.classList.contains('sort')) {
        container.style.backgroundColor = 'rgba(127, 255, 255, 0.1)';
      }
    })
    .on("out", (el, container) => {
      if (container.classList.contains('sort')) {
        container.style.backgroundColor = '';
      }
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

function openImageModal(imgElement) {
  currentImageElement = imgElement;
  const modal = document.getElementById("image-modal");
  const imageId = imgElement.dataset.imageId;
  
  // Show sync notification if not logged in
  const syncNotification = document.getElementById("sync-notification");
  if (syncNotification) {
    if (!currentUser || !firebaseDb) {
      syncNotification.classList.remove("hidden");
    } else {
      syncNotification.classList.add("hidden");
    }
  }
  
  getImageMetadataFromIndexedDB(imageId).then(imageMetadata => {
    document.getElementById("image-name").value = imageMetadata.name || "";
    document.getElementById("image-developer").value = imageMetadata.developer || "";
    document.getElementById("image-date").value = imageMetadata.date || "";
    document.getElementById("image-date-100").value = imageMetadata.date100 || "";
    document.getElementById("image-description").value = imageMetadata.description || "";
    document.getElementById("image-status").value = imageMetadata.status || "";
    currentHas100Replay = !!imageMetadata.has100Replay;
    
    // Update the date label based on status and show/hide replay fields
    updateDateLabel();
    updateReplayVisibility();
    
    // Load platform
    currentSelectedPlatform = imageMetadata.platform || null;
    document.getElementById("platform-search").value = "";
    document.getElementById("platform-dropdown-menu").classList.add("hidden");
    updatePlatformButton();
    renderPlatformOptions();

    // Set up auto-save listeners for metadata fields
    setupMetadataAutoSave(imageId);

    // Enable Escape key to close modal (same behavior as tapping the X)
    if (window.currentModalEscapeHandler) {
      document.removeEventListener("keydown", window.currentModalEscapeHandler);
    }
    window.currentModalEscapeHandler = (e) => {
      if (e.key === "Escape") {
        closeImageModal();
      }
    };
    document.addEventListener("keydown", window.currentModalEscapeHandler);

    modal.classList.remove("hidden");
  }).catch(err => {
    console.error('Failed to load image metadata:', err);
  });
}

// Set up auto-save event listeners for metadata fields
function setupMetadataAutoSave(imageId) {
  try {
    const descriptionField = document.getElementById("image-description");
    const dateField = document.getElementById("image-date");
    const statusField = document.getElementById("image-status");
    const nameField = document.getElementById("image-name");
    const developerField = document.getElementById("image-developer");

    if (!descriptionField || !dateField || !statusField || !nameField || !developerField) {
      console.error("One or more form fields not found in DOM");
      return;
    }

    // IMPORTANT: Save current values before cloning to preserve them
    const currentValues = {
      description: descriptionField.value,
      date: dateField.value,
      status: statusField.value,
      name: nameField.value,
      developer: developerField.value,
    };

    // Remove old listeners by cloning and replacing the elements (prevents duplicates)
    const newDescription = descriptionField.cloneNode(true);
    const newDate = dateField.cloneNode(true);
    const newStatus = statusField.cloneNode(true);
    const newName = nameField.cloneNode(true);
    const newDeveloper = developerField.cloneNode(true);

    descriptionField.parentNode.replaceChild(newDescription, descriptionField);
    dateField.parentNode.replaceChild(newDate, dateField);
    statusField.parentNode.replaceChild(newStatus, statusField);
    nameField.parentNode.replaceChild(newName, nameField);
    developerField.parentNode.replaceChild(newDeveloper, developerField);

    // Restore the values after cloning
    document.getElementById("image-description").value = currentValues.description;
    document.getElementById("image-date").value = currentValues.date;
    document.getElementById("image-status").value = currentValues.status;
    document.getElementById("image-name").value = currentValues.name;
    document.getElementById("image-developer").value = currentValues.developer;

    // Create a debounced auto-save handler
    const createDebouncedHandler = (currentImageId) => (e) => {
      // Clear existing timer for this image
      if (autoSaveTimers[currentImageId]) {
        clearTimeout(autoSaveTimers[currentImageId]);
      }
      
      // Set a new timer - save after 800ms of inactivity
      autoSaveTimers[currentImageId] = setTimeout(() => {
        autoSaveMetadata(currentImageId);
      }, 800);
    };

    // Attach debounced listeners to the form fields
    document.getElementById("image-description").addEventListener("input", createDebouncedHandler(imageId));
    document.getElementById("image-date").addEventListener("input", createDebouncedHandler(imageId));
    document.getElementById("image-name").addEventListener("input", createDebouncedHandler(imageId));
    document.getElementById("image-developer").addEventListener("input", createDebouncedHandler(imageId));
    document.getElementById("image-status").addEventListener("change", createDebouncedHandler(imageId));
    document.getElementById("image-date-100").addEventListener("input", createDebouncedHandler(imageId));
  } catch (err) {
    console.error("Error setting up metadata auto-save:", err);
  }
}

// Wrapper for status field change event
function autoSaveMetadataWrapper() {
  if (currentImageElement) {
    autoSaveMetadata(currentImageElement.dataset.imageId);
  }
}

// Auto-save metadata whenever fields change - with debouncing and optimization
function autoSaveMetadata(imageId) {
  if (!currentImageElement) {
    console.warn("autoSaveMetadata: currentImageElement is null");
    return;
  }
  
  if (currentImageElement.dataset.imageId !== imageId) {
    console.warn(`autoSaveMetadata: imageId mismatch. Expected ${imageId}, got ${currentImageElement.dataset.imageId}`);
    return;
  }

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

  console.log(`Auto-saving metadata for image ${imageId}:`, imageMetadata);

  // Save to IndexedDB immediately (fast local operation)
  saveImageMetadataToIndexedDB(imageId, imageMetadata)
    .then(() => {
      console.log(`Metadata saved to IndexedDB for image ${imageId}`);
      
      // Show syncing status if user is logged in
      if (currentUser && firebaseDb) {
        showSyncStatus("syncing", "Syncing...");
        
        // Debounce Firebase sync - wait 1.5 seconds after user stops typing before syncing
        // But force sync after 5 seconds of continuous changes (user may have forgotten tab is open)
        const nowMs = Date.now();
        const lastSyncMs = lastFirebaseSyncTime[imageId] || 0;
        const timeSinceLastSync = nowMs - lastSyncMs;
        
        // Clear existing timer for this image
        if (autoSaveTimers[imageId]) {
          clearTimeout(autoSaveTimers[imageId]);
        }
        
        // If we've gone more than 5 seconds since last sync, sync immediately
        if (timeSinceLastSync > 5000) {
          console.log(`Forcing Firebase sync after ${timeSinceLastSync}ms since last sync`);
          lastFirebaseSyncTime[imageId] = nowMs;
          saveTierListToFirebase()
            .then(() => {
              console.log(`Firebase sync completed for image ${imageId}`);
              showSyncStatus("synced", "Synced âœ“");
              setTimeout(() => hideSyncStatus(), 2000);
            })
            .catch(err => {
              console.error('Failed to sync to Firebase:', err);
              showSyncStatus("error", "Sync failed!");
              setTimeout(() => hideSyncStatus(), 3000);
            });
        } else {
          // Otherwise, set a debounce timer for 1.5 seconds
          autoSaveTimers[imageId] = setTimeout(() => {
            console.log(`Syncing to Firebase for image ${imageId} after debounce`);
            lastFirebaseSyncTime[imageId] = Date.now();
            saveTierListToFirebase()
              .then(() => {
                console.log(`Firebase sync completed for image ${imageId}`);
                showSyncStatus("synced", "Synced âœ“");
                setTimeout(() => hideSyncStatus(), 2000);
              })
              .catch(err => {
                console.error('Failed to sync to Firebase:', err);
                showSyncStatus("error", "Sync failed!");
                setTimeout(() => hideSyncStatus(), 3000);
              });
          }, 1500);
        }
      }
    })
    .catch(err => {
      console.error('Failed to auto-save metadata to IndexedDB:', err);
    });
}

// Show sync status indicator
function showSyncStatus(status, message) {
  const syncStatusDiv = document.getElementById("sync-status");
  const syncStatusText = document.getElementById("sync-status-text");
  
  if (syncStatusDiv) {
    syncStatusDiv.style.display = "flex";
    syncStatusDiv.className = "sync-status " + status;
    syncStatusText.textContent = message;
  }
}

// Hide sync status indicator
function hideSyncStatus() {
  const syncStatusDiv = document.getElementById("sync-status");
  if (syncStatusDiv) {
    syncStatusDiv.style.display = "none";
    syncStatusDiv.className = "sync-status";
  }
}

function updateDateLabel() {
  const statusSelect = document.getElementById("image-status");
  const dateLabel = document.getElementById("image-date-label");
  const status = statusSelect.value;

  if (status === "dropped") {
    dateLabel.textContent = "Date Dropped:";
  } else if (status === "Played") {
    dateLabel.textContent = "Date Last Played:";
  } else if (status === "") {
    dateLabel.textContent = "Date Beaten:";
  } else {
    dateLabel.textContent = "Date Beaten:";
  }

  updateReplayVisibility();
}

function toggleReplayFlag() {
  currentHas100Replay = !currentHas100Replay;
  updateReplayVisibility();
  autoSaveMetadataWrapper();
}

function updateReplayVisibility() {
  const statusSelect = document.getElementById("image-status");
  const replayGroup = document.getElementById("replay-toggle-group");
  const replayButton = document.getElementById("replay-toggle-btn");
  const date100Group = document.getElementById("image-date-100-group");

  if (!statusSelect || !replayGroup || !replayButton || !date100Group) return;

  const is100Percent = statusSelect.value === "100% complete";

  if (is100Percent) {
    replayGroup.classList.remove("hidden");
    replayButton.classList.toggle("green", currentHas100Replay);
    replayButton.classList.toggle("red", !currentHas100Replay);
    date100Group.classList.toggle("hidden", !currentHas100Replay);
  } else {
    replayGroup.classList.add("hidden");
    date100Group.classList.add("hidden");
    currentHas100Replay = false;
  }
}

function closeImageModal() {
  const modal = document.getElementById("image-modal");
  
  if (!currentImageElement) {
    console.warn("closeImageModal: currentImageElement is null");
    modal.classList.add("hidden");
    return;
  }
  
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

  console.log(`Closing modal for image ${imageId}, saving metadata:`, imageMetadata);

  // Clear any pending auto-save timers
  if (autoSaveTimers[imageId]) {
    clearTimeout(autoSaveTimers[imageId]);
    delete autoSaveTimers[imageId];
  }
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;
  }

  // Save metadata one final time on close (ensure all data is persisted)
  saveImageMetadataToIndexedDB(imageId, imageMetadata)
    .then(async () => {
      console.log(`Metadata saved to IndexedDB on modal close for image ${imageId}`);
      await sortCurrentImageTierIfOrdered(currentImageElement);

      // Sync metadata to Firebase if user is logged in
      if (currentUser && firebaseDb) {
        return saveTierListToFirebase();
      }
    })
    .then(() => {
      console.log(`Firebase sync completed on modal close for image ${imageId}`);
      // Re-run current search/filter so commands like /NoDescription, /NoDate, etc. update
      const searchInput = document.getElementById('search-input');
      const currentQuery = searchInput ? searchInput.value : '';
      try {
        filterImages(currentQuery);
      } catch (e) {
        console.error('Failed to refresh filters after saving metadata:', e);
      }
    })
    .catch(err => {
      console.error('Failed to save image metadata on modal close:', err);
    })
    .finally(() => {
      // Remove Escape key handler if it exists
      if (window.currentModalEscapeHandler) {
        document.removeEventListener("keydown", window.currentModalEscapeHandler);
        window.currentModalEscapeHandler = null;
      }

      modal.classList.add("hidden");
      currentImageElement = null;
      currentSelectedPlatform = null;
    });
}

async function sortCurrentImageTierIfOrdered(imageElement) {
  if (!imageElement) return;
  const row = imageElement.closest('.row');
  if (!row) return;

  const rows = Array.from(document.querySelectorAll('.row'));
  const tierIndex = rows.indexOf(row);
  if (tierIndex < 0) return;
  if (!tierOrderingStates[tierIndex]) return;

  try {
    await sortTierByPlatform(row.children[1]);
    console.log(`Sorted tier ${tierIndex} after saving platform metadata.`);
  } catch (err) {
    console.warn(`Failed to sort tier ${tierIndex} after saving platform metadata:`, err);
  }
}

function deleteImageFromModal() {
  if (currentImageElement) {
    const confirmDelete = confirm("Are you sure you want to delete this image? This will also remove it from Cloudinary.");
    if (confirmDelete) {
      const imageId = currentImageElement.dataset.imageId;
      const cloudinaryUrl = currentImageElement.dataset.cloudinaryUrl || currentImageElement.src;
      
      // Delete metadata from IndexedDB
      deleteImageMetadataFromIndexedDB(imageId);
      
      // Delete from Cloudinary first
      deleteFromCloudinary(cloudinaryUrl).then(() => {
        // Then delete image from IndexedDB
        return deleteImageFromIndexedDB(imageId);
      })
        .then(() => {
          currentImageElement.remove();
          closeImageModal();
          saveImagePositions();
          
          // Sync deletion to Firebase if user is logged in
          if (currentUser && firebaseDb) {
            saveTierListToFirebase().catch(err => {
              console.error('Failed to sync deletion to Firebase:', err);
            });
          }
        })
        .catch(err => {
          console.error('Failed to delete image:', err);
          alert('Failed to delete image. Please try again.');
        });
    }
  }
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
    btn.textContent = currentSelectedPlatform + " â–¼";
  } else {
    btn.textContent = "Select Platform â–¼";
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

