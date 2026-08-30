/// 持久化层：shared_preferences 封装（对应 web 版 V.store 语义）
/// 命名空间前缀 vshell.；JSON 序列化存储。
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class VsStore {
  VsStore._();
  static final VsStore instance = VsStore._();

  static const _prefix = 'vshell.';
  SharedPreferences? _sp;

  Future<void> init() async {
    _sp ??= await SharedPreferences.getInstance();
  }

  SharedPreferences get _p {
    final sp = _sp;
    if (sp == null) {
      throw StateError('VsStore not initialized — call init() first');
    }
    return sp;
  }

  T? get<T>(String key, {T? def}) {
    final raw = _p.getString(_prefix + key);
    if (raw == null) return def;
    try {
      final d = jsonDecode(raw);
      // bool 值存为 JSON 字符串 '"true"'/'"false"'——解码结果是 String，需转 bool
      if (T == bool && d is String) {
        return (d == 'true') as T;
      }
      return d as T;
    } catch (_) {
      return def;
    }
  }

  Future<void> set(String key, Object value) =>
      _p.setString(_prefix + key, jsonEncode(value));

  Future<void> del(String key) => _p.remove(_prefix + key);

  /// 全量导出（备份）
  Map<String, dynamic> exportAll() {
    final out = <String, dynamic>{};
    for (final k in _p.getKeys()) {
      if (k.startsWith(_prefix)) {
        try {
          out[k.substring(_prefix.length)] = jsonDecode(_p.getString(k)!);
        } catch (_) {
          out[k.substring(_prefix.length)] = _p.getString(k);
        }
      }
    }
    return out;
  }
}
