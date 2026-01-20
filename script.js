const hash = location.hash.substring(1);
const defaultColors = [
  "rgb(191, 255, 127);",
  "rgb(255, 127, 127)",
  "rgb(255, 191, 127)",
  "rgb(255, 223, 127)",
  "#FFFF7F",
  "rgb(191, 255, 127)",
  "rgb(127, 255, 127)",
  "rgb(255, 127, 255)",
];

// Cloudinary Configuration
const CLOUDINARY_CONFIG = {
  cloudName: "dfdibdfcm",
  uploadPreset: "GamersTierMaker",
  folder: "GamersTierMaker"
};

// Firebase Configuration - IMPORTANT: Update with your Firebase project credentials
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDPjqFmqGWUFBicEWcfzo6QfQ5fFX3cryk",
  authDomain: "gamertiermaker.firebaseapp.com",
  projectId: "gamertiermaker",
  storageBucket: "gamertiermaker.firebasestorage.app",
  messagingSenderId: "515771009142",
  appId: "1:515771009142:web:c485f6b63235449ff43757"
};

// Firebase globals
let firebaseDb;
let auth;
let currentUser = null;

const platformOptions = {
  "PC": ["PC"],
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
    "Visual Boy Advance (Game Boy Advance)",
    "MelonDS (Nintendo DS)",
    "Dolphin (Wii / GameCube)",
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
let indexedDb; // IndexedDB database

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
  return new Promise((resolve, reject) => {
    const transaction = indexedDb.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');
    const request = store.put({ key, value });
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Get setting from IndexedDB
function getSetting(key) {
  return new Promise((resolve, reject) => {
    const transaction = indexedDb.transaction(['settings'], 'readonly');
    const store = transaction.objectStore('settings');
    const request = store.get(key);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result ? request.result.value : null);
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
      resolve(result ? { name: result.name || "", date: result.date || "", description: result.description || "", status: result.status || "", platform: result.platform || null, rating: result.rating || "" } : { name: "", date: "", description: "", status: "", platform: null, rating: "" });
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
function initializeFirebase() {
  return new Promise((resolve, reject) => {
    if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey === "YOUR_API_KEY") {
      console.warn("Firebase not configured. Syncing across devices will not work.");
      resolve(null);
      return;
    }

    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth();
      firebaseDb = firebase.firestore();

      // Set up auth state listener
      auth.onAuthStateChanged((user) => {
        currentUser = user;
        updateAuthUI();
        if (user) {
          console.log("User logged in:", user.email);
          loadTierListFromFirebase();
        }
      });

      resolve(true);
    } catch (err) {
      console.error("Firebase initialization failed:", err);
      resolve(null);
    }
  });
}

// Update auth UI
function updateAuthUI() {
  const loginBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const userName = document.getElementById("user-name");

  if (currentUser) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "block";
    userName.textContent = currentUser.displayName || currentUser.email;
    userName.style.display = "block";
  } else {
    loginBtn.style.display = "block";
    logoutBtn.style.display = "none";
    userName.style.display = "none";
  }
}

// Sign in with Google
async function signInWithGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch (err) {
    console.error("Sign in error:", err);
    alert("Failed to sign in. Make sure Firebase is configured.");
  }
}

// Sign out
async function signOut() {
  try {
    await auth.signOut();
  } catch (err) {
    console.error("Sign out error:", err);
  }
}

// Save tier list to Firebase
async function saveTierListToFirebase() {
  if (!currentUser || !firebaseDb) return;

  try {
    const tierListData = {
      header: document.getElementById("main-title").textContent,
      tiers: [],
      imagePositions: [],
      gameMetadata: {},
      lastUpdated: new Date()
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

      tierImages.forEach((img) => {
        const imageId = img.dataset.imageId;
        tierListData.imagePositions.push({
          imageId: imageId,
          imageSrc: img.dataset.imageSrc,
          tier: tierIndex,
        });
        // Include metadata if it exists
        if (metadataMap[imageId]) {
          tierListData.gameMetadata[imageId] = metadataMap[imageId];
        }
      });
    });

    // Save images from bar
    const imagesBar = document.querySelector("#images-bar");
    const barImages = imagesBar.querySelectorAll(".image");
    barImages.forEach((img) => {
      const imageId = img.dataset.imageId;
      tierListData.imagePositions.push({
        imageId: imageId,
        imageSrc: img.dataset.imageSrc,
        tier: -1,
      });
      // Include metadata if it exists
      if (metadataMap[imageId]) {
        tierListData.gameMetadata[imageId] = metadataMap[imageId];
      }
    });

    // Save to Firestore
    await firebaseDb.collection("tierLists").doc(currentUser.uid).set(tierListData);
    console.log("Tier list saved to Firebase");
  } catch (err) {
    console.error("Failed to save tier list to Firebase:", err);
  }
}

