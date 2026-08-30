/* 诊断：remux 丢帧定位（最后一帧？getSample null？） */
const fs = require('fs');
const path = require('path');
global.window = global;
global.MP4Box = require(path.join(__dirname, '..', 'vendor', 'mp4box.all.min.js'));

const fixture = (n) => {
  const buf = fs.readFileSync(path.join(__dirname, '..', '..', 'output', '_vs-fixtures', n));
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return ab;
};

for (const name of ['video.m4s', 'audio.m4s']) {
  const ab = fixture(name);
  ab.fileStart = 0;
  const f = MP4Box.createFile();
  f.appendBuffer(ab);
  f.flush();
  const trak = f.moov.traks[0];
  const samples = trak.samples;
  console.log('=== ' + name + ' ===');
  console.log('trak.samples.length:', samples.length);
  let nulls = 0, lastNull = -1;
  for (let i = 0; i < samples.length; i++) {
    const s = f.getSample(trak, i);
    if (!s || !s.data) { nulls++; lastNull = i; }
  }
  console.log('getSample nulls:', nulls, 'lastNullIdx:', lastNull);
  // 样本 dts/cts 首尾
  const first = samples[0], last = samples[samples.length - 1];
  console.log('first: dts=' + first.dts + ' cts=' + first.cts + ' dur=' + first.duration + ' size=' + first.size);
  console.log('last:  dts=' + last.dts + ' cts=' + last.cts + ' dur=' + last.duration + ' size=' + last.size);
  // 检查最后一个 mdat 是否完整（stream buffers）
  const mdats = f.mdats || [];
  console.log('mdat boxes:', mdats.length, mdats.map((m) => m.data ? m.data.length : 'null').join(','));
}
