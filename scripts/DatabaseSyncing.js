// DatabaseSyncing.js
// Manages IndexedDB, Firebase sync, and Cloudinary helpers.
// UPDATED: Added gameType and originalGame to metadata
// Firebase saves only happen when manually triggered.

let indexedDb = null;

// Firebase globals
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let currentUser = null;
let firebaseAvailable = true;

let lastRemoteSyncTime = null;
let syncUnsubscribe = null;
let isApplyingRemoteUpdate = false;
let pendingRemoteTierData = null;
let pendingRemoteUpdatedAt = null;

const DB_NAME = "TierListDB";
const DB_VERSION = 2;
const STORE_IMAGES = "images";
const STORE_SETTINGS = "settings";
const STORE_IMAGE_METADATA = "imageMetadata";
const FIREBASE_COLLECTION = isLocalhost ? "DebugRoom" : "tierLists";
const IMAGE_VALIDATE_TIMEOUT_MS = 8000;

// ---- MULTI TIER LIST SUPPORT ----
// Each tier list has its own id. Signed-in users store a map of lists inside
// one Firestore doc (lists.<id>); guests store the same shape in localStorage.
const LOCAL_LISTS_KEY = "savedTierLists"; // localStorage: { [id]: tierListData }
const LEGACY_LOCAL_LIST_KEY = "savedTierList"; // old single-list format, migrated on first read
const CURRENT_LIST_ID_KEY = "currentTierListId"; // localStorage: last-used list id

