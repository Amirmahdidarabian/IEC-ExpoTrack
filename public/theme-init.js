(function () {
  try {
    var stored = window.localStorage.getItem("iec-theme");
    document.documentElement.dataset.theme = stored === "light" ? "light" : "dark";
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
})();
