const { test, expect } = require('@playwright/test');

test('ColumnSpacing is read and exported with keys - 1 values for every key mode', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  await page.waitForFunction(
    () => typeof parseSkinIniLazer === 'function' && typeof generateSkinIniText === 'function',
    null,
    { timeout: 30000 }
  );

  const result = await page.evaluate(() => {
    const keyModes = [1, 2, 4, 5, 7];
    const cases = keyModes.map((keys) => {
      maniaSkinConfigurations.clear();
      const inputSpacing = Array.from({ length: keys + 1 }, (_, i) => (i + 1) * 10).join(',');
      parseSkinIniLazer([
        '[General]',
        'Version: latest',
        '[Mania]',
        `Keys: ${keys}`,
        `ColumnWidth: ${new Array(keys).fill(30).join(',')}`,
        `ColumnSpacing: ${inputSpacing}`,
        ''
      ].join('\n'));

      const cfg = getManiaConfigForKeys(keys);
      const expected = Array.from({ length: Math.max(0, keys - 1) }, (_, i) => (i + 1) * 10);
      const exported = generateSkinIniText();
      const exportedLine = exported.split(/\r?\n/).find(line => line.startsWith('ColumnSpacing: ')) || null;
      return {
        keys,
        parsedSpacing: cfg.ColumnSpacing.slice(),
        expected,
        exportedLine
      };
    });

    maniaSkinConfigurations.clear();
    parseSkinIniLazer([
      '[General]',
      'Version: latest',
      '[Mania]',
      'Keys: 4',
      'ColumnWidth: 30,30,30,30',
      'ColumnSpacing: 12,24,36,48',
      ''
    ].join('\n'));
    const cfg = getManiaConfigForKeys(4);

    // Defensive export check for stale/imported data that still carries four values.
    cfg.ColumnSpacing = [1, 2, 3, 4];
    const staleExport = generateSkinIniText();
    const clamped = clampTrackLayoutArray(cfg, 4, 'ColumnSpacing', [5, 6, 7, 8], null).values;

    return { cases, staleExport, clamped };
  });

  for (const item of result.cases) {
    expect(item.parsedSpacing).toEqual(item.expected);
    if (item.expected.length === 0) {
      expect(item.exportedLine).toBeNull();
    } else {
      expect(item.exportedLine).toBe(`ColumnSpacing: ${item.expected.join(',')}`);
    }
  }

  expect(result.staleExport).toContain('ColumnSpacing: 1,2,3');
  expect(result.staleExport).not.toContain('ColumnSpacing: 1,2,3,4');
  expect(result.clamped).toEqual([5, 6, 7]);
  expect(pageErrors).toEqual([]);
});
