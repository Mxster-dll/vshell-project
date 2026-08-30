/* ============================================================
 * fswriter — 文件写盘层（下载引擎的落盘抽象）
 * - FSA（Chromium）：showSaveFilePicker / showDirectoryPicker，
 *   FileSystemWritableFileStream 按 offset 写入（真并发写盘）
 * - 降级（非 Chromium / 被拒）：Blob 模式，内存攒块后触发浏览器下载
 * writer 接口：
 *   { kind:'fsa'|'blob', name, bytesWritten,
 *     write(data:ArrayBuffer, offset) → Promise,
 *     close() → Promise（fsa: 收流；blob: 触发下载）,
 *     abort() → Promise }
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  function fsaSupported() {
    return typeof window.showSaveFilePicker === 'function';
  }

  /* ---------- FSA 单文件 writer ---------- */
  function FsaFileWriter(handle, name) {
    this.kind = 'fsa';
    this.name = name;
    this.bytesWritten = 0;
    this._handle = handle;
    this._stream = null;
  }
  FsaFileWriter.prototype._open = async function () {
    if (!this._stream) {
      this._stream = await this._handle.createWritable();
    }
    return this._stream;
  };
  FsaFileWriter.prototype.write = async function (data, offset) {
    var s = await this._open();
    await s.write({ type: 'write', position: offset, data: data });
    var end = offset + data.byteLength;
    if (end > this.bytesWritten) this.bytesWritten = end;
  };
  FsaFileWriter.prototype.close = async function () {
    if (this._stream) { await this._stream.close(); this._stream = null; }
  };
  FsaFileWriter.prototype.abort = async function () {
    if (this._stream) { try { await this._stream.abort(); } catch (e) { /* noop */ } this._stream = null; }
  };

  /* ---------- Blob 降级 writer ---------- */
  function BlobWriter(name) {
    this.kind = 'blob';
    this.name = name;
    this.bytesWritten = 0;
    this._parts = []; // {offset, data}
  }
  BlobWriter.prototype.write = async function (data, offset) {
    this._parts.push({ offset: offset, data: data });
    var end = offset + data.byteLength;
    if (end > this.bytesWritten) this.bytesWritten = end;
  };
  BlobWriter.prototype.close = async function () {
    var parts = this._parts.slice().sort(function (a, b) { return a.offset - b.offset; });
    var blobs = [];
    var expect = 0;
    for (var i = 0; i < parts.length; i++) {
      // 允许空洞（失败块已重试补齐；此处仅组装落盘内容）
      blobs.push(parts[i].data);
    }
    var blob = new Blob(blobs, { type: 'video/mp4' });
    V.utils.downloadBlob(blob, this.name);
  };
  BlobWriter.prototype.abort = async function () { this._parts = []; };

  /* ---------- 目录 writer（双文件流式，每轨一个） ---------- */
  function FsaDirWriter(dirHandle, name) {
    this.kind = 'fsa';
    this.name = name;
    this.bytesWritten = 0;
    this._dir = dirHandle;
    this._handle = null;
    this._stream = null;
  }
  FsaDirWriter.prototype._open = async function () {
    if (!this._stream) {
      this._handle = await this._dir.getFileHandle(this.name, { create: true });
      this._stream = await this._handle.createWritable();
    }
    return this._stream;
  };
  FsaDirWriter.prototype.write = FsaFileWriter.prototype.write;
  FsaDirWriter.prototype.close = FsaFileWriter.prototype.close;
  FsaDirWriter.prototype.abort = FsaFileWriter.prototype.abort;
  /** 续传：返回已落盘字节数（bitmap 可跳过已写块） */
  FsaDirWriter.prototype.existingSize = async function () {
    try {
      var h = await this._dir.getFileHandle(this.name);
      var f = await h.getFile();
      return f.size;
    } catch (e) { return 0; }
  };

  /* ---------- 工厂（下载引擎用） ---------- */
  function createDirWriter(dir, name) { return new FsaDirWriter(dir, name); }
  function createBlobWriter(name) { return new BlobWriter(name); }

  /* ---------- 公开 API ---------- */
  V.fswriter = {
    supported: fsaSupported(),
    createDirWriter: createDirWriter,
    createBlobWriter: createBlobWriter,

    /** 单文件：合并 mp4 输出 / 单轨。取消→null；无 FSA→Blob 降级 writer */
    pickSaveFile: async function (defaultName) {
      if (fsaSupported()) {
        try {
          var h = await window.showSaveFilePicker({
            suggestedName: defaultName,
            types: [{
              description: '视频文件',
              accept: { 'video/mp4': ['.mp4', '.m4s', '.m4a'] },
            }],
          });
          return new FsaFileWriter(h, defaultName);
        } catch (e) {
          if (e && e.name === 'AbortError') return null; // 用户取消
          V.toast.error('文件系统权限被拒，改用浏览器下载模式');
          return new BlobWriter(defaultName);
        }
      }
      return new BlobWriter(defaultName);
    },

    /** 目录：双文件流式。非 Chromium → null（调用方走 Blob 双文件） */
    pickSaveDir: async function () {
      if (!fsaSupported()) return null;
      try {
        return await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (e) {
        if (e && e.name === 'AbortError') return null;
        return null;
      }
    },
  };
})();
