function confirmDeleteTier() {
  return confirm("Are you sure you want to delete this tier? All images in it will be moved to the uncategorized section.");
}

function confirmDeleteTierList() {
  const confirmDelete = confirm("Are you sure you want to delete the entire tier list? This will remove all images from the tier list and Cloudinary. This action cannot be undone.");
  if (!confirmDelete) {
    return false;
  }

  return confirm("This will permanently delete ALL images from Cloudinary. Are you absolutely sure?");
}

function confirmDeleteImage() {
  return confirm("Are you sure you want to delete this image? This will also remove it from Cloudinary.");
}

function promptDeleteTier(action) {
  if (confirmDeleteTier()) {
    action();
  }
}

function promptDeleteImage(action) {
  if (confirmDeleteImage()) {
    action();
  }
}
