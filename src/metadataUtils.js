export function parseMetadata(xmlString) {
  const result = {};
  const regex = /<([\w:]+)>([^<]+)<\/\1>/g;
  let match;
  while ((match = regex.exec(xmlString)) !== null) {
    result[match[1]] = match[2];
  }
  return result;
}

function addIdentifier(targetSet, value) {
  if (typeof value !== 'string') {
    return;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return;
  }
  targetSet.add(trimmed);
}

export function parseModelSettingsObjects(configText) {
  if (typeof configText !== 'string') {
    return [];
  }

  const trimmed = configText.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const identifiers = new Set();

  const collectFromNode = node => {
    if (Array.isArray(node)) {
      node.forEach(collectFromNode);
      return;
    }
    if (node && typeof node === 'object') {
      if (Object.prototype.hasOwnProperty.call(node, 'id')) {
        addIdentifier(identifiers, node.id);
      }
      if (Object.prototype.hasOwnProperty.call(node, 'name')) {
        addIdentifier(identifiers, node.name);
      }
      for (const value of Object.values(node)) {
        collectFromNode(value);
      }
    }
  };

  try {
    const parsed = JSON.parse(trimmed);
    collectFromNode(parsed);
    if (identifiers.size > 0) {
      return Array.from(identifiers);
    }
  } catch (error) {
    // Ignore JSON parsing errors and fall back to heuristic parsing.
  }

  const identifierPattern = /(?:object[_\s.-]*(?:id|name)|\b(?:id|name))\s*[:=]\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s,;#{}]+))/gi;
  let match;
  while ((match = identifierPattern.exec(configText)) !== null) {
    const value = match[1] ?? match[2] ?? match[3];
    if (value) {
      addIdentifier(identifiers, value.replace(/\\"/g, '"').replace(/\\'/g, "'"));
    }
  }

  return Array.from(identifiers);
}
