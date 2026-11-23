
import SwaggerParser from '@apidevtools/swagger-parser';
import { resolve } from 'node:path';

const specPath = resolve('docs/openapi.yaml');

const requiredOperations = [
  ['/health', 'get'],
  ['/auth/login', 'post'],
  ['/auth/access-requests', 'post'],
  ['/projects', 'get'],
  ['/projects/{projectId}', 'get'],
  ['/projects/{projectId}/sites', 'get'],
  ['/sites', 'get'],
  ['/admin/roles', 'get'],
  ['/admin/users', 'get'],
  ['/admin/users/{userId}', 'patch'],
];

async function validate() {
  console.log('Validating Qorvenz OpenAPI specification...');

  // Check YAML structure, schemas and local references.
  const api = await SwaggerParser.validate(specPath);

  if (api.openapi !== '3.0.3') {
    throw new Error('Expected OpenAPI version 3.0.3.');
  }

  if (!api.servers?.some((server) => server.url === '/api/v1')) {
    throw new Error('The specification must use /api/v1.');
  }

  // Prevent accidental removal of our documented core endpoints.
  for (const [path, method] of requiredOperations) {
    const operation = api.paths?.[path]?.[method];

    if (!operation) {
      throw new Error(`Missing API operation: ${method.toUpperCase()} ${path}`);
    }

    if (!operation.operationId) {
      throw new Error(`Missing operationId: ${method.toUpperCase()} ${path}`);
    }

    if (!operation.responses || Object.keys(operation.responses).length === 0) {
      throw new Error(`Missing responses: ${method.toUpperCase()} ${path}`);
    }

    console.log(`PASS ${method.toUpperCase()} ${path}`);
  }

  console.log(`OpenAPI validation passed: ${requiredOperations.length} operations.`);
}

validate().catch((error) => {
  console.error('OpenAPI validation FAILED.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
