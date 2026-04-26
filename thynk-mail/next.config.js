/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
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
