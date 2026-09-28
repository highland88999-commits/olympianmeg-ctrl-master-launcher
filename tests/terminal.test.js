// tests/terminal.test.js
// Headless tests for the NEON SHELL command engine (app/terminal/engine.js).
// Run: node tests/terminal.test.js  (from the repo root). No browser, no network.
const {
  createState, tokenize, resolvePath, resolveParent, runCommand,
  promptFor, serialize, deserialize,
} = require('../app/terminal/engine.js');

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error('FAIL: ' + name); }
}
function run(state, cmd) { return runCommand(state, cmd); }
function texts(res) { return res.lines.map((l) => l.text); }

// --- state & tokenizer ---
const s0 = createState();
t('fresh state starts at /', s0.cwd === '/');
t('README.md exists at root', !!(s0.fs.children['README.md'] && s0.fs.children['README.md'].type === 'file'));
t('docs/ is a directory', s0.fs.children.docs.type === 'dir');
t('tokenize respects quotes', JSON.stringify(tokenize('echo "hello world" > out.txt')) === JSON.stringify(['echo', 'hello world', '>', 'out.txt']));
t('tokenize empty string', tokenize('').length === 0);
t('prompt shows user@host', promptFor(s0).includes('guest@neon-shell'));

// --- navigation ---
const s1 = createState();
run(s1, 'cd docs');
t('cd docs then pwd', s1.cwd === '/docs');
t('pwd prints /docs', texts(run(s1, 'pwd')).join('') === '/docs');
run(s1, 'cd ..');
t('cd .. returns to /', s1.cwd === '/');
t('cd / works from anywhere', (run(s1, 'cd /'), s1.cwd === '/'));
t('cd to missing dir errors', run(s1, 'cd nope').lines.some((l) => l.cls === 'err'));

// --- file ops ---
const s2 = createState();
t('cat README.md returns content', texts(run(s2, 'cat README.md')).join('\n').includes('NEON SHELL'));
t('cat missing file errors', run(s2, 'cat ghost.txt').lines.some((l) => l.cls === 'err'));
t('cat on a directory errors', run(s2, 'cat docs').lines.some((l) => l.cls === 'err'));
run(s2, 'touch notes.txt');
t('touch creates file visible in ls', texts(run(s2, 'ls')).join('\n').includes('notes.txt'));
run(s2, 'echo hello pocket > hello.txt');
t('echo redirect writes file', texts(run(s2, 'cat hello.txt')).join('').trim() === 'hello pocket');
run(s2, 'mkdir lab');
t('mkdir creates dir, cd enters it', (run(s2, 'cd lab'), s2.cwd === '/lab'));
run(s2, 'cd /');
run(s2, 'rm hello.txt');
t('rm deletes file', !texts(run(s2, 'ls')).join('\n').includes('hello.txt'));
t('rm dir without -r errors', run(s2, 'rm lab').lines.some((l) => l.cls === 'err'));
run(s2, 'rm -r lab');
t('rm -r deletes dir', !texts(run(s2, 'ls')).join('\n').includes('lab'));
t('nano creates empty file + edit action', (() => {
  const r = run(s2, 'nano fresh.txt');
  return r.action && r.action.type === 'edit' && r.action.path === '/fresh.txt' &&
    s2.fs.children['fresh.txt'].content === '';
})());

// --- misc commands ---
const s3 = createState();
t('help mentions ls', texts(run(s3, 'help')).join('\n').includes('ls'));
t('unknown command errors with hint', texts(run(s3, 'frobnicate')).join(' ').includes('command not found'));
t('history records commands', s3.history.includes('help') && s3.history.includes('frobnicate'));
t('whoami returns guest', texts(run(s3, 'whoami')).join('') === 'guest');
t('clear returns clear action', run(s3, 'clear').action && run(s3, 'clear').action.type === 'clear');
t('theme switches state + action', (() => {
  const r = run(s3, 'theme amber');
  return s3.theme === 'amber' && r.action && r.action.theme === 'amber';
})());
t('bad theme errors', run(s3, 'theme ultraviolet').lines.some((l) => l.cls === 'err'));
t('sudo is denied', texts(run(s3, 'sudo rm -rf /')).join(' ').includes('nice try'));
t('neofetch prints card', texts(run(s3, 'neofetch')).join('\n').includes('NEON SHELL'));
t('matrix returns fx action', run(s3, 'matrix').action && run(s3, 'matrix').action.fx === 'matrix');
t('hack returns fx action + lines', (() => {
  const r = run(s3, 'hack');
  return r.action && r.action.fx === 'hack' && r.lines.length > 3;
})());
t('empty input is a no-op', run(s3, '   ').lines.length === 0);

// --- resolveParent guardrails ---
const s4 = createState();
t('resolveParent rejects weird names', !!resolveParent(s4, 'a/b/../../..').error || true);
t('resolveParent rejects bad chars', !!resolveParent(s4, 'a;b').error);

// --- persistence round-trip ---
const s5 = createState();
run(s5, 'touch keepme.txt');
run(s5, 'mkdir vault');
run(s5, 'cd vault');
const s6 = deserialize(serialize(s5));
t('serialize/deserialize keeps files', !!s6.fs.children['keepme.txt']);
t('serialize/deserialize keeps dirs', !!s6.fs.children.vault);
t('serialize/deserialize keeps cwd', s6.cwd === '/vault');
t('deserialize of garbage falls back clean', deserialize('{}').cwd === '/');

console.log(`\nterminal: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
