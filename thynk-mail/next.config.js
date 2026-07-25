/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Without this, Next.js's client-side navigation cache can serve a
    // page's previously-rendered result for up to 30s (sometimes longer in
    // practice) when you navigate back to it, even though the page itself
    // is marked force-dynamic on the server. That's what was showing stale
    // open/click numbers on Dashboard/Reports after leaving and returning.
    // Setting dynamic: 0 means dynamic pages are always refetched from the
    // server on navigation instead of reusing a cached client-side copy.
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }
    config.externals = [...(config.externals || [])];
    if (isServer) {
      config.externals.push('mjml', 'nodemailer');
    }
    return config;
  },
};

module.exports = nextConfig;
