// MyTierLists.js
// Renders the "My Tier Lists" screen: profile header + a grid of the user's
// saved tier lists, sourced from Firebase (signed in) or localStorage (guest).

function mytlLogError(context, err) {
  console.error(`[MyTierLists] ${context}`, err);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function formatRelativeDate(isoString) {
  if (!isoString) return "";

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function getPreviewImageUrls(tierListData, max = 4) {
  const positions = Array.isArray(tierListData?.imagePositions) ? tierListData.imagePositions : [];

  const inTierFirst = positions
    .slice()
    .sort((a, b) => {
      const tierA = a.tier === -1 ? Number.MAX_SAFE_INTEGER : a.tier;
      const tierB = b.tier === -1 ? Number.MAX_SAFE_INTEGER : b.tier;
      if (tierA !== tierB) return tierA - tierB;
      return (a.order || 0) - (b.order || 0);
    })
    .map((pos) => pos.imageSrc)
    .filter(Boolean);

  return inTierFirst.slice(0, max);
}

function getImageCount(tierListData) {
  return Array.isArray(tierListData?.imagePositions) ? tierListData.imagePositions.length : 0;
}

function renderProfileHeader() {
  const container = document.getElementById("mytl-profile");
  if (!container) return;

  if (currentUser) {
    const displayName = currentUser.displayName || currentUser.email || "Signed in";
    const avatarSrc = currentUser.photoURL || "assets/aerith.jpg";

    container.innerHTML = `
      <img class="mytl-avatar" src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(displayName)}" />
      <div class="mytl-profile-info">
        <h1 class="mytl-name">${escapeHtml(displayName)}</h1>
        <div class="mytl-subtext">Synced to your Google account</div>
      </div>
      <div class="mytl-profile-actions">
        <button type="button" class="mytl-btn" id="mytl-signout-btn">Sign out</button>
      </div>
    `;

    const signOutBtn = document.getElementById("mytl-signout-btn");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", () => {
        signOut().catch((err) => mytlLogError("Sign out failed.", err));
      });
    }
  } else {
    container.innerHTML = `
      <img class="mytl-avatar" src="assets/aerith.jpg" alt="Guest" />
      <div class="mytl-profile-info">
        <h1 class="mytl-name">Guest</h1>
        <div class="mytl-subtext">Tier lists are saved on this device only</div>
      </div>
      <div class="mytl-profile-actions">
        <button type="button" class="mytl-btn mytl-btn-primary" id="mytl-signin-btn">Sign in with Google</button>
      </div>
    `;

    const signInBtn = document.getElementById("mytl-signin-btn");
    if (signInBtn) {
      signInBtn.addEventListener("click", () => {
        signInWithGoogle().catch((err) => mytlLogError("Sign in failed.", err));
      });
    }
  }
}

function buildThumbHtml(tierListData) {
  const previews = getPreviewImageUrls(tierListData, 4);

  if (!previews.length) {
    return `<div class="mytl-card-thumb mytl-card-thumb-empty">No images yet</div>`;
  }

  const imagesHtml = previews
    .map((src) => `<img src="${escapeHtml(src)}" alt="" loading="lazy" />`)
    .join("");

  return `<div class="mytl-card-thumb">${imagesHtml}</div>`;
}

function closeAllCardMenus() {
  document.querySelectorAll(".mytl-card-menu-dropdown").forEach((dropdown) => {
    dropdown.classList.add("hidden");
  });
  document.querySelectorAll(".mytl-card-menu-btn").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
  });
}

function createTierListCard(tierListData) {
  const card = document.createElement("a");
  card.className = "mytl-card";
  card.href = `index.html?list=${encodeURIComponent(tierListData.id)}`;

  const name = tierListData.header || "Untitled Tierlist";
  const imageCount = getImageCount(tierListData);
  const updatedText = formatRelativeDate(tierListData.lastUpdated || tierListData.createdAt);

  card.innerHTML = `
    ${buildThumbHtml(tierListData)}
    <div class="mytl-card-body">
      <div class="mytl-card-title">${escapeHtml(name)}</div>
      <div class="mytl-card-meta">${imageCount} image${imageCount === 1 ? "" : "s"}${updatedText ? ` &middot; ${escapeHtml(updatedText)}` : ""}</div>
    </div>
    <button type="button" class="mytl-card-menu-btn" title="More options" aria-label="More options" aria-haspopup="true" aria-expanded="false">
      <span class="mytl-dots-icon">&#8942;</span>
    </button>
    <div class="mytl-card-menu-dropdown hidden">
      <button type="button" class="mytl-card-menu-item mytl-duplicate-btn">Duplicate</button>
    </div>
    <button type="button" class="mytl-card-delete" title="Delete tier list" aria-label="Delete tier list">&times;</button>
  `;

  const deleteBtn = card.querySelector(".mytl-card-delete");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeAllCardMenus();
      handleDeleteTierList(tierListData.id, name);
    });
  }

  const menuBtn = card.querySelector(".mytl-card-menu-btn");
  const menuDropdown = card.querySelector(".mytl-card-menu-dropdown");
  const duplicateBtn = card.querySelector(".mytl-duplicate-btn");

  if (menuBtn && menuDropdown) {
    menuBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const wasHidden = menuDropdown.classList.contains("hidden");
      closeAllCardMenus();

      if (!wasHidden) return;

      menuDropdown.classList.remove("hidden");
      menuBtn.setAttribute("aria-expanded", "true");

      const closeOnOutsideClick = (outsideEvent) => {
        if (!card.contains(outsideEvent.target)) {
          menuDropdown.classList.add("hidden");
          menuBtn.setAttribute("aria-expanded", "false");
          document.removeEventListener("click", closeOnOutsideClick);
        }
      };

      setTimeout(() => document.addEventListener("click", closeOnOutsideClick), 0);
    });
  }

  if (duplicateBtn) {
    duplicateBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeAllCardMenus();
      handleDuplicateTierList(tierListData.id, name);
    });
  }

  return card;
}

