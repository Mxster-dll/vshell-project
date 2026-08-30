/// 播放器视图：media_kit（libmpv）播放 m3u8 + 自绘控件
/// 像素级复刻 web 版（components.css @38678-49200）：
/// - 底部独立进度条（永不隐藏）：4px 轨道 rgba(255,255,255,0.38) + 0 0 3px 阴影，
///   hover 8px、fill #0078D4 + 0 0 6px 光晕、宽度 450ms 平滑（拖动/seek 期 none）
/// - 控制条：底部渐变 transparent→rgba(0,0,0,0.72)、padding 10 12 12、gap 8、
///   200ms 滑入 translateY(8px)、按钮 30x30 radius 6 icon 15 hover rgba(255,255,255,0.18)
/// - 时间 12px tabular-nums min-width 96 居中 margin-right auto（播放钮+时间靠左）
/// - 音量 64x14（轨道 4px rgba(255,255,255,0.25) fill #fff）、倍速 10px、
///   分镜间隔滑块 96x4、全屏
/// - 中心播放钮 60px 圆 rgba(0,0,0,0.55) icon 26（hover 0.75）、暂停时显示
/// - seek 预览浮层：bottom 22px 160 宽 padding 4 radius 8 rgba(0,0,0,0.82)
///   + panel-border + 0 4px 16px 阴影；canvas 152x86 + 时间 11px tabular-nums
/// - buffering：全遮罩 rgba(0,0,0,0.35) + spinner 22px 2px listHover+chartsBlue
/// - 分镜分段模式：段间 2px 空隙、段轨道 rgba(255,255,255,0.2)、hover 只当前段 8px
library;

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:window_manager/window_manager.dart';

import '../../services/shots.dart';
import '../../theme/vs_icons.dart';
import '../../theme/vs_theme.dart';
import '../../theme/vs_tokens.dart';

class PlayerView extends StatefulWidget {
  final String url;
  final String title;
  /// 非空时启用分镜：边播边分析 + 进度条分段渲染（详情页传视频 id）
  final String? shotsId;
  /// 快扫完成信号（详情页触发快扫后 +1，播放器重新读缓存刷新分段）
  final ValueListenable<int>? shotsRev;

  const PlayerView(
      {super.key,
      required this.url,
      required this.title,
      this.shotsId,
      this.shotsRev});

  @override
  State<PlayerView> createState() => _PlayerViewState();
}

class _PlayerViewState extends State<PlayerView> {
  late final Player _player;
  late final VideoController _controller;
  Timer? _hideTimer;
  Timer? _attachTimer;
  Timer? _centerTimer;
  bool _controlsVisible = false;
  String? _peekedId; // web .is-peeked：控制条隐藏态鼠标命中的控件 id
  bool _playing = false;
  bool _seeking = false;
  bool _centerShow = false;
  bool _fs = false;

  Duration _pos = Duration.zero;
  Duration _dur = Duration.zero;
  Duration _buffered = Duration.zero;

  double _rate = 1.0;
  double _vol = 0.8;

  // seek 预览
  bool _seekPrevOn = false;
  double _seekHoverPct = 0;
  Uint8List? _prevFrame;
  double _prevFrameT = -1;

  // 分镜节点（约束后，用于进度条分段渲染）
  List<ShotNode> _shots = const [];
  final ShotAnalyzer _analyzer = ShotAnalyzer();
  bool _attachRunning = false;
  DateTime _lastSample = DateTime.fromMillisecondsSinceEpoch(0);

  static const _rates = [0.5, 1.0, 1.25, 1.5, 2.0];

