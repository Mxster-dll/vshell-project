/// 黑名单页（web .vshell-blacklist-body：#/blacklist 路由、无页头
/// margin-top 6px，导航按钮 circleSlash）
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../theme/vs_icons.dart';
import '../../theme/vs_theme.dart';
import '../widgets/video_card.dart';

class BlacklistPage extends StatelessWidget {
  const BlacklistPage({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final items = state.blacklist.values.toList();
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
                      Icon(VsIcons.circleSlash,
                          size: 36, color: VsTheme.fgDim),
                      const SizedBox(height: 10),
                      Text('暂无黑名单视频',
                          style:
                              TextStyle(color: VsTheme.fgDim, fontSize: 13)),
                    ],
                  ),
                )
              : LayoutBuilder(builder: (c, constraints) {
                  // 同 watchlist：minmax(400px,1fr)、gap 6、动态比例
                  final cols = (constraints.maxWidth / 400).floor().clamp(1, 8);
                  // 网格间距统一变量（设置页可调）
                  final gap = state.gridGap;
                  final w =
                      (constraints.maxWidth - 40 - gap * (cols - 1)) / cols;
                  final ratio = cover
                      ? w / (w * 9 / 16)
                      : w / (w * 9 / 16 + 92);
                  return GridView.builder(
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
