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

        if (initializationComplete) {
          startSyncPolling();
        }
      } else {
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
    console.error('Failed to navigate to My Tierlists page', e);
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
    console.error("Sign in error:", err);
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
    console.error("Sign out error:", err);
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
        console.warn(`Failed to get metadata for image ${image.id}:`, err);
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

    console.log("Tier list saved to Firebase");
  } catch (err) {
    console.error("Failed to save tier list to Firebase:", err);
    if (err && err.code === 'permission-denied') {
      console.warn("Firebase save permission denied. Check Firestore rules and auth configuration.");
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
    console.warn(`Image URL validation failed for ${url}:`, err.message);
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
        console.warn(`Removing broken image: ${imageId} (${url})`);
        img.remove();
        brokenImageIds.push(imageId);
      }
    }
  }

  for (const imageId of brokenImageIds) {
    await deleteImageFromIndexedDB(imageId).catch(err => {
      console.warn(`Could not delete image ${imageId} from IndexedDB:`, err);
    });
  }

  return brokenImageIds;
}

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
    console.log("✓ Tier list loaded from Firebase");
  } catch (err) {
    console.error("Failed to load tier list from Firebase:", err);
    if (err && err.code === 'permission-denied') {
      console.warn("Firebase permission denied. Check your Firestore rules and authenticated user.");
      firebaseAvailable = false;
      stopSyncPolling();
      alert('Firebase access denied. Your tierlist will load locally until Firestore permissions are fixed.');
    }
    console.log("Falling back to local storage...");
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
      console.log("🔥 Remote updates detected - syncing tier list...");
      await loadTierListFromObject(data.tier_data);
      lastRemoteSyncTime = remoteUpdatedAt;
      console.log("✓ Synced with remote tier list");
    }
  } catch (err) {
    console.warn("Error polling Firebase for updates:", err);
    if (err && err.code === 'permission-denied') {
      console.warn("Firebase permission denied during polling. Disabling Firebase sync.");
      firebaseAvailable = false;
      stopSyncPolling();
      alert('Firebase sync disabled because Firestore permissions are insufficient.');
    }
  }
}

function startSyncPolling() {
  if (syncPollInterval) return;
  if (!currentUser || !firebaseDb || !firebaseAvailable) return;

  console.log("🔄 Starting real-time sync polling (10 second interval)");
  syncPollInterval = setInterval(pollFirebaseForUpdates, 10000);
}

function stopSyncPolling() {
  if (syncPollInterval) {
    clearInterval(syncPollInterval);
    syncPollInterval = null;
    console.log("⛔ Stopped sync polling");
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
    console.error("Cloudinary upload error:", err);
    throw err;
  }
}

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
