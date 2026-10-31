const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const JSZip = require('../../vendor/jszip.min.js');

function sectionText(ini, header, keys) {
  const chunks = String(ini || '').split(/\r?\n(?=\[[^\]]+\])/);
  return chunks.find((chunk) => {
    if (!new RegExp(`^\\[${header}\\]`, 'i').test(chunk.trim())) return false;
    if (keys == null) return true;
    return new RegExp(`^Keys:\\s*${keys}\\s*$`, 'm').test(chunk);
  }) || '';
}

test('导出 skin.ini 用生成值覆盖，并按原顺序保留生成结果里没有的参数', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ini-export-preserve-'));
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const sourceIni = [
    '[General]',
    'Name: Preserve Test',
    'Version: latest',
    'CustomGeneralFlag: keep-me',
    '',
    '[Fonts]',
    'ScorePrefix: score',
    'Combo: legacy-combo',
    'CustomFontFlag: keep-font',
    '',
    '[CatchTheBeat]',
    'HyperDash: fruit-dash',
    'HyperDashFruit: fruit',
    '',
    '[Mania]',
    'Keys: 4',
    'HitPosition: 400',
    'ColorHold: 9,9,9',
    'SpecialStyle: 1',
    'SeparateScore: 0',
    'KeyFlipWhenUpsideDown0: 1',
    'NoteFlipWhenUpsideDown1: 0',
    'LightingN: global-hit',
    'LightingN0: lane-0',
    '',
    '[Mania]',
    'Keys: 7',
    'HitPosition: 380',
    'SpecialStyle: 2'
  ].join('\r\n');
  const zip = new JSZip();
  zip.file('skin.ini', sourceIni);
  zip.file('mania-note1.png', png);
  const skinPath = path.join(tmpDir, 'preserve.osk');
  fs.writeFileSync(skinPath, await zip.generateAsync({ type: 'nodebuffer' }));

  try {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof buildExportedSkinIniText === 'function', null, { timeout: 30000 });
    await page.setInputFiles('#oskInput', skinPath);
    await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 30000 });

    const exportedIni = await page.evaluate(async () => {
      const cfg4 = maniaSkinConfigurations.get(4);
      cfg4.HitPosition = 333;
      cfg4.ColumnStart = 150;
      const generated = generateSkinIniText();
      const { blob } = await buildSkinArchiveBlob('osk', { mode: 'release' });
      const archive = await JSZip.loadAsync(blob);
      const iniName = Object.keys(archive.files).find((name) => /(?:^|\/)skin\.ini$/i.test(name));
      const archived = await archive.file(iniName).async('string');
      return { generated, archived };
    });

    const ini = exportedIni.archived;
    const mania4 = sectionText(ini, 'Mania', 4);
    const mania7 = sectionText(ini, 'Mania', 7);
    const fonts = sectionText(ini, 'Fonts');
    const catchText = sectionText(ini, 'CatchTheBeat');

    expect(mania4).toMatch(/^HitPosition:\s*333\s*$/m);
    expect(mania4).not.toMatch(/^HitPosition:\s*400\s*$/m);
    expect(mania4).toMatch(/^ColumnStart:\s*150\s*$/m);
    expect(mania4).toMatch(/^ColourHold:\s*9,9,9,255\s*$/m);
    expect(mania4).not.toMatch(/^ColorHold\s*:/m);
    expect(exportedIni.generated).not.toMatch(/^LightingN0\s*:/m);
    expect(mania4).toMatch(/^LightingN0:\s*lane-0\s*$/m);
    expect(mania4).toMatch(/^SpecialStyle:\s*1\s*$/m);
    expect(mania4).toMatch(/^SeparateScore:\s*0\s*$/m);
    expect(mania4).toMatch(/^KeyFlipWhenUpsideDown0:\s*1\s*$/m);
    expect(mania4).toMatch(/^NoteFlipWhenUpsideDown1:\s*0\s*$/m);

    const preservedOrder = [
      'SpecialStyle: 1',
      'SeparateScore: 0',
      'KeyFlipWhenUpsideDown0: 1',
      'NoteFlipWhenUpsideDown1: 0',
      'LightingN0: lane-0'
    ].map((line) => mania4.indexOf(line));
    expect(preservedOrder.every((index) => index >= 0)).toBe(true);
    expect(preservedOrder).toEqual([...preservedOrder].sort((a, b) => a - b));
    expect(mania4.indexOf('SpecialStyle: 1')).toBeGreaterThan(mania4.indexOf('HitPosition: 333'));
    expect(mania4).not.toMatch(/保留的原始参数|未由编辑器重写/);

    expect(mania7).toMatch(/^HitPosition:\s*380\s*$/m);
    expect(mania7).toMatch(/^SpecialStyle:\s*2\s*$/m);
    expect(mania7).not.toMatch(/LightingN0|SpecialStyle:\s*1/);

    expect(fonts).toMatch(/^ComboPrefix:\s*legacy-combo\s*$/m);
    expect(fonts).toMatch(/^CustomFontFlag:\s*keep-font\s*$/m);
    expect(ini).not.toMatch(/^Combo\s*:/m);
    expect(fonts.indexOf('CustomFontFlag: keep-font')).toBeGreaterThan(fonts.indexOf('ComboPrefix: legacy-combo'));

    expect(catchText.replace(/\r\n/g, '\n').trim()).toBe('[CatchTheBeat]\nHyperDash: fruit-dash\nHyperDashFruit: fruit');
    expect(ini.indexOf('[CatchTheBeat]')).toBeGreaterThan(ini.lastIndexOf('[Mania]'));
    expect(ini).toMatch(/^CustomGeneralFlag:\s*keep-me\s*$/m);
    expect(errors).toEqual([]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
