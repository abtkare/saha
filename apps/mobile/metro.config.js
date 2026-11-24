// التطبيق خارج مساحة pnpm (يُثبَّت بـ npm وحده)، ويقرأ الحزمتين المشتركتين من مصدرهما مباشرة.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const root = path.resolve(__dirname, '../..');
const config = getDefaultConfig(__dirname);
const shared = {
  '@saha/shared': path.join(root, 'packages/shared/src/index.ts'),
  '@saha/ui': path.join(root, 'packages/ui/src/index.ts'),
};

config.watchFolders = [path.join(root, 'packages/shared/src'), path.join(root, 'packages/ui/src')];
config.resolver.nodeModulesPaths = [path.join(__dirname, 'node_modules')];
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (shared[moduleName]) return { type: 'sourceFile', filePath: shared[moduleName] };
  return upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
