// ModalScale.js
// Scales the Game Review modal (and anything else using --modal-scale)
// based on the user's actual screen resolution, not just the browser
// viewport. The modal's pixel values in styles.css were tuned by eye at
// 2560x1440, so that resolution is the 1.0x baseline. Higher-res screens
// (e.g. 4K at 3840x2160) get a proportionally larger scale so the modal
// doesn't look tiny; lower-res screens get a mildly smaller scale so it
// doesn't dominate the window.
//
// This intentionally runs as an inline, non-deferred script placed first
// in <head>, so --modal-scale is set on the root element before any CSS
// using it is painted.

(function () {
  var BASELINE_WIDTH = 2560; // resolution the current sizing was tuned for
  var MIN_SCALE = 0.85;
  var MAX_SCALE = 1.7;
  var GLOBAL_SCALE_MULTIPLIER = 1.1; // overall +10% bump on top of the resolution-based scale

  function getScreenWidth() {
    // window.screen.width reflects the actual monitor resolution,
    // independent of how large/small the browser window itself is.
    if (window.screen && window.screen.width) {
      return window.screen.width;
    }
    return window.innerWidth;
  }

  function computeModalScale() {
    var screenWidth = getScreenWidth();
    var scale = screenWidth / BASELINE_WIDTH;

    if (scale < MIN_SCALE) scale = MIN_SCALE;
    if (scale > MAX_SCALE) scale = MAX_SCALE;

    return scale * GLOBAL_SCALE_MULTIPLIER;
  }

  function applyModalScale() {
    try {
      var scale = computeModalScale();
      document.documentElement.style.setProperty("--modal-scale", scale.toFixed(3));
    } catch (err) {
      // If anything goes wrong, styles.css already has a --modal-scale: 1
      // fallback on :root, so the modal still renders at the 1440p baseline.
      console.error("[ModalScale] Failed computing modal scale.", err);
    }
  }

  applyModalScale();

  // Re-apply if the window is resized (covers dragging the window to a
  // different monitor with a different resolution, or resizing on a
  // desktop browser).
  window.addEventListener("resize", applyModalScale);
})();
