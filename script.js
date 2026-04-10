import { CONFIG } from "./config.js";

const tiersContainer = document.getElementById("tiers");
const pool = document.getElementById("pool");
const uploadInput = document.getElementById("upload");

// Supabase init
const supabase = window.supabase.createClient(
  CONFIG.supabase.url,
  CONFIG.supabase.anonKey
);

// Default tiers
const defaultTiers = [
  { name: "S", color: "#ff595e" },
  { name: "A", color: "#ff924c" },
  { name: "B", color: "#ffca3a" },
  { name: "C", color: "#8ac926" },
  { name: "D", color: "#1982c4" }
];

function createTier(name, color) {
  const tier = document.createElement("div");
  tier.className = "tier";

  const label = document.createElement("div");
  label.className = "tier-label";
  label.style.background = color;
  label.textContent = name;

  const items = document.createElement("div");
  items.className = "tier-items";

  const actions = document.createElement("div");
  actions.className = "tier-actions";
  actions.innerHTML = '<span class="tier-icon">⚙</span><span class="tier-icon">▲</span><span class="tier-icon">▼</span>';

  items.addEventListener("dragover", e => e.preventDefault());
  items.addEventListener("drop", e => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text");
    const el = document.getElementById(id);
    items.appendChild(el);
  });

  tier.appendChild(label);
  tier.appendChild(items);
  tier.appendChild(actions);
  tiersContainer.appendChild(tier);
}

function addTier() {
  const name = prompt("Tier name?");
  if (!name) return;
  createTier(name, "#666");
}

// Create item
function createItem(src) {
  const img = document.createElement("img");
  img.src = src;
  img.className = "item";
  img.draggable = true;
  img.id = "item-" + Math.random();

  img.addEventListener("dragstart", e => {
    e.dataTransfer.setData("text", img.id);
  });

  return img;
}

// 🔥 Upload to Cloudinary
async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CONFIG.cloudinary.uploadPreset);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CONFIG.cloudinary.cloudName}/image/upload`,
    {
      method: "POST",
      body: formData
    }
  );

  const data = await res.json();
  return data.secure_url;
}

// Handle upload
uploadInput.addEventListener("change", async (e) => {
  const files = e.target.files;

  for (let file of files) {
    const url = await uploadToCloudinary(file);
    const item = createItem(url);
    pool.appendChild(item);
  }
});

// Save data to Supabase
async function saveData() {
  const tiers = [];

  document.querySelectorAll(".tier").forEach((tierEl, tierIndex) => {
    const name = tierEl.querySelector(".tier-label").textContent;

    tierEl.querySelectorAll(".item").forEach((item, itemIndex) => {
      tiers.push({
        image_url: item.src,
        tier: name,
        position: itemIndex
      });
    });
  });

  // Clear old data
  await supabase.from("tier_items").delete().neq("id", 0);

  // Insert new
  const { error } = await supabase.from("tier_items").insert(tiers);

  if (error) {
    console.error(error);
    alert("Save failed");
  } else {
    alert("Saved!");
  }
}

// Load data
async function loadData() {
  const { data, error } = await supabase
    .from("tier_items")
    .select("*")
    .order("position");

  if (error) {
    console.error(error);
    return;
  }

  data.forEach(item => {
    let tierEl = [...document.querySelectorAll(".tier")]
      .find(t => t.querySelector(".tier-label").textContent === item.tier);

    if (!tierEl) {
      createTier(item.tier, "#666");
      tierEl = [...document.querySelectorAll(".tier")]
        .find(t => t.querySelector(".tier-label").textContent === item.tier);
    }

    const img = createItem(item.image_url);
    tierEl.querySelector(".tier-items").appendChild(img);
  });
}

// Pool drop
pool.addEventListener("dragover", e => e.preventDefault());
pool.addEventListener("drop", e => {
  e.preventDefault();
  const id = e.dataTransfer.getData("text");
  const el = document.getElementById(id);
  pool.appendChild(el);
});

// Init
defaultTiers.forEach(t => createTier(t.name, t.color));
loadData();

// Make save global
window.saveData = saveData;
window.addTier = addTier;
