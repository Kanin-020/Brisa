import { GITHUB_API_BASE, USER_AGENT } from './constants';
import type { AppConfig } from './config';
import { matchGlob } from './glob';
import { normalizeVersion } from './version';

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface ReleaseInfo {
  tag: string;
  name: string;
  /** Notas de la release (cuerpo del release de GitHub, markdown). */
  body: string;
  publishedAt: string;
  assets: ReleaseAsset[];
}

interface RawRelease {
  tag_name?: string;
  name?: string;
  body?: string | null;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>;
}

function githubHeaders(config: AppConfig): Record<string, string> {
  return {
    'User-Agent': USER_AGENT,
    ...(config.githubToken ? { Authorization: `Bearer ${config.githubToken}` } : {}),
  };
}

function parseRelease(data: RawRelease): ReleaseInfo {
  return {
    tag: normalizeVersion(data.tag_name) ?? 'unknown',
    name: data.name ?? data.tag_name ?? 'unknown',
    body: data.body ?? '',
    publishedAt: data.published_at ?? '',
    assets: (data.assets ?? [])
      .filter((asset) => asset.name && asset.browser_download_url)
      .map((asset) => ({
        name: asset.name ?? '',
        url: asset.browser_download_url ?? '',
        size: asset.size ?? 0,
      })),
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
  config: AppConfig,
  repo: string,
  opts: { allowPrerelease?: boolean } = {},
): Promise<ReleaseInfo> {
  const url = `${GITHUB_API_BASE}/repos/${repo}/releases/latest`;
  const res = await fetch(url, { headers: githubHeaders(config) });
  if (res.status === 404 && opts.allowPrerelease) {
    return getLatestReleaseFallback(config, repo);
  }
  if (!res.ok) {
    throw new Error(
      `GitHub API error ${res.status} for ${repo} (${url}). Add GITHUB_TOKEN to config to raise the rate limit.`,
    );
  }
  return parseRelease((await res.json()) as RawRelease);
}

/** Última release publicada (la API las ordena de más reciente a más antigua), saltando drafts. */
async function getLatestReleaseFallback(config: AppConfig, repo: string): Promise<ReleaseInfo> {
  const url = `${GITHUB_API_BASE}/repos/${repo}/releases?per_page=5`;
  const res = await fetch(url, { headers: githubHeaders(config) });
  if (!res.ok) {
    throw new Error(
      `GitHub API error ${res.status} for ${repo} (${url}). Add GITHUB_TOKEN to config to raise the rate limit.`,
    );
  }
  const data = (await res.json()) as RawRelease[];
  const release = data.find((item) => !item.draft);
  if (!release) {
    throw new Error(`No releases found for ${repo}.`);
  }
  return parseRelease(release);
}

export function pickAsset(release: ReleaseInfo, pattern: string): ReleaseAsset | null {
  return release.assets.find((asset) => matchGlob(pattern, asset.name)) ?? null;
}
