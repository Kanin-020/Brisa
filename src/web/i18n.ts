/**
 * i18n — Frontend translation module for Brisa.
 *
 * Translations live in src/web/lang/<locale>.json (served as /lang/<locale>.json).
 * The locale is auto-detected from the browser's Accept-Language and persisted
 * to localStorage. The user can override it via the language switcher in the UI.
 */

import type { I18nAPI, I18nHelpStep } from './types';

const STORAGE_KEY = 'brisa-locale';

/** Minimal fallback if en.json fails to load. */
const FALLBACK_EN: Record<string, string | I18nHelpStep[]> = {
  'brand.title': 'Brisa',
  'brand.tagline': 'Native PC port manager',
  'btn.refresh': '⟳ Refresh',
  'btn.addRoms': '＋ Add ROMs',
  'btn.openAppFolder': '🗀 Program files',
  'btn.exportManifests': '⬆ Export manifests',
  'btn.importManifests': '⬇ Import manifests',
  'btn.updateAll': '⬆ Update all',
  'btn.updateAllHint': 'Update all ports ({0} pending)',
  'task.cancel': 'Cancel',
  'stage.start': 'Starting…',
  'stage.release': 'Checking release…',
  'stage.download': 'Downloading…',
  'stage.extract': 'Extracting…',
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.viewPorts': 'Ports view',
  'settings.viewRoms': 'ROMs view',
  'settings.viewCards': 'Cards',
  'settings.viewList': 'List',
  'settings.close': 'Close',
  'changelog.title': "What's new",
  'changelog.button': "What's new",
  'changelog.empty': 'This release has no release notes.',
  'changelog.close': 'Close',
  'notify.installDone': '✓ {0} v{1} installed',
  'notify.updateDone': '✓ {0} updated to v{1}',
  'notify.updatedAll': '✓ {0} ports updated',
  'notify.error': '✗ {0}: error',
  'stat.roms': 'ROMs',
  'stat.installed': 'Installed ports',
  'stat.mods': 'Mods',
  'stat.updates': 'Updates',
  'tabs.installed': 'Installed ports',
  'tabs.available': 'Available ports',
  'tabs.roms': 'ROMs',
  'tabs.help': 'Help',
  'ports.searchPlaceholder': 'Search game or port…',
  'ports.empty': 'No ports found',
  'ports.emptyInstalled': 'No installed ports yet',
  'ports.emptyAvailable': 'All ports are installed',
  'ports.hintInstalled': '{0} installed',
  'ports.hintAvailable': '{0} available',
  'ports.viewCards': 'Card view',
  'ports.viewList': 'List view',
  'roms.delete': 'Delete ROM',
  'roms.deleteConfirm': 'Delete "{0}" from the ROMs folder? This cannot be undone.',
  'roms.dropTitle': 'Drop ROMs here',
  'roms.dropHint': "They will be copied to Brisa's ROMs folder",
  'roms.copyHash': 'Copy hash',
  'roms.noMatch': 'No matches',
  'roms.hint': '{0} ROM↔requirement matches',
  'roms.empty': 'No ROMs yet.',
  'port.install': 'Install',
  'port.installNoRom': 'Install (no ROM)',
  'port.uninstall': 'Uninstall',
  'port.update': 'Update',
  'port.updateAndPlay': 'Update and play',
  'port.launch': '▶ Play',
  'port.romOk': 'ROM ✓',
  'port.romMissing': 'ROM ✗',
  'port.optional': '(optional)',
  'port.openFolder': '🗀 Open files',
  'port.openFolderHint': "Opens the port's folder in your file manager",
  'port.sourceHint': 'Open the repository in your browser ({0})',
  'confirm.uninstallTitle': 'Uninstall port',
  'confirm.uninstallMessage':
    'Are you sure you want to uninstall "{0}"? Saves and preserved files will be kept.',
  'confirm.cancel': 'Cancel',
  'confirm.uninstall': 'Uninstall',
  'mod.unlink': 'Unlink',
  'mod.link': 'Link',
  'mod.openAll': 'Open mods ({0})',
  'mod.addMods': '＋ Add mods',
  'mod.addModsHint': 'Open mods folder: {0}',
  'mod.modalTitle': 'Mods of {0}',
  'mod.enableAll': '✓ Enable all',
  'mod.disableAll': '✕ Disable all',
  'mod.close': 'Close',
  'toast.copied': '✓ Hash copied to clipboard',
  'toast.modsEnabledAll': '✓ {0} mods enabled',
  'toast.modsDisabledAll': '✓ {0} mods disabled',
  'toast.uploading': 'Uploading {0}',
  'toast.romsAdded': '✓ {0} ROMs added',
  'toast.romsSkipped': '⏭ {0} already exist (unchanged)',
  'toast.romDeleted': '✓ {0} deleted',
  'toast.manifestsExported': '✓ {0} manifests exported (.zip)',
  'toast.manifestsImported': '✓ {0} manifests imported',
  'toast.importError': 'Import error',
  'toast.updateAvailable':
    '⚠ {0}: new version {2} available (installed: {1}). Click to update',
  'toast.cancelled': '✕ {0}: operation cancelled',
  'toast.updatedAll': '✓ {0} ports updated',
  'toast.updatingAll': 'Updating all ports…',
  'toast.error': 'Error',
  'toast.installing': 'Installing {0}…',
  'toast.installed': '✓ {0} v{1} installed',
  'toast.uninstalled': '✓ {0} uninstalled',
  'toast.updated': '✓ {0} → {1}',
  'toast.launching': 'Launching {0}…',
  'toast.modUnlinked': 'Mod "{0}" unlinked',
  'toast.modLinked': 'Mod "{0}" linked',
  'self.version': 'Brisa v{0}',
  'self.updateBtn': '⬆ Update Brisa v{0}',
  'self.updateAvailable': 'New Brisa version available: v{0}',
  'toast.selfAvailable': '⬆ Brisa v{0} available. Click to update',
  'toast.selfUpdating': 'Downloading Brisa v{0}…',
  'toast.selfUpdated':
    '✓ Brisa v{0} ready. The app will close and reopen automatically.',
  loading: 'Loading…',
  'help.title': 'How to use Brisa',
  'help.intro':
    'Brisa installs and updates native PC ports directly from your ROMs, and adds them to Steam as non-Steam games.',
  'help.welcome': 'Welcome to Brisa!',
  'help.steps': [
    { icon: '📥', title: 'Add your ROMs', text: 'Drop your files in the ROMs tab or click "＋ Add ROMs".' },
    { icon: '🔍', title: 'Check the matches', text: 'Each ROM shows a green chip per compatible port; a red chip means no match.' },
    { icon: '⬇', title: 'Install a port', text: 'Go to Available ports, check the ROM is green (✓) and click Install.' },
    { icon: '▶', title: 'Play and update', text: 'Click Play to launch. An orange chip means an update is available.' },
    { icon: '🎮', title: 'Manage mods', text: '＋ Add mods opens the mods folder; chips enable or disable each mod.' },
    { icon: '🖥', title: 'Add ports to Steam', text: "Installed ports get a launcher in Brisa's launchers folder — add it to Steam as a non-Steam game." },
    { icon: '🗀', title: 'Open files', text: 'Open files shows the port folder; the port icon opens its repository.' },
  ],
  'help.legal': '⚠ ROMs must be obtained legally: only use copies of games you own.',
  'help.finish': "Let's go!",
  'lang.en': 'English',
  'lang.es': 'Español',
};

