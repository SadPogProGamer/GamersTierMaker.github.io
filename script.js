// --- DATA ---
let tiers = [
    { label: 'S', color: '#FF7F7F', images: [], icon: '' },
    { label: 'A', color: '#FFBF7F', images: [], icon: '' },
    { label: 'B', color: '#FFDF7F', images: [], icon: '' },
    { label: 'C', color: '#FFFF7F', images: [], icon: '' },
    { label: 'D', color: '#b2e77d', images: [], icon: '' },
    { label: 'F', color: '#BFFF7F', images: [], icon: '' },
    { label: 'The world would have been better without', color: '#b855bf', images: [], icon: '' }
];
let imageBank = [];
let draggedImg = null;
let draggedFromTier = null;
let draggedFromBank = false;
let draggedFromIndex = null;

function updateImageCounter() {
    // Count total images
    let totalImages = imageBank.length;
    tiers.forEach(tier => {
      totalImages += tier.images.length;
    });
    
    // Update display
    const counter = document.getElementById('image-counter');
    if (counter) {
      counter.textContent = `(${totalImages})`;
    }
  }
  

// --- SORTING ---
function sortTiers() {
    tiers.sort((a, b) => a.label.localeCompare(b.label, 'en', {sensitivity: 'base'}));
}

// --- RENDER TIERLIST ---
function renderTierlist() {
    const container = document.getElementById('tierlist');
    container.innerHTML = '';
    tiers.forEach((tier, idx) => {
    const row = document.createElement('div');
    row.className = 'tier-row';

    // Tier label with icon
    const label = document.createElement('div');
    label.className = 'label-holder';
    label.style.background = tier.color;
    if (tier.icon) {
        const icon = document.createElement('img');
        icon.className = 'label-icon';
        icon.src = tier.icon;
        icon.alt = '';
        label.appendChild(icon);
    }
    const span = document.createElement('span');
    span.innerText = tier.label;
    label.appendChild(span);
    row.appendChild(label);

    // Images
    const tierDiv = document.createElement('div');
    tierDiv.className = 'tier';
    tierDiv.ondragover = e => e.preventDefault();
    tierDiv.ondrop = e => {
        e.preventDefault();
        if (draggedImg) {
        if (draggedFromBank) {
            // From bank to tier
            const bankIdx = imageBank.indexOf(draggedImg);
            if (bankIdx !== -1) imageBank.splice(bankIdx, 1);
            tier.images.push(draggedImg);
            renderTierlist();
        } else if (draggedFromTier !== null) {
            // Improved logic for multi-row drag and drop
            const fromIdx = tiers[draggedFromTier].images.indexOf(draggedImg);
            if (fromIdx !== -1) {
            tiers[draggedFromTier].images.splice(fromIdx, 1);
            
            // Find closest image by distance
            const images = Array.from(tierDiv.querySelectorAll('.character'));
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            
            let closestImage = null;
            let closestDistance = Infinity;
            let insertIndex = tier.images.length; // Default to end
            
            images.forEach((img, imgIdx) => {
                const rect = img.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const dx = mouseX - centerX;
                const dy = mouseY - centerY;
                const distance = dx * dx + dy * dy;
                
                if (distance < closestDistance) {
                closestDistance = distance;
                closestImage = img;
                
                // Determine whether to insert before or after the found image
                if (mouseX < centerX) {
                    insertIndex = imgIdx; // Insert before
                } else {
                    insertIndex = imgIdx + 1; // Insert after
                }
                }
            });
            
            // If no close image found or mouse is to the right of all images
            if (!closestImage || mouseX > tierDiv.getBoundingClientRect().right - 50) {
                insertIndex = tier.images.length;
            }
            
            // Insert image at the correct position
            if (draggedFromTier === idx) {
                // Within same tier - reorder
                tier.images.splice(Math.min(insertIndex, tier.images.length), 0, draggedImg);
            } else {
                // Between different tiers
                tier.images.splice(Math.min(insertIndex, tier.images.length), 0, draggedImg);
            }
            renderTierlist();
            }
        }
        }
    };

    tier.images.forEach((img, imgIdx) => {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'character';
        imgDiv.style.backgroundImage = `url('${img}')`;
        imgDiv.draggable = true;
        imgDiv.ondragstart = () => {
        imgDiv.classList.add('dragging');
        draggedImg = img;
        draggedFromTier = idx;
        draggedFromBank = false;
        draggedFromIndex = imgIdx;
        };
        imgDiv.ondragend = () => {
        imgDiv.classList.remove('dragging');
        draggedImg = null;
        draggedFromTier = null;
        draggedFromBank = false;
        draggedFromIndex = null;
        };
        
        // Trash click handler
        imgDiv.addEventListener('click', (e) => {
        const rect = imgDiv.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        // If click is in trash area (top right corner)
        if (clickX > 62 && clickY < 34) {
            tier.images = tier.images.filter(i => i !== img);
            renderTierlist();
        }
        });
        tierDiv.appendChild(imgDiv);
    });
    row.appendChild(tierDiv);
    container.appendChild(row);
    });
    renderImageBank();
    updateImageCounter();
}

