import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // bcryptjs chỉ chạy phía server, không bundle vào route
  serverExternalPackages: ["bcryptjs"],
};

export default nextConfig;
