'use strict';
// Guards the Android project + icon pipeline: scripts/export-icons.js helpers (pure), the committed resources/*.png sizes,
// capacitor.config.json, and the hand edits inside android/ that the release gates and AdMob depend on.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { KINDS, DENSITIES, LAYERS, ADAPTIVE_ICON_XML, pngSize, decodeDataUrl } = require('../../scripts/export-icons');

const ROOT = path.join(__dirname, '..', '..');
const ANDROID = 'android/app/src/main';
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

// Signature + IHDR chunk is all pngSize looks at.
function fakePng(w, h) {
  const b = Buffer.alloc(33, 0);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}

test('pngSize reads width/height from the IHDR chunk and rejects anything else', () => {
  assert.deepEqual(pngSize(fakePng(1024, 1024)), { width: 1024, height: 1024 });
  assert.deepEqual(pngSize(fakePng(2732, 7)), { width: 2732, height: 7 });
  assert.throws(() => pngSize(Buffer.alloc(4)), /short/);
  assert.throws(() => pngSize(Buffer.from('definitely not a png file, no sir.')), /signature/);
  const wrongChunk = fakePng(1, 1); wrongChunk.write('IDAT', 12, 'latin1');
  assert.throws(() => pngSize(wrongChunk), /IHDR/);
  assert.throws(() => pngSize('string'), /short/);
});

test('decodeDataUrl accepts only base64 PNG data URLs', () => {
  const png = fakePng(2, 3);
  assert.deepEqual(decodeDataUrl('data:image/png;base64,' + png.toString('base64')), png);
  assert.throws(() => decodeDataUrl('data:image/jpeg;base64,AAAA'), /data URL/);
  assert.throws(() => decodeDataUrl(undefined), /data URL/);
});

test('resources/ holds the five @capacitor/assets inputs at the documented sizes', () => {
  assert.deepEqual(Object.keys(KINDS), ['icon-only', 'icon-foreground', 'icon-background', 'splash', 'splash-dark']);
  for (const kind of Object.keys(KINDS)) {
    const buf = fs.readFileSync(path.join(ROOT, 'resources', kind + '.png'));
    assert.deepEqual(pngSize(buf), { width: KINDS[kind][0], height: KINDS[kind][1] }, kind);
  }
});

test('capacitor.config.json matches plan section 4.4', () => {
  const c = JSON.parse(read('capacitor.config.json'));
  assert.equal(c.appId, 'io.github.chungtr9527.sandslide');
  assert.equal(c.appName, 'Sandslide');
  assert.equal(c.webDir, 'www');
  assert.equal(c.server.androidScheme, 'https');
  assert.equal(c.android.backgroundColor, '#0F1233');
  assert.deepEqual(c.plugins.SystemBars, { insetsHandling: 'css', initialViewportFitValueHint: 'cover', style: 'DARK' });
});

