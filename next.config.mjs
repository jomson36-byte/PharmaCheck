/** @type {import('next').NextConfig} */
const isGitHubPages = process.env.GITHUB_PAGES === "true";
const githubPagesBasePath = "/PharmaCheck";

const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", "192.168.100.108", "192.168.100.110"],
  ...(isGitHubPages
    ? {
        output: "export",
        basePath: githubPagesBasePath,
        assetPrefix: githubPagesBasePath,
        trailingSlash: true,
      }
    : {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                {
                  key: "Cross-Origin-Opener-Policy",
                  value: "same-origin-allow-popups",
                },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
