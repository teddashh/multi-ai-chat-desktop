import { deflateRawSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_INPUT = path.join('src-tauri', 'target', 'release');
const DEFAULT_OUT_DIR = path.join('dist', 'portable');
const README_PORTABLE = `Multi-AI Chat Desktop portable build

Unzip this folder and run the .exe directly.

Requirements:
- Windows 10/11.
- Microsoft Edge WebView2 Evergreen Runtime must be installed. Download it from:
  https://developer.microsoft.com/microsoft-edge/webview2/

Portable notes:
- Keep the PORTABLE marker file next to the .exe.
- Portable mode disables auto-update. Use Settings -> Check for updates, then download a newer release manually.
`;

function parseArgs(argv) {
  const options = {
    input: process.env.MAC_PORTABLE_INPUT ?? process.env.PORTABLE_INPUT ?? DEFAULT_INPUT,
    out: process.env.MAC_PORTABLE_OUT ?? process.env.PORTABLE_OUT ?? DEFAULT_OUT_DIR,
    name: process.env.MAC_PORTABLE_NAME ?? process.env.PORTABLE_NAME,
    exe: process.env.MAC_PORTABLE_EXE ?? process.env.PORTABLE_EXE,
    prefix: process.env.MAC_PORTABLE_PREFIX ?? process.env.PORTABLE_PREFIX,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };

    if (arg === '--input') options.input = nextValue();
    else if (arg === '--out') options.out = nextValue();
    else if (arg === '--name') options.name = nextValue();
    else if (arg === '--exe') options.exe = nextValue();
    else if (arg === '--prefix') options.prefix = nextValue();
    else if (arg === '--no-prefix') options.prefix = '';
    else if (arg === '--') continue; // pnpm forwards the run separator; ignore it
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: pnpm pack:portable -- [options]

Options:
  --input <dir>    Built app directory. Default: ${DEFAULT_INPUT}
  --out <path>     Output .zip path or output directory. Default: ${DEFAULT_OUT_DIR}
  --name <file>    Zip filename when --out is a directory.
  --exe <file>     App executable filename when multiple .exe files are present.
  --prefix <dir>   Top-level folder inside the zip. Default: inferred product/version.
  --no-prefix      Put files at the zip root.

Equivalent env vars are MAC_PORTABLE_INPUT, MAC_PORTABLE_OUT, MAC_PORTABLE_NAME,
MAC_PORTABLE_EXE, and MAC_PORTABLE_PREFIX.`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function inferMetadata() {
  const packageJson = readJson('package.json');
  const tauriConfig = readJson(path.join('src-tauri', 'tauri.conf.json'));
  const productName = typeof tauriConfig.productName === 'string' ? tauriConfig.productName : packageJson.name;
  const rawVersion = process.env.VERSION ?? process.env.GITHUB_REF_NAME ?? packageJson.version ?? tauriConfig.version;
  const version = typeof rawVersion === 'string' ? rawVersion.replace(/^v/i, '') : '';
  const slug = slugify(productName || 'multi-ai-chat-desktop');
  return { productName: productName || 'Multi-AI Chat Desktop', slug, version };
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveZipPath(out, name, metadata) {
  if (out.toLowerCase().endsWith('.zip')) return path.resolve(out);

  const versionSuffix = metadata.version ? `-${metadata.version}` : '';
  const fileName = name ?? `${metadata.slug}${versionSuffix}-windows-portable.zip`;
  return path.resolve(out, fileName);
}

function findExe(inputDir, requestedExe) {
  if (requestedExe) {
    const exePath = path.resolve(inputDir, requestedExe);
    if (!fs.existsSync(exePath)) throw new Error(`Requested executable not found: ${exePath}`);
    return path.basename(exePath);
  }

  const exeFiles = fs
    .readdirSync(inputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
    .map((entry) => entry.name)
    .filter((name) => !name.toLowerCase().includes('setup'));

  if (exeFiles.length === 0) throw new Error(`No app .exe found in ${inputDir}`);
  if (exeFiles.length > 1) {
    throw new Error(`Multiple .exe files found in ${inputDir}; pass --exe. Found: ${exeFiles.join(', ')}`);
  }
  return exeFiles[0];
}

function shouldSkipRootEntry(name) {
  const lower = name.toLowerCase();
  return (
    lower.startsWith('.') || // cargo internals at the target root: .fingerprint, .cargo-lock, .cargo-*-lock
    lower === 'bundle' ||
    lower === 'nsis' ||
    lower === 'build' ||
    lower === 'deps' ||
    lower === 'examples' ||
    lower === 'incremental' ||
    lower.endsWith('.d') ||
    lower.endsWith('.rlib') ||
    lower.endsWith('.rmeta') ||
    lower.endsWith('.pdb') ||
    lower.endsWith('.exp') ||
    lower.endsWith('.lib')
  );
}

function collectFiles(inputDir, exeName) {
  const files = [];

  function walk(currentDir, relativeDir = '') {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const relativePath = path.join(relativeDir, entry.name);
      const absolutePath = path.join(currentDir, entry.name);
      if (!relativeDir && entry.name !== exeName && shouldSkipRootEntry(entry.name)) continue;

      if (entry.isDirectory()) {
        walk(absolutePath, relativePath);
      } else if (entry.isFile()) {
        files.push({
          source: absolutePath,
          archivePath: toZipPath(relativePath),
          mtime: fs.statSync(absolutePath).mtime,
        });
      }
    }
  }

  walk(inputDir);

  if (!files.some((file) => file.archivePath === exeName)) {
    throw new Error(`Executable ${exeName} was not collected from ${inputDir}`);
  }

  return files.sort((a, b) => a.archivePath.localeCompare(b.archivePath));
}

function toZipPath(value) {
  return value.split(path.sep).join('/');
}

function withPrefix(prefix, archivePath) {
  const cleanPrefix = (prefix ?? '').replace(/^\/+|\/+$/g, '');
  return cleanPrefix ? `${cleanPrefix}/${archivePath}` : archivePath;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function writeUInt16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function writeUInt32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function createZip(entries, zipPath) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const data = entry.data ?? fs.readFileSync(entry.source);
    const compressed = deflateRawSync(data, { level: 9 });
    const name = Buffer.from(entry.archivePath, 'utf8');
    const { dosTime, dosDate } = dosDateTime(entry.mtime ?? new Date());
    const checksum = crc32(data);

    if (data.length > 0xffffffff || compressed.length > 0xffffffff || offset > 0xffffffff) {
      throw new Error('Portable zip exceeds classic ZIP limits; Zip64 is not supported by this script.');
    }

    const localHeader = Buffer.concat([
      writeUInt32(0x04034b50),
      writeUInt16(20),
      writeUInt16(0),
      writeUInt16(8),
      writeUInt16(dosTime),
      writeUInt16(dosDate),
      writeUInt32(checksum),
      writeUInt32(compressed.length),
      writeUInt32(data.length),
      writeUInt16(name.length),
      writeUInt16(0),
      name,
    ]);

    localParts.push(localHeader, compressed);

    const centralHeader = Buffer.concat([
      writeUInt32(0x02014b50),
      writeUInt16(20),
      writeUInt16(20),
      writeUInt16(0),
      writeUInt16(8),
      writeUInt16(dosTime),
      writeUInt16(dosDate),
      writeUInt32(checksum),
      writeUInt32(compressed.length),
      writeUInt32(data.length),
      writeUInt16(name.length),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(0),
      writeUInt32(offset),
      name,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.concat([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(entries.length),
    writeUInt16(entries.length),
    writeUInt32(centralDir.length),
    writeUInt32(offset),
    writeUInt16(0),
  ]);

  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  fs.writeFileSync(zipPath, Buffer.concat([...localParts, centralDir, end]));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputDir = path.resolve(options.input);
  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    throw new Error(`Input directory does not exist: ${inputDir}`);
  }

  const metadata = inferMetadata();
  const exeName = findExe(inputDir, options.exe);
  const prefix =
    options.prefix === undefined
      ? `${metadata.slug}${metadata.version ? `-${metadata.version}` : ''}-windows-portable`
      : options.prefix;
  const zipPath = resolveZipPath(options.out, options.name, metadata);
  const now = new Date();
  const files = collectFiles(inputDir, exeName).map((file) => ({
    ...file,
    archivePath: withPrefix(prefix, file.archivePath),
  }));

  const entries = [
    ...files,
    { archivePath: withPrefix(prefix, 'PORTABLE'), data: Buffer.alloc(0), mtime: now },
    { archivePath: withPrefix(prefix, 'README-portable.txt'), data: Buffer.from(README_PORTABLE, 'utf8'), mtime: now },
  ];

  createZip(entries, zipPath);
  console.log(`Created ${zipPath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
