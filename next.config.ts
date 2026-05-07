import os from "node:os";
import type { NextConfig } from "next";

function getAllowedDevOrigins() {
  const origins = new Set<string>(["localhost", "127.0.0.1"]);

  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const iface of interfaces || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        origins.add(iface.address);
      }
    }
  }

  return [...origins];
}

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  allowedDevOrigins: getAllowedDevOrigins(),
};

export default nextConfig;
