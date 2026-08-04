import vinext from "vinext";
import { defineConfig } from "vite";

const githubRepositoryName = (process.env.GITHUB_REPOSITORY ?? "").split("/")[1] ?? "";
const fallbackBasePath = process.env.GITHUB_ACTIONS === "true" && githubRepositoryName && !githubRepositoryName.toLowerCase().endsWith(".github.io")
  ? `/${githubRepositoryName}`
  : "";
const pagesBasePath = process.env.PAGES_BASE_PATH !== undefined
  ? (process.env.PAGES_BASE_PATH === "/" ? "" : process.env.PAGES_BASE_PATH)
  : fallbackBasePath;
const githubPagesBase = `${pagesBasePath.replace(/\/$/, "")}/`;

export default defineConfig({
  base: githubPagesBase,
  plugins: [vinext()],
});
