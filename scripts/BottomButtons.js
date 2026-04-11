// BottomButtons.js
// Handles export, download, and delete functionality for the tier maker.

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
  } finally {
    loadingDiv.remove();
  }
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
    alert('Failed to export game details. See console for details.');
  });
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
  const response = await fetch(`https://hastebin.skyra.pw/raw/${hash}`);
  const text = await response.text();
  const chunks = JSON.parse(decodeUnicode(text));

  const chunksData = await Promise.all(
    chunks.map(async (chunk) => {
      const chunkResponse = await fetch(`https://hastebin.skyra.pw/raw/${chunk}`);
      return chunkResponse.text();
    })
  );

  const res = chunksData.join("");
  const data = JSON.parse(decodeUnicode(res));

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

async function deleteTierList() {
  if (!confirmDeleteTierList()) {
    return;
  }

  const loadingDiv = document.createElement("div");
  loadingDiv.id = "delete-loading";
  loadingDiv.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); color: white; padding: 20px 40px; border-radius: 8px; z-index: 10000; font-size: 16px;";
  loadingDiv.textContent = "Deleting tier list...";
  document.body.appendChild(loadingDiv);

  try {
    const allImages = await getImagesFromIndexedDB();

    for (const image of allImages) {
      const cloudinaryUrl = image.cloudinaryUrl || image.src;
      await deleteFromCloudinary(cloudinaryUrl);
    }

    await clearImagesFromIndexedDB();

    const transaction = indexedDb.transaction(['imageMetadata'], 'readwrite');
    const store = transaction.objectStore('imageMetadata');
    await new Promise((resolve, reject) => {
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });

    document.querySelectorAll(".image").forEach(img => img.remove());

    if (currentUser && firebaseDb) {
      try {
        await firebaseDb.collection("tierLists").doc(currentUser.uid).delete();
      } catch (error) {
      }
    }

    loadingDiv.remove();
    alert("Tier list deleted successfully. All images have been removed from Cloudinary and your tier list.");

    location.reload();
  } catch (err) {
    loadingDiv.remove();
    alert("Failed to delete tier list. Please try again.");
  }
}