// --- IMAGE BANK ---
function renderImageBank() {
    const bank = document.getElementById('image-bank');
    bank.innerHTML = '';
    
    // Add handlers for returning images to the bank
    bank.ondragover = e => {
    e.preventDefault();
    bank.classList.add('drop-zone');
    };
    bank.ondragleave = e => {
    if (!bank.contains(e.relatedTarget)) {
        bank.classList.remove('drop-zone');
    }
    };
    bank.ondrop = e => {
    e.preventDefault();
    bank.classList.remove('drop-zone');
    
    if (draggedImg && !draggedFromBank) {
        // Return image from tier to bank
        if (draggedFromTier !== null) {
        const fromIdx = tiers[draggedFromTier].images.indexOf(draggedImg);
        if (fromIdx !== -1) {
            tiers[draggedFromTier].images.splice(fromIdx, 1);
            imageBank.push(draggedImg);
            renderTierlist();
        }
        }
    }
    };

    imageBank.forEach((img, idx) => {
    const imgDiv = document.createElement('div');
    imgDiv.className = 'image-bank-img';
    imgDiv.style.backgroundImage = `url('${img}')`;
    imgDiv.draggable = true;
    imgDiv.ondragstart = () => {
        imgDiv.classList.add('dragging');
        draggedImg = img;
        draggedFromTier = null;
        draggedFromBank = true;
    };
    imgDiv.ondragend = () => {
        imgDiv.classList.remove('dragging');
        draggedImg = null;
        draggedFromTier = null;
        draggedFromBank = false;
    };
    
    // Trash click handler in bank
    imgDiv.addEventListener('click', (e) => {
        const rect = imgDiv.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        // If click is in trash area (top right corner)
        if (clickX > 62 && clickY < 34) {
        imageBank.splice(idx, 1);
        renderImageBank();
        }
    });
    
    bank.appendChild(imgDiv);
    });
    updateImageCounter();
}

// --- IMAGE UPLOAD ---
document.getElementById('upload').addEventListener('change', function(e) {
    const files = Array.from(e.target.files);
    files.forEach(file => {
    const reader = new FileReader();
    reader.onload = function(ev) {
        imageBank.push(ev.target.result);
        renderImageBank();
        updateImageCounter();
    };
    reader.readAsDataURL(file);
    });
    e.target.value = '';
});

function closeEditModal() {
    document.getElementById('modal-root').innerHTML = '';
}

function openEditModal() {
    const modalRoot = document.getElementById('modal-root');
    modalRoot.innerHTML = `
    <div class="modal-bg" onclick="if(event.target===this)closeEditModal()">
        <div class="modal">
        <div class="modal-header">
            <h2>Tier Management</h2>
            <button class="close-modal" onclick="closeEditModal()">&times;</button>
        </div>
        <div class="modal-body">
            <div class="tier-edit-container" id="tiers-edit-list"></div>
            <button class="add-tier-btn" onclick="addTierRowModal()">
            + Add
            </button>
        </div>
        <div class="modal-footer">
            <div class="modal-actions-split">
            <button class="btn btn--cancel" onclick="closeEditModal()">Cancel</button>
            <button class="btn btn--save" onclick="saveTiersModal()">Save</button>
            </div>
        </div>
        </div>
    </div>
    `;
    renderTiersEditList();
}


