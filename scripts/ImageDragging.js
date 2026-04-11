let scrollable = true;
let drake;
let dragEndCleanupAttached = false;

function cleanupDragMirrors() {
  const oldMirrors = document.querySelectorAll('.gu-mirror, .gu-transit');
  oldMirrors.forEach((mirror) => mirror.remove());
}

function setupImageSelection(image) {
  image.addEventListener('mousedown', () => {});
}

function initializeDragula() {
  const containers = Array.from(document.querySelectorAll('.sort'));

  if (drake) {
    try {
      drake.destroy();
    } catch (e) {
    }
    cleanupDragMirrors();
  }

  if (containers.length === 0) {
    return;
  }

  drake = dragula(containers, {
    removeOnSpill: false,
    revertOnSpill: true,
    mirrorContainer: document.body,
    moves: (el) => el.classList.contains('image'),
    accepts: (el, target) => target && target.classList.contains('sort'),
  });

  drake.on('drag', () => {
    scrollable = false;
  });

  drake.on('drop', async (el, target, source, sibling) => {
    scrollable = true;

    if (!target || !target.classList.contains('sort')) {
      cleanupDragMirrors();
      return;
    }

    const referenceNode = sibling && sibling.parentNode === target ? sibling : null;
    if (!target.contains(el)) {
      target.insertBefore(el, referenceNode);
    }

    try {
      const p = saveImagePositions();
      if (p && typeof p.then === 'function') {
        await p;
      }
    } catch (e) {
    }

    try {
      updateTierCounts(countsAreShown());
    } catch (e) {
    }

    cleanupDragMirrors();
  });

  drake.on('cancel', () => {
    scrollable = true;
    cleanupDragMirrors();
  });

  drake.on('over', (el, container) => {
    if (container.classList.contains('sort')) {
      container.style.backgroundColor = 'rgba(127, 255, 255, 0.1)';
    }
  });

  drake.on('out', (el, container) => {
    if (container.classList.contains('sort')) {
      container.style.backgroundColor = '';
    }
  });

  if (!dragEndCleanupAttached) {
    document.addEventListener('dragend', cleanupDragMirrors);
    dragEndCleanupAttached = true;
  }
}

document.addEventListener('touchmove', (event) => {
  if (!scrollable) {
    event.preventDefault();
  }
}, {
  passive: false,
});