/** Loaded translations: { localeCode: { key: string } } */
const _translations: Record<string, Record<string, string | I18nHelpStep[]>> = {};

/** Currently active locale code, e.g. "en" or "es". */
let _locale = 'en';

/** Subscribers to locale changes. */
const _subs = new Set<(locale: string) => void>();

/** Whether initial loading is done. */
let _ready = false;

/** Queue of locale changes that arrived before ready. */
let _pendingLocale: string | null = null;

async function fetchLocale(loc: string): Promise<Record<string, string | I18nHelpStep[]> | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`/lang/${loc}.json`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, string | I18nHelpStep[]>;
  } catch {
    return null;
  }
}

function detectLocale(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    /* localStorage may be unavailable */
  }
  return (navigator.language || '').slice(0, 2).toLowerCase();
}

function interpolate(str: string, ...args: (string | number)[]): string {
  if (args.length === 0) return str;
  return str.replace(/\{(\d+)\}/g, (_, idx: string) => {
    const i = parseInt(idx, 10);
    return i < args.length ? String(args[i]) : `{${idx}}`;
  });
}

function t(key: string, ...args: (string | number)[]): string {
  const dict = _translations[_locale] ?? _translations.en;
  let val = dict ? dict[key] : undefined;
  if (val === undefined) {
    val = _translations.en ? _translations.en[key] : undefined;
    if (val === undefined) {
      console.warn(`[i18n] missing translation key: "${key}" for locale "${_locale}"`);
      return key;
    }
  }
  if (typeof val === 'string') return interpolate(val, ...args);
  return key;
}

