/**
 * i18n — Frontend translation module for Brisa.
 *
 * Translations live in src/web/lang/<locale>.json (served as /lang/<locale>.json).
 * To add a new language:
 *   1. Create src/web/lang/fr.json with all the same keys translated.
 *   2. That's it — no JavaScript changes needed.
 *
 * The locale is auto-detected from the browser's Accept-Language
 * (navigator.language) and persisted to localStorage. The user can
 * override it via the language switcher in the UI.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "brisa-locale";

  /** Minimal fallback if en.json fails to load. */
  const FALLBACK_EN = {
    "brand.title": "Brisa",
    "brand.tagline": "Native PC port manager",
    "btn.refresh": "⟳ Refresh",
    "stat.roms": "ROMs",
    "stat.installed": "Installed ports",
    "stat.mods": "Mods",
    "stat.updates": "Updates",
    "ports.title": "📦 Ports",
    "ports.searchPlaceholder": "Search game or port…",
    "ports.empty": "No ports found",
    "ports.viewCards": "Card view",
    "ports.viewList": "List view",
    "roms.title": "💾 Detected ROMs",
    "roms.copyHash": "Copy hash",
    "port.updateAndPlay": "Update and play",
    "mod.empty": "No mods. Drop your mods in",
    "mod.openAll": "Open mods ({0})",
    "mod.modalTitle": "Mods of {0}",
    "mod.close": "Close",
    "toast.copied": "✓ Hash copied to clipboard",
    "toast.updateAvailable": "⚠ {0}: new version {2} available (installed: {1}). Click to update",
    "loading": "Loading…",
    "lang.en": "English",
    "lang.es": "Español",
  };

  /** Loaded translations: { localeCode: { key: string } } */
  const _translations = {};

  /** Currently active locale code, e.g. "en" or "es". */
  let _locale = "en";

  /** Subscribers to locale changes: (locale) => void. */
  const _subs = new Set();

  /** Whether initial loading is done. */
  let _ready = false;

  /** Queue of locale changes that arrived before ready. */
  let _pendingLocale = null;

  /**
   * Fetch a translation JSON file from /lang/<locale>.json.
   */
  async function fetchLocale(loc) {
    try {
      const res = await fetch(`/lang/${loc}.json`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Detect the best locale from browser settings, falling back to "en".
   */
  function detectLocale() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return stored;
    } catch {
      // localStorage may be unavailable
    }
    const lang = (navigator.language || "").slice(0, 2).toLowerCase();
    return lang;
  }

  /**
   * Get the current locale.
   */
  function getLocale() {
    return _locale;
  }

  /**
   * Interpolate {0}, {1}, etc. in a string with the given arguments.
   */
  function interpolate(str, ...args) {
    if (!str || args.length === 0) return str;
    return str.replace(/\{(\d+)\}/g, (_, idx) => {
      const i = parseInt(idx, 10);
      return i < args.length ? String(args[i]) : `{${idx}}`;
    });
  }

  /**
   * Translate a key. Accepts optional interpolation arguments.
   *
   *   t("brand.title")              → "Brisa"
   *   t("ports.hint", 5)            → "5 ports in registry"
   *   t("toast.installed", "SoH", "1.2.3") → "✓ SoH v1.2.3 installed"
   */
  function t(key, ...args) {
    const dict = _translations[_locale] || _translations.en;
    let val = dict ? dict[key] : undefined;
    if (val === undefined) {
      // Fallback to English
      val = _translations.en ? _translations.en[key] : undefined;
      if (val === undefined) {
        if (typeof console !== "undefined") {
          console.warn(`[i18n] missing translation key: "${key}" for locale "${_locale}"`);
        }
        return key;
      }
    }
    return interpolate(val, ...args);
  }

  /**
   * Return all available locale codes (those that have been loaded).
   */
  function availableLocales() {
    return Object.keys(_translations);
  }

  /**
   * Get the display name of a locale in its own language.
   */
  function localeLabel(loc) {
    const key = `lang.${loc}`;
    return _translations[loc]?.[key] || loc;
  }

  /**
   * Set the locale and persist it. Notifies subscribers.
   * Safe to call before ready — the change will be queued.
   */
  function setLocale(loc) {
    if (!_translations[loc]) {
      if (!_ready) {
        _pendingLocale = loc;
      }
      return;
    }
    _locale = loc;
    try {
      localStorage.setItem(STORAGE_KEY, loc);
    } catch {
      // ignore
    }
    for (const fn of _subs) fn(loc);
  }

  /**
   * Subscribe to locale changes. Returns an unsubscribe function.
   */
  function onLocaleChange(fn) {
    _subs.add(fn);
    return () => _subs.delete(fn);
  }

  /**
   * Returns a promise that resolves when i18n is ready (all locales loaded).
   */
  function ready() {
    return _readyPromise;
  }

  let _readyPromiseResolve;

  const _readyPromise = new Promise((resolve) => {
    _readyPromiseResolve = resolve;
  });

  /**
   * Initialise: discover available locales by scanning the lang/ directory.
   * We try common locales; the first successful fetch tells us the format.
   * A more robust approach: fetch a manifest. But for simplicity, we try
   * the detected locale first, then fall back to en, then discover others
   * by checking all known .json files.
   */
  async function init() {
    const detected = detectLocale();

    // Try to load the detected locale (e.g. "es"), and always load "en" as fallback.
    const [enData, detectedData] = await Promise.all([
      fetchLocale("en"),
      detected !== "en" ? fetchLocale(detected) : Promise.resolve(null),
    ]);

    if (enData) _translations.en = enData;
    else _translations.en = FALLBACK_EN; // hardcoded fallback
    if (detectedData) _translations[detected] = detectedData;

    // Determine the initial locale
    let initial = "en";
    if (_translations[detected]) initial = detected;
    else if (detected !== "en" && _translations.en) initial = "en";

    _locale = initial;
    _ready = true;

    // Apply any pending locale change
    if (_pendingLocale && _translations[_pendingLocale]) {
      _locale = _pendingLocale;
      _pendingLocale = null;
    }

    // Persist the resolved locale
    try {
      localStorage.setItem(STORAGE_KEY, _locale);
    } catch {
      // ignore
    }

    _readyPromiseResolve();

    // Notify subscribers
    for (const fn of _subs) fn(_locale);
  }

  // Expose globally (the app.js script loads after this one)
  window.__i18n = {
    t,
    setLocale,
    locale: getLocale,
    onLocaleChange,
    availableLocales,
    localeLabel,
    ready,
  };

  // Start initialisation
  init();
})();