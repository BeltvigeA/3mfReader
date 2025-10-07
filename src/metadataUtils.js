import { Parser } from 'xml2js';

const parserOptions = {
  explicitArray: false,
  attrkey: 'attributes',
  charkey: 'value',
  explicitCharkey: true,
  trim: true
};

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
}

function extractText(node) {
  if (node === undefined || node === null) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(item => extractText(item)).join('').trim();
  }
  if (typeof node === 'object' && typeof node.value === 'string') {
    return node.value;
  }
  return '';
}

function parseSkippedFlag(value) {
  if (value === undefined || value === null) {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '' || normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false;
  }
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function collectObjectNodes(node, collected) {
  if (Array.isArray(node)) {
    node.forEach(item => collectObjectNodes(item, collected));
    return;
  }

  if (node === undefined || node === null || typeof node !== 'object') {
    return;
  }

  if (node.attributes && (node.attributes.identify_id !== undefined || node.attributes.identifyId !== undefined)) {
    collected.push(node);
  }

  Object.entries(node).forEach(([key, value]) => {
    if (key === 'attributes' || key === 'value') {
      return;
    }
    collectObjectNodes(value, collected);
  });
}

function buildPlate(plateNode) {
  const plateAttributes = { ...(plateNode.attributes ?? {}) };
  const metadataEntries = {};

  const metadataNodes = toArray(plateNode.metadata);
  metadataNodes.forEach(entry => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const key = entry.attributes?.name ?? entry.attributes?.key ?? entry.attributes?.id;
    if (!key) {
      return;
    }
    metadataEntries[key] = extractText(entry);
  });

  const plateObjectsRaw = [];
  collectObjectNodes(plateNode, plateObjectsRaw);

  const objects = plateObjectsRaw.map(objectNode => {
    const objectAttributes = { ...(objectNode.attributes ?? {}) };
    const identifyId = objectAttributes.identify_id ?? objectAttributes.identifyId ?? null;
    const name = objectAttributes.name ?? null;
    const skipped = parseSkippedFlag(objectAttributes.skipped);

    return {
      identifyId,
      name,
      skipped,
      attributes: objectAttributes,
      raw: objectNode
    };
  });

  return {
    attributes: plateAttributes,
    metadata: metadataEntries,
    objects
  };
}

function collectPlates(node, plates) {
  if (Array.isArray(node)) {
    node.forEach(item => collectPlates(item, plates));
    return;
  }

  if (node === undefined || node === null || typeof node !== 'object') {
    return;
  }

  if (Object.prototype.hasOwnProperty.call(node, 'plate')) {
    const plateNodes = toArray(node.plate);
    plateNodes.forEach(plateNode => {
      if (plateNode && typeof plateNode === 'object') {
        plates.push(buildPlate(plateNode));
        collectPlates(plateNode, plates);
      }
    });
  }

  Object.entries(node).forEach(([key, value]) => {
    if (key === 'plate' || key === 'attributes' || key === 'value') {
      return;
    }
    collectPlates(value, plates);
  });
}

export async function parseMetadata(xmlString) {
  if (typeof xmlString !== 'string') {
    return { tree: null, plates: [], objects: [] };
  }

  const trimmed = xmlString.trim();
  if (trimmed === '') {
    return { tree: null, plates: [], objects: [] };
  }

  let tree;
  try {
    const parser = new Parser(parserOptions);
    tree = await parser.parseStringPromise(trimmed);
  } catch (error) {
    return { tree: null, plates: [], objects: [] };
  }

  const plates = [];
  collectPlates(tree, plates);
  const objects = plates.flatMap(plate => plate.objects.map(objectEntry => ({
    identifyId: objectEntry.identifyId,
    name: objectEntry.name,
    skipped: objectEntry.skipped,
    attributes: objectEntry.attributes,
    raw: objectEntry.raw,
    plateIndex: plate.attributes?.index ?? null
  })));

  return { tree, plates, objects };
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
