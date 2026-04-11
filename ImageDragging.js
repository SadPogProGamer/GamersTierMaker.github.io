let scrollable = true;
let drake;
let selectedImages = new Set();
let lastSelectedImage = null;
let suppressNextLeftClick = false;

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
    return;
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

function initializeDragula() {
  const containers = Array.from(document.querySelectorAll('.sort'));

  if (drake) {
    drake.destroy();
  }
  
  if (containers.length === 0) {
    console.warn('No containers found for dragula');
    return;
  }
  
  drake = dragula(containers, {
    removeOnSpill: false,
    mirrorContainer: document.body,
    accepts: (el, target) => {
      return target && target.classList.contains('sort');
    }
  });
  
  drake
    .on('drag', (el, source) => {
      scrollable = false;
      if (!selectedImages.has(el)) {
        selectImage(el);
      }
      updateDragMirror();
    })
    .on('drop', (el, target, source, sibling) => {
      scrollable = true;
      moveSelectedImagesToTarget(el, target, sibling);
      
      const targetRow = target.parentNode;
      if (targetRow && targetRow.classList.contains('row')) {
        const rows = document.querySelectorAll('.row');
        const tierIndex = Array.from(rows).indexOf(targetRow);
        
        if (tierLimitStates[tierIndex]) {
          const tierImages = target.querySelectorAll('.image');
          if (tierImages.length > 10 && tierIndex < rows.length - 1) {
            const lastImage = tierImages[tierImages.length - 1];
            const tierBelowIndex = tierIndex + 1;
            const tierBelow = rows[tierBelowIndex].children[1];
            tierBelow.insertBefore(lastImage, tierBelow.firstChild);
            console.log(`Moved last image from tier ${tierIndex} to tier ${tierBelowIndex} due to limit`);
          }
        }
        
        if (tierOrderingStates[tierIndex]) {
          sortTierByPlatform(target).catch(err => console.warn('Failed to re-sort tier:', err));
        }
      }
      
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
    .on('cancel', (el) => {
      scrollable = true;
      clearImageSelection();
    })
    .on('over', (el, container) => {
      if (container.classList.contains('sort')) {
        container.style.backgroundColor = 'rgba(127, 255, 255, 0.1)';
      }
    })
    .on('out', (el, container) => {
      if (container.classList.contains('sort')) {
        container.style.backgroundColor = '';
      }
    });
}

document.addEventListener(
  'touchmove',
  (event) => {
    if (!scrollable) {
      event.preventDefault();
    }
  },
  {
    passive: false,
  }
);
