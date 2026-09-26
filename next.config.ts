import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Person 1's runtime (src/agent, src/harness, src/tools) uses NodeNext-style
  // ".js" extensions in relative imports that actually point at ".ts" sources.
  // Next.js's bundler does not rewrite those by default, so teach it to resolve
  // a ".js" import to the matching ".ts"/".tsx" file. Non-invasive: no source
  // files change, and the vitest/node toolchains are unaffected.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
