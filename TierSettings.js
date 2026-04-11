function addRow(tierName = "New tier", defaultColor = "lightslategray") {
  const mainContainer = document.querySelector("main");
  const newRow = document.createElement("div");
  newRow.className = "row";

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
    (hexColor) => {
      tooltip.parentNode.style.backgroundColor = hexColor;
    },
    (hexColor) => {
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

  const unassignedContainer = mainContainer.querySelector('.unassigned-container');
  if (unassignedContainer) {
    mainContainer.insertBefore(newRow, unassignedContainer);
  } else {
    mainContainer.appendChild(newRow);
  }

  attachTierLabelKeydownListener(tierLabelDiv);

  initializeDragula();
  saveTierColors();
  try { updateTierCounts(countsAreShown()); } catch (e) {}
  try { updateTierCounts(countsAreShown()); } catch (e) {}
}

function openRowMenu(element, event) {
  event.stopPropagation();

  document.querySelectorAll('.row-menu').forEach(menu => menu.remove());

  const row = element.closest(".row");
  const currentIndex = Array.from(row.parentNode.children).indexOf(row);

  const menu = document.createElement("div");
  menu.className = "row-menu";

  const addAboveBtn = document.createElement("button");
  addAboveBtn.className = "row-menu-btn";
  addAboveBtn.textContent = "Add Tier Above";
  addAboveBtn.onclick = () => {
    row.parentNode.insertBefore(createNewRow(), row);
    initializeDragula();
    saveTierColors();
    menu.remove();
  };

  const addBelowBtn = document.createElement("button");
  addBelowBtn.className = "row-menu-btn";
  addBelowBtn.textContent = "Add Tier Below";
  addBelowBtn.onclick = () => {
    row.parentNode.insertBefore(createNewRow(), row.nextSibling);
    initializeDragula();
    saveTierColors();
    menu.remove();
  };

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "row-menu-btn delete";
  deleteBtn.textContent = "Delete Tier";
  deleteBtn.onclick = () => {
    if (confirm("Are you sure you want to delete this tier? All images in it will be moved to the uncategorized section.")) {
      deleteRow(element);
      menu.remove();
    }
  };

  const orderCheckboxContainer = document.createElement("div");
  orderCheckboxContainer.style.display = "flex";
  orderCheckboxContainer.style.alignItems = "center";
  orderCheckboxContainer.style.padding = "8px 12px";
  orderCheckboxContainer.style.borderTop = "1px solid #ddd";

  const orderCheckbox = document.createElement("input");
  orderCheckbox.type = "checkbox";
  orderCheckbox.id = "order-on-platform-" + currentIndex;
  orderCheckbox.style.marginRight = "8px";
  orderCheckbox.checked = tierOrderingStates[currentIndex] === true;
  orderCheckbox.onchange = () => {
    toggleTierOrdering(currentIndex, orderCheckbox.checked);
  };

  const orderLabel = document.createElement("label");
  orderLabel.htmlFor = orderCheckbox.id;
  orderLabel.textContent = "Order on platform";
  orderLabel.style.cursor = "pointer";
  orderLabel.style.userSelect = "none";
  orderLabel.style.color = "white";

  orderCheckboxContainer.appendChild(orderCheckbox);
  orderCheckboxContainer.appendChild(orderLabel);

  const limitCheckboxContainer = document.createElement("div");
  limitCheckboxContainer.style.display = "flex";
  limitCheckboxContainer.style.alignItems = "center";
  limitCheckboxContainer.style.padding = "8px 12px";
  limitCheckboxContainer.style.borderTop = "1px solid #ddd";

  const limitCheckbox = document.createElement("input");
  limitCheckbox.type = "checkbox";
  limitCheckbox.id = "limit-to-10-" + currentIndex;
  limitCheckbox.style.marginRight = "8px";
  limitCheckbox.checked = tierLimitStates[currentIndex] === true;
  limitCheckbox.onchange = () => {
    toggleTierLimit(currentIndex, limitCheckbox.checked);
  };

  const limitLabel = document.createElement("label");
  limitLabel.htmlFor = limitCheckbox.id;
  limitLabel.textContent = "Limit to 10";
  limitLabel.style.cursor = "pointer";
  limitLabel.style.userSelect = "none";
  limitLabel.style.color = "white";

  limitCheckboxContainer.appendChild(limitCheckbox);
  limitCheckboxContainer.appendChild(limitLabel);

  menu.appendChild(addAboveBtn);
  menu.appendChild(addBelowBtn);
  menu.appendChild(orderCheckboxContainer);
  menu.appendChild(limitCheckboxContainer);
  menu.appendChild(deleteBtn);

  const cogRect = element.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.right = (window.innerWidth - cogRect.right) + "px";

  document.body.appendChild(menu);

  const menuRect = menu.getBoundingClientRect();
  const menuHeight = menuRect.height;
  const spaceBelow = window.innerHeight - cogRect.bottom;

  if (spaceBelow < menuHeight + 10) {
    menu.style.bottom = (window.innerHeight - cogRect.top) + "px";
    menu.style.top = "auto";
  } else {
    menu.style.top = cogRect.bottom + "px";
    menu.style.bottom = "auto";
  }

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
    (hexColor) => {
      tooltip.parentNode.style.backgroundColor = hexColor;
    },
    (hexColor) => {
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

  attachTierLabelKeydownListener(tierLabelDiv);

  return newRow;
}

function deleteRow(element) {
  const row = element.closest(".row");
  const imagesBar = document.getElementById("images-bar");

  const tierContainer = row.children[1];
  const imagesInTier = Array.from(tierContainer.querySelectorAll(".image"));

  imagesInTier.forEach(img => {
    if (img && imagesBar) {
      imagesBar.appendChild(img);
    }
  });

  const tooltips = row.querySelectorAll(".tooltip");
  tooltips.forEach(tooltip => {
    const colorPickerDiv = tooltip.querySelector(".color-picker");
    if (colorPickerDiv && colorPickerDiv._pickr) {
      colorPickerDiv._pickr.destroy();
      pickrInstances = pickrInstances.filter(p => p !== colorPickerDiv._pickr);
    }
  });

  row.remove();

  initializeDragula();
  saveTierColors();
  saveImagePositions();
}

function moveRow(button, direction) {
  const row = button.closest(".row");
  const parent = row.parentNode;
  const rows = Array.from(parent.children).filter((child) => child.classList.contains("row"));
  const currentIndex = rows.indexOf(row);
  const newIndex = currentIndex + direction;

  if (newIndex < 0 || newIndex >= rows.length) {
    return;
  }

  const referenceRow = direction === 1 ? rows[newIndex].nextElementSibling : rows[newIndex];
  parent.insertBefore(row, referenceRow);
  initializeDragula();
  saveTierColors();
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

  if (currentUser) {
    saveTierListToFirebase();
  }
}

function loadTierColors() {
  getSetting("tierColors").then(storedTiers => {
    if (storedTiers) {
      const rows = document.querySelectorAll(".row");
      const defaultTierCount = rows.length;

      storedTiers.forEach((tier, index) => {
        if (rows[index]) {
          const tierLabel = rows[index].querySelector(".tier-label");
          const tierNameElement = tierLabel.querySelector("p");
          tierNameElement.textContent = tier.name;
          tierLabel.style.backgroundColor = tier.color;
        }
      });

      for (let i = defaultTierCount; i < storedTiers.length; i++) {
        const tier = storedTiers[i];
        addRow(tier.name, tier.color);
      }
    }
  }).catch(err => {
    console.error('Failed to load tier colors:', err);
  });
}

function attachTierLabelKeydownListener(tierLabel) {
  tierLabel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        e.preventDefault();
        document.execCommand('insertLineBreak');
        setTimeout(() => {
          saveTierColors();
        }, 0);
      } else {
        e.preventDefault();
        saveTierColors();
        tierLabel.blur();
      }
    }
  });

  tierLabel.addEventListener('blur', () => {
    saveTierColors();
  });
}

