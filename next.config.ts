import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf usa pdfjs, que trae features de Node y se rompe si el bundler lo
  // reescribe. Se carga con require nativo en el servidor.
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
