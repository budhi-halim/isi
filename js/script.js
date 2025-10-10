// ---------------------------
// App grid script
// ---------------------------

document.addEventListener("DOMContentLoaded", async () => {
  const appGrid = document.getElementById("appGrid");
  const darkModeToggle = document.getElementById("darkModeToggle");
  const darkToggleContainer = document.querySelector(".darkmode-toggle");

  // Load app list JSON
  async function loadAppList() {
    try {
      const res = await fetch("data/app_list.json", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch app list");
      const arr = await res.json();
      return arr;
    } catch (err) {
      console.error("Error loading app list", err);
      return [];
    }
  }

  function initialsFromName(name) {
    if (!name) return "";
    const words = name.trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 3).map(w => w[0].toUpperCase()).join('');
  }

  function createAppCard(app, index) {
    const item = document.createElement("div");
    item.className = "app-item";
    item.setAttribute("role", "listitem");
    item.setAttribute("data-index", index);

    const link = document.createElement("a");
    link.className = "app-link";
    link.href = app.url || "#";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", app.name || `App ${index + 1}`);

    const spanInit = document.createElement("span");
    spanInit.className = "initials";
    spanInit.textContent = initialsFromName(app.name);

    link.appendChild(spanInit);

    const label = document.createElement("div");
    label.className = "app-label";
    label.textContent = app.name || "";

    item.appendChild(link);
    item.appendChild(label);

    // Keyboard accessibility
    item.tabIndex = 0;
    item.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        link.click();
      }
    });

    return item;
  }

  // Render grid
  function renderGrid(list) {
    appGrid.innerHTML = "";
    if (!Array.isArray(list) || list.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No apps available.";
      appGrid.appendChild(empty);
      return;
    }
    list.forEach((app, idx) => {
      const card = createAppCard(app, idx);
      appGrid.appendChild(card);
    });
  }

  // Dark mode handling
  const colorSchemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
  function applySystemPreference() {
    const isDark = colorSchemeMedia.matches;
    const toggleVisible =
      darkToggleContainer &&
      window.getComputedStyle(darkToggleContainer).display !== "none";

    if (!toggleVisible) {
      document.body.classList.toggle("dark", isDark);
      if (darkModeToggle) darkModeToggle.checked = isDark;
    }
  }

  function initDarkToggle() {
    if (colorSchemeMedia.matches) {
      document.body.classList.add("dark");
      if (darkModeToggle) darkModeToggle.checked = true;
    } else {
      document.body.classList.remove("dark");
      if (darkModeToggle) darkModeToggle.checked = false;
    }

    if (colorSchemeMedia.addEventListener)
      colorSchemeMedia.addEventListener("change", applySystemPreference);
    else if (colorSchemeMedia.addListener)
      colorSchemeMedia.addListener(applySystemPreference);

    window.addEventListener("resize", applySystemPreference);

    if (darkModeToggle) {
      darkModeToggle.addEventListener("change", () => {
        document.body.classList.toggle("dark", darkModeToggle.checked);
      });
    }
  }

  // Main flow
  const list = await loadAppList();
  renderGrid(list);
  initDarkToggle();
});