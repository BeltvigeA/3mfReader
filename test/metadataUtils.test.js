import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetadata, parseConfigObjects } from '../src/metadataUtils.js';

test('parseMetadata returns tree, plate metadata, and object summaries', async () => {
  const xml = `<?xml version="1.0"?>
    <sliceinfo>
      <plate index="1">
        <metadata name="plate_name">Calibration Plate</metadata>
        <metadata name="plate_no">1</metadata>
        <object identify_id="OBJ_1" name="Calibration Cube" skipped="0">
          <settings>
            <setting name="infill">20</setting>
          </settings>
        </object>
        <object identify_id="OBJ_2" name="Alignment Bar" skipped="1" />
      </plate>
    </sliceinfo>`;

  const result = await parseMetadata(xml);

  assert.ok(result.tree.sliceinfo);
  assert.equal(result.plates.length, 1);
  assert.deepEqual(result.plates[0].attributes, { index: '1' });
  assert.deepEqual(result.plates[0].metadata, {
    plate_name: 'Calibration Plate',
    plate_no: '1'
  });

  assert.equal(result.objects.length, 2);
  assert.deepEqual(result.objects.map(objectEntry => objectEntry.identifyId), ['OBJ_1', 'OBJ_2']);
  assert.equal(result.objects[0].name, 'Calibration Cube');
  assert.equal(result.objects[0].skipped, false);
  assert.equal(result.objects[1].skipped, true);
});

test('parseMetadata handles nested object containers and attribute variants', async () => {
  const xml = `
    <root>
      <sliceinfo>
        <plate index="2">
          <metadata key="plate_name">Multi Plate</metadata>
          <objects>
            <object identify_id="OBJ_A" name="Primary" skipped="false" />
            <object identify_id="OBJ_B" name="Secondary" skipped="true" />
          </objects>
        </plate>
        <plate index="3">
          <metadata name="plate_name">Second Plate</metadata>
          <object identifyId="OBJ_C" name="Tertiary" skipped="yes" />
        </plate>
      </sliceinfo>
    </root>`;

  const result = await parseMetadata(xml);

  assert.equal(result.plates.length, 2);
  assert.deepEqual(result.plates[0].metadata.plate_name, 'Multi Plate');
  assert.deepEqual(result.plates[1].metadata.plate_name, 'Second Plate');

  const objectById = Object.fromEntries(result.objects.map(objectEntry => [objectEntry.identifyId, objectEntry]));
  assert.equal(Object.keys(objectById).length, 3);
  assert.equal(objectById.OBJ_A.skipped, false);
  assert.equal(objectById.OBJ_B.skipped, true);
  assert.equal(objectById.OBJ_C.skipped, true);
  assert.equal(objectById.OBJ_C.plateIndex, '3');
});

test('parseMetadata returns empty structures for invalid input', async () => {
  const malformedResult = await parseMetadata('<sliceinfo');
  assert.deepEqual(malformedResult, { tree: null, plates: [], objects: [] });

  const emptyResult = await parseMetadata('   ');
  assert.deepEqual(emptyResult, { tree: null, plates: [], objects: [] });
});

test('parseConfigObjects extracts object attributes without plate context', async () => {
  const xml = `<?xml version="1.0"?>
    <config>
      <model identify_id="OBJ_10" name="Widget" skipped="false" />
      <group>
        <model identifyId="OBJ_20" name="Gadget" skipped="yes" />
      </group>
    </config>`;

  const result = await parseConfigObjects(xml);

  assert.equal(result.objects.length, 2);
  const [first, second] = result.objects;
  assert.equal(first.identifyId, 'OBJ_10');
  assert.equal(first.name, 'Widget');
  assert.equal(first.skipped, false);
  assert.equal(second.identifyId, 'OBJ_20');
  assert.equal(second.skipped, true);
});
