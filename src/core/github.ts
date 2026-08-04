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

export async function getLatestRelease(cfg: AppConfig, repo: string): Promise<ReleaseInfo> {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "port-hub",
      ...(cfg.githubToken ? { Authorization: `Bearer ${cfg.githubToken}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status} for ${repo} (${url}). Add GITHUB_TOKEN to config to raise the rate limit.`);
  }
  const data = (await res.json()) as {
    tag_name?: string;
    name?: string;
    published_at?: string;
    assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>;
  };
  return {
    tag: data.tag_name ?? "unknown",
    name: data.name ?? data.tag_name ?? "unknown",
    publishedAt: data.published_at ?? "",
    assets: (data.assets ?? [])
      .filter((a) => a.name && a.browser_download_url)
      .map((a) => ({ name: a.name!, url: a.browser_download_url!, size: a.size ?? 0 })),
  };
}

export function pickAsset(release: ReleaseInfo, pattern: string): ReleaseAsset | null {
  return release.assets.find((a) => matchGlob(pattern, a.name)) ?? null;
}
