/// 待看/收藏页（双视图复用）：网格展示 + 空态
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../theme/vs_icons.dart';
import '../../theme/vs_theme.dart';
import '../widgets/video_card.dart';

class WatchlistPage extends StatelessWidget {
  final bool watchOnly;
  const WatchlistPage({super.key, required this.watchOnly});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final all =
        watchOnly ? state.watch.values.toList() : state.fav.values.toList();
    // 黑名单过滤（web .vsc-video-blacklist 加入后从列表移除）
    final items = all.where((it) => !state.isBlacklisted(it.id)).toList();
    final title = watchOnly ? '待看' : '收藏';
    final cover = state.coverLayout;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: items.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(watchOnly ? VsIcons.bookmark : VsIcons.star,
                          size: 36, color: VsTheme.fgDim),
                      const SizedBox(height: 10),
                      Text(watchOnly ? '暂无待看视频' : '暂无收藏视频',
                          style: TextStyle(color: VsTheme.fgDim, fontSize: 13)),
                    ],
                  ),
                )
              : LayoutBuilder(builder: (c, constraints) {
                  // web .vshell-wall：minmax(400px,1fr)——列宽下限 400
                  final cols = (constraints.maxWidth / 400).floor().clamp(1, 8);
                  // 卡高 = 媒体 16:9 + 文字区固定高（padding 22 + 标题 2 行 47
                  // + meta 20 + 弹性 3 ≈ 92px）→ 动态比例防窄窗口溢出
                  // 网格间距统一变量（设置页可调）
                  final gap = state.gridGap;
                  final w =
                      (constraints.maxWidth - 40 - gap * (cols - 1)) / cols;
                  // cover 布局卡片只有媒体区 → 恒 16:9
                  final ratio =
                      cover ? w / (w * 9 / 16) : w / (w * 9 / 16 + 92);
                  return GridView.builder(
                    // web v0.3.85：待看/收藏无页头，body margin-top 6；
                    // page padding 20 + 底部 60 留白
                    padding: const EdgeInsets.fromLTRB(20, 6, 20, 60),
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: cols,
                      mainAxisSpacing: gap,
                      crossAxisSpacing: gap,
                      childAspectRatio: ratio,
                    ),
                    itemCount: items.length,
                    itemBuilder: (c, i) {
                      final it = items[i];
                      return VideoCard(
                        item: it,
                        onTap: () => context
                            .read<AppState>()
                            .go(PageType.detail, id: it.id),
                      );
                    },
                  );
                }),
        ),
      ],
    );
  }
}