function generateTierListId() {
  return `list_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getCurrentTierListId() {
  return window.__currentTierListId || null;
}

function setCurrentTierListId(id) {
  window.__currentTierListId = id || null;
  if (!id) return;

  try {
    localStorage.setItem(CURRENT_LIST_ID_KEY, id);
  } catch (err) {
    logDbSyncError("Failed persisting current tier list id.", err);
  }
}

function sortTierListsByRecency(list) {
  return list.slice().sort((a, b) => {
    const aTime = new Date((a && (a.lastUpdated || a.createdAt)) || 0).getTime();
    const bTime = new Date((b && (b.lastUpdated || b.createdAt)) || 0).getTime();
    return bTime - aTime;
  });
}

function readLocalTierListsMap() {
  try {
    const raw = localStorage.getItem(LOCAL_LISTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (err) {
    logDbSyncError("Failed reading local tier lists map.", err);
  }

  // Migrate the old single-tierlist format into the new map, once.
  try {
    const legacyRaw = localStorage.getItem(LEGACY_LOCAL_LIST_KEY);
    if (legacyRaw) {
      const legacyData = JSON.parse(legacyRaw);
      if (legacyData) {
        const id = generateTierListId();
        const migrated = {
          [id]: {
            ...legacyData,
            id,
            createdAt: legacyData.createdAt || legacyData.lastUpdated || new Date().toISOString(),
          },
        };
        localStorage.setItem(LOCAL_LISTS_KEY, JSON.stringify(migrated));
        localStorage.removeItem(LEGACY_LOCAL_LIST_KEY);
        return migrated;
      }
    }
  } catch (err) {
    logDbSyncError("Failed migrating legacy local tier list.", err);
  }

  return {};
}

function writeLocalTierListsMap(map) {
  try {
    localStorage.setItem(LOCAL_LISTS_KEY, JSON.stringify(map || {}));
  } catch (err) {
    logDbSyncError("Failed writing local tier lists map.", err);
  }
}

function getAllLocalTierLists() {
  const map = readLocalTierListsMap();
  return sortTierListsByRecency(Object.values(map));
}

function getLocalTierListById(id) {
  if (!id) return null;
  const map = readLocalTierListsMap();
  return map[id] || null;
}

function saveLocalTierList(id, data) {
  if (!id || !data) return null;

  const map = readLocalTierListsMap();
  const existing = map[id] || null;

  const record = {
    ...data,
    id,
    createdAt: (existing && existing.createdAt) || data.createdAt || new Date().toISOString(),
  };

  map[id] = record;
  writeLocalTierListsMap(map);
  setCurrentTierListId(id);

  return record;
}

function deleteLocalTierList(id) {
  if (!id) return;

  const map = readLocalTierListsMap();
  if (map[id]) {
    delete map[id];
    writeLocalTierListsMap(map);
  }
}

function logDbSyncError(context, err) {
  console.error(`[DatabaseSyncing] ${context}`, err);
}

function hasIndexedDb() {
  return !!window.indexedDB;
}

function getDefaultImageMetadata() {
  return {
    name: "",
    developer: "",
    date: "",
    date100: "",
    description: "",
    status: "",
    platform: null,
    originalPlatform: null,
    genres: [],
    has100Replay: false,
    gameType: "Original Game",
    originalGame: "",
  };
}

function normalizeImageMetadata(record) {
  if (!record) return getDefaultImageMetadata();

  const genres = Array.isArray(record.genres)
    ? record.genres.slice()
    : record.genre
      ? [record.genre]
      : [];

  return {
    name: record.name || "",
    developer: record.developer || "",
    date: record.date || "",
    date100: record.date100 || record.date_100 || "",
    description: record.description || "",
    status: record.status || "",
    platform: record.platform || null,
    originalPlatform: record.originalPlatform || null,
    genres,
    has100Replay: !!record.has100Replay || !!record.has100,
    gameType: record.gameType || "Original Game",
    originalGame: record.originalGame || "",
  };
}

function ensureIndexedDbReady() {
  if (!indexedDb) {
    throw new Error("IndexedDB is not initialized.");
  }
}

function runStoreRequest(storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    try {
      ensureIndexedDbReady();
      const transaction = indexedDb.transaction([storeName], mode);
      const store = transaction.objectStore(storeName);
      const request = operation(store);

      request.onerror = () => reject(request.error || new Error(`IndexedDB request failed for ${storeName}`));
      request.onsuccess = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error || new Error(`IndexedDB transaction failed for ${storeName}`));
    } catch (err) {
      reject(err);
    }
  });
}

function safeElementTextContent(element, fallback = "") {
  return element ? element.textContent || fallback : fallback;
}

function getImagesBarElement() {
  return document.querySelector("#images-bar");
}

function getTierRows() {
  return Array.from(document.querySelectorAll(".row"));
}

function getMainTitleText() {
  const title = document.getElementById("main-title");
  return title ? title.textContent || "Untitled Tierlist" : "Untitled Tierlist";
}

function getTierOrderingStateSnapshot() {
  return typeof tierOrderingStates === "object" && tierOrderingStates ? { ...tierOrderingStates } : {};
}

function getTierLimitStateSnapshot() {
  return typeof tierLimitStates === "object" && tierLimitStates ? { ...tierLimitStates } : {};
}

function isTierListEditorPage() {
  return !!document.getElementById("main-title");
}

async function buildTierListDataForSync() {
  const tierListData = {
    id: getCurrentTierListId(),
    header: getMainTitleText(),
    tiers: [],
    imagePositions: [],
    gameMetadata: {},
    tierOrderingStates: getTierOrderingStateSnapshot(),
    tierLimitStates: getTierLimitStateSnapshot(),
    lastUpdated: new Date().toISOString(),
  };

  let storedImages = [];
  try {
    storedImages = indexedDb ? await getImagesFromIndexedDB() : [];
  } catch (err) {
    logDbSyncError("Failed to read stored images while building sync payload.", err);
  }

  const metadataMap = {};
  for (const image of storedImages) {
    try {
      const metadata = await getImageMetadataFromIndexedDB(image.id);
      if (metadata) {
        metadataMap[image.id] = metadata;
      }
    } catch (err) {
      logDbSyncError(`Failed to load metadata for image ${image?.id}.`, err);
    }
  }

  const rows = getTierRows();
  rows.forEach((row, tierIndex) => {
    const tierLabel = row.querySelector(".tier-label");
    const tierNameElement = tierLabel ? tierLabel.querySelector("p") : null;
    const tierContainer = row.children && row.children[1] ? row.children[1] : null;
    const tierImages = tierContainer ? Array.from(tierContainer.querySelectorAll(".image")) : [];

    tierListData.tiers.push({
      index: tierIndex,
      name: safeElementTextContent(tierNameElement, `Tier ${tierIndex + 1}`),
      color: tierLabel ? tierLabel.style.backgroundColor || "lightslategray" : "lightslategray",
    });

    tierImages.forEach((img, order) => {
      const imageId = img.dataset.imageId;
      const imageSrc = img.dataset.imageSrc || img.dataset.cloudinaryUrl || img.src || "";
      const details = metadataMap[imageId] || null;

      tierListData.imagePositions.push({
        imageId,
        imageSrc,
        tier: tierIndex,
        order,
        details,
      });

      if (details) {
        tierListData.gameMetadata[imageId] = details;
      }
    });
  });

  const imagesBar = getImagesBarElement();
  const barImages = imagesBar ? Array.from(imagesBar.querySelectorAll(".image")) : [];
  barImages.forEach((img, order) => {
    const imageId = img.dataset.imageId;
    const imageSrc = img.dataset.imageSrc || img.dataset.cloudinaryUrl || img.src || "";
    const details = metadataMap[imageId] || null;

    tierListData.imagePositions.push({
      imageId,
      imageSrc,
      tier: -1,
      order,
      details,
    });

    if (details) {
      tierListData.gameMetadata[imageId] = details;
    }
  });

  return tierListData;
}

function createImageElementFromStoredData(imageObj) {
  const image = document.createElement("img");
  image.src = imageObj.src;
  image.className = "image";
  image.dataset.imageSrc = imageObj.src || "";
  image.dataset.imageId = imageObj.id;
  image.dataset.cloudinaryUrl = imageObj.cloudinaryUrl || imageObj.src || "";

  image.addEventListener("click", () => openImageModal(image));

  if (typeof setupImageSelection === "function") {
    try {
      setupImageSelection(image);
    } catch (err) {
      logDbSyncError("setupImageSelection failed while rebuilding image element.", err);
    }
  }

  image.addEventListener("error", () => {
    image.remove();
    deleteImageFromIndexedDB(imageObj.id).catch((err) => {
      logDbSyncError(`Failed to remove broken image ${imageObj.id} from IndexedDB.`, err);
    });
  }, { once: true });

  return image;
}

function initializeIndexedDB() {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      const err = new Error("This browser does not support IndexedDB.");
      logDbSyncError("IndexedDB unavailable.", err);
      reject(err);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error || new Error("Failed to open IndexedDB."));
    };

    request.onsuccess = () => {
      indexedDb = request.result;
      resolve(indexedDb);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORE_IMAGES)) {
        database.createObjectStore(STORE_IMAGES, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(STORE_SETTINGS)) {
        database.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
      }

      if (!database.objectStoreNames.contains(STORE_IMAGE_METADATA)) {
        database.createObjectStore(STORE_IMAGE_METADATA, { keyPath: "id" });
      }
    };
  });
}

function saveImageToIndexedDB(imageData) {
  return runStoreRequest(STORE_IMAGES, "readwrite", (store) => {
    const normalized = {
      id: imageData.id,
      src: imageData.src,
      cloudinaryUrl: imageData.cloudinaryUrl || imageData.src || "",
      tier: typeof imageData.tier === "number" ? imageData.tier : -1,
      order: typeof imageData.order === "number" ? imageData.order : 0,
    };
    return store.put(normalized);
  });
}

function getImagesFromIndexedDB() {
  return runStoreRequest(STORE_IMAGES, "readonly", (store) => store.getAll());
}

function deleteImageFromIndexedDB(id) {
  return runStoreRequest(STORE_IMAGES, "readwrite", (store) => store.delete(id)).then(() => undefined);
}

function clearImagesFromIndexedDB() {
  return runStoreRequest(STORE_IMAGES, "readwrite", (store) => store.clear()).then(() => undefined);
}

function saveSetting(key, value) {
  return runStoreRequest(STORE_SETTINGS, "readwrite", (store) => store.put({ key, value })).then(() => undefined);
}

function getSetting(key) {
  if (!indexedDb) return Promise.resolve(null);
  return runStoreRequest(STORE_SETTINGS, "readonly", (store) => store.get(key)).then((result) => {
    return result ? result.value : null;
  });
}

function saveImageMetadataToIndexedDB(id, metadata) {
  const normalized = normalizeImageMetadata(metadata);
  return runStoreRequest(STORE_IMAGE_METADATA, "readwrite", (store) => {
    return store.put({ id, ...normalized });
  }).then(() => undefined);
}

function getImageMetadataFromIndexedDB(id) {
  return runStoreRequest(STORE_IMAGE_METADATA, "readonly", (store) => store.get(id)).then((result) => {
    return normalizeImageMetadata(result);
  });
}

function getAllImageMetadataFromIndexedDB() {
  return runStoreRequest(STORE_IMAGE_METADATA, "readonly", (store) => store.getAll());
}

function deleteImageMetadataFromIndexedDB(id) {
  return runStoreRequest(STORE_IMAGE_METADATA, "readwrite", (store) => store.delete(id)).then(() => undefined);
}

async function saveImagePositions() {
  if (!indexedDb) return;

  const imagePositions = [];
  const rows = getTierRows();
  const imagesBar = getImagesBarElement();

  rows.forEach((row, tierIndex) => {
    const tierContainer = row.children && row.children[1] ? row.children[1] : null;
    const tierImages = tierContainer ? Array.from(tierContainer.querySelectorAll(".image")) : [];

    tierImages.forEach((img, order) => {
      imagePositions.push({
        id: img.dataset.imageId,
        tier: tierIndex,
        order,
      });
    });
  });

  if (imagesBar) {
    Array.from(imagesBar.querySelectorAll(".image")).forEach((img, order) => {
      imagePositions.push({
        id: img.dataset.imageId,
        tier: -1,
        order,
      });
    });
  }

  const positionMap = new Map(imagePositions.map((item) => [item.id, item]));
  const images = await getImagesFromIndexedDB();

  await Promise.all(images.map((image) => {
    const position = positionMap.get(image.id);
    if (!position) return Promise.resolve();

    return saveImageToIndexedDB({
      ...image,
      tier: position.tier,
      order: position.order,
    });
  }));
}

async function loadTierListFromLocalStorage() {
  if (!isTierListEditorPage()) return;
  if (window.__isNewTierList) return;

  const id = getCurrentTierListId();

  if (id) {
    const listData = getLocalTierListById(id);
    if (listData) {
      await loadTierListFromObject(listData);
      return;
    }
  } else {
    const allLists = getAllLocalTierLists();
    if (allLists.length) {
      const mostRecent = allLists[0];
      setCurrentTierListId(mostRecent.id);
      await loadTierListFromObject(mostRecent);
      return;
    }
  }

  // Nothing saved under the multi-list format yet (very first run) — fall
  // back to whatever legacy IndexedDB cache may still be present.
  await loadImagesFromStorage();

  const displayedImages = document.querySelectorAll(".image");
  if (displayedImages.length > 0) return;

  try {
    const data = await getSetting("localTierList");
    if (data) {
      await loadTierListFromObject(data);
      return;
    }
  } catch (err) {
    logDbSyncError("Failed loading local tier list from IndexedDB settings.", err);
  }
}

function loadImagesFromStorage() {
  const imagesBar = getImagesBarElement();
  const rows = getTierRows();

  if (!indexedDb) return Promise.resolve();

  return getImagesFromIndexedDB()
    .then((storedImages) => {
      const displayedImageIds = new Set(
        Array.from(document.querySelectorAll(".image")).map((img) => img.dataset.imageId)
      );

      storedImages.sort((a, b) => {
        const tierA = a.tier === -1 ? Number.MAX_SAFE_INTEGER : a.tier;
        const tierB = b.tier === -1 ? Number.MAX_SAFE_INTEGER : b.tier;
        if (tierA !== tierB) return tierA - tierB;
        return (a.order || 0) - (b.order || 0);
      });

      for (const imageObj of storedImages) {
        if (!imageObj?.id || !imageObj?.src) continue;
        if (displayedImageIds.has(imageObj.id)) continue;

        const image = createImageElementFromStoredData(imageObj);

        if (imageObj.tier === -1 || !rows[imageObj.tier]) {
          if (imagesBar) imagesBar.appendChild(image);
        } else {
          rows[imageObj.tier].children[1].appendChild(image);
        }
      }
    })
    .then(() => {
      if (typeof applyTierSettingsToRows === "function") {
        return applyTierSettingsToRows();
      }
    })
    .then(() => {
      // Do not initialize Dragula during the initial storage restore.
      // bootstrapApp initializes Dragula after all images, tier settings, and cleanup are done.
      // Initializing early can make the first drag use stale DOM/state and snap back to Unassigned.
      if (typeof initializationComplete !== "undefined" && initializationComplete && typeof initializeDragula === "function") {
        initializeDragula();
      }
    })
    .catch((err) => {
      logDbSyncError("Failed loading images from IndexedDB.", err);
    });
}

function getImageMetadata() {
  return getDefaultImageMetadata();
}

function saveImageMetadata(imageId, metadata) {
  saveImageMetadataToIndexedDB(imageId, metadata).catch((err) => {
    logDbSyncError(`Deprecated saveImageMetadata failed for ${imageId}.`, err);
  });
}

function deleteImageMetadata(imageId) {
  deleteImageMetadataFromIndexedDB(imageId).catch((err) => {
    logDbSyncError(`Deprecated deleteImageMetadata failed for ${imageId}.`, err);
  });
}

function isFirebaseConfigured() {
  return !!(typeof firebase !== "undefined" && FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY");
}

async function initializeFirebase() {
  if (!isFirebaseConfigured()) {
    firebaseAvailable = false;
    return null;
  }

  try {
    if (!firebase.apps || !firebase.apps.length) {
      firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    } else {
      firebaseApp = firebase.app();
    }

    firebaseAuth = firebase.auth();
    firebaseDb = firebase.firestore();

    firebaseAuth.onAuthStateChanged(async (user) => {
      currentUser = user || null;
      updateAuthUI();

      if (currentUser) {
        try {
          await loadTierListFromFirebase();
          startRealtimeSync();
        } catch (err) {
          logDbSyncError("Failed loading tier list after auth state change.", err);
        }
      } else {
        stopRealtimeSync();
      }
    });

    return true;
  } catch (err) {
    firebaseAvailable = false;
    logDbSyncError("Firebase initialization failed.", err);
    return null;
  }
}

function updateAuthUI() {
  const loginBtn = document.getElementById("login-btn");
  const profileDropdown = document.getElementById("profile-dropdown");
  const profileAvatar = document.getElementById("profile-avatar");
  const userName = document.getElementById("user-name");

  if (!loginBtn || !profileDropdown || !profileAvatar || !userName) return;

  if (currentUser) {
    loginBtn.style.display = "none";
    profileDropdown.classList.remove("hidden");
    profileAvatar.src = "assets/aerith.jpg";
    userName.textContent = currentUser.displayName || currentUser.email || "Signed in";
    userName.style.display = "block";
  } else {
    loginBtn.style.display = "block";
    profileDropdown.classList.add("hidden");
    userName.textContent = "";
    userName.style.display = "none";
  }
}

function toggleProfileDropdown() {
  const profileMenu = document.getElementById("profile-menu");
  const profileDropdown = document.getElementById("profile-dropdown");
  if (!profileMenu || !profileDropdown) return;

  const isOpening = profileMenu.classList.contains("hidden");
  profileMenu.classList.toggle("hidden");
  if (!isOpening) return;

  const closeMenu = (event) => {
    if (!profileDropdown.contains(event.target)) {
      profileMenu.classList.add("hidden");
      document.removeEventListener("click", closeMenu);
    }
  };

  setTimeout(() => {
    document.addEventListener("click", closeMenu);
  }, 0);
}

function openProfileScreen() {
  window.location.href = "my-tierlists.html";
}

function closeProfileScreen() {
  const screen = document.getElementById("profile-screen");
  if (screen) screen.classList.add("hidden");
}

async function signInWithGoogle() {
  if (!firebaseAuth) {
    alert("Firebase auth is not initialized.");
    return;
  }

  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await firebaseAuth.signInWithPopup(provider);
  } catch (err) {
    logDbSyncError("Google sign-in failed.", err);
    alert("Failed to sign in. Make sure Firebase is configured and Google auth is enabled.");
  }
}

function shouldDeferRealtimeApply() {
  const modalOpen = typeof isImageModalOpen === "function" && isImageModalOpen();

  const draggingActive = typeof isDraggingImages !== "undefined" && !!isDraggingImages;

  return isApplyingRemoteUpdate || modalOpen || draggingActive;
}

async function applyRemoteTierData(remoteTierData, remoteUpdatedAt) {
  if (!remoteTierData) return;

  isApplyingRemoteUpdate = true;
  try {
    await loadTierListFromObject(remoteTierData);
    lastRemoteSyncTime = remoteUpdatedAt;
  } catch (err) {
    logDbSyncError("Realtime Firebase update failed.", err);
  } finally {
    isApplyingRemoteUpdate = false;
  }
}

async function flushPendingRealtimeSync() {
  if (!pendingRemoteTierData) return;
  if (shouldDeferRealtimeApply()) return;

  const remoteTierData = pendingRemoteTierData;
  const remoteUpdatedAt = pendingRemoteUpdatedAt;

  pendingRemoteTierData = null;
  pendingRemoteUpdatedAt = null;

  await applyRemoteTierData(remoteTierData, remoteUpdatedAt);
}

async function signOut() {
  stopRealtimeSync();

  if (!firebaseAuth) {
    alert("Firebase auth is not initialized.");
    return;
  }

  try {
    await firebaseAuth.signOut();
  } catch (err) {
    logDbSyncError("Sign out failed.", err);
    alert("Failed to sign out.");
  }
}

async function saveTierListToFirebase() {
  if (!currentUser || !firebaseDb || !firebaseAvailable) return;
  if (isApplyingRemoteUpdate) return;

  try {
    const id = getCurrentTierListId() || generateTierListId();
    setCurrentTierListId(id);

    const docRef = firebaseDb.collection(FIREBASE_COLLECTION).doc(currentUser.uid);
    const nowIso = new Date().toISOString();

    const tierListData = await buildTierListDataForSync();
    tierListData.id = id;
    tierListData.lastUpdated = nowIso;

    let existingCreatedAt = null;
    try {
      const existingDoc = await docRef.get();
      const existingList = existingDoc.exists ? existingDoc.data()?.lists?.[id] : null;
      existingCreatedAt = existingList ? existingList.createdAt : null;
    } catch (err) {
      logDbSyncError("Failed reading existing tier list before save.", err);
    }
    tierListData.createdAt = existingCreatedAt || tierListData.createdAt || nowIso;

    await docRef.set({
      userId: currentUser.uid,
      userEmail: currentUser.email || null,
      lists: { [id]: tierListData },
      updated_at: nowIso,
    }, { merge: true });

    lastRemoteSyncTime = new Date(nowIso).getTime();
  } catch (err) {
    if (err && err.code === "permission-denied") {
      firebaseAvailable = false;
      stopRealtimeSync();
      alert("Firebase save failed because Firestore permissions are insufficient. Saving locally instead.");
    }
    logDbSyncError("Saving tier list to Firebase failed.", err);
    throw err;
  }
}

function validateImageUrl(url, timeoutMs = IMAGE_VALIDATE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(false);
      return;
    }

    const img = new Image();
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  });
}

async function cleanupBrokenImages() {
  const brokenImageIds = [];
  const allImageElements = Array.from(document.querySelectorAll(".image"));

  for (const img of allImageElements) {
    const imageId = img.dataset.imageId;
    const url = img.dataset.imageSrc || img.dataset.cloudinaryUrl || img.src;

    if (!url || !url.startsWith("http")) continue;

    const isValid = await validateImageUrl(url);
    if (!isValid) {
      img.remove();
      if (imageId) brokenImageIds.push(imageId);
    }
  }

  await Promise.all(brokenImageIds.map((imageId) => {
    return deleteImageFromIndexedDB(imageId).catch((err) => {
      logDbSyncError(`Failed deleting broken image ${imageId} from IndexedDB.`, err);
    });
  }));

  return brokenImageIds;
}

async function getFirebaseListsMapForCurrentUser() {
  if (!currentUser || !firebaseDb || !firebaseAvailable) return {};

  const docRef = firebaseDb.collection(FIREBASE_COLLECTION).doc(currentUser.uid);
  const doc = await docRef.get();
  if (!doc.exists) return {};

  const data = doc.data();
  if (!data) return {};

  if (data.lists && typeof data.lists === "object") {
    return data.lists;
  }

  // Legacy migration: a single tier_data doc becomes a one-entry lists map.
  if (data.tier_data) {
    const id = generateTierListId();
    const migratedList = {
      ...data.tier_data,
      id,
      createdAt: data.tier_data.lastUpdated || new Date().toISOString(),
    };

    try {
      await docRef.set({
        lists: { [id]: migratedList },
        updated_at: new Date().toISOString(),
      }, { merge: true });
    } catch (err) {
      logDbSyncError("Failed migrating legacy Firebase tier_data into lists map.", err);
    }

    return { [id]: migratedList };
  }

  return {};
}

async function getAllRemoteTierLists() {
  const listsMap = await getFirebaseListsMapForCurrentUser();
  return sortTierListsByRecency(Object.values(listsMap));
}

async function deleteRemoteTierList(id) {
  if (!currentUser || !firebaseDb || !firebaseAvailable || !id) return;

  await firebaseDb.collection(FIREBASE_COLLECTION).doc(currentUser.uid).update({
    [`lists.${id}`]: firebase.firestore.FieldValue.delete(),
    updated_at: new Date().toISOString(),
  });
}

async function loadTierListFromFirebase() {
  if (!currentUser || !firebaseDb || !firebaseAvailable) return;
  if (!isTierListEditorPage()) return;
  if (window.__isNewTierList) return;

  try {
    const listsMap = await getFirebaseListsMapForCurrentUser();
    const entries = sortTierListsByRecency(Object.values(listsMap));

    let targetId = getCurrentTierListId();
    let targetList = targetId ? listsMap[targetId] : null;

    if (!targetList && entries.length) {
      targetList = entries[0];
      targetId = targetList.id;
    }

    if (!targetList) {
      await loadTierListFromLocalStorage();
      return;
    }

    setCurrentTierListId(targetId);

    isApplyingRemoteUpdate = true;
    try {
      await loadTierListFromObject(targetList);
    } finally {
      isApplyingRemoteUpdate = false;
    }

    lastRemoteSyncTime = new Date(targetList.lastUpdated || Date.now()).getTime();
  } catch (err) {
    if (err && err.code === "permission-denied") {
      firebaseAvailable = false;
      stopRealtimeSync();
      alert("Firebase access denied. Your tierlist will load locally until Firestore permissions are fixed.");
    }
    logDbSyncError("Failed loading tier list from Firebase.", err);
    await loadTierListFromLocalStorage();
  }
}

function startRealtimeSync() {
  if (syncUnsubscribe) return;
  if (!currentUser || !firebaseDb || !firebaseAvailable) return;
  if (!isTierListEditorPage()) return;

  const docRef = firebaseDb.collection(FIREBASE_COLLECTION).doc(currentUser.uid);

  syncUnsubscribe = docRef.onSnapshot(
    async (doc) => {
      if (!doc.exists) return;

      const data = doc.data();
      if (!data) return;

      const listId = getCurrentTierListId();
      if (!listId) return;

      const listData = data.lists && data.lists[listId];
      if (!listData) return;

      const remoteUpdatedAt = new Date(listData.lastUpdated || 0).getTime();
      if (Number.isNaN(remoteUpdatedAt)) return;
      if (lastRemoteSyncTime !== null && remoteUpdatedAt <= lastRemoteSyncTime) return;

      if (shouldDeferRealtimeApply()) {
        pendingRemoteTierData = listData;
        pendingRemoteUpdatedAt = remoteUpdatedAt;
        return;
      }

      await applyRemoteTierData(listData, remoteUpdatedAt);
    },
    (err) => {
      if (err && err.code === "permission-denied") {
        firebaseAvailable = false;
        stopRealtimeSync();
        alert("Firebase sync disabled because Firestore permissions are insufficient.");
      }
      logDbSyncError("Realtime Firebase listener failed.", err);
    }
  );
}

function stopRealtimeSync() {
  if (typeof syncUnsubscribe === "function") {
    syncUnsubscribe();
  }
  syncUnsubscribe = null;
  pendingRemoteTierData = null;
  pendingRemoteUpdatedAt = null;
}

function getCloudinaryFolder() {
  return CLOUDINARY_CONFIG && CLOUDINARY_CONFIG.folder ? CLOUDINARY_CONFIG.folder : null;
}

async function uploadToCloudinary(file) {
  if (!file) {
    throw new Error("No file provided for upload.");
  }

  if (!CLOUDINARY_CONFIG || !CLOUDINARY_CONFIG.cloudName) {
    throw new Error("Cloudinary config is missing.");
  }

  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);

  if (CLOUDINARY_CONFIG.folder) {
    formData.append("folder", CLOUDINARY_CONFIG.folder);
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Cloudinary upload failed: ${response.status} ${text}`);
    }

    const data = await response.json();

    if (!data || !data.secure_url) {
      throw new Error("Cloudinary response missing secure_url.");
    }

    return data.secure_url;
  } catch (err) {
    console.error("[uploadToCloudinary] Upload failed:", err);
    throw err;
  }
}

async function deleteFromCloudinary(cloudinaryUrl) {
  if (!cloudinaryUrl) return;

  const endpoint = CLOUDINARY_CONFIG && CLOUDINARY_CONFIG.deleteEndpoint;
  if (!endpoint) {
    console.warn("[DatabaseSyncing] Remote Cloudinary deletion is disabled because deleteEndpoint is not configured.");
    return;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ cloudinaryUrl }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Failed to delete image from Cloudinary via backend endpoint.");
  }

  return response.json().catch(() => ({}));
}

function extractCloudinaryPublicId(cloudinaryUrl) {
  try {
    const url = new URL(cloudinaryUrl);
    const match = url.pathname.match(/\/(?:image|video|raw)\/upload\/(?:v\d+\/)?(.+)/);
    if (!match || !match[1]) return null;
    return decodeURIComponent(match[1].replace(/\.[^/.]+$/, ""));
  } catch (err) {
    logDbSyncError("Failed to extract Cloudinary public ID.", err);
    return null;
  }
}