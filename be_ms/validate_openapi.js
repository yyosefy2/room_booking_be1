const fs = require('fs');
try {
  const yaml = require('js-yaml');
  const doc = yaml.load(fs.readFileSync('openapi.yaml', 'utf8'));
  console.log('openapi.yaml parsed OK');
} catch (err) {
  console.error('Error parsing openapi.yaml:', err.message || err);
  process.exit(1);
}
