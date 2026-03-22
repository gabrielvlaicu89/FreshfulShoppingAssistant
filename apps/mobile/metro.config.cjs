const path = require("node:path");
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");
const { resolve: resolveMetroRequest } = require("metro-resolver");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const reactNativeScreensRoot = path.resolve(workspaceRoot, "node_modules/react-native-screens/lib/commonjs");

function resolveReactNativeScreensModule(moduleName) {
  if (moduleName === "react-native-screens") {
    return path.join(reactNativeScreensRoot, "index.js");
  }

  if (moduleName.startsWith("react-native-screens/")) {
    const relativeModulePath = moduleName.slice("react-native-screens/".length);

    return path.join(
      reactNativeScreensRoot,
      relativeModulePath.endsWith(".js") ? relativeModulePath : `${relativeModulePath}.js`
    );
  }

  return null;
}

const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    unstable_enableSymlinks: true,
    nodeModulesPaths: [path.resolve(projectRoot, "node_modules"), path.resolve(workspaceRoot, "node_modules")],
    resolveRequest(context, moduleName, platform) {
      const reactNativeScreensModule = resolveReactNativeScreensModule(moduleName);

      if (reactNativeScreensModule) {
        return {
          type: "sourceFile",
          filePath: reactNativeScreensModule
        };
      }

      return resolveMetroRequest(context, moduleName, platform);
    }
  }
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);