import fs from 'fs';
import test from 'ava';
import path from 'path';

import { generate } from '../src';

test('Should generate additionalProperties for types with specific keys and index signatures', async (t) => {
    const tempSpecPath = '/tmp/record-index-signature-test.json';

    await generate({
        tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
        controllers: [path.resolve(__dirname, './fixture/record-index-signature-test.ts')],
        openapi: {
            filePath: tempSpecPath,
            service: {
                name: 'test-service',
                version: '1.0.0'
            }
        },
        router: {
            filePath: '/tmp/test-router.ts'
        }
    });

    const specContent = await fs.promises.readFile(tempSpecPath);
    const spec = JSON.parse(specContent.toString());

    // Verify the Meta schema
    const metaSchema = spec.components.schemas.Meta;
    t.truthy(metaSchema);
    t.is(metaSchema.type, 'object');

    // Should have specific properties
    t.truthy(metaSchema.properties);
    t.truthy(metaSchema.properties['email-token']);
    t.truthy(metaSchema.properties['esp']);
    t.is(metaSchema.properties['email-token'].type, 'string');
    t.is(metaSchema.properties['esp'].type, 'string');

    // Should NOT have required array (both properties are optional)
    t.falsy(metaSchema.required);

    // Should have additionalProperties for the index signature
    t.truthy(metaSchema.additionalProperties);
    t.is(metaSchema.additionalProperties.type, 'string');
    t.is(metaSchema.additionalProperties.nullable, true);

    // Verify direct endpoint response
    const directResponse = spec.paths['/record-index-test/direct'].get.responses['200'];
    const directSchema = directResponse.content['application/json'].schema;
    t.is(directSchema.$ref, '#/components/schemas/Meta');

    // Verify partial-pick endpoint response  
    const partialPickResponse = spec.paths['/record-index-test/partial-pick'].get.responses['200'];
    const partialPickSchema = partialPickResponse.content['application/json'].schema;

    // The partial-pick should either reference Meta or have inline properties
    // that preserve the additionalProperties via reference
    if (partialPickSchema.$ref) {
        // If it's a reference, verify the referenced schema has the correct structure
        const referencedSchemaName = partialPickSchema.$ref.split('/').pop();
        const referencedSchema = spec.components.schemas[referencedSchemaName];
        t.truthy(referencedSchema);
    } else {
        // If it's inline, verify it has the meta property with correct reference
        t.truthy(partialPickSchema.properties);
        t.truthy(partialPickSchema.properties.meta);
        t.is(partialPickSchema.properties.meta.$ref, '#/components/schemas/Meta');
    }

    // Verify intersection type endpoint
    const intersectionResponse = spec.paths['/record-index-test/intersection'].get.responses['200'];
    const intersectionSchema = intersectionResponse.content['application/json'].schema;

    // Intersection types should generate allOf
    t.truthy(intersectionSchema.allOf);
    t.is(intersectionSchema.allOf.length, 2);

    // One part should have additionalProperties (Record<string, string>) 
    const recordPart = intersectionSchema.allOf.find((part: any) =>
        part.additionalProperties && Object.keys(part.properties || {}).length === 0);
    t.truthy(recordPart);
    t.is(recordPart.additionalProperties.type, 'string');

    // Other part should have specific properties
    const specificPart = intersectionSchema.allOf.find((part: any) => part.properties && Object.keys(part.properties).length > 0);
    t.truthy(specificPart);
    t.truthy(specificPart.properties['specific-key']);
    t.truthy(specificPart.properties['another-key']);
});
