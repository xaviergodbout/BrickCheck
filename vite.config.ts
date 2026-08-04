import vinext from "vinext";
import { defineConfig } from "vite";

const githubRepositoryName =
  (process.env.GITHUB_REPOSITORY ?? "").split("/")[1] ?? "";

const githubPagesBase =
  process.env.GITHUB_ACTIONS === "true" &&
  githubRepositoryName &&
  !githubRepositoryName.toLowerCase().endsWith(".github.io")
    ? `/${githubRepositoryName}/`
    : "/";

export default defineConfig({
  base: githubPagesBase,
  plugins: [vinext()],
});