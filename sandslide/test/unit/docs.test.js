'use strict';
// Guards the launch documents: the privacy page must stay standalone (no external assets) and keep the
// placeholders/links the launch checklist depends on; the store listing must respect Google Play's field
// limits and its own "what not to write" rules; the checklists must keep the identifiers other docs cite.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const chars = (s) => Array.from(s).length;   // Play counts characters, CJK included

test('privacy.html is standalone, bilingual and keeps the required placeholders and links', () => {
  const html = read('www/privacy.html');
  assert.match(html, /^<!doctype html>/i);
  assert.ok(html.includes('Privacy Policy / 隱私權政策'));
  assert.ok(html.includes('{{DEVELOPER_NAME}}') && html.includes('{{CONTACT_EMAIL}}'), 'literal placeholders');
  assert.ok(html.includes('2026-11-01'), 'effective date');
  assert.ok(html.includes('https://policies.google.com/technologies/partner-sites'));
  // zh-TW section comes before the English one
  const zh = html.indexOf('<section id="zh" lang="zh-Hant-TW">');
  const en = html.indexOf('<section id="en" lang="en">');
  assert.ok(zh > 0 && en > zh);
  // no external assets: no scripts, stylesheets, images, fonts or CSS urls
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<link\b/i);
  assert.doesNotMatch(html, /<img\b/i);
  assert.doesNotMatch(html, /url\(/i);
  assert.doesNotMatch(html, /@import/i);
  assert.doesNotMatch(html, /\bsrc=/i);
  // every link is one of the allowed targets
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const allowed = /^(#|\.\/$|mailto:\{\{CONTACT_EMAIL\}\}$|https:\/\/policies\.google\.com\/|https:\/\/chungtr9527\.github\.io\/)/;
  for (const h of hrefs) assert.match(h, allowed, 'unexpected link ' + h);
  // dark theme tokens
  assert.ok(html.includes('#0F1233') && html.includes('#F4F5FA'));
  assert.doesNotMatch(html, /REPLACE/);
});

const LIMITS = { title: 30, short: 80, full: 4000, whatsnew: 500 };
const BANNED = [/tetris/i, /block\s*blast/i, /俄羅斯方塊/, /hungry studio/i];

test('store-listing.md fields respect Play limits in both languages and avoid third-party trademarks', () => {
  const md = read('docs/store-listing.md');
  const blocks = {};
  for (const m of md.matchAll(/```text (\w+):([\w-]+)\n([\s\S]*?)\n```/g)) blocks[m[1] + ':' + m[2]] = m[3];
  for (const field of Object.keys(LIMITS)) {
    for (const lang of ['en-US', 'zh-TW']) {
      const key = field + ':' + lang;
      assert.ok(blocks[key], 'missing block ' + key);
      const text = blocks[key];
      assert.ok(chars(text) <= LIMITS[field], `${key} is ${chars(text)} chars > ${LIMITS[field]}`);
      for (const re of BANNED) assert.doesNotMatch(text, re, key + ' mentions a third-party trademark');
    }
  }
  // Play metadata policy: no promotional words, emoji or ALL CAPS in the title
  for (const lang of ['en-US', 'zh-TW']) {
    const title = blocks['title:' + lang];
    assert.doesNotMatch(title, /\b(free|best|#1|new|top)\b/i);
    assert.doesNotMatch(title, /[\u{1F300}-\u{1FAFF}!]/u);
  }
  assert.equal(blocks['title:en-US'], 'Sandslide: Block Puzzle');
  assert.equal(blocks['title:zh-TW'], '流沙方塊：傾斜方塊消除益智');
  // the six screenshot captions from the plan, both languages
  for (const cap of ['卡住了？翻轉它。', 'Stuck? Tilt it.', '方塊像流沙一樣滑落', 'Blocks slide like sand.',
    '一次翻轉消 3 線：流沙 ×3！', '3 lines in one Tilt: SANDSLIDE ×3!', '公平亂數，絕不發死牌', 'Fair random. Never rigged.',
    '沒有計時器 · 離線可玩', 'No timer. Plays offline.', '每日流沙，和朋友比分', 'Daily Slide. Beat your friends.']) {
    assert.ok(md.includes(cap), 'missing caption ' + cap);
  }
});

test('launch-checklist.md keeps the identifiers the rest of the pipeline relies on', () => {
  const md = read('docs/launch-checklist.md');
  for (const s of ['sandslide_and_banner_bottom', 'sandslide_and_inter_gameover', 'sandslide_and_rw_rescue', 'sandslide_and_rw_tilt',
    'ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD',
    'google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0',
    'android/app/src/main/res/values/strings.xml', 'www/js/ads-ids.prod.js',
    'https://chungtr9527.github.io/-/sandslide/www/privacy.html', 'https://chungtr9527.github.io/-/sandslide/www/',
    'https://play.google.com/apps/testing/io.github.chungtr9527.sandslide',
    'keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000',
    'US$25', 'US$100', '12 位', '14 天', 'API 36']) {
    assert.ok(md.includes(s), 'missing ' + s);
  }
  assert.ok(md.indexOf('## §0') < md.indexOf('## §1'), '§0 comes first');
});

test('tester-guide.md and growth-playbook.md carry the links and the single tuning knob', () => {
  const guide = read('docs/tester-guide.md');
  assert.ok(guide.includes('https://play.google.com/apps/testing/io.github.chungtr9527.sandslide'));
  assert.ok(guide.includes('複製診斷資料') && guide.includes('{{FEEDBACK_FORM_URL}}'));
  const growth = read('docs/growth-playbook.md');
  assert.ok(growth.includes('chargeGrowth') && growth.includes('https://chungtr9527.github.io/sandslide/'));
  for (const v of ['10', '15', '20']) assert.ok(growth.includes('**' + v), 'knob value ' + v);
});