function renderTiersEditList() {
    const editList = document.getElementById('tiers-edit-list');
    editList.innerHTML = '';
    
    tiers.forEach((tier, idx) => {
    const tierItem = document.createElement('div');
    tierItem.className = 'tier-edit-item';
    tierItem.dataset.index = idx;
    tierItem.style.animationDelay = `${idx * 0.05}s`;
    
    tierItem.innerHTML = `
        <div class="arrow-controls">
        <button class="arrow-btn" 
                onclick="moveTierUp(${idx})" 
                title="Move up"
                ${idx === 0 ? 'disabled' : ''}>
            <i class="fi fi-rr-angle-small-up"></i>
        </button>
        <button class="arrow-btn" 
                onclick="moveTierDown(${idx})" 
                title="Move down"
                ${idx === tiers.length - 1 ? 'disabled' : ''}>
            <i class="fi fi-rr-angle-small-down"></i>
        </button>
        </div>
        
        <div class="tier-preview" style="background: ${tier.color}">
        ${tier.icon ? `<img src="${tier.icon}" class="tier-icon-preview" alt="">` : ''}
        <span>${tier.label}</span>
        </div>
        
        <div class="tier-controls">
        <div class="tier-input-group">
            <input type="text" 
                class="tier-name-input" 
                value="${tier.label.replace(/"/g, '&quot;')}" 
                maxlength="3" 
                data-idx="${idx}"
                placeholder="ABC">
        </div>
        
        <div class="tier-input-group">
            <input type="color" 
                class="tier-color-input" 
                value="${tier.color}" 
                data-idx="${idx}"
                title="Choose color">
        </div>
        </div>
        
        <div class="tier-actions">
        <button class="action-btn action-btn--delete" 
                onclick="deleteTierRowModal(${idx})" 
                title="Delete tier">
            <i class="fi fi-sr-trash"></i>
        </button>
        
        <input type="file" 
                class="icon-upload-input" 
                id="icon-upload-${idx}" 
                accept="image/*" 
                data-idx="${idx}">
        </div>
    `;
    
    editList.appendChild(tierItem);
    
    // Event handlers for input fields
    const nameInput = tierItem.querySelector('.tier-name-input');
    const colorInput = tierItem.querySelector('.tier-color-input');
    const iconInput = tierItem.querySelector('.icon-upload-input');
    
    nameInput.oninput = (e) => {
        const newLabel = e.target.value.slice(0, 3);
        tiers[idx].label = newLabel;
        tierItem.querySelector('.tier-preview span').textContent = newLabel;
    };
    
    colorInput.oninput = (e) => {
        const newColor = e.target.value;
        tiers[idx].color = newColor;
        tierItem.querySelector('.tier-preview').style.background = newColor;
    };
    
    iconInput.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(ev) {
        tiers[idx].icon = ev.target.result;
        
        // Update preview
        const preview = tierItem.querySelector('.tier-preview');
        let iconImg = preview.querySelector('.tier-icon-preview');
        
        if (!iconImg) {
            iconImg = document.createElement('img');
            iconImg.className = 'tier-icon-preview';
            preview.insertBefore(iconImg, preview.querySelector('span'));
        }
        
        iconImg.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    };
    });
}

function moveTierUp(idx) {
    if (idx > 0) {
    // Swap elements in array
    const temp = tiers[idx];
    tiers[idx] = tiers[idx - 1];
    tiers[idx - 1] = temp;
    
    // Re-render list
    renderTiersEditList();
    }
}

function moveTierDown(idx) {
    if (idx < tiers.length - 1) {
    // Swap elements in array
    const temp = tiers[idx];
    tiers[idx] = tiers[idx + 1];
    tiers[idx + 1] = temp;
    
    // Re-render list
    renderTiersEditList();
    }
}

function triggerIconUpload(idx) {
    document.getElementById(`icon-upload-${idx}`).click();
}


function triggerIconUpload(idx) {
    document.getElementById(`icon-upload-${idx}`).click();
}


function addTierRowModal() {
    tiers.push({ label: 'NEW', color: '#7FBFFF', images: [], icon: '' });
    renderTiersEditList();
}

function deleteTierRowModal(idx) {
    if (tiers.length > 1) {
    tiers.splice(idx, 1);
    renderTiersEditList();
    }
}

function saveTiersModal() {
    // sortTiers();
    closeEditModal();
    renderTierlist();
}

// --- MANAGEMENT FUNCTIONS ---
function resetTierlist() {
    // Collect all images from all tiers
    tiers.forEach(tier => {
    // Add all tier images to bank
    imageBank.push(...tier.images);
    // Clear tier
    tier.images = [];
    });
    renderTierlist();
}

