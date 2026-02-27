import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@evolu/common",
    "@evolu/react",
    "@evolu/react-web",
    "@evolu/sqlite-wasm",
    "@evolu/web",
  ],
};

export default nextConfig;
