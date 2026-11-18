// Applies the saved light/dark preference before first paint (external file: the CSP forbids inline scripts).
(function () {
  try {
    var t = localStorage.getItem("cul:theme");
    if (t === '"light"' || t === "light") {
      document.documentElement.setAttribute("data-theme", "light");
      document.querySelector('meta[name="theme-color"]') && document.querySelector('meta[name="theme-color"]').setAttribute("content", "#000000");
    }
  } catch (e) {
    /* storage unavailable: keep the default dark theme */
  }
})();
