import type { NextConfig } from "next";

const repository = process.env.GITHUB_REPOSITORY ?? "";
const [repositoryOwner = "", repositoryName = ""] = repository.split("/");
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true" && Boolean(repositoryName);
const isUserOrOrganizationSite = repositoryName.toLowerCase().endsWith(".github.io");
const basePath = isGitHubPagesBuild && !isUserOrOrganizationSite ? `/${repositoryName}` : "";
const siteUrl = isGitHubPagesBuild
  ? `https://${repositoryOwner}.github.io${basePath}`
  : "http://localhost:3000";

const nextConfig: NextConfig = {
  output: "export",
  assetPrefix: basePath,
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_SITE_URL: siteUrl,
  },
};

export default nextConfig;
