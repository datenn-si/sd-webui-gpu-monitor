const fs = require('fs');
const path = require('path');

const isWindows = process.platform === 'win32';
const venvDirs = ['venv', '.venv'];
const binSegments = isWindows ? ['Scripts', 'ruff.exe'] : ['bin', 'ruff'];

const quote = (value) => (/\s/.test(value) ? `"${value}"` : value);

const toPosix = (value) => value.split(path.sep).join('/');

const resolveRuff = () => {
  for (const dir of venvDirs) {
    const candidate = path.join(process.cwd(), dir, ...binSegments);
    if (fs.existsSync(candidate)) {
      return quote(toPosix(candidate));
    }
  }
  return 'ruff';
};

const joinFiles = (files) => files.map((file) => quote(toPosix(file))).join(' ');

module.exports = {
  '*.py': (files) => {
    const ruff = resolveRuff();
    const targets = joinFiles(files);
    return [`${ruff} check --fix ${targets}`, `${ruff} format ${targets}`];
  },
  '*.js': ['oxlint -c .oxlintrc.json --fix'],
  '*.{js,css,json,md}': ['oxfmt'],
};