// Deep-clones a stored tier list object so the duplicate has its own
// independent imagePositions/gameMetadata, without mutating the source.
function cloneTierListData(source) {
  try {
    return JSON.parse(JSON.stringify(source));
  } catch (err) {
    mytlLogError("Failed cloning tier list data for duplication.", err);
    return { ...source };
  }
}

// Persists a duplicated tier list the same way the app already persists
// edits: straight to the signed-in user's Firestore "lists" map, or to
// localStorage for guests. Nothing here touches Cloudinary or IndexedDB
// image metadata — the duplicate's imagePositions (image URLs, tier/order,
// and embedded "details") and gameMetadata are carried over as-is from the
// source tier list, since that data already lives in storage.
async function saveDuplicatedTierList(duplicateData) {
  if (currentUser && firebaseDb && firebaseAvailable) {
    const docRef = firebaseDb.collection(FIREBASE_COLLECTION).doc(currentUser.uid);
    await docRef.set(
      {
        userId: currentUser.uid,
        userEmail: currentUser.email || null,
        lists: { [duplicateData.id]: duplicateData },
        updated_at: duplicateData.lastUpdated,
      },
      { merge: true }
    );
    return;
  }

  saveLocalTierList(duplicateData.id, duplicateData);
}

async function handleDuplicateTierList(id, name) {
  try {
    let source = null;

    if (currentUser && firebaseDb && firebaseAvailable) {
      const listsMap = await getFirebaseListsMapForCurrentUser();
      source = listsMap[id] || null;
    } else {
      source = getLocalTierListById(id);
    }

    if (!source) {
      alert("Could not find that tier list to duplicate.");
      return;
    }

    const nowIso = new Date().toISOString();
    const duplicate = cloneTierListData(source);
    duplicate.id = generateTierListId();
    duplicate.header = `${source.header || name || "Untitled Tierlist"} (Copy)`;
    duplicate.createdAt = nowIso;
    duplicate.lastUpdated = nowIso;

    await saveDuplicatedTierList(duplicate);
    await renderTierListGrid();
  } catch (err) {
    mytlLogError(`Failed duplicating tier list ${id}.`, err);
    alert("Failed to duplicate that tier list. See console for details.");
  }
}

function createNewTierListCard() {
  const card = document.createElement("a");
  card.className = "mytl-card mytl-new-card";
  card.href = "index.html?new=1";
  card.innerHTML = `
    <div class="mytl-new-card-plus">+</div>
    <div>New Tier List</div>
  `;
  return card;
}

async function handleDeleteTierList(id, name) {
  const confirmed = confirm(`Delete "${name}"? This cannot be undone.`);
  if (!confirmed) return;

  try {
    if (currentUser && firebaseDb && firebaseAvailable) {
      await deleteRemoteTierList(id);
    } else {
      deleteLocalTierList(id);
    }

    // Also clear any matching per-list IndexedDB cache, if present.
    await saveSetting(`localTierList:${id}`, null).catch(() => {});

    await renderTierListGrid();
  } catch (err) {
    mytlLogError(`Failed deleting tier list ${id}.`, err);
    alert("Failed to delete that tier list. See console for details.");
  }
}

async function getTierListsToDisplay() {
  if (currentUser && firebaseDb && firebaseAvailable) {
    try {
      return await getAllRemoteTierLists();
    } catch (err) {
      mytlLogError("Failed loading remote tier lists, falling back to local.", err);
      return getAllLocalTierLists();
    }
  }

  return getAllLocalTierLists();
}

async function renderTierListGrid() {
  const grid = document.getElementById("mytl-grid");
  const countPill = document.getElementById("mytl-count-pill");
  const emptyState = document.getElementById("mytl-empty-state");
  if (!grid) return;

  grid.innerHTML = `<div class="mytl-loading">Loading your tier lists...</div>`;
  if (emptyState) emptyState.classList.add("hidden");

  let tierLists = [];
  try {
    tierLists = await getTierListsToDisplay();
  } catch (err) {
    mytlLogError("Failed loading tier lists for display.", err);
  }

  grid.innerHTML = "";

  if (countPill) {
    countPill.textContent = String(tierLists.length);
  }

  grid.appendChild(createNewTierListCard());

  if (!tierLists.length) {
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }

  tierLists.forEach((tierListData) => {
    if (!tierListData || !tierListData.id) return;
    grid.appendChild(createTierListCard(tierListData));
  });
}

function renderSignInBanner() {
  const banner = document.getElementById("mytl-signin-banner");
  if (!banner) return;
  banner.classList.toggle("hidden", !!currentUser);
}

async function initMyTierListsPage() {
  try {
    await initializeFirebase();
  } catch (err) {
    mytlLogError("Firebase init failed.", err);
  }

  renderProfileHeader();
  renderSignInBanner();
  await renderTierListGrid();

  if (firebaseAuth) {
    firebaseAuth.onAuthStateChanged(async () => {
      renderProfileHeader();
      renderSignInBanner();
      await renderTierListGrid();
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initMyTierListsPage().catch((err) => {
    mytlLogError("Unhandled init failure.", err);
  });
});