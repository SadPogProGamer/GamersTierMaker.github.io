// DatabaseSyncing.js
// Contains Firebase sync, Cloudinary upload/delete logic, and IndexedDB persistence helpers.

let indexedDb; // IndexedDB database

// IndexedDB globals
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

// Save image to IndexedDB
function saveImageToIndexedDB(imageData) {
  return new Promise((resolve, reject) => {
    const transaction = indexedDb.transaction(['images'], 'readwrite');
    const store = transaction.objectStore('images');
    // Use put to upsert — prevents duplicate records when an id already exists
    const request = store.put(imageData);

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
  return new Promise((resolve, reject) => {
    if (!indexedDb) {
      const err = new Error('indexedDb not available');
      reject(err);
      return;
    }
    const transaction = indexedDb.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');
    const request = store.put({ key, value });

    request.onerror = (e) => {
      reject(request.error || e);
    };
    request.onsuccess = () => {
      resolve();
    };
    transaction.oncomplete = () => {
    };
    transaction.onerror = (e) => {
    };
  });
}

// Get setting from IndexedDB
function getSetting(key) {
  return new Promise((resolve, reject) => {
    if (!indexedDb) {
      resolve(null);
      return;
    }
    const transaction = indexedDb.transaction(['settings'], 'readonly');
    const store = transaction.objectStore('settings');
    const request = store.get(key);

    request.onerror = (e) => {
      reject(request.error || e);
    };
    request.onsuccess = () => {
      resolve(request.result ? request.result.value : null);
    };
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

// Deprecated metadata wrappers kept for compatibility
function getImageMetadata(imageId) {
  // This function is kept for backward compatibility but uses IndexedDB asynchronously
  // For synchronous metadata access, use getImageMetadataFromIndexedDB instead
  return { name: "", developer: "", date: "", date100: "", description: "", status: "", platform: null, genres: [], has100Replay: false };
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

// Firebase globals
let firebaseApp;
let firebaseAuth;
let firebaseDb;
let currentUser = null;
let firebaseAvailable = true;

let autoSaveTimeout = null; // Debounce timer for Firebase sync
let autoSaveTimers = {}; // Track separate timers per image for faster saves
let lastFirebaseSyncTime = {}; // Track last sync time per image to force periodic syncs
let lastRemoteSyncTime = null; // Track last time we synced FROM Firebase
let syncPollInterval = null; // IntervalID for polling remote Firebase for updates

async function initializeFirebase() {
  if (!FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey === "YOUR_API_KEY") {
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
        await loadTierListFromFirebase().catch(err => {
        });

        if (initializationComplete) {
          startSyncPolling();
        }
      } else {
        stopSyncPolling();
      }
    });

    return true;
  } catch (err) {
    firebaseAvailable = false;
    return null;
  }
}

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
    const customAvatarUrl = "assets/aerith.jpg";
    profileAvatar.src = customAvatarUrl;

    userName.textContent = userMeta.full_name || userMeta.name || rawMeta.full_name || rawMeta.name || currentUser.email || "Signed in";
    userName.style.display = "block";
  } else {
    loginBtn.style.display = "block";
    profileDropdown.classList.add("hidden");
    userName.style.display = "none";
  }
}

function toggleProfileDropdown() {
  const profileMenu = document.getElementById("profile-menu");
  profileMenu.classList.toggle("hidden");

  document.addEventListener("click", function closeMenu(e) {
    const profileDropdown = document.getElementById("profile-dropdown");
    if (!profileDropdown.contains(e.target)) {
      profileMenu.classList.add("hidden");
      document.removeEventListener("click", closeMenu);
    }
  });
}

function openProfileScreen() {
  try {
    window.location.href = 'my-tierlists.html';
  } catch (e) {
  }
}

function closeProfileScreen() {
  const screen = document.getElementById('profile-screen');
  if (screen) screen.classList.add('hidden');
}

async function signInWithGoogle() {
  try {
    if (!firebaseAuth) {
      throw new Error("Firebase auth is not initialized.");
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    await firebaseAuth.signInWithPopup(provider);
  } catch (err) {
    alert("Failed to sign in. Make sure Firebase is configured and Google auth is enabled.");
  }
}

async function signOut() {
  try {
    stopSyncPolling();
    if (!firebaseAuth) {
      throw new Error("Firebase auth is not initialized.");
    }
    await firebaseAuth.signOut();
  } catch (err) {
  }
}

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

    const allImages = await getImagesFromIndexedDB();
    const metadataMap = {};

    for (const image of allImages) {
      try {
        const metadata = await getImageMetadataFromIndexedDB(image.id);
        if (metadata) {
          metadataMap[image.id] = metadata;
        }
      } catch (err) {
      }
    }

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
      userId: currentUser.uid,
      userEmail: currentUser.email || null,
      tier_data: tierListData,
      updated_at: new Date().toISOString()
    }, { merge: true });

  } catch (err) {
    if (err && err.code === 'permission-denied') {
      firebaseAvailable = false;
      stopSyncPolling();
      alert('Firebase save failed because Firestore permissions are insufficient. Saving locally instead.');
    }
    throw err;
  }
}

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
    return response.status < 500;
  } catch (err) {
    return false;
  }
}

