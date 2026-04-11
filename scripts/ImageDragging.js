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

let draggedPlatform = null;
let draggedCategory = null;
let draggedPlaceholder = null;

function handlePlatformDragStart(e, platform, category) {
  draggedPlatform = platform;
  draggedCategory = category;
  e.dataTransfer.effectAllowed = 'move';
  e.target.style.opacity = '0.5';

  // Enable auto-scroll on drag
  document.addEventListener('dragover', autoScrollDuringDrag);
}

function autoScrollDuringDrag(e) {
  const dropdownMenu = document.getElementById('platform-dropdown-menu');
  if (!dropdownMenu || dropdownMenu.classList.contains('hidden')) {
    document.removeEventListener('dragover', autoScrollDuringDrag);
    return;
  }

  const rect = dropdownMenu.getBoundingClientRect();
  const scrollThreshold = 30;

  if (e.clientY < rect.top + scrollThreshold) {
    dropdownMenu.scrollTop -= 10;
  } else if (e.clientY > rect.bottom - scrollThreshold) {
    dropdownMenu.scrollTop += 10;
  }
}

function handlePlatformDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  if (e.target.classList.contains('platform-option') || e.target.classList.contains('platform-category-header')) {
    e.target.classList.add('drag-over');
  }
}

function handlePlatformDragLeave(e) {
  e.target.classList.remove('drag-over');
}

function handlePlatformDrop(e, targetPlatform, targetCategory) {
  e.preventDefault();
  e.target.classList.remove('drag-over');
  removePlaceholder();
  if (draggedPlatform && draggedPlatform !== targetPlatform) {
    const draggedCustomIndex = customPlatforms.findIndex(p => p.name === draggedPlatform);

    if (draggedCustomIndex > -1) {
      customPlatforms[draggedCustomIndex].category = targetCategory;
      saveSetting('customPlatforms', customPlatforms).then(() => {
        renderPlatformOptions();
      }).catch(err => {
      });
    }
  }
}

function handlePlatformDropOnCategory(e, targetCategory) {
  e.preventDefault();
  e.target.classList.remove('drag-over');
  removePlaceholder();
  if (draggedPlatform) {
    const draggedCustomIndex = customPlatforms.findIndex(p => p.name === draggedPlatform);

    if (draggedCustomIndex > -1) {
      customPlatforms[draggedCustomIndex].category = targetCategory;
      saveSetting('customPlatforms', customPlatforms).then(() => {
        renderPlatformOptions();
      }).catch(err => {
      });
    }
  }
}

function showPlaceholder(targetCategory) {
  removePlaceholder();

  const optionsContainer = document.getElementById('platform-options');
  const placeholder = document.createElement('div');
  placeholder.className = 'platform-option draggable placeholder';
  placeholder.textContent = draggedPlatform;
  placeholder.id = 'drag-placeholder';

  let inserted = false;
  const children = optionsContainer.querySelectorAll('.platform-category-header');

  for (let header of children) {
    if (header.textContent === targetCategory) {
      let nextSibling = header.nextElementSibling;
      while (nextSibling && !nextSibling.classList.contains('platform-category-header') && !nextSibling.classList.contains('platform-drop-zone')) {
        if (nextSibling.classList.contains('platform-drop-zone')) {
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
  e.target.style.opacity = '1';
  draggedPlatform = null;
  draggedCategory = null;
  removePlaceholder();

  document.removeEventListener('dragover', autoScrollDuringDrag);

  document.querySelectorAll('.platform-option.drag-over, .platform-category-header.drag-over').forEach(el => {
    el.classList.remove('drag-over');
  });
}

function initializeDragula() {
  const containers = Array.from(document.querySelectorAll('.sort'));

  if (drake) {
    drake.destroy();
  }
  
  if (containers.length === 0) {
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
          }
        }
        
        if (tierOrderingStates[tierIndex]) {
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
