import type { NextConfig } from "next";

const repository = process.env.GITHUB_REPOSITORY ?? "";
const [repositoryOwner = "", repositoryName = ""] = repository.split("/");
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true" && Boolean(repositoryName);
const isUserOrOrganizationSite = repositoryName.toLowerCase().endsWith(".github.io");
const fallbackBasePath = isGitHubPagesBuild && !isUserOrOrganizationSite ? `/${repositoryName}` : "";
const basePath = process.env.PAGES_BASE_PATH !== undefined
  ? (process.env.PAGES_BASE_PATH === "/" ? "" : process.env.PAGES_BASE_PATH.replace(/\/$/, ""))
  : fallbackBasePath;
const siteUrl = process.env.PAGES_SITE_URL || (isGitHubPagesBuild
  ? `https://${repositoryOwner}.github.io${basePath}`
  : "http://localhost:3000");

const nextConfig: NextConfig = {
  output: "export",
  assetPrefix: basePath,
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_SITE_URL: siteUrl,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  },
};

export default nextConfig;
