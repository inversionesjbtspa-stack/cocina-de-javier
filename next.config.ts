import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/hr/accountant-data": ["./src/templates/rrhh/datos-sueldos-contador.xlsx"]
  },
  reactStrictMode: true,
  typedRoutes: true
};

export default nextConfig;
