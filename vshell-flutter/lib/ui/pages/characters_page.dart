/// 角色管理页（--page=characters 入口；web 版角色管理 = 640 两栏浮窗
/// char-panel，页面模式复用同一面板内容，居中展示）
library;

import 'package:flutter/material.dart';

import '../../theme/vs_theme.dart';
import '../widgets/char_panel_dialog.dart';

class CharactersPage extends StatelessWidget {
  const CharactersPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: CharPanelDialog(asPage: true),
      ),
    );
  }
}
