import fs from 'fs';
import path from 'path';

const localesDir = path.join(process.cwd(), 'src/locales');
const langs = ['es', 'en', 'fr', 'de', 'it'];
const namespaces = ['common', 'gameplay'];

let hasErrors = false;

function flattenKeys(obj, prefix = '') {
  let keys = {};
  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      if (Object.keys(obj[key]).length === 0) {
        console.error(`Empty object found: ${prefix}${key}`);
        hasErrors = true;
      } else {
        Object.assign(keys, flattenKeys(obj[key], `${prefix}${key}.`));
      }
    } else {
      if (obj[key] === '') {
        console.error(`Empty string found: ${prefix}${key}`);
        hasErrors = true;
      }
      keys[`${prefix}${key}`] = obj[key];
    }
  }
  return keys;
}

for (const ns of namespaces) {
  console.log(`\nChecking namespace: ${ns}`);
  const baseLang = 'es';
  const baseFilename = ns === 'common' ? `${baseLang}.json` : `${ns}.${baseLang}.json`;
  const basePath = path.join(localesDir, baseFilename);
  
  if (!fs.existsSync(basePath)) {
    console.error(`Base file not found: ${basePath}`);
    hasErrors = true;
    continue;
  }
  
  const baseContent = JSON.parse(fs.readFileSync(basePath, 'utf-8'));
  const baseKeys = Object.keys(flattenKeys(baseContent));
  
  for (const lang of langs) {
    if (lang === baseLang) continue;
    
    const filename = ns === 'common' ? `${lang}.json` : `${ns}.${lang}.json`;
    const filePath = path.join(localesDir, filename);
    
    if (!fs.existsSync(filePath)) {
      console.error(`Missing file: ${filePath}`);
      hasErrors = true;
      continue;
    }
    
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const keys = Object.keys(flattenKeys(content));
    
    const missingKeys = baseKeys.filter(k => !keys.includes(k));
    const extraKeys = keys.filter(k => !baseKeys.includes(k));
    
    if (missingKeys.length > 0) {
      console.error(`[${lang}] Missing keys in ${ns}:\n  ${missingKeys.join('\n  ')}`);
      hasErrors = true;
    }
    if (extraKeys.length > 0) {
      console.error(`[${lang}] Extra keys in ${ns} (not in ${baseLang}):\n  ${extraKeys.join('\n  ')}`);
      hasErrors = true;
    }
  }
}

if (hasErrors) {
  console.error('\nParity check failed.');
  process.exit(1);
} else {
  console.log('\nParity check passed. All 5 languages have exact parity and no empty objects/strings.');
}
