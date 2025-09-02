export function parseGcode(gcodeString) {
  const result = {};
  const lines = gcodeString.split(/\r?\n/);

  const patterns = {
    'model printing time': { key: 'modelPrintingTime', transform: v => parseFloat(v) / 60 },
    'total filament weight': { key: 'totalFilamentWeight', split: true, transform: v => parseFloat(v) },
    enable_support: { key: 'enableSupport', split: true, transform: v => v.trim() },
    filament_type: { key: 'filamentType', split: true, transform: v => v.trim() },
    layer_height: { key: 'layerHeight', transform: v => parseFloat(v) },
    nozzle_diameter: { key: 'nozzleDiameter', transform: v => parseFloat(v) },
    sparse_infill_density: { key: 'sparseInfillDensity', transform: v => parseFloat(v) },
    printer_model: { key: 'printerModel', transform: v => v.trim() }
  };

  for (const line of lines) {
    if (line.includes('BambuStudio')) {
      result.slicer = 'BambuStudio';
    }
    if (!line.startsWith(';')) continue;
    const cleaned = line.slice(1).trim();
    const [rawKey, rawValue] = cleaned.split(/[:=]/);
    if (!rawValue) continue;
    const key = rawKey.trim().toLowerCase();
    const pattern = patterns[key];
    if (pattern) {
      let value = rawValue.trim();
      if (pattern.split && value.includes(',')) {
        value.split(',').forEach((val, idx) => {
          result[`${pattern.key}${idx + 1}`] = pattern.transform(val);
        });
      } else {
        result[pattern.key] = pattern.transform(value);
      }
    }
  }

  return result;
}
