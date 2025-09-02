export function parseGcode(gcodeString) {
  const result = {};
  const lines = gcodeString.split(/\r?\n/);
  const keyRegex = /^;\s*([^=]+?)\s*=\s*(.+)$/;

  for (const line of lines) {
    if (line.includes('BambuStudio')) {
      result.slicer = 'BambuStudio';
    }
    const match = line.match(keyRegex);
    if (!match) continue;

    const key = match[1].trim().toLowerCase();
    const rawValue = match[2].trim();

    switch (key) {
      case 'model printing time': {
        const seconds = parseFloat(rawValue);
        result.modelPrintingTime = seconds / 60;
        break;
      }
      case 'total filament weight': {
        rawValue.split(',').forEach((value, index) => {
          result[`totalFilamentWeight${index + 1}`] = parseFloat(value);
        });
        break;
      }
      case 'enable_support':
      case 'enable support': {
        result.enableSupport = Boolean(parseInt(rawValue, 10));
        break;
      }
      case 'filament_type':
      case 'filament type': {
        rawValue.split(',').forEach((value, index) => {
          result[`filamentType${index + 1}`] = value.trim();
        });
        break;
      }
      case 'layer_height':
      case 'layer height': {
        result.layerHeight = parseFloat(rawValue);
        break;
      }
      case 'nozzle_diameter':
      case 'nozzle diameter': {
        result.nozzleDiameter = parseFloat(rawValue);
        break;
      }
      case 'sparse_infill_density':
      case 'sparse infill density': {
        result.sparseInfillDensity = parseFloat(rawValue);
        break;
      }
      case 'printer_model':
      case 'printer model': {
        result.printerModel = rawValue;
        break;
      }
    }
  }

  return result;
}
