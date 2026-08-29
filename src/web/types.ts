/**
 * Shared types and interfaces for the Brisa web frontend.
 */

// ── i18n ──

export interface I18nTranslation {
  [key: string]: string | I18nHelpStep[];
}

export interface I18nHelpStep {
  icon: string;
  title: string;
  text: string;
}

export interface I18nAPI {
  t: (key: string, ...args: (string | number)[]) => string;
  tRaw: (key: string) => string | I18nHelpStep[] | undefined;
  setLocale: (loc: string) => void;
  locale: () => string;
  onLocaleChange: (fn: (locale: string) => void) => () => void;
  availableLocales: () => string[];
  localeLabel: (loc: string) => string;
  ready: () => Promise<void>;
}

declare global {
  interface Window {
    __i18n?: I18nAPI;
  }
}

// ── Port / Manifest / ROM ──

export interface PortManifest {
  id: string;
  name: string;
  game: string;
  description: string;
  repo?: string;
}

export interface RomSlot {
  name: string;
  matched: boolean;
  matchedBy?: 'hash' | 'gameid' | 'name';
  romName?: string;
  required: boolean;
}

export interface UpdateInfo {
  installed: string;
  latest: string;
  notes?: string;
}

export interface Port {
  manifest: PortManifest;
  installed: boolean;
  version?: string;
  hasRom: boolean;
  updateAvailable: boolean;
  updateInfo?: UpdateInfo;
  roms: RomSlot[];
  mods: string[];
  linkedMods: string[];
  modsRoot: string;
}

export interface RomFile {
  name: string;
  sha1: string;
  size: number;
  path: string;
}

export interface RomMatch {
  rom: RomFile;
  manifest: PortManifest;
  requirement: { name: string };
}

// ── Task ──

export interface Task {
  id: string;
  type: string;
  status: 'running' | 'done' | 'cancelled' | 'error';
  label: string;
  stage: string;
  pct: number;
  result?: Record<string, unknown>;
  error?: string;
}

export interface ActiveTask {
  task: Task;
  portId: string | null;
  onDone?: () => void;
}

// ── App State ──

export interface AppState {
  ports: Port[];
  scan: {
    roms: RomFile[];
    matches: RomMatch[];
  };
  platform?: { key: string };
  self?: {
    current: string;
    latest: string;
    available: boolean;
    supported: boolean;
    notes?: string;
  };
  cfg: {
    romsDir: string;
    romsDirs?: string[];
  };
}

// ── Component Props ──

export interface ToastProps {
  message: string;
  kind?: 'ok' | 'warn' | 'error';
  duration?: number;
  onClick?: () => void;
  onClose?: () => void;
}

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm?: () => void;
  children?: preact.ComponentChildren;
}

export interface ProgressBarProps {
  percent?: number;
  stage?: string;
  label?: string;
  indeterminate?: boolean;
  cancellable?: boolean;
  taskId?: string;
  onCancel?: (taskId: string) => void;
}

export interface ModChipProps {
  name: string;
  linked: boolean;
  portId: string;
  onToggle?: (portId: string, mod: string, linked: boolean) => void;
}

export interface SearchInputProps {
  placeholder?: string;
  value?: string;
  onSearch?: (query: string) => void;
  onClear?: () => void;
}

export interface RomCardProps {
  name: string;
  sha1: string;
  size: number;
  path: string;
  matchedPorts?: string[];
  onDelete?: (path: string, name: string) => void;
}

export interface PortCardProps {
  port: Port;
  busy?: boolean;
  task?: Task | null;
  onInstall?: (port: Port) => void;
  onUpdate?: (port: Port) => void;
  onUpdateAndPlay?: (port: Port) => void;
  onLaunch?: (port: Port) => void;
  onUninstall?: (port: Port) => void;
  onOpenFolder?: (port: Port) => void;
  onOpenMods?: (port: Port) => void;
  onToggleMod?: (portId: string, mod: string, linked: boolean) => void;
  onCancelTask?: (taskId: string) => void;
}
