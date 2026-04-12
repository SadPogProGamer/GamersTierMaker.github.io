// DatabaseSyncing.js (REWRITTEN)

// =========================
// UTIL
// =========================

function logError(context, err) {
  console.error(`[${context}]`, err);
}

// =========================
// INDEXED DB
// =========================

let indexedDb;

async function ensureDB() {
  if (indexedDb) return indexedDb;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open("TierListDB", 2);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      indexedDb = request.result;
      resolve(indexedDb);
    };

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains("images")) {
        db.createObjectStore("images", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains("imageMetadata")) {
        db.createObjectStore("imageMetadata", { keyPath: "id" });
      }
    };
  });
}

async function dbAction(storeName, mode, callback) {
  const db = await ensureDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], mode);
    const store = tx.objectStore(storeName);

    const result = callback(store);

    tx.onerror = (e) => {
      logError(`IndexedDB ${storeName}`, e);
      reject(e);
    };

    tx.oncomplete = () => resolve(result);
  });
}

// =========================
// IMAGE STORAGE
// =========================

async function saveImage(image) {
  return dbAction("images", "readwrite", (store) => store.put(image));
}

async function getAllImages() {
  return dbAction("images", "readonly", (store) => store.getAll());
}

async function deleteImage(id) {
  return dbAction("images", "readwrite", (store) => store.delete(id));
}

// =========================
// METADATA
// =========================

async function saveMetadata(id, metadata) {
  return dbAction("imageMetadata", "readwrite", (store) =>
    store.put({ id, ...metadata })
  );
}

async function getMetadata(id) {
  const result = await dbAction("imageMetadata", "readonly", (store) =>
    store.get(id)
  );

  if (!result) {
    return {
      name: "",
      developer: "",
      date: "",
      date100: "",
      description: "",
      status: "",
      platform: null,
      genres: [],
      has100Replay: false,
    };
  }

  return {
    name: result.name || "",
    developer: result.developer || "",
    date: result.date || "",
    date100: result.date100 || "",
    description: result.description || "",
    status: result.status || "",
    platform: result.platform || null,
    genres: result.genres || [],
    has100Replay: !!result.has100Replay,
  };
}

// =========================
// FIREBASE (REALTIME SYNC)
// =========================

let firebaseDb;
let firebaseAuth;
let currentUser = null;
let unsubscribeSnapshot = null;

async function initializeFirebase() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    firebaseAuth = firebase.auth();
    firebaseDb = firebase.firestore();

    firebaseAuth.onAuthStateChanged(async (user) => {
      currentUser = user;

      if (user) {
        startRealtimeSync();
      } else {
        stopRealtimeSync();
      }
    });
  } catch (err) {
    logError("Firebase init", err);
  }
}

// =========================
// REALTIME SYNC (🔥 KEY)
// =========================

function startRealtimeSync() {
  if (!currentUser) return;

  const ref = firebaseDb.collection("tierLists").doc(currentUser.uid);

  unsubscribeSnapshot = ref.onSnapshot(async (doc) => {
    if (!doc.exists) return;

    const data = doc.data();
    if (!data?.tier_data) return;

    console.log("🔥 Realtime update received");

    await loadTierListFromObject(data.tier_data);
  });
}

function stopRealtimeSync() {
  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
    unsubscribeSnapshot = null;
  }
}

// =========================
// SAVE (INSTANT FIREBASE)
// =========================

async function saveTierListToFirebase() {
  if (!currentUser || !firebaseDb) return;

  try {
    const images = await getAllImages();

    const metadataMap = {};
    for (const img of images) {
      metadataMap[img.id] = await getMetadata(img.id);
    }

    const rows = document.querySelectorAll(".row");

    const tierData = {
      header: document.getElementById("main-title").textContent,
      tiers: [],
      imagePositions: [],
      gameMetadata: metadataMap,
      updated_at: Date.now(),
    };

    rows.forEach((row, tierIndex) => {
      const label = row.querySelector(".tier-label");

      tierData.tiers.push({
        index: tierIndex,
        name: label.querySelector("p").textContent,
        color: label.style.backgroundColor,
      });

      const imgs = row.children[1].querySelectorAll(".image");

      imgs.forEach((img, order) => {
        tierData.imagePositions.push({
          id: img.dataset.imageId,
          src: img.dataset.imageSrc,
          tier: tierIndex,
          order,
        });
      });
    });

    const barImgs = document.querySelectorAll("#images-bar .image");

    barImgs.forEach((img, order) => {
      tierData.imagePositions.push({
        id: img.dataset.imageId,
        src: img.dataset.imageSrc,
        tier: -1,
        order,
      });
    });

    await firebaseDb
      .collection("tierLists")
      .doc(currentUser.uid)
      .set({ tier_data: tierData }, { merge: true });

    console.log("✅ Saved instantly to Firebase");
  } catch (err) {
    logError("Firebase save", err);
  }
}

// =========================
// POSITION SAVE (INSTANT)
// =========================

async function saveImagePositions() {
  try {
    const images = await getAllImages();

    const map = new Map(images.map((img) => [img.id, img]));

    const rows = document.querySelectorAll(".row");

    rows.forEach((row, tierIndex) => {
      const imgs = row.children[1].querySelectorAll(".image");

      imgs.forEach((img, order) => {
        const item = map.get(img.dataset.imageId);
        if (item) {
          item.tier = tierIndex;
          item.order = order;
        }
      });
    });

    const barImgs = document.querySelectorAll("#images-bar .image");

    barImgs.forEach((img, order) => {
      const item = map.get(img.dataset.imageId);
      if (item) {
        item.tier = -1;
        item.order = order;
      }
    });

    // Batch update
    await dbAction("images", "readwrite", (store) => {
      map.forEach((img) => store.put(img));
    });

    // 🔥 INSTANT SYNC
    await saveTierListToFirebase();

  } catch (err) {
    logError("saveImagePositions", err);
  }
}

// =========================
// CLOUDINARY (SAFE)
// =========================

async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
    { method: "POST", body: formData }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message);
  }

  const data = await res.json();
  return data.secure_url;
}

// 🔒 BACKEND ONLY DELETE
async function deleteFromCloudinary(url) {
  if (!CLOUDINARY_CONFIG.deleteEndpoint) return;

  try {
    await fetch(CLOUDINARY_CONFIG.deleteEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });
  } catch (err) {
    logError("Cloudinary delete", err);
  }
}
