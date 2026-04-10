// ----------------------------------------------
// TIERMAKER - Core Application Logic
// Drag & Drop, Image Upload, State Management
// Compatible with index.html & style.css
// ----------------------------------------------

(function() {
    "use strict";

    // ---------- APPLICATION STATE ----------
    // Tier structure: each tier has unique id, editable label, and an array of items
    let tiers = [
        { id: "tier_S", label: "S", items: [] },
        { id: "tier_A", label: "A", items: [] },
        { id: "tier_B", label: "B", items: [] },
        { id: "tier_C", label: "C", items: [] },
        { id: "tier_D", label: "D", items: [] },
        { id: "tier_F", label: "F", items: [] }
    ];

    // Unassigned items pool (items not placed in any tier)
    let unassignedItems = [];

    // Simple unique ID generator
    let nextId = 100;
    function generateUniqueId() {
        return Date.now() + '-' + Math.random().toString(36).substr(2, 8) + (nextId++);
    }

    // DOM element references (populated after init)
    let tierContainerEl = null;
    let unassignedPoolEl = null;
    let fileInputEl = null;
    let downloadBtn = null;
    let fileCounterSpan = null;

    // ---------- HELPER: ESCAPE HTML (for safe export) ----------
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(match) {
            if (match === '&') return '&amp;';
            if (match === '<') return '&lt;';
            if (match === '>') return '&gt;';
            return match;
        });
    }

    // ---------- RENDER FULL UI (tiers + unassigned) ----------
    function render() {
        if (!tierContainerEl || !unassignedPoolEl) return;

        // ---- Render Tier Rows ----
        tierContainerEl.innerHTML = '';
        for (let i = 0; i < tiers.length; i++) {
            const tier = tiers[i];
            const row = document.createElement('div');
            row.className = 'tier-row';
            row.dataset.tierId = tier.id;

            // Left side: Tier label with editable input
            const labelDiv = document.createElement('div');
            labelDiv.className = 'tier-label';
            const labelInput = document.createElement('input');
            labelInput.type = 'text';
            labelInput.value = tier.label;
            labelInput.maxLength = 8;
            labelInput.addEventListener('change', (e) => {
                const newVal = e.target.value.trim();
                if (newVal) tier.label = newVal;
                render(); // re-render to reflect updated label
            });
            const subSpan = document.createElement('span');
            subSpan.textContent = 'TIER';
            labelDiv.appendChild(labelInput);
            labelDiv.appendChild(subSpan);

            // Right side: Items container (drop zone)
            const itemsDiv = document.createElement('div');
            itemsDiv.className = 'tier-items';
            itemsDiv.dataset.tierId = tier.id;

            // Drag & Drop event listeners for this tier container
            itemsDiv.addEventListener('dragover', (e) => {
                e.preventDefault();
                itemsDiv.classList.add('drop-valid');
            });
            itemsDiv.addEventListener('dragleave', () => {
                itemsDiv.classList.remove('drop-valid');
            });
            itemsDiv.addEventListener('drop', (e) => {
                e.preventDefault();
                itemsDiv.classList.remove('drop-valid');
                const draggedId = e.dataTransfer.getData('text/plain');
                if (!draggedId) return;

                // Find the dragged item (search in unassigned or any tier)
                let sourceItemObj = null;
                let sourceIsUnassigned = false;
                let sourceTierIndex = -1;
                let sourceItemIndex = -1;

                // Check unassigned pool first
                const unassignedIndex = unassignedItems.findIndex(item => item.id === draggedId);
                if (unassignedIndex !== -1) {
                    sourceItemObj = unassignedItems[unassignedIndex];
                    sourceIsUnassigned = true;
                    sourceItemIndex = unassignedIndex;
                } else {
                    // Search in each tier
                    for (let t = 0; t < tiers.length; t++) {
                        const idx = tiers[t].items.findIndex(item => item.id === draggedId);
                        if (idx !== -1) {
                            sourceItemObj = tiers[t].items[idx];
                            sourceTierIndex = t;
                            sourceItemIndex = idx;
                            break;
                        }
                    }
                }

                if (!sourceItemObj) return;

                // Remove from original location
                if (sourceIsUnassigned) {
                    unassignedItems.splice(sourceItemIndex, 1);
                } else if (sourceTierIndex !== -1) {
                    tiers[sourceTierIndex].items.splice(sourceItemIndex, 1);
                }

                // Add to target tier
                const targetTier = tiers.find(t => t.id === tier.id);
                if (targetTier) {
                    targetTier.items.push(sourceItemObj);
                } else {
                    // Fallback: should never happen, but push back to unassigned
                    unassignedItems.push(sourceItemObj);
                }

                // Re-render the entire UI
                render();
            });

            // Populate items inside this tier
            tier.items.forEach(item => {
                itemsDiv.appendChild(createItemCard(item, tier.id));
            });

            row.appendChild(labelDiv);
            row.appendChild(itemsDiv);
            tierContainerEl.appendChild(row);
        }

        // ---- Render Unassigned Pool (with drop zone to move items back) ----
        unassignedPoolEl.innerHTML = '';
        unassignedItems.forEach(item => {
            const card = createItemCard(item, null, true);
            card.setAttribute('draggable', 'true');
            card.addEventListener('dragstart', handleDragStart);
            card.addEventListener('dragend', (e) => {
                card.classList.remove('dragging');
            });
            unassignedPoolEl.appendChild(card);
        });

        // Allow dropping items INTO the unassigned pool (to remove from tiers)
        const unassignedContainer = document.getElementById('unassignedPool');
        if (unassignedContainer) {
            // Remove previous listeners to avoid duplicates (but we can re-set)
            // We'll just attach new ones; but to be clean we clone? Not necessary.
            unassignedContainer.removeEventListener('dragover', unassignedDragOver);
            unassignedContainer.removeEventListener('drop', unassignedDrop);
            unassignedContainer.addEventListener('dragover', unassignedDragOver);
            unassignedContainer.addEventListener('drop', unassignedDrop);
        }

        // Update the file counter display
        updateFileCounter();
    }

    // Separate handlers for unassigned drop zone
    function unassignedDragOver(e) {
        e.preventDefault();
    }

    function unassignedDrop(e) {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        if (!draggedId) return;

        let itemObj = null;
        let sourceTierIndex = -1;
        let sourceItemIndex = -1;

        // Find item in any tier
        for (let t = 0; t < tiers.length; t++) {
            const idx = tiers[t].items.findIndex(it => it.id === draggedId);
            if (idx !== -1) {
                itemObj = tiers[t].items[idx];
                sourceTierIndex = t;
                sourceItemIndex = idx;
                break;
            }
        }

        if (itemObj) {
            // Remove from tier and add to unassigned
            tiers[sourceTierIndex].items.splice(sourceItemIndex, 1);
            unassignedItems.push(itemObj);
            render();
        }
    }

    // ---------- CREATE A DRAGGABLE ITEM CARD (visual element) ----------
    function createItemCard(item, parentTierId, isFromUnassigned = false) {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'tier-item';
        cardDiv.setAttribute('draggable', 'true');
        cardDiv.dataset.itemId = item.id;

        // Drag start handler
        cardDiv.addEventListener('dragstart', handleDragStart);
        cardDiv.addEventListener('dragend', (e) => {
            cardDiv.classList.remove('dragging');
        });

        // Image element
        const img = document.createElement('img');
        img.src = item.imageUrl;
        img.className = 'item-img';
        img.alt = item.name;
        img.onerror = () => {
            // Fallback if image fails to load
            img.src = 'https://via.placeholder.com/64/3a4a3a?text=img';
        };

        // Name label
        const nameSpan = document.createElement('span');
        nameSpan.className = 'item-name';
        nameSpan.textContent = item.name.length > 18 ? item.name.slice(0, 15) + '…' : item.name;

        // Delete button (remove item completely)
        const delBtn = document.createElement('button');
        delBtn.textContent = '✖';
        delBtn.className = 'delete-item';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Remove item from wherever it exists (tiers or unassigned)
            let removed = false;
            // Check unassigned first
            const unIdx = unassignedItems.findIndex(i => i.id === item.id);
            if (unIdx !== -1) {
                unassignedItems.splice(unIdx, 1);
                removed = true;
            } else {
                // Check all tiers
                for (let t = 0; t < tiers.length; t++) {
                    const idx = tiers[t].items.findIndex(i => i.id === item.id);
                    if (idx !== -1) {
                        tiers[t].items.splice(idx, 1);
                        removed = true;
                        break;
                    }
                }
            }
            if (removed) render();
        });

        cardDiv.appendChild(img);
        cardDiv.appendChild(nameSpan);
        cardDiv.appendChild(delBtn);
        return cardDiv;
    }

    // ---------- GLOBAL DRAG START HANDLER ----------
    function handleDragStart(e) {
        const card = e.target.closest('.tier-item');
        if (!card) return;
        const itemId = card.dataset.itemId;
        if (itemId) {
            e.dataTransfer.setData('text/plain', itemId);
            e.dataTransfer.effectAllowed = 'move';
            card.classList.add('dragging');
        }
    }

    // ---------- ADD IMAGES FROM USER UPLOAD ----------
    function addImagesFromFiles(files) {
        if (!files || files.length === 0) return;

        const validFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
        if (validFiles.length === 0) {
            alert('Please select valid image files (PNG, JPG, GIF, etc.).');
            return;
        }

        let loadedCount = 0;
        const newItems = [];

        validFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const imageDataUrl = ev.target.result;
                let baseName = file.name.split('.')[0];
                // Trim long names
                if (baseName.length > 20) baseName = baseName.slice(0, 17) + '...';
                newItems.push({
                    id: generateUniqueId(),
                    name: baseName || 'Custom Image',
                    imageUrl: imageDataUrl
                });
                loadedCount++;
                if (loadedCount === validFiles.length) {
                    // All images processed: add to unassigned pool
                    unassignedItems.push(...newItems);
                    render();
                    // Reset file input value so same file can be re-uploaded if needed
                    if (fileInputEl) fileInputEl.value = '';
                }
            };
            reader.onerror = () => {
                console.warn('Failed to read file:', file.name);
                loadedCount++;
                if (loadedCount === validFiles.length && fileInputEl) fileInputEl.value = '';
            };
            reader.readAsDataURL(file);
        });
    }

    // Update the file counter / total items hint
    function updateFileCounter() {
        if (fileCounterSpan) {
            const totalItems = unassignedItems.length + tiers.reduce((sum, tier) => sum + tier.items.length, 0);
            fileCounterSpan.textContent = `📁 ${totalItems} items total`;
        }
    }

    // ---------- EXPORT / DOWNLOAD FULL TIER LIST AS HTML ----------
    function downloadTierlistSnapshot() {
        // Capture current state for export
        const exportData = {
            tiers: JSON.parse(JSON.stringify(tiers)),
            unassigned: JSON.parse(JSON.stringify(unassignedItems))
        };

        const exportHtml = generateExportHTML(exportData);
        const blob = new Blob([exportHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tierlist_export_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Generate standalone HTML for the current tierlist state
    function generateExportHTML(state) {
        const { tiers: exportTiers, unassigned: exportUnassigned } = state;

        let tiersHtml = '';
        for (let tier of exportTiers) {
            tiersHtml += `
                <div class="tier-row">
                    <div class="tier-label">${escapeHtml(tier.label)}</div>
                    <div class="tier-items">
                        ${tier.items.map(item => `
                            <div class="item-card">
                                <img class="item-img" src="${escapeHtml(item.imageUrl)}" onerror="this.src='https://via.placeholder.com/64'">
                                <div class="item-name">${escapeHtml(item.name)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        const unassignedHtml = exportUnassigned.map(item => `
            <div class="item-card">
                <img class="item-img" src="${escapeHtml(item.imageUrl)}" onerror="this.src='https://via.placeholder.com/64'">
                <div class="item-name">${escapeHtml(item.name)}</div>
            </div>
        `).join('');

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>TierMaker - Exported Tier List</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    background: linear-gradient(145deg, #1a2a3a, #0f1a24);
                    font-family: 'Segoe UI', Roboto, sans-serif;
                    padding: 2rem;
                    min-height: 100vh;
                }
                .container {
                    max-width: 1300px;
                    margin: 0 auto;
                    background: rgba(30,35,45,0.9);
                    border-radius: 2rem;
                    padding: 2rem;
                    box-shadow: 0 20px 35px rgba(0,0,0,0.4);
                }
                h1 {
                    font-size: 2rem;
                    background: linear-gradient(135deg, #F9F3E2, #FFD966);
                    background-clip: text;
                    -webkit-background-clip: text;
                    color: transparent;
                    margin-bottom: 1.5rem;
                }
                .tier-row {
                    display: flex;
                    background: #1f272f;
                    border-radius: 1.2rem;
                    margin-bottom: 0.75rem;
                    overflow: hidden;
                }
                .tier-label {
                    width: 100px;
                    background: #2c3a44;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 2rem;
                    font-weight: bold;
                    color: white;
                }
                .tier-items {
                    flex: 1;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    padding: 12px;
                    background: #18202a;
                }
                .item-card {
                    background: #2e3b2c;
                    border-radius: 1rem;
                    padding: 0.5rem;
                    text-align: center;
                    width: 90px;
                    box-shadow: 0 2px 6px black;
                }
                .item-img {
                    width: 64px;
                    height: 64px;
                    object-fit: contain;
                    border-radius: 12px;
                }
                .item-name {
                    font-size: 0.7rem;
                    color: #f5e7c8;
                    margin-top: 5px;
                }
                .unassigned-section {
                    margin-top: 2rem;
                    background: #151e26;
                    border-radius: 1.5rem;
                    padding: 1rem;
                }
                .section-title {
                    color: #ffd966;
                    font-weight: bold;
                    margin-bottom: 1rem;
                    font-size: 1.2rem;
                }
                .unassigned-grid {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 12px;
                }
                footer {
                    text-align: center;
                    margin-top: 2rem;
                    color: #7e8c9e;
                    font-size: 0.7rem;
                }
            </style>
        </head>
        <body>
        <div class="container">
            <h1>📋 TIERMAKER EXPORT</h1>
            ${tiersHtml}
            <div class="unassigned-section">
                <div class="section-title">📦 Unassigned Items</div>
                <div class="unassigned-grid">
                    ${unassignedHtml || '<div style="color:#aaa;">No unassigned items</div>'}
                </div>
            </div>
            <footer>Exported from TierMaker Interactive Tool</footer>
        </div>
        </body>
        </html>`;
    }

    // ---------- INITIALIZE APPLICATION ----------
    function init() {
        // Get DOM references
        tierContainerEl = document.getElementById('tierContainer');
        unassignedPoolEl = document.getElementById('unassignedPool');
        fileInputEl = document.getElementById('imageUpload');
        downloadBtn = document.getElementById('downloadBtn');
        fileCounterSpan = document.getElementById('fileCounter');

        if (!tierContainerEl || !unassignedPoolEl) {
            console.error('Critical DOM elements missing!');
            return;
        }

        // Start with no preset images
        tiers.forEach(tier => { tier.items = []; });
        unassignedItems = [];
        render();

        // Attach event listeners
        if (fileInputEl) {
            fileInputEl.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    addImagesFromFiles(e.target.files);
                } else {
                    updateFileCounter();
                }
            });
        }

        if (downloadBtn) {
            downloadBtn.addEventListener('click', downloadTierlistSnapshot);
        }

        // Initial render
        render();
    }

    // Start the app when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();