function tRaw(key: string): string | I18nHelpStep[] | undefined {
  const dict = _translations[_locale] ?? _translations.en;
  let val = dict ? dict[key] : undefined;
  if (val === undefined) {
    val = _translations.en ? _translations.en[key] : undefined;
    if (val === undefined) val = FALLBACK_EN[key];
  }
  return val;
}

function availableLocales(): string[] {
  return Object.keys(_translations);
}

function localeLabel(loc: string): string {
  const key = `lang.${loc}`;
  const val = _translations[loc]?.[key];
  return typeof val === 'string' ? val : loc;
}

function setLocale(loc: string): void {
  if (!_translations[loc]) {
    if (!_ready) _pendingLocale = loc;
    return;
  }
  _locale = loc;
  try {
    localStorage.setItem(STORAGE_KEY, loc);
  } catch {
    /* ignore */
  }
  for (const fn of _subs) fn(loc);
}

function onLocaleChange(fn: (locale: string) => void): () => void {
  _subs.add(fn);
  return () => {
    _subs.delete(fn);
  };
}

function getLocale(): string {
  return _locale;
}

let _readyPromiseResolve: () => void;
const _readyPromise = new Promise<void>((resolve) => {
  _readyPromiseResolve = resolve;
});

async function init(): Promise<void> {
  const detected = detectLocale();

  // Always start with fallback so the app can render immediately
  _translations.en = FALLBACK_EN;

  let available = ['en'];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('/api/locales', { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as { locales?: string[] };
      if (Array.isArray(data.locales) && data.locales.length > 0) {
        available = data.locales;
      }
    }
  } catch {
    /* fallback */
  }

  if (detected !== 'en' && !available.includes(detected)) {
    available.push(detected);
  }

  // Fetch all locales in parallel, don't fail if some don't load
  const results = await Promise.allSettled(
    available.map(async (loc) => ({
      loc,
      data: await fetchLocale(loc),
    })),
  );
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.data) {
      _translations[result.value.loc] = result.value.data;
    }
  }
  // Ensure English is always present
  if (!_translations.en) _translations.en = FALLBACK_EN;

  let initial = 'en';
  if (_translations[detected]) initial = detected;
  else if (detected !== 'en' && _translations.en) initial = 'en';

  _locale = initial;
  _ready = true;

  if (_pendingLocale && _translations[_pendingLocale]) {
    _locale = _pendingLocale;
    _pendingLocale = null;
  }

  try {
    localStorage.setItem(STORAGE_KEY, _locale);
  } catch {
    /* ignore */
  }

  _readyPromiseResolve();

  for (const fn of _subs) fn(_locale);
}

// Expose globally and start init
const api: I18nAPI = {
  t,
  tRaw,
  setLocale,
  locale: getLocale,
  onLocaleChange,
  availableLocales,
  localeLabel,
  ready: () => _readyPromise,
};

window.__i18n = api;
init().catch(() => {
  // Ensure the app always renders even if i18n init fails
  if (!_ready) {
    _ready = true;
    _readyPromiseResolve();
  }
});
