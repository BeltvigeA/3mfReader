export function parseMetadata(xmlString) {
  const result = {};
  const regex = /<([\w:]+)>([^<]+)<\/\1>/g;
  let match;
  while ((match = regex.exec(xmlString)) !== null) {
    result[match[1]] = match[2];
  }
  return result;
}
