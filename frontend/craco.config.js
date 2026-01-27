const path = require("path");

module.exports = {
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  devServer: (devServerConfig) => {
    // Removed Emergent visual-edits middleware setup
    devServerConfig.static = {
      directory: path.join(__dirname, "public"),
    };

    // Ensure standard hot reloading and history fallback
    devServerConfig.historyApiFallback = true;
    devServerConfig.hot = true;

    return devServerConfig;
  },
};

