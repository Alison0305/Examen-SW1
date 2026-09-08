import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@examen-sw1/uml-core"],
  webpack(config) {
    config.resolve.alias["@examen-sw1/uml-core"] = new URL("../uml-core/src/index.ts", import.meta.url).pathname;
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
