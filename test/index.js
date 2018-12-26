/* eslint-env es6 */
import { promises as fs } from 'fs';
import test from 'ava';
import path from 'path';
import rimraf from 'rimraf';
import FaviconsWebpackPlugin from '..';
import denodeify from 'denodeify';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import packageJson from '../package.json';

const webpack = denodeify(require('webpack'));
const readFile = denodeify(require('fs').readFile);
const writeFile = denodeify(require('fs').writeFile);
const mkdirp = denodeify(require('mkdirp'));

let outputId = 0;
const LOGO_PATH = path.resolve(__dirname, 'fixtures/logo.png');

rimraf.sync(path.resolve(__dirname, '../dist'));

function baseWebpackConfig (plugin) {
  return {
    devtool: 'eval',
    entry: path.resolve(__dirname, 'fixtures/entry.js'),
    output: {
      path: path.resolve(__dirname, '../dist', 'test-' + outputId++)
    },
    plugins: [].concat(plugin)
  };
}

async function readFiles (directory) {
  async function readFilesInner (result, base, rel) {
    const filenames = await fs.readdir(path.join(base, rel));
    for (const filename of filenames) {
      const relpath = path.join(rel, filename);
      const fullpath = path.join(base, relpath);
      const stat = await fs.stat(fullpath);
      if (stat.isDirectory()) await readFilesInner(result, base, relpath);
      else if (stat.isFile()) result[relpath] = await fs.readFile(fullpath);
      else if (stat.isSymbolicLink()) {
        result[relpath] = { link: await fs.readlink(fullpath) };
      } else result[relpath] = { type: 'unknown' };
    }
  }

  const result = {};
  await readFilesInner(result, directory, './');
  return result;
}

test('should throw error when called without arguments', async t => {
  t.plan(2);
  let plugin;
  try {
    plugin = new FaviconsWebpackPlugin();
  } catch (err) {
    t.is(err.message, 'FaviconsWebpackPlugin options are required');
  }
  t.is(plugin, undefined);
});

test('should take a string as argument', async t => {
  var plugin = new FaviconsWebpackPlugin(LOGO_PATH);
  t.is(plugin.options.logo, LOGO_PATH);
});

test('should take an object with just the logo as argument', async t => {
  var plugin = new FaviconsWebpackPlugin({ logo: LOGO_PATH });
  t.is(plugin.options.logo, LOGO_PATH);
});

test('should generate the expected default result', async t => {
  const stats = await webpack(
    baseWebpackConfig(
      new FaviconsWebpackPlugin({
        logo: LOGO_PATH
      })
    )
  );
  t.snapshot(await readFiles(stats.compilation.compiler.outputPath));
});

test('should generate a configured JSON file', async t => {
  const stats = await webpack(
    baseWebpackConfig(
      new FaviconsWebpackPlugin({
        logo: LOGO_PATH,
        emitStats: true,
        persistentCache: false,
        statsFilename: 'iconstats.json'
      })
    )
  );
  t.snapshot(await readFiles(stats.compilation.compiler.outputPath));
});

test('should work together with the html-webpack-plugin', async t => {
  const stats = await webpack(
    baseWebpackConfig([
      new FaviconsWebpackPlugin({
        logo: LOGO_PATH,
        emitStats: true,
        statsFilename: 'iconstats.json',
        persistentCache: false
      }),
      new HtmlWebpackPlugin()
    ])
  );
  t.snapshot(await readFiles(stats.compilation.compiler.outputPath));
});

test('should not recompile if there is a cache file', async t => {
  const options = baseWebpackConfig([
    new FaviconsWebpackPlugin({
      logo: LOGO_PATH,
      emitStats: false,
      persistentCache: true
    }),
    new HtmlWebpackPlugin()
  ]);

  // Bring cache file in place
  const cacheFile = 'icons-366a3768de05f9e78c392fa62b8fbb80/.cache';
  const cacheFileExpected = path.resolve(
    __dirname,
    'fixtures/expected/from-cache/',
    cacheFile
  );
  const cacheFileDist = path.resolve(__dirname, options.output.path, cacheFile);
  await mkdirp(path.dirname(cacheFileDist));
  const cache = JSON.parse(await readFile(cacheFileExpected));
  cache.version = packageJson.version;
  await writeFile(cacheFileDist, JSON.stringify(cache));

  const stats = await webpack(options);
  t.snapshot(await readFiles(stats.compilation.compiler.outputPath));
});
