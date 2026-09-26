const path = require("node:path");
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const workspaceRoot = path.resolve(__dirname, "../..");
const appPath = path.relative(workspaceRoot, __dirname);
// Solo el servidor de desarrollo (`react-native start`). En el bundle de release
// la raíz del servidor cambia la ruta con que se guardan las imágenes, pero no la
// que se busca en ejecución, y las imágenes no aparecen.
const devServer = process.argv.includes("start");
const config = {
  watchFolders: [workspaceRoot],
  server: devServer
    ? {
        // Con la raíz del proyecto en apps/mobile, los bundles diferidos de dependencias
        // del monorepo salen como /../../node_modules/... y el cliente HTTP los normaliza
        // mal. Se sirve desde la raíz y se redirige el bundle principal que pide Android.
        unstable_serverRoot: workspaceRoot,
        // El servidor HTTP pasa la ruta; el de recarga en caliente, la URL completa.
        rewriteRequestUrl: (url) =>
          url.replace(/^((?:https?:\/\/[^/]+)?)\/index\.(bundle|map)/, `$1/${appPath}/index.$2`),
      }
    : {},
  resolver: {
    nodeModulesPaths: [
      path.join(__dirname, "node_modules"),
      path.join(workspaceRoot, "node_modules"),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
