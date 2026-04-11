const os = require("os");

/** First non-internal IPv4 (Mac LAN). Fallback 127.0.0.1 for CI / no network. */
function lanIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      const v4 = net.family === "IPv4" || net.family === 4;
      if (v4 && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

module.exports = ({ config }) => {
  const envUrl = (process.env.EXPO_PUBLIC_API_URL || "").trim();
  const apiBaseUrl = envUrl.replace(/\/$/, "") || `http://${lanIPv4()}:8000`.replace(/\/$/, "");

  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      apiBaseUrl,
    },
  };
};