// Load tier list from Firebase
async function loadTierListFromFirebase() {
  if (!currentUser || !firebaseDb) return;

  try {
    const doc = await firebaseDb.collection("tierLists").doc(currentUser.uid).get();
    
    if (!doc.exists) {
      console.log("No saved tier list found");
      return;
    }

    const tierListData = doc.data();
    
    // Restore header
    document.getElementById("main-title").textContent = tierListData.header;

    // Restore tiers
    const rows = document.querySelectorAll(".row");
    tierListData.tiers.forEach((tier, index) => {
      if (rows[index]) {
        const tierLabel = rows[index].querySelector(".tier-label");
        tierLabel.querySelector("p").textContent = tier.name;
        tierLabel.style.backgroundColor = tier.color;
      }
    });

    // Restore image positions and metadata
    const imagesBar = document.querySelector("#images-bar");
    
    // Clear all images from the entire page (both bar and tiers)
    document.querySelectorAll(".image").forEach(img => img.remove());

    tierListData.imagePositions.forEach((imgPos) => {
      const image = document.createElement("img");
      image.src = imgPos.imageSrc;
      image.className = "image";
      image.dataset.imageSrc = imgPos.imageSrc;
      image.dataset.imageId = imgPos.imageId;
      image.dataset.cloudinaryUrl = imgPos.imageSrc;
      image.onclick = () => openImageModal(image);

      if (imgPos.tier === -1) {
        imagesBar.appendChild(image);
      } else if (rows[imgPos.tier]) {
        rows[imgPos.tier].children[1].appendChild(image);
      }

      // Restore metadata from Firebase to IndexedDB
      if (tierListData.gameMetadata && tierListData.gameMetadata[imgPos.imageId]) {
        const metadata = tierListData.gameMetadata[imgPos.imageId];
        saveImageMetadataToIndexedDB(imgPos.imageId, metadata).catch(err => {
          console.warn(`Failed to restore metadata for image ${imgPos.imageId}:`, err);
        });
      }
    });

    initializeDragula();
    console.log("Tier list loaded from Firebase");
  } catch (err) {
    console.error("Failed to load tier list from Firebase:", err);
  }
}

// Initialize Firebase first, then IndexedDB
initializeFirebase().then(() => {
  return initializeIndexedDB();
}).then(() => {
  // Load header from storage on page load
  loadHeaderFromStorage();
  loadCustomPlatforms();
  loadTierColors();
  
  if (hash.length <= 0) {
    console.log("Nothing to load.");
    loadImagesFromStorage();
  } else {
    load();
  }
}).catch(err => {
  console.error('Failed to initialize:', err);
});

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
      storedTiers.forEach((tier, index) => {
        if (rows[index]) {
          const tierLabel = rows[index].querySelector(".tier-label");
          tierLabel.style.backgroundColor = tier.color;
        }
      });
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

document.querySelectorAll(".tooltip").forEach((tooltip) => {
  const tierLabel = tooltip.parentNode;
  const defaultColor = tierLabel.style.backgroundColor || defaultColors[0];
  const colorPicker = tooltip.querySelector(".color-picker");

  createColorPicker(
    colorPicker,
    (color) => {
      const hexColor = color ? color.toHEXA().toString() : "";
      tierLabel.style.backgroundColor = hexColor;
      saveTierColors();
    },
    defaultColor
  );
});

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

