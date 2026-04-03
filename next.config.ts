import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

/** 상위 폴더에 또 다른 package-lock.json이 있을 때 Next가 잘못된 루트를 잡는 경고 방지 */
const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: configDir,
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  /** 디스크 부족(ENOSPC) 시: PowerShell `$env:WEBPACK_DISABLE_CACHE="1"; npm run build` */
  webpack: (config) => {
    if (process.env.WEBPACK_DISABLE_CACHE === "1") {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
