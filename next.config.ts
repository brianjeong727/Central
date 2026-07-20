import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  serverExternalPackages: ["pdfjs-dist"],
  images: {
    // Allow next/image to optimize public Supabase Storage objects (all public
    // buckets: profile-images, announcement-images, home-slides, etc.). Scoped
    // to the public object path so signed/private URLs are never proxied.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "wgqpnilaokfipocsugqo.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