function createColorPicker(colorPicker, onChange, defaultColor) {
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

  pickr.on("save", (color) => {
    onChange(color);
    pickr.hide();
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
    (color) => {
      const hexColor = color ? color.toHEXA().toString() : "";
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

  mainContainer.appendChild(newRow);

  initializeDragula();
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
    menu.remove();
  };
  
  // Add tier below button
  const addBelowBtn = document.createElement("button");
  addBelowBtn.className = "row-menu-btn";
  addBelowBtn.textContent = "Add Tier Below";
  addBelowBtn.onclick = () => {
    row.parentNode.insertBefore(createNewRow(), row.nextSibling);
    menu.remove();
  };
  
  // Delete tier button
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "row-menu-btn delete";
  deleteBtn.textContent = "Delete Tier";
  deleteBtn.onclick = () => {
    deleteRow(element);
    menu.remove();
  };
  
  menu.appendChild(addAboveBtn);
  menu.appendChild(addBelowBtn);
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
    (color) => {
      const hexColor = color ? color.toHEXA().toString() : "";
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

  initializeDragula();
  
  return newRow;
}

function deleteRow(element) {
  const row = element.closest(".row");
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
}

function moveRow(button, direction) {
  const row = button.closest(".row");

  const currentIndex = Array.from(row.parentNode.children).indexOf(row);
  const newIndex = currentIndex + direction;

  if (newIndex >= 0) {
    row.parentNode.insertBefore(
      row,
      row.parentNode.children[newIndex + (direction === 1 ? 1 : 0)]
    );
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

// Upload image to Cloudinary
async function uploadToCloudinary(file) {
  if (!CLOUDINARY_CONFIG.cloudName || CLOUDINARY_CONFIG.cloudName === "YOUR_CLOUD_NAME") {
    throw new Error("Cloudinary is not configured. Please set your Cloud Name and Upload Preset in the script.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
  formData.append("folder", CLOUDINARY_CONFIG.folder);

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

  try {
    // Extract public ID from the Cloudinary URL
    // URL format: https://res.cloudinary.com/{cloudName}/image/upload/v{version}/{folder}/{publicId}.{format}
    const urlParts = cloudinaryUrl.split('/');
    const fileNameWithExtension = urlParts[urlParts.length - 1];
    const publicId = fileNameWithExtension.split('.')[0];
    const folder = CLOUDINARY_CONFIG.folder;
    const fullPublicId = folder ? `${folder}/${publicId}` : publicId;

    // Use Cloudinary's destroy endpoint
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/destroy`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          public_id: fullPublicId,
          api_key: "YOUR_API_KEY", // This won't work without API key - see note below
        }).toString(),
      }
    );

    if (!response.ok) {
      console.warn("Failed to delete from Cloudinary (API key required for deletion)");
      return;
    }

    console.log("Image deleted from Cloudinary:", fullPublicId);
  } catch (err) {
    console.warn("Could not delete image from Cloudinary:", err);
    // Don't throw - allow local deletion to continue even if remote deletion fails
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
        loadingDiv.remove();
        initializeDragula();
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
  
  drake = dragula(containers);
  
  drake
    .on("drag", (el) => {
      scrollable = false;
    })
    .on("drop", (el, target, source, sibling) => {
      scrollable = true;
      saveImagePositions();
    })
    .on("cancel", (el) => {
      scrollable = true;
    })
    .on("over", (el, container) => {
      container.style.backgroundColor = 'rgba(127, 255, 255, 0.1)';
    })
    .on("out", (el, container) => {
      container.style.backgroundColor = '';
    });
}

function saveImagePositions() {
  const imagePositions = [];
  const rows = document.querySelectorAll(".row");
  const imagesBar = document.querySelector("#images-bar");

  // Get images from tiers
  rows.forEach((row, tierIndex) => {
    const tierImages = row.children[1].querySelectorAll(".image");
    tierImages.forEach((img) => {
      imagePositions.push({
        id: img.dataset.imageId,
        tier: tierIndex,
      });
    });
  });

  // Get images from images bar
  const barImages = imagesBar.querySelectorAll(".image");
  barImages.forEach((img) => {
    imagePositions.push({
      id: img.dataset.imageId,
      tier: -1,
    });
  });

  // Update IndexedDB with new positions
  getImagesFromIndexedDB().then((images) => {
    images.forEach((image) => {
      const position = imagePositions.find(p => p.id === image.id);
      if (position) {
        image.tier = position.tier;
        // Update in IndexedDB
        const transaction = indexedDb.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        store.put(image);
      }
    });
  });

  // Also save to Firebase if user is logged in
  if (currentUser) {
    saveTierListToFirebase();
  }
}

function dynamicStyle(checkbox, css) {
  const style = document.querySelector("#dynamic-styles");

  if (checkbox.checked) {
    style.innerHTML += css;
  } else {
    style.innerHTML = style.innerHTML.replace(css, "");
  }
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
  
  getImageMetadataFromIndexedDB(imageId).then(imageMetadata => {
    document.getElementById("image-name").value = imageMetadata.name || "";
    document.getElementById("image-date").value = imageMetadata.date || "";
    document.getElementById("image-description").value = imageMetadata.description || "";
    document.getElementById("image-status").value = imageMetadata.status || "";
    document.getElementById("image-rating").value = imageMetadata.rating || "";
    
    // Update the date label based on status
    updateDateLabel();
    
    // Load platform
    currentSelectedPlatform = imageMetadata.platform || null;
    document.getElementById("platform-search").value = "";
    document.getElementById("platform-dropdown-menu").classList.add("hidden");
    updatePlatformButton();
    renderPlatformOptions();

    modal.classList.remove("hidden");
  }).catch(err => {
    console.error('Failed to load image metadata:', err);
  });
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
}

function closeImageModal() {
  const modal = document.getElementById("image-modal");
  const imageId = currentImageElement.dataset.imageId;
  const imageMetadata = {
    name: document.getElementById("image-name").value,
    date: document.getElementById("image-date").value,
    description: document.getElementById("image-description").value,
    status: document.getElementById("image-status").value,
    platform: currentSelectedPlatform,
    rating: document.getElementById("image-rating").value,
  };

  saveImageMetadataToIndexedDB(imageId, imageMetadata).catch(err => {
    console.error('Failed to save image metadata:', err);
  });

  // Sync metadata to Firebase if user is logged in
  if (currentUser && firebaseDb) {
    saveTierListToFirebase().catch(err => {
      console.error('Failed to sync metadata to Firebase:', err);
    });
  }

  modal.classList.add("hidden");
  currentImageElement = null;
  currentSelectedPlatform = null;
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
      await firebaseDb.collection("tierLists").doc(currentUser.uid).delete();
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

  // Add "Add Platform" input at the bottom
  const addContainer = document.createElement("div");
  addContainer.className = "platform-add-container";
  addContainer.innerHTML = `
    <input 
      type="text" 
      id="new-platform-input" 
      class="platform-add-input" 
      placeholder="Type new platform..."
    />
    <button class="platform-add-btn" onclick="addCustomPlatform()">Add</button>
    <button class="platform-delete-btn" onclick="enterDeletePlatformMode()">Delete</button>
  `;
  optionsContainer.appendChild(addContainer);
}

function addCustomPlatform() {
  const input = document.getElementById("new-platform-input");
  const platformName = input.value.trim();

  if (platformName && !customPlatforms.find(p => p.name === platformName)) {
    customPlatforms.push({ name: platformName, category: "Uncategorized" });
    saveSetting("customPlatforms", customPlatforms).then(() => {
      input.value = "";
      renderPlatformOptions();
    }).catch(err => {
      console.error('Failed to save custom platform:', err);
    });
  }
}

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
    btn.textContent = "Select Platform ▼";
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

  // Convert search query to lowercase for case-insensitive search
  const query = searchQuery.toLowerCase();

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

  // Function to check if a game name matches the query (including abbreviations)
  function matchesQuery(gameName) {
    const nameWords = gameName.toLowerCase().split(/\s+/);
    
    // Direct string match
    if (gameName.toLowerCase().includes(query)) {
      return true;
    }
    
    // Check if query is an abbreviation that matches
    if (abbreviationsMap[query]) {
      const fullName = abbreviationsMap[query].toLowerCase();
      if (gameName.toLowerCase().includes(fullName)) {
        return true;
      }
    }
    
    // Check if any word in the game name starts with the query
    if (nameWords.some(word => word.startsWith(query))) {
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

    // Filter images in tiers
    rows.forEach((row) => {
      const tierImages = row.children[1].querySelectorAll(".image");
      tierImages.forEach((img) => {
        const imageId = img.dataset.imageId;
        const metadata = metadataMap[imageId] || { name: "", date: "", description: "", status: "", platform: null };
        const imageName = metadata.name;
        const imagePlatform = metadata.platform ? metadata.platform : "";

        // Check if search query matches name or platform
        const matchesName = query === "" || matchesQuery(imageName);
        
        // Check platform - support both full names and abbreviations
        let matchesPlatform = query === "" || imagePlatform.toLowerCase().includes(query);
        if (!matchesPlatform && platformAbbreviationsMap[query]) {
          const fullPlatformName = platformAbbreviationsMap[query].toLowerCase();
          matchesPlatform = imagePlatform.toLowerCase().includes(fullPlatformName);
        }

        if (matchesName || matchesPlatform) {
          img.style.display = "";
        } else {
          img.style.display = "none";
        }
      });
    });

    // Filter images in images bar
    const barImages = imagesBar.querySelectorAll(".image");
    barImages.forEach((img) => {
      const imageId = img.dataset.imageId;
      const metadata = metadataMap[imageId] || { name: "", date: "", description: "", status: "", platform: null };
      const imageName = metadata.name;
      const imagePlatform = metadata.platform ? metadata.platform : "";

      // Check if search query matches name or platform
      const matchesName = query === "" || matchesQuery(imageName);
      
      // Check platform - support both full names and abbreviations
      let matchesPlatform = query === "" || imagePlatform.toLowerCase().includes(query);
      if (!matchesPlatform && platformAbbreviationsMap[query]) {
        const fullPlatformName = platformAbbreviationsMap[query].toLowerCase();
        matchesPlatform = imagePlatform.toLowerCase().includes(fullPlatformName);
      }

      if (matchesName || matchesPlatform) {
        img.style.display = "";
      } else {
        img.style.display = "none";
      }
    });
  }).catch(err => {
    console.error('Failed to load image metadata for filtering:', err);
  });
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