async function cleanupBrokenImages() {
  const brokenImageIds = [];
  const allImageElements = document.querySelectorAll('.image');

  for (const img of allImageElements) {
    const imageId = img.dataset.imageId;
    const url = img.dataset.imageSrc || img.src;

    if (url && url.startsWith('http')) {
      const isValid = await validateImageUrl(url);
      if (!isValid) {
        img.remove();
        brokenImageIds.push(imageId);
      }
    }
  }

  for (const imageId of brokenImageIds) {
    await deleteImageFromIndexedDB(imageId).catch(err => {
    });
  }

  return brokenImageIds;
}

async function loadTierListFromFirebase() {
  if (!currentUser || !firebaseDb || !firebaseAvailable) return;

  try {
    const doc = await firebaseDb.collection("tierLists").doc(currentUser.uid).get();
    if (!doc.exists) {
      loadTierListFromLocalStorage();
      return;
    }

    const data = doc.data();
    if (!data || !data.tier_data) {
      loadTierListFromLocalStorage();
      return;
    }

    await loadTierListFromObject(data.tier_data);
    lastRemoteSyncTime = new Date(data.updated_at || new Date()).getTime();
  } catch (err) {
    if (err && err.code === 'permission-denied') {
      firebaseAvailable = false;
      stopSyncPolling();
      alert('Firebase access denied. Your tierlist will load locally until Firestore permissions are fixed.');
    }
    loadTierListFromLocalStorage();
  }
}

async function pollFirebaseForUpdates() {
  if (!currentUser || !firebaseDb || !firebaseAvailable) return;

  try {
    const doc = await firebaseDb.collection("tierLists").doc(currentUser.uid).get();
    if (!doc.exists) return;

    const data = doc.data();
    if (!data || !data.tier_data) return;

    const remoteUpdatedAt = new Date(data.updated_at).getTime();
    if (lastRemoteSyncTime === null || remoteUpdatedAt > lastRemoteSyncTime) {
      await loadTierListFromObject(data.tier_data);
      lastRemoteSyncTime = remoteUpdatedAt;
    }
  } catch (err) {
    if (err && err.code === 'permission-denied') {
      firebaseAvailable = false;
      stopSyncPolling();
      alert('Firebase sync disabled because Firestore permissions are insufficient.');
    }
  }
}

function startSyncPolling() {
  if (syncPollInterval) return;
  if (!currentUser || !firebaseDb || !firebaseAvailable) return;

  syncPollInterval = setInterval(pollFirebaseForUpdates, 10000);
}

function stopSyncPolling() {
  if (syncPollInterval) {
    clearInterval(syncPollInterval);
    syncPollInterval = null;
  }
}

function getCloudinaryFolder() {
  return CLOUDINARY_CONFIG.folder || null;
}

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
    return data.secure_url;
  } catch (err) {
    throw err;
  }
}

async function deleteFromCloudinary(cloudinaryUrl) {
  if (!CLOUDINARY_CONFIG.cloudName || CLOUDINARY_CONFIG.cloudName === "YOUR_CLOUD_NAME") {
    return;
  }

  const publicId = extractCloudinaryPublicId(cloudinaryUrl);
  if (!publicId) {
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
        return;
      }

      const result = await response.json();
      if (result.result !== "ok" && result.result !== "not found") {
        return;
      }

      return;
    } catch (err) {
    }
  }

  const endpoint = CLOUDINARY_CONFIG.deleteEndpoint;
  if (!endpoint) {
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
      return;
    }

  } catch (err) {
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