// Export all images to JSON with base64 encoding
function exportImagesJSON() {
    // Create export object with full structure
    const exportData = {
        timestamp: new Date().toISOString(),
        version: "1.1",
        tiers: tiers.map((tier, tierIndex) => ({
        index: tierIndex,
        label: tier.label,
        color: tier.color,
        icon: tier.icon,
        images: tier.images.map((img, imgIndex) => ({
            data: img,
            position: imgIndex,
            location: "tier",
            tierIndex: tierIndex
        }))
        })),
        imageBank: imageBank.map((img, imgIndex) => ({
        data: img,
        position: imgIndex,
        location: "bank"
        }))
    };
    
    // Count total images
    let totalImages = imageBank.length;
    tiers.forEach(tier => {
        totalImages += tier.images.length;
    });
    
    exportData.totalImages = totalImages;
    
    if (totalImages === 0) {
        alert('No images to export!');
        return;
    }
    
    // Export to file
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tierlist_full_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    
    alert(`Exported ${totalImages} images with positions preserved!`);
    }
      

  
  // Import images from JSON
  function importImagesJSON(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      
      // Check version and format
      if (data.version === "1.1" && data.tiers && data.imageBank) {
        // New format with positions
        importFullTierlistStructure(data);
      } else if (data.images && Array.isArray(data.images)) {
        // Legacy format - only images to bank
        importLegacyImages(data);
      } else {
        throw new Error('Invalid file format');
      }
      
    } catch (error) {
      alert('Import error: ' + error.message);
    }
  }
  
  function importFullTierlistStructure(data) {
    let importedImages = 0;
    let restoredTiers = 0;
    
    // Clear current data
    const shouldClear = confirm('Replace current tier list with imported data?\n\nYes - replace completely\nNo - add to existing');
    
    if (shouldClear) {
      // Full replacement
      tiers = [];
      imageBank = [];
      
      // Restore tier structure
      data.tiers.forEach(tierData => {
        const newTier = {
          label: tierData.label,
          color: tierData.color,
          icon: tierData.icon || '',
          images: []
        };
        
        // Restore images in correct order
        tierData.images
          .sort((a, b) => a.position - b.position)
          .forEach(imgData => {
            if (isValidImageBase64(imgData.data)) {
              newTier.images.push(imgData.data);
              importedImages++;
            }
          });
        
        tiers.push(newTier);
        restoredTiers++;
      });
      
      // Restore image bank
      data.imageBank
        .sort((a, b) => a.position - b.position)
        .forEach(imgData => {
          if (isValidImageBase64(imgData.data)) {
            imageBank.push(imgData.data);
            importedImages++;
          }
        });
      
      alert(`Import complete!\nRestored tiers: ${restoredTiers}\nImages: ${importedImages}`);
      
    } else {
      // Add to existing
      data.imageBank.forEach(imgData => {
        if (isValidImageBase64(imgData.data) && !imageBank.includes(imgData.data)) {
          imageBank.push(imgData.data);
          importedImages++;
        }
      });
      
      alert(`Added ${importedImages} new images to bank`);
    }
    
    renderTierlist();
    updateImageCounter();
  }
  
  function importLegacyImages(data) {
    let importedCount = 0;
    
    data.images.forEach(imageObj => {
      try {
        if (imageObj.data && imageObj.data.startsWith('data:image/')) {
          if (!imageBank.includes(imageObj.data)) {
            imageBank.push(imageObj.data);
            importedCount++;
          }
        }
      } catch (err) {
        console.error('Image import error:', err);
      }
    });
    
    renderImageBank();
    updateImageCounter();
    
    if (importedCount > 0) {
      alert(`Imported ${importedCount} images to bank (legacy format)`);
    } else {
      alert('Could not import images');
    }
  }
  
  
  function isValidImageBase64(base64String) {
    if (!base64String || typeof base64String !== 'string') {
      return false;
    }
    const imagePattern = /^data:image\/(jpeg|jpg|png|gif|bmp|webp);base64,/;
    return imagePattern.test(base64String);
  }
  

  // Convert image to base64 (for future use)
  function convertImageToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  
// Image import handler
document.getElementById('import-images').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(ev) {
      importImagesJSON(ev.target.result);
    };
    reader.readAsText(file);
    e.target.value = '';
  });
  

// --- INITIALIZATION ---
renderTierlist();