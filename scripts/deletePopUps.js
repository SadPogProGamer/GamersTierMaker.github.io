// deletePopUps.js
// Confirmation helpers for deleting tiers, images, and full tier lists.
// Wording matches the rewritten app behavior: local deletion always happens,
// remote Cloudinary deletion only happens if a backend delete endpoint exists.

function hasRemoteDeleteEndpoint() {
  return !!(
    typeof CLOUDINARY_CONFIG !== "undefined" &&
    CLOUDINARY_CONFIG &&
    typeof CLOUDINARY_CONFIG.deleteEndpoint === "string" &&
    CLOUDINARY_CONFIG.deleteEndpoint.trim() !== ""
  );
}

function confirmDeleteTier() {
  return confirm(
    "Are you sure you want to delete this tier? All images in it will be moved to the unassigned section."
  );
}

function confirmDeleteTierList() {
  const firstMessage = hasRemoteDeleteEndpoint()
    ? "Are you sure you want to delete the entire tier list? This will remove all images from the page, local storage, and synced save data. It will also request remote Cloudinary deletion where possible. This action cannot be undone."
    : "Are you sure you want to delete the entire tier list? This will remove all images from the page, local storage, and synced save data. Remote Cloudinary deletion is not configured, so uploaded files may still remain in Cloudinary. This action cannot be undone.";

  const confirmed = confirm(firstMessage);
  if (!confirmed) {
    return false;
  }

  const secondMessage = hasRemoteDeleteEndpoint()
    ? "This may also delete uploaded images from Cloudinary through your backend. Are you absolutely sure?"
    : "This will permanently clear the tier list from this app, but remote Cloudinary files may remain. Are you absolutely sure?";

  return confirm(secondMessage);
}

function confirmDeleteImage() {
  const message = hasRemoteDeleteEndpoint()
    ? "Are you sure you want to delete this image? It will be removed from the tier list and the app will also try to delete it remotely from Cloudinary."
    : "Are you sure you want to delete this image? It will be removed from the tier list and local data, but remote Cloudinary deletion is not configured.";

  return confirm(message);
}

function promptDeleteTier(action) {
  if (confirmDeleteTier() && typeof action === "function") {
    action();
  }
}

function promptDeleteImage(action) {
  if (confirmDeleteImage() && typeof action === "function") {
    action();
  }
}
