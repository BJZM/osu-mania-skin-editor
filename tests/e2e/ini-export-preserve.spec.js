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
    expect(mania4).toMatch(/^ColourHold:\s*255,191,51,255\s*$/m);
    expect(mania4).toMatch(/^ColorHold:\s*9,9,9\s*$/m);
    expect(exportedIni.generated).not.toMatch(/^LightingN0\s*:/m);
    expect(mania4).toMatch(/^LightingN0:\s*lane-0\s*$/m);
    expect(mania4).toMatch(/^SpecialStyle:\s*1\s*$/m);
    expect(mania4).toMatch(/^SeparateScore:\s*0\s*$/m);
    expect(mania4).toMatch(/^KeyFlipWhenUpsideDown0:\s*1\s*$/m);
    expect(mania4).toMatch(/^NoteFlipWhenUpsideDown1:\s*0\s*$/m);

    const preservedOrder = [
      'ColorHold: 9,9,9',
      'SeparateScore: 0',
      'KeyFlipWhenUpsideDown0: 1',
      'NoteFlipWhenUpsideDown1: 0',
      'LightingN0: lane-0'
    ].map((line) => mania4.indexOf(line));
    expect(preservedOrder.every((index) => index >= 0)).toBe(true);
    expect(preservedOrder).toEqual([...preservedOrder].sort((a, b) => a - b));
    expect(mania4).toMatch(/^SpecialStyle:\s*1\s*$/m);
    expect(mania4).not.toMatch(/保留的原始参数|未由编辑器重写/);

    expect(mania7).toMatch(/^HitPosition:\s*380\s*$/m);
    expect(mania7).toMatch(/^SpecialStyle:\s*2\s*$/m);
    expect(mania7).not.toMatch(/LightingN0|SpecialStyle:\s*1/);

    expect(fonts).toMatch(/^Combo:\s*legacy-combo\s*$/m);
    expect(fonts).not.toMatch(/^ComboPrefix\s*:/m);
    expect(fonts).toMatch(/^CustomFontFlag:\s*keep-font\s*$/m);
    expect(fonts.indexOf('CustomFontFlag: keep-font')).toBeGreaterThan(fonts.indexOf('Combo: legacy-combo'));
    const importedFonts = await page.evaluate(() => ({
      explicit: skinFontsConfig.hasExplicitComboPrefix,
      prefix: getExplicitComboFontPrefix(4)
    }));
    expect(importedFonts.explicit).toBe(false);
    expect(importedFonts.prefix).toBeNull();
    const promoted = await page.evaluate(() => {
      onParamChange('ComboPrefix', 'fonts/combo/combo');
      return buildExportedSkinIniText();
    });
    expect(promoted).toMatch(/^ComboPrefix:\s*fonts\/combo\/combo\s*$/m);
    expect(promoted).toMatch(/^Combo:\s*legacy-combo\s*$/m);

    expect(catchText.replace(/\r\n/g, '\n').trim()).toBe('[CatchTheBeat]\nHyperDash: fruit-dash\nHyperDashFruit: fruit');
    expect(ini.indexOf('[CatchTheBeat]')).toBeGreaterThan(ini.lastIndexOf('[Mania]'));
    expect(ini).toMatch(/^CustomGeneralFlag:\s*keep-me\s*$/m);

    const strict = await page.evaluate(() => {
      parseSkinIniLazer([
        '[Mania]',
        'Keys: 4',
        'BarlineHeight: 4.5',
        'JudgementLine: 0',
        'ShowJudgementLine: 1',
        'ColourBreak: 4,5,6',
        'ComboBreakColour: 7,8,9',
        'NoteImage0: note-a',
        'noteimage0: lower-note',
        'KeyImage0D: key-d',
        'keyimage0: lower-key',
        '[Mania]',
        'Keys: 6',
        'barlineheight: 9',
        'ShowJudgementLine: 0',
        'ColorHold: 1,2,3',
        'ComboBreakColour: 7,8,9'
      ].join('\n'));
      const read = (keys) => {
        const cfg = maniaSkinConfigurations.get(keys);
        return {
          bar: cfg.BarLineHeight,
          line: cfg.ShowJudgementLine,
          hold: cfg.ColourHold,
          brk: cfg.ComboBreakColour,
          note: cfg.ImageLookups.get('NoteImage0') || null,
          noteLower: cfg.ImageLookups.get('noteimage0') || null,
          key: cfg.ImageLookups.get('KeyImage0') || null,
          keyLower: cfg.ImageLookups.get('keyimage0') || null,
          keyD: cfg.ImageLookups.get('KeyImage0D') || null
        };
      };
      return { four: read(4), six: read(6), exported: generateSkinIniText() };
    });
    expect(strict.four.bar).toBe(4.5);
    expect(strict.four.line).toBe(false);
    expect(strict.four.brk).toEqual({ r: 4, g: 5, b: 6 });
    expect(strict.four.note).toBe('note-a');
    expect(strict.four.noteLower).toBeNull();
    expect(strict.four.key).toBeNull();
    expect(strict.four.keyLower).toBeNull();
    expect(strict.four.keyD).toBe('key-d');
    expect(strict.six.bar).toBe(1.2);
    expect(strict.six.line).toBe(true);
    expect(strict.six.hold).toEqual({ r: 255, g: 191, b: 51, a: 255 });
    expect(strict.six.brk).toEqual({ r: 255, g: 0, b: 0 });
    expect(strict.exported).toMatch(/^BarlineHeight:\s*4\.5\s*$/m);
    expect(strict.exported).toMatch(/^JudgementLine:\s*0\s*$/m);
    expect(strict.exported).toMatch(/^ColourBreak:\s*4,5,6\s*$/m);
    expect(strict.exported).toMatch(/^NoteImage0:\s*note-a\s*$/m);
    expect(strict.exported).toMatch(/^KeyImage0D:\s*key-d\s*$/m);
    expect(strict.exported).not.toMatch(/^ComboBreakColour\s*:/m);
    expect(strict.exported).not.toMatch(/^noteimage0\s*:/m);
    expect(strict.exported).not.toMatch(/^keyimage0\s*:/m);
    expect(strict.exported).not.toMatch(/^ShowJudgementLine\s*:/m);
    expect(errors).toEqual([]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
