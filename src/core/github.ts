import type { AppConfig } from "./config";
import { matchGlob } from "./glob";

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface ReleaseInfo {
  tag: string;
  name: string;
  publishedAt: string;
  assets: ReleaseAsset[];
}

interface RawRelease {
  tag_name?: string;
  name?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>;
}

function ghHeaders(cfg: AppConfig): Record<string, string> {
  return {
    "User-Agent": "brisa",
    ...(cfg.githubToken ? { Authorization: `Bearer ${cfg.githubToken}` } : {}),
  };
}

function parseRelease(data: RawRelease): ReleaseInfo {
  return {
    tag: data.tag_name ?? "unknown",
    name: data.name ?? data.tag_name ?? "unknown",
    publishedAt: data.published_at ?? "",
    assets: (data.assets ?? [])
      .filter((a) => a.name && a.browser_download_url)
      .map((a) => ({ name: a.name!, url: a.browser_download_url!, size: a.size ?? 0 })),
  };
}

/**
 * Última release de un repo. Con `allowPrerelease` (solo el self-update de la
 * propia app), si /releases/latest devuelve 404 —no hay ninguna release
 * estable: todas son pre-release o drafts— cae a la lista completa y usa la
 * más reciente publicada. Los ports mantienen el comportamiento actual: 404
 * significa "sin release estable" y no se ofrecen pre-releases como update.
 */
export async function getLatestRelease(
  cfg: AppConfig,
  repo: string,
  opts: { allowPrerelease?: boolean } = {},
): Promise<ReleaseInfo> {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const res = await fetch(url, { headers: ghHeaders(cfg) });
  if (res.status === 404 && opts.allowPrerelease) {
    return getLatestReleaseFallback(cfg, repo);
  }
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status} for ${repo} (${url}). Add GITHUB_TOKEN to config to raise the rate limit.`);
  }
  return parseRelease((await res.json()) as RawRelease);
}

/** Última release publicada (la API las ordena de más reciente a más antigua), saltando drafts. */
async function getLatestReleaseFallback(cfg: AppConfig, repo: string): Promise<ReleaseInfo> {
  const url = `https://api.github.com/repos/${repo}/releases?per_page=5`;
  const res = await fetch(url, { headers: ghHeaders(cfg) });
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status} for ${repo} (${url}). Add GITHUB_TOKEN to config to raise the rate limit.`);
  }
  const data = (await res.json()) as RawRelease[];
  const rel = data.find((r) => !r.draft);
  if (!rel) {
    throw new Error(`No releases found for ${repo}.`);
  }
  return parseRelease(rel);
}

export function pickAsset(release: ReleaseInfo, pattern: string): ReleaseAsset | null {
  return release.assets.find((a) => matchGlob(pattern, a.name)) ?? null;
}
