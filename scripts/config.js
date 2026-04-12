// config.js
// Frontend-safe configuration only.
// Do NOT put Cloudinary API secrets or any other private keys in this file.

// Cloudinary configuration
const CLOUDINARY_CONFIG = {
  cloudName: "dfdibdfcm",
  uploadPreset: "GamersTierMaker",
  folder: "GamerTierMaker",

  // Optional backend endpoint for secure deletes.
  // Leave as null if you do not have a backend yet.
  deleteEndpoint: null,
};

// Firebase configuration
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDPjqFmqGWUFBicEWcfzo6QfQ5fFX3cryk",
  authDomain: "gamertiermaker.firebaseapp.com",
  databaseURL: "https://gamertiermaker-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "gamertiermaker",
  storageBucket: "gamertiermaker.firebasestorage.app",
  messagingSenderId: "515771009142",
  appId: "1:515771009142:web:c485f6b63235449ff43757",
};

// Basic runtime validation so config mistakes fail loudly
(function validateFrontendConfig() {
  const cloudinaryMissing = [];
  const firebaseMissing = [];

  if (!CLOUDINARY_CONFIG || typeof CLOUDINARY_CONFIG !== "object") {
    throw new Error("CLOUDINARY_CONFIG is missing or invalid.");
  }

  if (!CLOUDINARY_CONFIG.cloudName) cloudinaryMissing.push("cloudName");
  if (!CLOUDINARY_CONFIG.uploadPreset) cloudinaryMissing.push("uploadPreset");

  if (cloudinaryMissing.length) {
    console.warn(
      `[config] Cloudinary is missing required fields: ${cloudinaryMissing.join(", ")}`
    );
  }

  if (!FIREBASE_CONFIG || typeof FIREBASE_CONFIG !== "object") {
    throw new Error("FIREBASE_CONFIG is missing or invalid.");
  }

  const requiredFirebaseFields = [
    "apiKey",
    "authDomain",
    "projectId",
    "storageBucket",
    "messagingSenderId",
    "appId",
  ];

  for (const key of requiredFirebaseFields) {
    if (!FIREBASE_CONFIG[key]) {
      firebaseMissing.push(key);
    }
  }

  if (firebaseMissing.length) {
    console.warn(
      `[config] Firebase is missing required fields: ${firebaseMissing.join(", ")}`
    );
  }

  if (
    CLOUDINARY_CONFIG.deleteEndpoint !== null &&
    typeof CLOUDINARY_CONFIG.deleteEndpoint !== "string"
  ) {
    throw new Error("CLOUDINARY_CONFIG.deleteEndpoint must be a string or null.");
  }
})();
