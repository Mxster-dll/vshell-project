/// 本地视频页：导入（文件选择）/列表/删除/播放
library;

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/local_videos.dart';
import '../../state/app_state.dart';
import '../../theme/vs_icons.dart';
import '../../theme/vs_theme.dart';
import '../widgets/vs_toast.dart';
import '../widgets/thumb_host.dart';
import '../widgets/video_card.dart';

class LocalPage extends StatefulWidget {
  const LocalPage({super.key});

  @override
  State<LocalPage> createState() => _LocalPageState();
}

class _LocalPageState extends State<LocalPage> {
  @override
  void initState() {
    super.initState();
    final service = LocalVideosService.instance;
    // 截帧宿主注入（ThumbHost 提供真实渲染上下文，裸 Player 无法出帧）
    service.thumbFn = ThumbHost.capture;
    // 截帧完成（cover 更新）后刷新 UI
    service.onChanged = () {
      if (mounted) setState(() {});
    };
    // 封面缺失的旧条目补截帧（用户打开本地页时执行——启动期自动截帧会
    // 触发 media_kit 后台播放，与 Flutter debug 渲染管线冲突导致崩溃）
    service.healMissingCovers();
  }

  @override
  void dispose() {
    LocalVideosService.instance.onChanged = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final service = LocalVideosService.instance;
    final items = service.items;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 4),
          child: Row(
            children: [
              Text('本地视频',
                  style: TextStyle(
                      color: VsTheme.fg, fontSize: 16, fontWeight: FontWeight.w600)),
              const Spacer(),
              TextButton.icon(
                onPressed: () => _import(context),
                icon: const Icon(VsIcons.add, size: 14),
                label: const Text('导入视频'),
              ),
            ],
          ),
        ),
        Expanded(
          child: items.isEmpty
              ? Center(
                  child: Text('暂无本地视频\n点击「导入视频」添加本地文件',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: VsTheme.fgDim, fontSize: 13, height: 1.8)))
              : LayoutBuilder(builder: (c, constraints) {
                  // web .vshell-wall：minmax(400px,1fr)
                  final cols = (constraints.maxWidth / 400).floor().clamp(1, 8);
                  // 卡高 = 媒体 16:9 + 文字区固定高 92px → 动态比例；
                  // cover 布局卡片只有媒体区 → 恒 16:9
                  final cover = context.watch<AppState>().coverLayout;
                  // 网格间距统一变量（设置页可调）
                  final gap = context.watch<AppState>().gridGap;
                  final w =
                      (constraints.maxWidth - 40 - gap * (cols - 1)) / cols;
                  final ratio =
                      cover ? w / (w * 9 / 16) : w / (w * 9 / 16 + 92);
                  return GridView.builder(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 60),
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: cols,
                      mainAxisSpacing: gap,
                      crossAxisSpacing: gap,
                      childAspectRatio: ratio,
                    ),
                    itemCount: items.length,
                    itemBuilder: (c, i) {
                      final it = items[i];
                      return Stack(
                        children: [
                          VideoCard(
                            item: it,
                            onTap: () => context
                                .read<AppState>()
                                .go(PageType.detail, id: it.id),
                          ),
                          // 删除按钮（右下角，避免与右上角状态圆点重叠）
                          Positioned(
                            bottom: 4,
                            right: 4,
                            child: GestureDetector(
                              onTap: () => _remove(context, service, it.id),
                              child: Container(
                                width: 24,
                                height: 24,
                                decoration: BoxDecoration(
                                  color: const Color(0x99000000),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Icon(VsIcons.close,
                                    size: 12, color: Colors.white),
                              ),
                            ),
                          ),
                        ],
                      );
                    },
                  );
                }),
        ),
      ],
    );
  }

  Future<void> _import(BuildContext context) async {
    const typeGroup = XTypeGroup(
      label: '视频',
      extensions: ['mp4', 'webm', 'mkv', 'mov', 'avi', 'flv', 'm4v', 'ts'],
    );
    final files = await openFiles(acceptedTypeGroups: const [typeGroup]);
    if (files.isEmpty) return;
    final service = LocalVideosService.instance;
    var n = 0;
    for (final f in files) {
      final ok = await service.importFile(f.path);
      if (ok != null) n++;
    }
    if (context.mounted) {
      VsToast.show(context, '已导入 $n 个本地视频');
    }
  }

  Future<void> _remove(BuildContext context, LocalVideosService service, String id) async {
    await service.remove(id);
    if (context.mounted) {
      VsToast.show(context, '已删除本地视频');
    }
  }
}


