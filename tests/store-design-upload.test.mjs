// tests/store-design-upload.test.mjs
// Guards for the Custom Designer transport fix (2026-10-15):
//   1. Staged-upload paths: only the exact shape the mint route issues
//      is accepted back by the create route.
//   2. Error copy: a raw browser system string can never be the message
//      shown to a customer; our own messages pass through untouched.
// Run: node tests/store-design-upload.test.mjs (from the repo root).
import {
  isDesignUploadPath,
  designUploadPath,
  DESIGN_UPLOAD_BUCKET,
} from '../lib/store/design-upload.js';
import {
  ourError,
  friendlyDesignerError,
} from '../lib/store/designer-errors.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- staged path shape ---------------------------------------------------
const p = designUploadPath('front');
t('bucket name is stable', DESIGN_UPLOAD_BUCKET === 'custom-design-uploads');
t('generated path accepted', isDesignUploadPath(p));
t('generated path carries the placement key', p.endsWith('/front.png'));
t('two paths differ (unguessable per upload)', designUploadPath('front') !== designUploadPath('front'));
t('traversal rejected', !isDesignUploadPath('uploads/../secret.png'));
t('foreign bucket path rejected', !isDesignUploadPath('other/123e4567-e89b-12d3-a456-426614174000/front.png'));
t('missing uuid rejected', !isDesignUploadPath('uploads/front.png'));
t('non-png rejected', !isDesignUploadPath('uploads/123e4567-e89b-12d3-a456-426614174000/front.jpg'));
t('absolute URL rejected', !isDesignUploadPath('https://example.com/uploads/123e4567-e89b-12d3-a456-426614174000/front.png'));
t('non-string rejected', !isDesignUploadPath(null) && !isDesignUploadPath(42) && !isDesignUploadPath(undefined));

// --- error copy ------------------------------------------------------------
const RAW = 'The string did not match the expected pattern.';
const mapped = friendlyDesignerError(new Error(RAW), 'fallback copy');
t('Safari pattern string is never shown', mapped !== RAW && !mapped.includes('expected pattern'));
t('transport failure gets send-specific copy', /could not be sent/i.test(mapped));

const domEx = new Error(RAW);
domEx.name = 'DOMException';
t('DOMException name alone maps to human copy', friendlyDesignerError(domEx, 'fb') !== RAW);

t('JSON syntax error maps to human copy',
  !/unexpected token/i.test(friendlyDesignerError(new SyntaxError("Unexpected token '<', \"<html>\"... is not valid JSON"), 'fb')));
t('network TypeError maps to human copy',
  /could not be sent/i.test(friendlyDesignerError(new TypeError('Failed to fetch'), 'fb')));
t('our own message passes through verbatim',
  friendlyDesignerError(ourError('Design image has the wrong print size for this product.'), 'fb')
    === 'Design image has the wrong print size for this product.');
t('unknown error falls back',
  friendlyDesignerError(new Error('something exotic'), 'Plain fallback.') === 'Plain fallback.');
t('null error falls back', friendlyDesignerError(null, 'Plain fallback.') === 'Plain fallback.');

console.log(`store-design-upload: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