  @override
  void initState() {
    super.initState();
    _player = Player();
    _controller = VideoController(_player);
    _player.stream.playing.listen((p) {
      if (!mounted) return;
      setState(() {
        _playing = p;
        if (p) _centerShow = false;
      });
      if (p) _armHide();
    });
    _player.stream.position.listen((p) {
      if (mounted) setState(() => _pos = p);
      // 不在此处 _armHide：播放中 position 高频更新会阻止控制条 700ms 自动隐藏
      // （web v0.3.94 契约：仅鼠标活动重置隐藏计时）
    });
    _player.stream.duration.listen((d) {
      if (mounted) setState(() => _dur = d);
    });
    _player.stream.buffer.listen((d) {
      if (mounted) setState(() => _buffered = d);
    });
    _player.stream.volume.listen((v) {
      if (mounted) setState(() => _vol = v);
    });
    _player.open(Media(widget.url));
    _initShots();
    widget.shotsRev?.addListener(_onShotsRev);
  }

  void _onShotsRev() {
    final sid = widget.shotsId;
    if (sid == null || !mounted) return;
    final cached = ShotsStore.instance.get(sid);
    if (cached != null) {
      setState(() {
        _shots = constrainShots(cached, ShotsStore.instance.minGap);
      });
    }
  }

  void _initShots() {
    final sid = widget.shotsId;
    if (sid == null || sid.isEmpty) return;
    final cached = ShotsStore.instance.get(sid);
    if (cached != null) {
      _analyzer.shots.addAll(cached);
      _shots = constrainShots(cached, ShotsStore.instance.minGap);
    }
    // 边播边分析：播放中每 ~300ms 截帧采样
    _attachTimer = Timer.periodic(const Duration(milliseconds: 300), (_) {
      if (!mounted || !_playing) return;
      final now = DateTime.now();
      if (now.difference(_lastSample).inMilliseconds < 300) return;
      _lastSample = now;
      _sampleOnce();
    });
  }

  Future<void> _sampleOnce() async {
    if (_attachRunning) return;
    _attachRunning = true;
    try {
      final shot = await _player.screenshot(format: 'image/png');
      if (shot == null || shot.isEmpty || !mounted) return;
      final px = await decodePixels(shot);
      if (px == null) return;
      final t = _pos.inMilliseconds / 1000;
      final feat = sampleRgba(px.rgba, px.w, px.h, t);
      final news = _analyzer.ingest(feat);
      if (news.isNotEmpty) {
        await ShotsStore.instance.save(widget.shotsId!, _analyzer.shots);
        if (mounted) {
          setState(() {
            _shots =
                constrainShots(_analyzer.shots, ShotsStore.instance.minGap);
          });
        }
      }
    } catch (_) {
      // 采样失败静默（帧未就绪）
    } finally {
      _attachRunning = false;
    }
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    _attachTimer?.cancel();
    _centerTimer?.cancel();
    widget.shotsRev?.removeListener(_onShotsRev);
    _player.dispose();
    super.dispose();
  }

