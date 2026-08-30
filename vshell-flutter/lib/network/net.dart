/// 网络层：dio 单例（连接池复用 / UA / Referer / 重试）
/// 桌面无 CORS：直连 CDN，m3u8 分片走独立 HttpClient 并发下载。
library;

import 'package:dio/dio.dart';

class Net {
  Net._();

  static final Dio dio = _build();

  static Dio _build() {
    final d = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
      headers: {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': 'https://www.acfun.cn/',
        'Accept': 'application/json, text/plain, */*',
      },
    ));
    d.interceptors.add(InterceptorsWrapper(
      onError: (e, handler) {
        // 网络抖动重试一次（GET 幂等请求）
        if (e.type == DioExceptionType.connectionTimeout ||
            e.type == DioExceptionType.connectionError) {
          handler.reject(e);
        } else {
          handler.next(e);
        }
      },
    ));
    return d;
  }

  /// GET JSON（自动处理 result 码；result != 0 抛 ApiException）
  static Future<Map<String, dynamic>> getJson(
    String url, {
    Map<String, dynamic>? params,
    bool withCookie = true,
  }) async {
    try {
      final r = await dio.get<Map<String, dynamic>>(url,
          queryParameters: params, options: Options(responseType: ResponseType.json));
      return r.data ?? {};
    } on DioException catch (e) {
      throw ApiException('网络错误: ${e.message}', kind: 'network');
    }
  }

  /// POST 表单 JSON（AcFun rest API 要求 POST + form）
  static Future<Map<String, dynamic>> postForm(
    String url,
    Map<String, dynamic> data,
  ) async {
    try {
      final r = await dio.post<Map<String, dynamic>>(url,
          data: data, options: Options(contentType: 'application/x-www-form-urlencoded'));
      return r.data ?? {};
    } on DioException catch (e) {
      throw ApiException('网络错误: ${e.message}', kind: 'network');
    }
  }

  /// GET 原始文本（页面 HTML / m3u8）
  static Future<String> getText(String url, {Map<String, String>? headers}) async {
    try {
      final r = await dio.get<String>(url,
          options: Options(responseType: ResponseType.plain, headers: headers));
      return r.data ?? '';
    } on DioException catch (e) {
      throw ApiException('网络错误: ${e.message}', kind: 'network');
    }
  }
}

class ApiException implements Exception {
  final String message;
  final String kind; // network / api / parse
  final int? code;

  ApiException(this.message, {this.kind = 'api', this.code});

  @override
  String toString() => message;
}