function createColorPicker(colorPicker, onPreview, onSave, defaultColor) {
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

  let originalColor = defaultColor;
  let lastAction = "none";

  pickr.on("change", (color) => {
    const hexColor = color ? color.toHEXA().toString() : "";
    lastAction = "preview";
    onPreview(hexColor);
  });

  pickr.on("save", (color) => {
    const hexColor = color ? color.toHEXA().toString() : "";
    lastAction = "save";
    originalColor = hexColor;
    onSave(hexColor);
    pickr.hide();
  });

  pickr.on("cancel", () => {
    lastAction = "cancel";
    onPreview(originalColor);
    pickr.hide();
  });

  pickr.on("hide", () => {
    if (lastAction === "preview") {
      onPreview(originalColor);
    }
    lastAction = "none";
  });

  colorPicker._pickr = pickr;
  pickrInstances.push(pickr);
}

document.querySelectorAll(".tooltip").forEach((tooltip) => {
  const tierLabel = tooltip.parentNode;
  const defaultColor = tierLabel.style.backgroundColor || defaultColors[0];
  const colorPicker = tooltip.querySelector(".color-picker");

  createColorPicker(
    colorPicker,
    (hexColor) => {
      tierLabel.style.backgroundColor = hexColor;
    },
    (hexColor) => {
      tierLabel.style.backgroundColor = hexColor;
      saveTierColors();
    },
    defaultColor
  );
});
