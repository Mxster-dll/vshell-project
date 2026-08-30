/* Node 端合并管线验证：直接加载浏览器 merger.js 源码（window shim） */
const fs = require('fs');
const path = require('path');

global.window = global;
global.MP4Box = require(path.join(__dirname, '..', 'vendor', 'mp4box.all.min.js'));
global.DataStream = global.MP4Box.DataStream || require(path.join(__dirname, '..', 'vendor', 'mp4box.all.min.js')).DataStream;

require(path.join(__dirname, '..', 'src', 'services', 'merger.js'));

const merger = global.window.VShell.merger;

function toAB(buf) {
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return ab;
}

(async () => {
  const videoBuf = fs.readFileSync(path.join(__dirname, '..', '..', 'output', '_vs-fixtures', 'video.m4s'));
  const audioBuf = fs.readFileSync(path.join(__dirname, '..', '..', 'output', '_vs-fixtures', 'audio.m4s'));
  console.log('video:', videoBuf.length, 'audio:', audioBuf.length);
  try {
    const merged = await merger.mergeTracks({
      video: toAB(videoBuf),
      audio: toAB(audioBuf),
      onProgress: (p) => console.log('progress', Math.round(p * 100) + '%'),
    });
    console.log('merged bytes:', merged.byteLength);
    fs.writeFileSync(path.join(__dirname, '..', '..', 'output', '_vs-merged.mp4'), Buffer.from(merged));
    console.log('written _vs-merged.mp4');
  } catch (e) {
    console.error('MERGE FAIL:', e.message);
    if (e.stack) console.error(e.stack.split('\n').slice(0, 6).join('\n'));
    process.exit(1);
  }
})();