test('AndroidManifest declares the AdMob app id, locks portrait and keeps the template configChanges', () => {
  const m = read(`${ANDROID}/AndroidManifest.xml`);
  assert.match(m, /<application[^>]*>[\s\S]*<meta-data[^>]*android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"[^>]*android:value="@string\/admob_app_id"[^>]*\/>[\s\S]*<\/application>/);
  assert.match(m, /<activity[^>]*android:name="\.MainActivity"[^>]*>/);
  assert.match(m, /<activity[^>]*android:screenOrientation="portrait"[^>]*>/);
  assert.match(m, /<activity[^>]*android:configChanges="orientation\|keyboardHidden\|keyboard\|screenSize\|locale\|smallestScreenSize\|screenLayout\|uiMode\|navigation\|density"[^>]*>/);
  assert.match(m, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(m, /android:roundIcon="@mipmap\/ic_launcher_round"/);
  assert.match(m, /<uses-permission android:name="android\.permission\.INTERNET" \/>/);
});

test('MainActivity stays the plain BridgeActivity template (no EdgeToEdge)', () => {
  const j = read(`${ANDROID}/java/io/github/chungtr9527/sandslide/MainActivity.java`);
  assert.match(j, /^package io\.github\.chungtr9527\.sandslide;/m);
  assert.match(j, /public class MainActivity extends BridgeActivity \{\}/);
  assert.doesNotMatch(j, /EdgeToEdge/);
});

test('strings: live AdMob id placeholder in main, Google sample id only in debug, zh-TW label', () => {
  const main = read(`${ANDROID}/res/values/strings.xml`);
  assert.match(main, /<string name="app_name">Sandslide<\/string>/);
  assert.match(main, /<string name="title_activity_main">Sandslide<\/string>/);
  assert.match(main, /<string name="package_name">io\.github\.chungtr9527\.sandslide<\/string>/);
  assert.match(main, /<string name="custom_url_scheme">io\.github\.chungtr9527\.sandslide<\/string>/);
  assert.match(main, /<string name="admob_app_id">ca-app-pub-[^<]+~[^<]+<\/string>/);
  assert.doesNotMatch(main, /3940256099942544/, 'the live strings must never carry the Google sample app id');
  const debug = read('android/app/src/debug/res/values/strings.xml');
  assert.match(debug, /<string name="admob_app_id">ca-app-pub-3940256099942544~3347511713<\/string>/);
  assert.doesNotMatch(debug, /app_name/, 'the debug source set only overrides the AdMob id');
  const tw = read(`${ANDROID}/res/values-zh-rTW/strings.xml`);
  assert.match(tw, /<string name="app_name">流沙方塊<\/string>/);
  assert.match(tw, /<string name="title_activity_main">流沙方塊<\/string>/);
});

test('launch theme paints the splash window background in the brand colour', () => {
  const s = read(`${ANDROID}/res/values/styles.xml`);
  assert.match(s, /<style name="AppTheme\.NoActionBarLaunch" parent="Theme\.SplashScreen">[\s\S]*?<item name="windowSplashScreenBackground">#0F1233<\/item>[\s\S]*?<\/style>/);
  assert.match(s, /<item name="android:background">@drawable\/splash<\/item>/);
});

test('build.gradle: version from -P properties, committed debug keystore, env-only release signing', () => {
  const g = read('android/app/build.gradle');
  assert.match(g, /applicationId "io\.github\.chungtr9527\.sandslide"/);
  assert.match(g, /namespace = "io\.github\.chungtr9527\.sandslide"/);
  assert.match(g, /hasProperty\('appVersionCode'\)/);
  assert.match(g, /hasProperty\('appVersionName'\)/);
  assert.match(g, /: '1'\)/, 'versionCode defaults to 1');
  assert.match(g, /: '0\.1\.0'/, 'versionName defaults to 0.1.0');
  assert.match(g, /versionCode appVersionCode/);
  assert.match(g, /versionName appVersionName/);
  assert.match(g, /signingConfigs \{[\s\S]*debug \{[\s\S]*storeFile file\('debug\.keystore'\)[\s\S]*keyAlias 'androiddebugkey'/);
  for (const v of ['KEYSTORE_PATH', 'KEYSTORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD']) assert.match(g, new RegExp(`System\\.getenv\\('${v}'\\)`), v);
  assert.match(g, /buildTypes \{[\s\S]*debug \{\s*signingConfig signingConfigs\.debug/);
  assert.match(g, /release \{[\s\S]*minifyEnabled false/);
  assert.match(g, /apply from: 'capacitor\.build\.gradle'/);
  assert.ok(exists('android/app/debug.keystore'), 'android/app/debug.keystore is committed');
  assert.match(read('android/gradle.properties'), /^org\.gradle\.jvmargs=-Xmx4g$/m);
  assert.match(read('android/gradle.properties'), /^android\.useAndroidX=true$/m);
  assert.ok(fs.statSync(path.join(ROOT, 'android/gradlew')).mode & 0o111, 'gradlew must be executable');
});

test('launcher icons and splash drawables exist for every density; adaptive layers are 108 dp with no extra inset', () => {
  const size = (p) => pngSize(fs.readFileSync(path.join(ROOT, p)));
  assert.deepEqual(DENSITIES, { ldpi: 81, mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 });
  for (const d of Object.keys(DENSITIES)) {
    for (const f of ['ic_launcher', 'ic_launcher_round']) assert.doesNotThrow(() => size(`${ANDROID}/res/mipmap-${d}/${f}.png`), `${d}/${f}`);
    // written by "node scripts/export-icons.js --android" (@capacitor/assets 4.0.0 emits these at the 48 dp legacy sizes)
    for (const f of Object.values(LAYERS)) assert.deepEqual(size(`${ANDROID}/res/mipmap-${d}/${f}`), { width: DENSITIES[d], height: DENSITIES[d] }, `${d}/${f}`);
  }
  assert.deepEqual(size(`${ANDROID}/res/mipmap-xxxhdpi/ic_launcher.png`), { width: 192, height: 192 }, '48 dp legacy icon at xxxhdpi');
  assert.deepEqual(size(`${ANDROID}/res/mipmap-xxxhdpi/ic_launcher_round.png`), { width: 192, height: 192 });
  for (const d of ['', '-port-xxxhdpi', '-land-xxxhdpi', '-night', '-port-night-xxxhdpi']) assert.ok(exists(`${ANDROID}/res/drawable${d}/splash.png`), `drawable${d}/splash.png`);
  assert.deepEqual(size(`${ANDROID}/res/drawable-port-xxxhdpi/splash.png`), { width: 1280, height: 1920 });
  assert.doesNotMatch(ADAPTIVE_ICON_XML, /<inset/);
  for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) assert.equal(read(`${ANDROID}/res/mipmap-anydpi-v26/${f}`), ADAPTIVE_ICON_XML, f);
});

test('www/tools/icon.html is noindex, carries the icon SVG and the export API', () => {
  const h = read('www/tools/icon.html');
  assert.match(h, /<meta name="robots" content="noindex">/);
  assert.match(h, /window\.exportIcon = function \(kind, size\)/);
  assert.match(h, /<svg xmlns='http:\/\/www\.w3\.org\/2000\/svg' viewBox='0 0 512 512'>/);
  assert.match(h, /rotate\(12 256 256\)/);
  assert.match(h, /FG_SCALE = 0\.78/);
  assert.match(h, /SPLASH_FRAC = 0\.2/);
  assert.doesNotMatch(h, /\?\.|\?\?/, 'ES2017-safe (no optional chaining / nullish coalescing)');
});