  void _armHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(milliseconds: 700), () {
      if (mounted && _playing && !_seeking) {
        setState(() => _controlsVisible = false);
      }
    });
  }

  void _showControls() {
    _hideTimer?.cancel();
    if (!_controlsVisible && mounted) setState(() => _controlsVisible = true);
    _armHide();
  }

  void _togglePlay() {
    _playing ? _player.pause() : _player.play();
    _centerTimer?.cancel();
    _centerTimer = Timer(const Duration(milliseconds: 500), () {
      if (mounted) setState(() => _centerShow = false);
    });
  }

  Future<void> _seek(double fraction) async {
    final dur = _dur.inMilliseconds;
    if (dur <= 0) return;
    await _player.seek(Duration(milliseconds: (dur * fraction).round()));
  }

  Future<void> _cycleRate() async {
    final i = _rates.indexOf(_rate);
    final next = _rates[(i + 1) % _rates.length];
    await _player.setRate(next);
    if (mounted) setState(() => _rate = next);
  }

  void _setVol(double v) {
    _player.setVolume(v.clamp(0.0, 1.0));
  }

  /// seek 预览截帧（节流：位置变化 >=0.5s 才重截）
  Future<void> _updatePrevFrame(double t) async {
    if (t - _prevFrameT < 0.5 && _prevFrame != null) return;
    try {
      final shot = await _player.screenshot(format: 'image/jpeg');
      if (shot == null || shot.isEmpty || !mounted) return;
      setState(() {
        _prevFrame = shot;
        _prevFrameT = t;
      });
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onHover: (_) => _showControls(),
      onExit: (_) {
        if (mounted && _seekPrevOn) setState(() => _seekPrevOn = false);
      },
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Video(controller: _controller, controls: NoVideoControls),
          ),
          // 点击切换播放/暂停
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _togglePlay,
          ),
          // ---- 底部独立进度条（永不隐藏，web v0.3.95 契约） ----
          Positioned(left: 0, right: 0, bottom: 0, child: _bar()),
          // ---- seek 预览浮层 ----
          if (_seekPrevOn && !_seeking)
            Positioned.fill(
              child: IgnorePointer(
                child: LayoutBuilder(builder: (c, cons) {
                  final w = cons.maxWidth;
                  final x = (_seekHoverPct * w - 84)
                      .clamp(0.0, math.max(0.0, w - 168))
                      .toDouble();
                  return Align(
                    alignment: Alignment.bottomLeft,
                    child: Padding(
                      padding: EdgeInsets.only(left: x, bottom: 22),
                      child: _seekPrevBox(),
                    ),
                  );
                }),
              ),
            ),
          // ---- 控制条 ----
          _controls(),
          // ---- 中心播放钮 ----
          if (_centerShow) _centerBtn(),
          // ---- buffering 遮罩 + spinner ----
          StreamBuilder<bool>(
            stream: _player.stream.buffering,
            builder: (c, s) {
              if (s.data != true) return const SizedBox.shrink();
              return Container(
                color: const Color(0x59333333), // rgba(0,0,0,0.35)
                alignment: Alignment.center,
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: const AlwaysStoppedAnimation(VsToken.chartsBlue),
                    backgroundColor: VsTheme.listHover,
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  // ================= 控制条 =================
  // web peek 模式：控制条隐藏态容器 opacity 1 + 背景透明 + translateY(8px)，
  // 直接子控件各 opacity 0 + pointer-events none；.is-peeked 唯一显示
  // （JS mousemove 命中坐标 → 鼠标所在控件单显，120ms）
  Widget _controls() {
    return AnimatedSlide(
      offset: _controlsVisible ? Offset.zero : const Offset(0, 0.06),
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOut,
      child: MouseRegion(
        onExit: (_) {
          if (_peekedId != null) setState(() => _peekedId = null);
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
          // 恒有 decoration 保证隐藏态仍参与 hit test（peek 命中）
          decoration: BoxDecoration(
            gradient: _controlsVisible
                ? const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Color(0xB8000000)], // 0.72
                  )
                : const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Colors.transparent],
                  ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // 控件行（进度条在独立层贴底，这里不重复放）
              Row(
                children: [
                  _peekable('play',
                      _ctlBtn(_playing ? VsIcons.debugPause : VsIcons.play,
                          _togglePlay)),
                  const SizedBox(width: 2),
                  // 时间：12px tabular-nums min-width 96 居中，右侧自动留白
                  _peekable(
                    'time',
                    SizedBox(
                      width: 96,
                      child: Text(
                        '${_fmt(_pos)} / ${_fmt(_dur)}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback,
                            fontFeatures: [FontFeature.tabularFigures()]),
                      ),
                    ),
                  ),
                  const Spacer(),
                  // 分镜间隔滑块（有分镜 id 才显示）
                  if (widget.shotsId != null)
                    _peekable('gap', _gapSlider()),
                  // 倍速
                  _peekable('rate', _rateBtn()),
                  // 音量
                  _peekable('vol', _volBar()),
                  const SizedBox(width: 2),
                  // 全屏
                  _peekable(
                    'fs',
                    _ctlBtn(
                        _fs ? VsIcons.screenNormal : VsIcons.screenFull,
                        () async {
                      try {
                        final target = !_fs;
                        await windowManager.setFullScreen(target);
                        if (mounted) setState(() => _fs = target);
                      } catch (_) {}
                    }),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// peek 包裹：控制条可见 → 恒显；隐藏 → 仅鼠标命中的控件单显（120ms 淡入）
  Widget _peekable(String id, Widget child) {
    final show = _controlsVisible || _peekedId == id;
    return MouseRegion(
      onEnter: (_) {
        if (_peekedId != id) setState(() => _peekedId = id);
      },
      onExit: (_) {
        if (_peekedId == id) setState(() => _peekedId = null);
      },
      child: IgnorePointer(
        ignoring: !show,
        child: AnimatedOpacity(
          opacity: show ? 1 : 0,
          duration: const Duration(milliseconds: 120),
          child: child,
        ),
      ),
    );
  }

  /// 控制按钮（web .vshell-player-btn：30x30 r6 icon 15 白；
  /// hover rgba(255,255,255,0.18) + scale(1.08) 120ms）
  Widget _ctlBtn(IconData icon, VoidCallback onTap) {
    return _PlayerBtnHover(
      builder: (hover) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            color: hover ? const Color(0x2EFFFFFF) : Colors.transparent,
            borderRadius: const BorderRadius.all(Radius.circular(6)),
          ),
          child: Icon(icon, size: 15, color: Colors.white),
        ),
      ),
    );
  }

  Widget _rateBtn() {
    return GestureDetector(
      onTap: _cycleRate,
      child: Container(
        height: 30,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        alignment: Alignment.center,
        child: Text(
          '${_rate}x',
          style: const TextStyle(
              color: Colors.white, fontSize: 10, fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback),
        ),
      ),
    );
  }

  /// 音量条：64x14，轨道 4px rgba(255,255,255,0.25)，fill #fff
  Widget _volBar() {
    return GestureDetector(
      onTapDown: (d) {
        final w = 64.0;
        _setVol(d.localPosition.dx / w);
      },
      onHorizontalDragUpdate: (d) {
        final w = 64.0;
        _setVol(d.localPosition.dx / w);
      },
      child: SizedBox(
        width: 64,
        height: 14,
        child: Stack(
          alignment: Alignment.centerLeft,
          children: [
            // 轨道
            Container(
              height: 4,
              decoration: BoxDecoration(
                color: const Color(0x40FFFFFF), // rgba(255,255,255,0.25)
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            // fill
            FractionallySizedBox(
              widthFactor: _vol.clamp(0.0, 1.0),
              child: Container(
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 分镜间隔滑块：96x4 轨道 rgba(255,255,255,0.2) fill #0078D4
  /// 指数映射 0.1s~600s（web：0.1s~10min 13 档）；按钮显示当前值点击恢复 1.2s
  Widget _gapSlider() {
    final gap = ShotsStore.instance.minGap;
    final frac = (math.log(gap.clamp(0.1, 600) / 0.1) / math.log(6000)).toDouble()
        .clamp(0.0, 1.0);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 数值按钮（点击恢复默认 1.2s）
        GestureDetector(
          onTap: () {
            ShotsStore.instance.setMinGap(1.2);
            setState(() {});
          },
          child: Container(
            height: 30,
            constraints: const BoxConstraints(minWidth: 34),
            padding: const EdgeInsets.symmetric(horizontal: 5),
            alignment: Alignment.center,
            child: Text(
              _fmtGap(gap),
              style: const TextStyle(
                  color: Colors.white, fontSize: 11, fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback),
            ),
          ),
        ),
        const SizedBox(width: 6),
        // 滑块
        GestureDetector(
          onTapDown: (d) => _setGap(d.localPosition.dx / 96),
          onHorizontalDragUpdate: (d) => _setGap(d.localPosition.dx / 96),
          child: SizedBox(
            width: 96,
            height: 30,
            child: Stack(
              alignment: Alignment.centerLeft,
              children: [
                Container(
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0x33FFFFFF), // rgba(255,255,255,0.2)
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                FractionallySizedBox(
                  widthFactor: frac,
                  child: Container(
                    height: 4,
                    decoration: BoxDecoration(
                      color: VsTheme.accent,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  void _setGap(double f) {
    final v = 0.1 * math.pow(6000, f.clamp(0.0, 1.0)).toDouble();
    ShotsStore.instance.setMinGap(v.roundToDouble());
    setState(() {});
  }

  static String _fmtGap(double s) {
    if (s < 60) return '${s.toStringAsFixed(s < 10 ? 1 : 0)}s';
    return '${(s / 60).toStringAsFixed(0)}m';
  }

  // ================= 中心播放钮 =================
  Widget _centerBtn() {
    return Center(
      child: _PlayerBtnHover(
        builder: (hover) => GestureDetector(
          onTap: _togglePlay,
          child: Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              // web：rgba(0,0,0,0.55) hover 0.75
              color: hover ? const Color(0xBF000000) : const Color(0x8C000000),
            ),
            child: Icon(_playing ? VsIcons.debugPause : VsIcons.play,
                size: 26, color: Colors.white),
          ),
        ),
      ),
    );
  }

  // ================= 进度条（独立层，永不隐藏） =================
  Widget _bar() {
    return _ProgressBar(
      pos: _pos,
      dur: _dur,
      buffered: _buffered,
      seeking: _seeking,
      shots: _shots,
      onSeekStart: () {
        _seeking = true;
        _hideTimer?.cancel();
      },
      onSeekEnd: (f) {
        _seeking = false;
        _seek(f);
        _armHide();
      },
      onHoverPct: (p, t) {
        if (p < 0) {
          if (_seekPrevOn) setState(() => _seekPrevOn = false);
          return;
        }
        setState(() {
          _seekPrevOn = true;
          _seekHoverPct = p;
        });
        if (t >= 0) _updatePrevFrame(t);
      },
    );
  }

  Widget _seekPrevBox() {
    return Container(
          width: 160,
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: const Color(0xD1000000), // rgba(0,0,0,0.82)
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: VsToken.panelBorder),
            boxShadow: const [
              BoxShadow(
                  color: Color(0x80000000), blurRadius: 16, offset: Offset(0, 4)),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // 截帧 152x86（黑底）
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: Container(
                  width: 152,
                  height: 86,
                  color: Colors.black,
                  child: _prevFrame != null
                      ? Image.memory(_prevFrame!, fit: BoxFit.contain)
                      : null,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                _fmt(Duration(
                    milliseconds: (_dur.inMilliseconds * _seekHoverPct)
                        .round())),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
    );
  }

  static String _fmt(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes % 60;
    final s = d.inSeconds % 60;
    if (h > 0) return '$h:${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }
}

/// KKAV 风格进度条：4px 轨道 rgba(255,255,255,0.38)、hover 8px、
/// fill #0078D4 + 0 0 6px 光晕、拖动/seek 期宽度过渡 none
/// 命中区 19px（视觉 4px 贴底 + 上方 5px 扩展）
/// 分镜分段模式：有节点时渲染为段列表（段间 2px 空隙），hover 只当前段 8px
class _ProgressBar extends StatefulWidget {
  final Duration pos;
  final Duration dur;
  final Duration buffered;
  final bool seeking;
  final List<ShotNode> shots; // 约束后的分镜节点（空 = 整条模式）
  final VoidCallback onSeekStart;
  final ValueChanged<double> onSeekEnd;
  /// hover 位置回调（pct>=0 悬停中，-1 离开；t=悬停时间秒，-1 未知）
  final void Function(double pct, double t) onHoverPct;

  const _ProgressBar({
    required this.pos,
    required this.dur,
    required this.buffered,
    required this.seeking,
    this.shots = const [],
    required this.onSeekStart,
    required this.onSeekEnd,
    required this.onHoverPct,
  });

  @override
  State<_ProgressBar> createState() => _ProgressBarState();
}

class _ProgressBarState extends State<_ProgressBar> {
  bool _hover = false;
  int _hoverSeg = -1;
  double _dragPct = -1;

  double get _pct {
    final d = widget.dur.inMilliseconds;
    if (d <= 0) return 0;
    return (widget.pos.inMilliseconds / d).clamp(0.0, 1.0);
  }

  double get _bufferPct {
    final d = widget.dur.inMilliseconds;
    if (d <= 0) return 0;
    return (widget.buffered.inMilliseconds / d).clamp(0.0, 1.0);
  }

  /// 分段边界（0..1 区间，含首尾）
  List<double> _bounds() {
    final dur = widget.dur.inMilliseconds / 1000;
    if (dur <= 0) return const [0, 1];
    final list = <double>[0];
    for (final n in widget.shots) {
      if (n.t > 0 && n.t < dur) list.add(n.t / dur);
    }
    list.add(1);
    return list;
  }

  bool _segmented() {
    final dur = widget.dur.inMilliseconds / 1000;
    if (widget.shots.length < 2 || dur <= 0) return false;
    for (final n in widget.shots) {
      if (n.t > 0 && n.t < dur) return true;
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) {
        setState(() {
          _hover = false;
          _hoverSeg = -1;
        });
        widget.onHoverPct(-1, -1);
      },
      onHover: (e) {
        final w = context.size?.width ?? 1;
        final p = (e.localPosition.dx / w).clamp(0.0, 1.0);
        final d = widget.dur.inMilliseconds / 1000;
        widget.onHoverPct(p, d > 0 ? p * d : -1);
      },
      child: GestureDetector(
        onTapDown: (d) {
          widget.onSeekStart();
          final w = context.size?.width ?? 1;
          _dragPct = (d.localPosition.dx / w).clamp(0.0, 1.0);
          setState(() {});
          widget.onSeekEnd(_dragPct);
        },
        onHorizontalDragStart: (_) => widget.onSeekStart(),
        onHorizontalDragUpdate: (d) {
          final w = context.size?.width ?? 1;
          setState(() {
            _dragPct = (d.localPosition.dx / w).clamp(0.0, 1.0);
          });
        },
        onHorizontalDragEnd: (_) {
          widget.onSeekEnd(_dragPct);
          _dragPct = -1;
          setState(() {});
        },
        onHorizontalDragCancel: () {
          _dragPct = -1;
          setState(() {});
        },
        // 命中区 19px：视觉 4px 贴底
        // 注意：不能用 Positioned(left/right/bottom) 无 top/height——Flutter 对只设
        // bottom 的 positioned child 给 maxHeight=∞，FractionallySizedBox 高度取 ∞
        // 导致轨道/高度全乱（fill 只有 5px、轨道不可见）。用 Stack align 贴底。
        child: SizedBox(
          height: 19,
          child: Stack(
            alignment: Alignment.bottomCenter,
            children: [
              Align(
                alignment: Alignment.bottomCenter,
                child: _segmented() ? _segments() : _solidBar(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ---- 整条模式 ----
  Widget _solidBar() {
    final trackH = _hover || widget.seeking ? 8.0 : 4.0;
    final fill = _dragPct >= 0 ? _dragPct : _pct;
    return Container(
      height: trackH,
      width: double.infinity,
      decoration: BoxDecoration(
        color: const Color(0x61FFFFFF),
        boxShadow: const [
          BoxShadow(color: Color(0x99000000), blurRadius: 3),
        ],
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          // buffer：rgba(255,255,255,0.35)
          FractionallySizedBox(
            alignment: Alignment.centerLeft,
            widthFactor: _bufferPct,
            child: Container(color: const Color(0x59FFFFFF)),
          ),
          // fill：#0078D4
          // 无动画容器：position stream 高频重建会使 AnimatedFractionallySizedBox
          // 的 450ms 动画永远追赶不上（fill 冻结在早期，实测 94px→4px）
          FractionallySizedBox(
            alignment: Alignment.centerLeft,
            widthFactor: fill,
            child: Container(
              decoration: BoxDecoration(
                color: VsTheme.accent,
                borderRadius: BorderRadius.circular(2),
                boxShadow: [
                  BoxShadow(
                      color: VsTheme.accent.withValues(alpha: 0.6), blurRadius: 6),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ---- 分段模式 ----
  Widget _segments() {
    final bounds = _bounds();
    return LayoutBuilder(builder: (c, cons) {
      final w = cons.maxWidth;
      return SizedBox(
        height: 19,
        child: Stack(
          children: [
            for (var i = 0; i < bounds.length - 1; i++)
              Positioned(
                left: bounds[i] * w + (i == 0 ? 0 : 1),
                bottom: 0,
                width: (bounds[i + 1] - bounds[i]) * w -
                    (i == 0 || i == bounds.length - 2 ? 1 : 2),
                height: 19,
                child: _seg(i, bounds[i], bounds[i + 1], w),
              ),
          ],
        ),
      );
    });
  }

  Widget _seg(int i, double s0, double s1, double w) {
    final segH = (_hover && _hoverSeg == i) || widget.seeking ? 8.0 : 4.0;
    final p = _dragPct >= 0 ? _dragPct : _pct;
    double f;
    if (p >= s1) {
      f = 1;
    } else if (p > s0) {
      f = (p - s0) / (s1 - s0);
    } else {
      f = 0;
    }
    return MouseRegion(
      onEnter: (_) => setState(() => _hoverSeg = i),
      onExit: (_) => setState(() => _hoverSeg = -1),
      child: GestureDetector(
        onTapDown: (d) {
          widget.onSeekStart();
          final local = (d.localPosition.dx + s0 * w) / w;
          _dragPct = local.clamp(0.0, 1.0);
          setState(() {});
          widget.onSeekEnd(_dragPct);
        },
        onHorizontalDragUpdate: (d) {
          final local = (d.localPosition.dx + s0 * w) / w;
          setState(() => _dragPct = local.clamp(0.0, 1.0));
        },
        onHorizontalDragEnd: (_) {
          widget.onSeekEnd(_dragPct);
          _dragPct = -1;
          setState(() {});
        },
        child: Align(
          alignment: Alignment.bottomCenter,
          child: AnimatedContainer(
            duration:
                Duration(milliseconds: widget.seeking || _dragPct >= 0 ? 0 : 120),
            height: segH,
            decoration: BoxDecoration(
              color: const Color(0x33FFFFFF), // rgba(255,255,255,0.2)
              borderRadius: BorderRadius.circular(2),
            ),
            child: Stack(
              children: [
                // buffer
                FractionallySizedBox(
                  alignment: Alignment.centerLeft,
                  widthFactor: f >= 1
                      ? 1
                      : (_bufferPct >= s1
                          ? 1
                          : _bufferPct > s0
                              ? (_bufferPct - s0) / (s1 - s0)
                              : 0),
                  child: Container(color: const Color(0x59FFFFFF)),
                ),
                // fill（web：kk-progress-color #0078D4 + glow 0 0 6px）
                FractionallySizedBox(
                  alignment: Alignment.centerLeft,
                  widthFactor: f,
                  child: Container(
                    decoration: BoxDecoration(
                      color: VsTheme.accent,
                      borderRadius: BorderRadius.circular(2),
                      boxShadow: [
                        BoxShadow(
                            color: VsTheme.accent.withValues(alpha: 0.6),
                            blurRadius: 6),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// 播放器按钮 hover 包装（web .vshell-player-btn：
/// hover rgba(255,255,255,0.18) + scale(1.08) 120ms）
class _PlayerBtnHover extends StatefulWidget {
  final Widget Function(bool hover) builder;
  const _PlayerBtnHover({required this.builder});

  @override
  State<_PlayerBtnHover> createState() => _PlayerBtnHoverState();
}

class _PlayerBtnHoverState extends State<_PlayerBtnHover> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: AnimatedScale(
        scale: _hover ? 1.08 : 1.0,
        duration: const Duration(milliseconds: 120),
        child: widget.builder(_hover),
      ),
    );
  }
}
