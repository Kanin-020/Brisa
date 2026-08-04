export type Os = "linux" | "windows" | "macos" | "android" | "other";
export type Arch = "x64" | "arm64" | "x86" | "other";

export interface Platform {
  os: Os;
  arch: Arch;
  /** Manifest asset key, e.g. "linux-x64". */
  key: string;
  isAndroid: boolean;
}

export function detectPlatform(): Platform {
  let os: Os = "other";
  const p = process.platform;
  if (p === "linux") {
    // Android via Termux exposes TERMUX_VERSION / PREFIX.
    const isAndroid =
      !!process.env.TERMUX_VERSION ||
      !!process.env.TERMUX_APP__DEX_PATH ||
      /android/i.test(process.env.ANDROID_ROOT ?? "");
    os = isAndroid ? "android" : "linux";
  } else if (p === "win32") {
    os = "windows";
  } else if (p === "darwin") {
    os = "macos";
  }

  let arch: Arch = "other";
  const a: string = process.arch;
  if (a === "x64") arch = "x64";
  else if (a === "arm64" || a === "aarch64") arch = "arm64";
  else if (a === "ia32" || a === "x32") arch = "x86";

  const key = os === "android" ? "android" : `${os}-${arch}`;
  return { os, arch, key, isAndroid: os === "android" };
}
