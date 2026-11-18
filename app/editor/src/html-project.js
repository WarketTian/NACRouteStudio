import { HISTORY_BYTES } from './operation-history.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project.js';

export const HTML_PROJECT_HASH_PREFIX = '#nac-html=';

const archiveLimit = 31 * (8 * 1024 * 1024 + 512) + HISTORY_BYTES + 4096;
const compressedLimit = archiveLimit + 1024 * 1024;
const encodedLimit = Math.ceil(compressedLimit / 3) * 4;
const documentLimit = encodedLimit + 8192;
// Leave room below Chromium's two-MiB URL ceiling for the address and browser handling.
const launchLimit = 1_200_000;
const encoding = 'g1.';
const dataId = 'nac-project-data';
const dataTag = `<script id="${dataId}" type="application/x-nac-project">`;
const scriptEnd = '</script>';
const escaped = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
const escapeHtml = text => String(text).replace(/[&<>"']/g, char => escaped[char]);

const launchScript = `const url = new URL(document.getElementById('open-workspace').href);
url.hash = '${HTML_PROJECT_HASH_PREFIX}' + document.getElementById('${dataId}').textContent;
document.getElementById('open-workspace').href = url.href;
location.replace(url.href);`;

function websiteAddress(value) {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) ||
      url.username || url.password || url.search || url.hash || url.href.length > 2048) {
    throw Error('HTML 工程的网址无效。');
  }
  return url.href;
}

function base64(bytes) {
  if (typeof bytes.toBase64 === 'function') return bytes.toBase64();
  const parts = [];
  // Each chunk except the last has an integral number of Base64 groups.
  const chunkSize = 24_576;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    parts.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))));
  }
  return parts.join('');
}

function base64url(bytes) {
  return base64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64url(text) {
  if (typeof Uint8Array.fromBase64 === 'function') {
    return Uint8Array.fromBase64(text, { alphabet:'base64url' });
  }
  const chars = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(chars, char => char.charCodeAt(0));
}

function requireArchive(archive) {
  if (archive?.format !== PROJECT_FILE_FORMAT || archive.version !== PROJECT_FILE_VERSION ||
      archive.project?.schema !== 1 || typeof archive.project.name !== 'string' || !Array.isArray(archive.backups)) {
    throw Error('HTML 工程的数据格式不受支持。');
  }
  return archive;
}

export async function createHtmlProject(archive, websiteUrl) {
  requireArchive(archive);
  const address = websiteAddress(websiteUrl);
  const source = new Blob([JSON.stringify(archive)]);
  if (source.size > archiveLimit) throw Error('HTML 工程超过大小限制。');
  const compressed = await new Response(source.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const payload = encoding + base64url(new Uint8Array(compressed));
  const autoOpen = address.length + HTML_PROJECT_HASH_PREFIX.length + payload.length <= launchLimit;
  const scriptHash = autoOpen ? base64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(launchScript)))) : null;
  const policy = `default-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'; script-src ${scriptHash ? `'sha256-${scriptHash}'` : "'none'"}`;
  const name = escapeHtml(archive.project.name.slice(0, 150));
  const hint = autoOpen ? '正在打开对应的 NAC 工程。' : '此工程较大，请打开工作室，再选择本文件。';
  const link = autoOpen ? '打开工作室' : '打开网站，再选择本文件';
  const header = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}">
  <title>${name} · NAC 工程</title>
  <style>body{font:16px system-ui,sans-serif;color:#e4edf0;background:#152127;margin:0;padding:3rem 1.25rem}main{max-width:38rem;margin:auto}h1{font-size:1.6rem;overflow-wrap:anywhere}a{color:#87efd8}</style>
</head>
<body>
  <main>
    <h1>${name}</h1>
    <p>${hint}</p>
    <a id="open-workspace" href="${escapeHtml(address)}">${link}</a>
  </main>
  ${dataTag}`;
  const footer = `${scriptEnd}${autoOpen ? `\n  <script>${launchScript}${scriptEnd}` : ''}\n</body>\n</html>\n`;
  return new Blob([header, payload, footer], { type:'text/html;charset=utf-8' });
}

async function decompressText(compressed) {
  const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const decoder = new TextDecoder('utf-8', { fatal:true });
  const parts = [];
  let size = 0;
  let complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > archiveLimit) throw Error('HTML 工程超过大小限制。');
      parts.push(decoder.decode(value, { stream:true }));
    }
    complete = true;
    parts.push(decoder.decode());
    return parts.join('');
  } finally {
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function decodeArchive(payload) {
  const text = payload.slice(encoding.length);
  if (!payload.startsWith(encoding) || text.length > encodedLimit ||
      text.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(text)) {
    throw Error('HTML 工程的数据块无效。');
  }
  let archive;
  try {
    const compressed = decodeBase64url(text);
    if (compressed.byteLength > compressedLimit) throw Error('HTML 工程超过大小限制。');
    archive = JSON.parse(await decompressText(compressed));
  } catch (error) {
    throw Error('HTML 工程的数据无法读取。', { cause:error });
  }
  return requireArchive(archive);
}

export async function readHtmlProject(source) {
  if (source instanceof Blob) {
    if (source.size > documentLimit) throw Error('HTML 工程超过大小限制。');
    source = await source.text();
  }
  if (typeof source !== 'string' || source.length > documentLimit) {
    throw Error('HTML 工程超过大小限制。');
  }
  const marker = source.indexOf(dataTag);
  const start = marker + dataTag.length;
  const end = source.indexOf(scriptEnd, start);
  if (marker < 0 || end < 0 || source.indexOf(dataTag, start) >= 0) {
    throw Error('文件中没有有效的 NAC 工程。');
  }
  return decodeArchive(source.slice(start, end));
}

export async function htmlProjectFromHash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith(HTML_PROJECT_HASH_PREFIX)) return null;
  if (hash.length > launchLimit) throw Error('HTML 工程超过网址大小限制，请在网页内选择工程文件。');
  return decodeArchive(hash.slice(HTML_PROJECT_HASH_PREFIX.length));
}
