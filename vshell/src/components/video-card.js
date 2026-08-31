/* ============================================================
 * video-card — 视频卡片（视频墙视图）
 * 结构/样式/行为完全照搬 vscode-modern-ui skill 范例
 * examples/video-card.html（video-card 交互模式）：
 *   媒体区 16:9 = 链接（点击整图跳详情，a.vsc-video-media）：
 *     video 悬停预览 + shade 反向压暗 + 时长徽章 +
 *     悬停浮层「收藏♥左上 / 待看+右上」+ 静音钮右下 +
 *     播放/弹幕 icon+数字左下（学 bilibili，悬停隐藏）+ 播放进度条
 *   文字区（标题两行截断 + meta 两端：UP名(icon+名字)左 / 日期右，
 *     meta 相对卡片底部固定，不随标题高度漂移）
 * 行为：
 *   1) 悬停预览：mouseenter → V.preview.enter（帧采样预览——不连续
 *      播放解码全部帧，定时 seek 只取部分帧，目标倍速
 *      rate = min(15, max(0.1, duration/10))；paused 下 seek 不触发
 *      原生 timeupdate，preview 手动派发驱动底部进度条；
 *      prefers-reduced-motion 时不自动预览），
 *      mouseleave → V.preview.leave（停止采样、复位首帧）
 *   2) 点击图片 / 标题 / Enter：跳详情（#/video/<id>）；
 *      右下静音钮：切换静音（stopPropagation 不导航）
 *   3) 收藏/待看纯图标按钮：激活态切换（图标 + aria-pressed +
 *      aria-label/title），并持久化到 V.saved
 *   4) 时长徽章：优先 metadata 真实时长，失败回退 data-duration
 *   5) 播放中底部进度条（is-previewing 时显示，leave 复位 0）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  /** 卡片：item = { id, title, pic, duration, owner, stat }
   *  opts.layout：'cover' → 封面布局（图片占满卡片、标题浮封面顶部、
   *    UP 不显示、日期放时长左侧）；默认 standard（封面 + 文字区） */
  function create(item, opts) {
    opts = opts || {};
    // v0.5.6 需求：角色主页视频墙不显示左上角角色头像角标（noTagIcon）
    var noTagIcon = !!opts.noTagIcon;
    // v0.5.6 第二十二轮需求 2：本地视频卡封面兜底——saved 快照（待看/收藏
    // 页）/旧角色快照在导入时 cover 可能为空，卡片渲染时从 localVideos
    // 内存补（find 同时会触发懒截帧自愈，封面稍后生成）
    if ((item.local || /^local:/.test(item.id || '')) && !item.cover
      && V.localVideos && V.localVideos.find) {
      var lv = V.localVideos.find(item.id);
      if (lv && lv.cover) item.cover = lv.cover;
    }
    // v0.6.1 视频聚合：成员卡折叠成组卡——显示主成员封面+标题，
    // id 换组 id、href 进组详情（#/video/grp:<id>），右上角加组角标。
    // 两种来源：①成员卡（item.id 真实 id，按（源,id）反查组）
    // ②组项快照（待看/收藏/黑名单存组 id，item.id 即 grp:xxx）
    var grp = null;
    var origItem = item;   // 组卡时保留原始成员引用（懒扫描/状态用）
    if (V.aggregations) {
      if (V.aggregations.isGroupId(item.id)) {
        grp = V.aggregations.getGroup(item.id);
      } else if (item.sourceId && item.sourceId !== 'local') {
        grp = V.aggregations.groupOf(item.sourceId, item.id);
      }
    }
    if (grp) {
      var _gid = grp.id;
      item = {
        id: _gid,
        title: grp.title || item.title,
        pic: grp.cover || item.pic,
        cover: grp.cover || item.cover,
        duration: item.duration,
        owner: item.owner,
        stat: item.stat,
        sourceId: grp.coverSrc || item.sourceId,
        _grp: true,
      };
    }
    var cover = opts.layout === 'cover';
    var saved = V.saved || {};
    // v0.5.7 多源：收藏/待看状态按（源,id）查（item.sourceId 标注归属）
    var isWatch = saved.isWatch(item.id, item.sourceId);
    var isFav = saved.isFav(item.id, item.sourceId);
    // v0.2.0 观看历史：看过（连续播放满 5s）的卡片背景 #181818，未看过 #1f1f1f
    var watched = !!(V.watched && V.watched.isWatched(item.id));

    var card = V.utils.el('article', {
      className: 'vsc-video-card' + (watched ? ' is-watched' : ''),
      'data-id': item.id,
      'data-src': item.sourceId || '',   // v0.5.7 多源：归属源（差量删除按（源,id）匹配）
    });

    // v0.5.7：源未启用（角色页/收藏页全源快照可见但源未激活，**含内置源**）→
    // 卡片置灰+角标（与详情页「数据源未启用」提示一致）
    var srcDisabled = item.sourceId && item.sourceId !== 'local'
      && V.multisource && V.multisource.activeSources().indexOf(item.sourceId) < 0;
    if (srcDisabled) card.classList.add('src-disabled');

    // ===== 媒体区（链接：点击整图跳详情；demo 结构 + 进度条）=====
    // v0.6.1 聚合：组卡 href = #/video/grp:<组id>（进组详情切源页）
    var cardHref = item._grp
      ? '#/video/grp:' + encodeURIComponent(item.id.slice(4))
      : '#/video/' + (item.sourceId && item.sourceId !== 'local'
          ? item.sourceId + ':' : '') + encodeURIComponent(item.id);
    var media = V.utils.el('a', {
      className: 'vsc-video-media',
      href: cardHref,
      'aria-label': item.title,
    });
    var video = V.utils.el('video', {
      className: 'vsc-video',
      poster: item.pic || item.cover || '',
      muted: '',
      playsinline: '',
      preload: 'metadata',
      tabindex: '0',
      'aria-label': item.title,
      // 禁用浏览器视频浮层（Edge 快速操作 / PiP 按钮）：无原生 UI
      disablepictureinpicture: '',
      controlslist: 'nodownload noremoteplayback noplaybackrate',
    });
    // 保险：setAttribute('muted','') 后 property 在部分环境（headless 实测）为 false——
    // 显式赋值保证初始静音预览（用户取消静音后由 toggleMute 驱动）
    video.muted = true;
    // 通用封面兜底（v0.6.5 提升到解密分支外）：解密失败（auth_key 过期/域名
    // 失效 403）→ 详情接口刷新 pic（新 auth_key）；仍失败 → 渐变占位不黑。
    function refreshCover() {
      var ad;
      try { ad = V.siteAdapters.adapterFor(item.sourceId); } catch (e) { ad = null; }
      if (!ad || typeof ad.getVideoDetail !== 'function') { showCoverPlaceholder(); return; }
      ad.getVideoDetail(item.id).then(function (d) {
        if (d && d.pic && d.pic !== _raw) {
          video.poster = d.pic;   // 17c 详情 pic 为解密后 blob
          if (d.pic.indexOf('blob:') === 0) return;
        }
        showCoverPlaceholder();
      }).catch(showCoverPlaceholder);
    }
    function showCoverPlaceholder() {
      if (card.classList.contains('is-local-nocover')) return;
      card.classList.add('is-local-nocover');
      if (!placeholder) {
        placeholder = V.utils.el('span', { className: 'vsc-video-placeholder' },
          V.utils.el('span', { className: 'codicon codicon-file-media' }));
        media.appendChild(placeholder);
      }
    }
    // v0.6.0 加密封面懒解密：源注册了解密器（pic 是加密 URL，blob 不可持久化）
    // → poster 先空，异步解密后回填。否则缓存加载的 blob URL 重启失效 → 封面黑。
    // v0.6.5 组卡（item._grp）不走此分支：组封面统一走 picUrlOf（见下）。
    if (!item._grp && item.pic && item.sourceId && V.siteAdapters && V.siteAdapters.picDecryptorFor) {
      var _dec = V.siteAdapters.picDecryptorFor(item.sourceId);
      if (_dec) {
        var _raw = item.pic;
        video.removeAttribute('poster');
        video.poster = '';
        _dec(_raw).then(function (u) {
          if (u) video.poster = u;
          else refreshCover();
        }).catch(refreshCover);
      }
    }
    // v0.6.5 组卡封面：grp.cover 可能是相对路径（kkav 需拼 baseUrl）或密文
    // URL（17c 需 XOR 解密）——统一走 aggregations.picUrlOf 解析（resolvePicUrl
    // 自动解密 + wallBaseUrl 拼域名）。
    // v0.6.10 解密失败（17c auth_key 过期 403）→ 用组**主成员**详情刷新封面
    //（17c 详情 pic 为解密后 blob，新 auth_key），仍失败 → 渐变占位不黑。
    if (item._grp && item.pic && V.aggregations && V.aggregations.picUrlOf) {
      var _raw = item.pic;
      video.removeAttribute('poster');
      video.poster = '';
      V.aggregations.picUrlOf(item.sourceId, { pic: _raw }).then(function (u) {
        if (u) video.poster = u;
        else refreshGroupCover();
      }).catch(refreshGroupCover);
      function refreshGroupCover() {
        var g = V.aggregations.getGroup(item.id);
        var ms = (g && g.members) || [];
        if (!ms.length) { showCoverPlaceholder(); return; }
        var ad;
        try { ad = V.siteAdapters.adapterFor(ms[0].src); } catch (e) { ad = null; }
        if (!ad || typeof ad.getVideoDetail !== 'function') { showCoverPlaceholder(); return; }
        ad.getVideoDetail(ms[0].id).then(function (d) {
          if (d && d.pic) { video.poster = d.pic; return; }
          showCoverPlaceholder();
        }).catch(showCoverPlaceholder);
      }
    }
    // v0.5.6 第二十三轮：**无封面占位**——本地视频无任何封面图（截帧未
    // 完成/失败）时卡片不显示纯黑：media 上盖渐变+文件 icon 占位层（悬停
    // 时淡出让位给视频预览；懒截帧成功热更新 poster 并移除占位）
    // 注意：cover 变量已被布局标志占用（opts.layout==='cover'），此处按
    // 封面 URL 判定
    // v0.5.7 扩展：**所有源** pic/cover 都缺的卡片也占位（缓存里残留的
    // 幽灵条目——封面 URL 缺失——不再显示空白/破图，统一渐变+icon）
    var noCover = !item.cover && !item.pic;
    if (noCover) card.classList.add('is-local-nocover');
    var placeholder = noCover
      ? V.utils.el('span', { className: 'vsc-video-placeholder' },
          V.utils.el('span', { className: 'codicon codicon-file-media' }))
      : null;
    var shade = V.utils.el('div', { className: 'vsc-video-shade' });

    // 悬停浮层：待看=右上（primary）、收藏=左上（secondary）
    // v0.5.6 第十三轮曾加 noActions（代表作排纯展示），第十四轮需求 3
    // 撤销——滚动排卡也要显示收藏/待看/代表作按钮（黑名单/静音一直在，
    // 只藏 actions 会让按钮"残缺"）
    var actions = V.utils.el('div', { className: 'vsc-video-actions' });
    var watchBtn = V.utils.el('button', {
      className: 'vsc-video-btn primary vsc-video-btn-watch' + (isWatch ? ' is-active' : ''),
      type: 'button',
      'aria-label': isWatch ? '已加入待看' : '加入待看',
      title: isWatch ? '已加入待看' : '加入待看',
      'aria-pressed': isWatch ? 'true' : 'false',
    }, [V.utils.el('span', { className: 'codicon ' + (isWatch ? 'codicon-check' : 'codicon-add') })]);
    var favBtn = V.utils.el('button', {
      className: 'vsc-video-btn secondary vsc-video-btn-star' + (isFav ? ' is-active' : ''),
      type: 'button',
      'aria-label': isFav ? '已收藏' : '收藏',
      title: isFav ? '已收藏' : '收藏',
      'aria-pressed': isFav ? 'true' : 'false',
    }, [V.utils.el('span', { className: 'codicon ' + (isFav ? 'codicon-heart-filled' : 'codicon-heart') })]);
    actions.appendChild(watchBtn);
    actions.appendChild(favBtn);

    // 时长徽章（常驻右下，纯文字；metadata 就绪后按真实时长校正）
    var badgeText = V.utils.el('span', {
      className: 'vsc-video-badge-text',
      'data-duration': V.utils.fmtTime(item.duration),
    }, V.utils.fmtTime(item.duration));
    var badge = V.utils.el('span', { className: 'vsc-video-badge' }, [badgeText]);

    // 播放/弹幕（图片区左下，学 bilibili：icon + 纯数字；悬停隐藏；
    //   danmaku 缺失只显示播放；icon 用 codicon（play=播放三角、comment=弹幕气泡））
    // v0.6.26：数据源没返回播放数（view 为 null/undefined/''）→ 整个 stats 不渲染
    // （不兜底 0，避免「没数据」伪装成「真 0」）；真 0 正常显示
    var _st = item.stat || {};
    var _hasView = _st.view !== undefined && _st.view !== null && _st.view !== '';
    var stats = _hasView ? V.utils.el('span', { className: 'vsc-video-stats' }, [
      V.utils.el('span', { className: 'codicon codicon-play' }),
      V.utils.el('span', { className: 'vsc-video-stats-num' }, V.utils.fmtCount(_st.view)),
      _st.danmaku ? [
        V.utils.el('span', { className: 'vsc-video-stats-sep' }, ' · '),
        V.utils.el('span', { className: 'codicon codicon-comment' }),
        V.utils.el('span', { className: 'vsc-video-stats-num' }, V.utils.fmtCount(_st.danmaku)),
      ] : null,
    ]) : null;

    // 静音钮（右下，悬停浮现）
    var mute = V.utils.el('button', {
      className: 'vsc-video-mute is-muted',
      type: 'button',
      'aria-label': '取消静音',
    }, [V.utils.el('span', { className: 'codicon codicon-mute' })]);

    // 黑名单按钮（左下角，悬停浮现；用户需求 v0.3.2：屏蔽单个视频）
    // 点击 → 加入黑名单 + 卡片立即从当前墙移除（全站过滤由各页 load 时
    // V.blacklist.filter 兜底；待看/收藏不受影响，面板可解除）
    // v0.3.85：黑名单页（opts.blacklistMode）按钮反转为「解除屏蔽」
    var blackBtn = V.utils.el('button', {
      className: 'vsc-video-blacklist',
      type: 'button',
      title: opts.blacklistMode ? '解除屏蔽' : '屏蔽该视频',
      'aria-label': opts.blacklistMode ? '解除屏蔽' : '屏蔽该视频',
    }, [V.utils.el('span', { className: 'codicon codicon-circle-slash' })]);

    // 播放进度条（预览播放时图片内底部；leave 复位）
    var progressFill = V.utils.el('div', { className: 'vsc-video-progress-fill' });
    var progress = V.utils.el('div', { className: 'vsc-video-progress' }, [progressFill]);

    // 状态点（v0.3.0 用户需求改义）：右上角常驻——蓝点=已加入待看、
    // 红点=已收藏（红与收藏按钮 active 一致 errorForeground）；悬停隐藏
    // v0.5.6 第十二轮需求 9：圆点**3x3 网格**布局（位置编号按矩阵
    //   5 2 1 / 6 4 3 / 9 8 7：1=右上角、2=1左边、3=2左边（第一行）
    //   →4=第二行右、5=第二行中、6=第二行左→…）
    // 需求 2：本地视频追加 .is-local 圆点；需求 8：代表作卡追加
    // .is-featured-mark 圆点
    // v0.5.6 第十九轮需求 2：顺序改为**本地 → 收藏 → 代表作 → 待看**
    // （用户改序）；代表作圆点**全局生效**——opts.featured 未显式指定时
    // 用 characters.featuredOf(item.id) 查（任何页面的卡，只要该视频是
    // 某角色的代表作就显示金点，不只在角色主页）
    // v0.5.6 第十八轮需求 2：MARK_POS 映射修正——按用户矩阵
    //   5 2 1 / 6 4 3 / 9 8 7
    // 位置 1=右上(row1col3)、2=中上(row1col2)、**3=中右(row2col3)**、
    // 4=中中、5=左上(row1col1)、6=左中、7=右下、8=下中、9=左下。
    // 此前 3:[1,1]、4:[2,3]、5:[2,2] 错位 → 三个点（收藏/本地/代表作）
    // 显示成右上+中上+左上（第一行一条线），用户指出与 demo 不一致
    var MARK_POS = { 1: [1, 3], 2: [1, 2], 3: [2, 3], 4: [2, 2], 5: [1, 1], 6: [2, 1], 7: [3, 3], 8: [3, 2], 9: [3, 1] };
    var marks = [];
    // v0.6.1 聚合：组角标（新颜色 is-group-mark，固定占矩阵位置 1=右上角，
    // 其余状态点顺延——placeMarks 按可见点 1..n 动态分配）
    if (grp) {
      marks.push(V.utils.el('span', {
        className: 'vsc-video-saved-mark is-group-mark',
        title: '已聚合 ' + grp.members.length + ' 个视频（点击查看全部来源）',
      }));
    }
    // 顺序：本地 → 收藏 → 代表作 → 待看（v0.5.6 第十九轮）
    // v0.5.6 第二十轮需求 1：快照（charVideos/fm）可能丢 local 字段——
    // 用 id 前缀 'local:' 兜底识别本地视频（marquee 卡补圆点）
    var localMark = (item.local || /^local:/.test(item.id || ''))
      ? V.utils.el('span', { className: 'vsc-video-saved-mark is-local', title: '本地视频' })
      : null;
    if (localMark) marks.push(localMark);
    var favMark = V.utils.el('span', {
      className: 'vsc-video-saved-mark is-fav' + (V.saved.isFav(item.id, item.sourceId) ? '' : ' is-hidden'),
      title: '已收藏',
    });
    marks.push(favMark);
    // v0.5.6 第十九轮需求 2：代表作点全局——opts.featured 显式指定优先
    // （角色主页传显式值），否则查 characters.featuredOf
    var isFeat = opts.featured !== undefined ? !!opts.featured
      : !!(V.characters && V.characters.featuredOf && V.characters.featuredOf(item.id));
    var featMark = isFeat
      ? V.utils.el('span', { className: 'vsc-video-saved-mark is-featured-mark', title: '代表作' })
      : null;
    if (featMark) marks.push(featMark);
    var watchMark = V.utils.el('span', {
      className: 'vsc-video-saved-mark is-watch' + (V.saved.isWatch(item.id, item.sourceId) ? '' : ' is-hidden'),
      title: '已加入待看',
    });
    marks.push(watchMark);
    var savedMarks = V.utils.el('div', { className: 'vsc-video-saved-marks' }, marks);
    // 位置按**可见点**动态分配（按本地→收藏→代表作→待看顺序依次填
    // 1..n）——is-hidden 的点不占位（v0.5.6 第十三/十四轮；第十七轮把
    // 分配抽成 placeMarks() 供 syncMarks 重排——收藏/待看切换后点不串位）
    function placeMarks() {
      var vi = 0;
      marks.forEach(function (m) {
        if (!m || m.classList.contains('is-hidden')) return;
        vi += 1;
        var p = MARK_POS[vi];
        if (!p) return;
        m.style.gridRow = String(p[0]);
        m.style.gridColumn = String(p[1]);
      });
    }
    placeMarks();
    function syncMarks() {
      watchMark.classList.toggle('is-hidden', !V.saved.isWatch(item.id, item.sourceId));
      favMark.classList.toggle('is-hidden', !V.saved.isFav(item.id, item.sourceId));
      placeMarks();   // 收藏/待看切换后重新分配位置
    }

    // 角色（v0.5.0，标签功能升级）：首次加载自动匹配赋予/冲突判定
    // charFor 结果：char（已赋予，含自动匹配）/ conflict（多角色冲突）/ none
    var charsMod = V.characters;
    var cres = charsMod && charsMod.charFor ? charsMod.charFor(item.id, item) : { kind: 'none' };
    var roleChar = cres.kind === 'char' ? cres.char : null;
    var conflictChars = cres.kind === 'conflict' ? cres.chars : null;

    // 标题高亮素材：已赋予角色 → 该角色关键词；冲突 → 候选角色名
    var hlChars = roleChar ? [roleChar]
      : (conflictChars ? conflictChars.map(function (n) { return { name: n }; }) : []);

    // 角色角标（v0.5.0）：左上角——已赋予 → 角色图/白底首字；
    // 冲突 → 冲突 icon（可点击打开处理弹窗，用户拍板：不自动弹窗）；
    // 无角色 → 不显示
    // v0.5.6 第七轮曾把已赋予角标改为可点击进角色主页（用户需求 1），
    // 用户反馈"不实用"回退：已赋予角标恢复纯展示 span，不可点击；
    // 进主页入口统一走左下角角色名（meta-owner button）
    // v0.5.6 OOM 修复：tagIcons **始终创建**（无角色 display:none）——
    // card.__updateChar 差量更新只需改 innerHTML/display，无需动态建删
    var tagIcons = V.utils.el('div', { className: 'vsc-video-tag-icons' });
    /** 视频快照（conflict 弹窗 meta 参数；角色主页「手动添加」列表数据源） */
    function metaSnap() {
      return {
        id: item.id,
        bvid: item.bvid || item.id,
        title: item.title || '',
        cover: item.cover || item.pic || '',
        url: item._grp
          ? '#/video/grp:' + encodeURIComponent(item.id.slice(4))
          : '#/video/' + (item.sourceId && item.sourceId !== 'local'
              ? item.sourceId + ':' : '') + item.id,
        pubdate: item.pubdate || '',
      };
    }
    /** 差量更新：重算 charFor → 重建角标（角色 box / 冲突按钮 / 无 → 隐藏） */
    function renderTagIcons() {
      if (noTagIcon) { tagIcons.style.display = 'none'; return; }   // 角色主页：不显示角标
      var cres2 = charsMod && charsMod.charFor ? charsMod.charFor(item.id, item) : { kind: 'none' };
      var roleChar2 = cres2.kind === 'char' ? cres2.char : null;
      var conflictChars2 = cres2.kind === 'conflict' ? cres2.chars : null;
      tagIcons.innerHTML = '';
      if (conflictChars2) {
        var cbox2 = V.utils.el('button', {
          className: 'vsc-video-tag-icon is-conflict',
          type: 'button',
          title: '匹配到多个角色：' + conflictChars2.join('、') + '——点击选择',
          'aria-label': '角色冲突，点击选择',
        }, [V.utils.el('span', { className: 'codicon codicon-circle-slash' })]);
        cbox2.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          if (V.charPicker && V.charPicker.conflict) {
            V.charPicker.conflict(item.id, item.title, conflictChars2, metaSnap(), item.sourceId);
          }
        });
        tagIcons.appendChild(cbox2);
      } else if (roleChar2) {
        var box2 = V.utils.el('span', {
          className: 'vsc-video-tag-icon',
          title: '角色：' + roleChar2.name,
        });
        if (roleChar2.icon) {
          var img2 = V.utils.el('img', {
            src: roleChar2.icon,
            alt: '',
            loading: 'lazy',
            onerror: function () {
              box2.innerHTML = '';
              box2.appendChild(V.utils.el('span', { className: 'codicon codicon-tag' }));
            },
          });
          box2.appendChild(img2);
        } else {
          // 无图角色（沿用 v0.3.3 惯例）：白底圆角方框 + 角色首字
          box2.classList.add('is-letter');
          box2.appendChild(V.utils.el('span', { className: 'vsc-video-tag-letter' },
            String(roleChar2.name).charAt(0) || '?'));
        }
        tagIcons.appendChild(box2);
      }
      tagIcons.style.display = (roleChar2 || conflictChars2) ? '' : 'none';
      // v0.5.6 用户需求：无角色角标（display:none）时标题浮层不避让——
      // has-char 类驱动 CSS 的 padding-left:54px（兄弟选择器只认元素存在，
      // 不认 display:none，必须显式类切换）
      tagIcons.classList.toggle('has-char', !!(roleChar2 || conflictChars2));
    }
    renderTagIcons();

    // 标题（v0.3.0 起：标题内高亮匹配关键词；tag 对象数组 [{name, icon}]）
    // standard：文字区链接；cover：封面顶部浮层（media 是链接，h3 不挡点击）。
    // 注意：cover 的 h3 不能带 vsc-video-title 类——`.vshell .vsc-video-title`
    //   color: surface-foreground（0,2,0）会盖过 title-cover 的 #fff（0,1,0），
    //   实测标题变灰 #ccc（用户需求：增亮）
    var title = cover
      ? V.utils.el('h3', {
          className: 'vsc-video-title-cover',
          title: item.title,
        })
      : V.utils.el('a', {
          className: 'vsc-video-title',
          // v0.5.7 多源：卡片 href 带源前缀 #/video/<源>:<id>（跨源同 id
          // 是不同实体；本地视频 sourceId='local' 用原 id 含 local: 前缀）
          // v0.6.1 聚合：组卡 href = #/video/grp:<组id>
          href: item._grp
            ? '#/video/grp:' + encodeURIComponent(item.id.slice(4))
            : '#/video/' + (item.sourceId && item.sourceId !== 'local'
                ? item.sourceId + ':' : '') + encodeURIComponent(item.id),
          title: item.title,
        });
    /** 差量更新：重算角色 → 重建标题关键词高亮（不改标题文本/href） */
    function renderTitle() {
      var cres2 = charsMod && charsMod.charFor ? charsMod.charFor(item.id, item) : { kind: 'none' };
      var hlChars2 = cres2.kind === 'char' ? [cres2.char]
        : (cres2.kind === 'conflict' ? cres2.chars.map(function (n) { return { name: n }; }) : []);
      var nodes = highlightTitle(item.title, hlChars2);
      title.replaceChildren.apply(title, [].concat(nodes));
    }
    renderTitle();

    media.appendChild(video);
    media.appendChild(shade);
    if (placeholder) media.appendChild(placeholder);
    media.appendChild(actions);
    if (stats) media.appendChild(stats);
    if (cover) {
      // 封面布局：日期 + 时长徽章 → 右下角一排（日期在时长左侧，用户需求）
      var dateEl = V.utils.el('span', { className: 'vsc-video-cover-date' },
        item.pubdate ? fmtDate(item.pubdate) : '');
      var rightBox = V.utils.el('div', { className: 'vsc-video-cover-right' }, [dateEl, badge]);
      media.appendChild(rightBox);
    } else {
      media.appendChild(badge);
    }
    media.appendChild(mute);
    media.appendChild(blackBtn);
    media.appendChild(progress);
    // v0.5.7：源未启用角标（角色页全源快照卡——源未激活时置灰+提示）
    if (srcDisabled) {
      media.appendChild(V.utils.el('span', { className: 'vsc-video-src-disabled' },
        V.utils.el('span', { className: 'codicon codicon-unverified' })));
    }
    if (savedMarks) media.appendChild(savedMarks);
    if (tagIcons && !noTagIcon) media.appendChild(tagIcons);
    // 封面布局：标题浮层最后渲染（层叠最高，悬停浮层 z-3 仍可盖住角落按钮）
    if (cover) media.appendChild(title);

    // ===== 文字区（standard 布局：meta 两端——角色名/空 靠左、日期靠右）=====
    // v0.5.0 用户需求：底部不再显示 UP 名——视频包含角色 → 原 UP 位置
    // 以完全相同的方式显示角色名；无角色 → 什么都不显示（含 UP icon）
    // v0.5.6 第七轮：①角色名可点击 → 角色主页（统一入口，需求 1）
    //   ②opts.noRoleMeta：角色主页内不显示角色名（需求 5）
    // 注意：media 必须先 append（卡片 flex column 下 body 在 media 下方——
    // 顺序颠倒会让标题跑到图片上方，用户反馈 bug）
    card.appendChild(media);
    if (!cover) {
      var body = V.utils.el('div', { className: 'vsc-video-body' });
      var meta = V.utils.el('div', { className: 'vsc-video-meta' });
      /** 差量更新：重建 meta 行（角色名按钮 / 冲突红字 / 无 → 日期 flex-end） */
      function renderMeta() {
        var cres2 = charsMod && charsMod.charFor ? charsMod.charFor(item.id, item) : { kind: 'none' };
        var roleChar2 = cres2.kind === 'char' ? cres2.char : null;
        var conflictChars2 = cres2.kind === 'conflict' ? cres2.chars : null;
        meta.innerHTML = '';
        if (!opts.noRoleMeta && roleChar2) {
          meta.appendChild(V.utils.el('button', {
            className: 'vsc-video-meta-owner',
            type: 'button',
            title: '角色：' + roleChar2.name + '——点击进入角色主页',
            'aria-label': '角色：' + roleChar2.name + '，点击进入角色主页',
            onclick: function (e) {
              e.preventDefault(); e.stopPropagation();
              if (V.router) V.router.nav('/role/' + encodeURIComponent(roleChar2.name));
            },
          }, [
            // v0.5.4：角色名前显示 icon（用户需求：原 UP 名位置显示角色时加 icon）
            V.utils.el('span', { className: 'codicon codicon-account vsc-video-meta-owner-icon' }),
            V.utils.el('span', { className: 'vsc-video-meta-owner-name' }, roleChar2.name),
          ]));
        } else if (!opts.noRoleMeta && conflictChars2) {
          // v0.5.4：冲突卡片原 UP 位置显示红字「冲突」（用户需求）
          meta.appendChild(V.utils.el('span', { className: 'vsc-video-meta-owner is-conflict' }, '冲突'));
        }
        meta.appendChild(V.utils.el('span', { className: 'vsc-video-meta-date' },
          item.pubdate ? fmtDate(item.pubdate) : ''));
        // v0.5.6 第八轮：左下角无角色名/icon 时 meta 行只有日期——
        // .vsc-video-meta 的 justify-content:space-between 会把唯一子元素推到
        // **左侧**（用户反馈"日期也被去除了"——实为位置漂移）；加 .no-owner
        // 类改 flex-end，日期回到右下角
        meta.classList.toggle('no-owner', !roleChar2 && !conflictChars2);
      }
      renderMeta();
      body.appendChild(title);
      body.appendChild(meta);
      card.appendChild(body);
    }

    // ===== 行为（demo video-card 交互模式）=====
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* 时长徽章：metadata 就绪后按真实时长格式化（失败保留 data-duration） */
    video.addEventListener('loadedmetadata', function () {
      badgeText.textContent = V.utils.fmtTime(video.duration);
    });
    /* 播完一遍（用户需求）：画面停最后一帧、结束预览
       （移除 is-previewing → 进度条消失、静音按钮下移；不回封面） */
    video.addEventListener('ended', function () {
      if (card.classList.contains('is-previewing')) V.preview.finish(card);
    });

    /* 播放进度条：预览播放时底部细条随 currentTime 推进 */
    video.addEventListener('timeupdate', function () {
      var dur = video.duration;
      if (isFinite(dur) && dur > 0) {
        progressFill.style.width = Math.min(100, (video.currentTime / dur) * 100) + '%';
      }
    });
    video.addEventListener('pause', function () {
      if (!card.classList.contains('is-previewing')) progressFill.style.width = '0%';
    });

    /* 悬停预览（比例倍速：rate = min(15, max(1, duration/10))）/ 离开复位。
       v0.3.71 用户需求：触发区域只有图片（media）——鼠标移到标题/meta 区
       不触发倍速预览（原挂在 card 上） */
    media.addEventListener('mouseenter', function () {
      if (reduce) return;                    // demo：reduced-motion 不自动播放
      // v0.6.1 聚合：组卡无真实视频 id，禁用帧采样预览
      if (item._grp) return;
      card.classList.add('is-previewing');
      V.preview.enter(card, item);
    });
    media.addEventListener('mouseleave', function () {
      card.classList.remove('is-previewing');
      // 帧采样下 video 恒 paused，leave 的 pause() 不触发 pause 事件 →
      // 进度条无法靠 pause 监听复位，这里显式清零
      progressFill.style.width = '0%';
      V.preview.leave(card);
    });

    /* 静音切换（仅右下静音钮；stopPropagation 防止触发图片跳转） */
    function toggleMute() {
      video.muted = !video.muted;
      mute.classList.toggle('is-muted', video.muted);
      var icon = mute.querySelector('.codicon');
      icon.className = 'codicon ' + (video.muted ? 'codicon-mute' : 'codicon-unmute');
      mute.setAttribute('aria-label', video.muted ? '取消静音' : '静音');
    }
    mute.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); toggleMute(); });
    /* 防误导航双保险（用户反馈：点取消静音会进视频页）：
       media 内任何 button 的点击都绝不触发 a 的默认导航——
       若按钮自身 stopPropagation 失效（如被浮层截走事件），
       冒泡到 media 时在此兜底 preventDefault */
    media.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.closest && t.closest('button')) e.preventDefault();
    });
    /* 黑名单（v0.3.2）：屏蔽单个视频 → 卡片局部移除 + toast；面板可解除
       v0.3.85：黑名单页反转为解除屏蔽 */
    blackBtn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (opts.blacklistMode) {
        if (V.blacklist && V.blacklist.remove(item.id, item.sourceId)) {
          V.toast.ok('已解除屏蔽');
          if (card.parentNode) card.remove();
        }
        return;
      }
      var added = V.blacklist && V.blacklist.add(item);
      if (added) {
        V.toast.info('已屏蔽：' + (item.title || '该视频'));
        if (card.parentNode) card.remove();
      } else if (V.blacklist) {
        V.toast.info('该视频已在黑名单');
      }
    });
    /* video 键盘（Enter/空格）：跳详情（与整图点击一致；a 内 video 点击默认导航） */
    video.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); media.click(); }
    });

    /* 待看 / 收藏（纯图标按钮）：激活态切换 + 持久化
       demo 文案：加入待看↔已加入待看、收藏↔已收藏 */
    function setBtn(btn, icon, on, labelOn, labelOff, iconOn, iconOff) {
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? labelOn : labelOff);
      btn.setAttribute('title', on ? labelOn : labelOff);
      icon.className = 'codicon ' + (on ? iconOn : iconOff);
    }
    watchBtn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      V.saved.toggleWatch(item);
      var on = V.saved.isWatch(item.id, item.sourceId);
      setBtn(watchBtn, watchBtn.querySelector('.codicon'), on,
        '已加入待看', '加入待看', 'codicon-check', 'codicon-add');
      syncMarks();
    });
    favBtn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      V.saved.toggleFav(item);
      var on = V.saved.isFav(item.id, item.sourceId);
      setBtn(favBtn, favBtn.querySelector('.codicon'), on,
        '已收藏', '收藏', 'codicon-heart-filled', 'codicon-heart');
      syncMarks();
    });

    // v0.5.6 第十五轮需求 5：返回恢复后的静默窗（app.js reveal 置
    // __VS_SILENT__ 1.5s）——网络刷新（refreshFromNet）重建的新卡
    // 同样禁止入场动画（返回过程要"非常干净"，不能有卡片加载动画）
    if (window.__VS_SILENT__) card.classList.add('no-anim');

    // v0.5.6 OOM 修复：差量更新入口——characters.onChange 时各页面
    // 调用 card.__updateChar() 只重建角色相关 DOM（角标/标题高亮/meta 行），
    // **不重建卡片**（80 卡 poster/video 元素重建解码峰值 ~500MB 曾致渲染
    // 进程 OOM "此页存在问题"）。角色无关部分（图片/进度/交互）完全不动。
    card.__updateChar = function () {
      renderTagIcons();
      renderTitle();
      if (!cover) renderMeta();
    };

    // v0.6.1 聚合：后台增量扫描——卡片渲染时对**原始成员**入队算 phash
    // （组卡/组项快照/已扫过跳过；scanned 会话级去重，串行节流不抢首屏）
    if (V.aggregations && origItem && origItem.sourceId && origItem.sourceId !== 'local'
        && !V.aggregations.isGroupId(origItem.id)) {
      V.aggregations.scheduleScan(origItem);
    }

    // v0.6.2 聚合二期：交互代理——右键菜单 / 长按拖拽 / 多选。
    // __item = 渲染项（组卡含 _grp），__orig = 原始成员/组项快照，
    // agg-ui 的 memberOf 用 __item 反查组或成员引用。
    card.__item = item;
    card.__orig = origItem;
    // v0.6.23：点击快照退役——详情页加载中占位统一读每源 id 表
    // （V.videoTable，由 feed 拉取时写入），此处不再记录 __VS_LAST_CARD__。
    if (V.aggUi) {
      card.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        V.aggUi.openMenu(card, item, { x: e.clientX, y: e.clientY });
      });
      card.addEventListener('pointerdown', function (e) {
        V.aggUi.dragStart(card, e);
      });
      if (V.aggUi.isMultiActive()) V.aggUi.registerCard(card);
    }

    return card;
  }

  /** 日期格式化：pubdate（秒）→ YYYY-MM-DD（本地时区） */
  function fmtDate(pubdate) {
    var d = new Date(pubdate * 1000);
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /**
   * v0.2.7 标题关键词高亮（v0.5.0 角色化：按角色**关键词**高亮）：
   * 命中的角色对象数组（{name, keywords}）→ 每个角色的全部关键词在
   * 标题中的全部出现（大小写不敏感）→ 区间合并重叠 →
   * 匹配段包 <span class="vsc-video-title-tag">，其余为文本节点。
   * 无匹配/无角色时原样返回字符串。
   */
  function highlightTitle(title, chars) {
    if (!title) return '';
    if (!chars || !chars.length) return title;
    var lower = String(title).toLowerCase();
    var ranges = [];
    chars.forEach(function (c) {
      var kws = (c && c.keywords && c.keywords.length) ? c.keywords : [c && c.name];
      kws.forEach(function (kw) {
        var t = String(kw).toLowerCase();
        if (!t) return;
        var i = lower.indexOf(t);
        while (i >= 0) {
          ranges.push([i, i + t.length]);
          i = lower.indexOf(t, i + t.length);
        }
      });
    });
    if (!ranges.length) return title;
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [ranges[0]];
    for (var j = 1; j < ranges.length; j++) {
      var last = merged[merged.length - 1];
      if (ranges[j][0] <= last[1]) last[1] = Math.max(last[1], ranges[j][1]);
      else merged.push(ranges[j]);
    }
    var nodes = [];
    var pos = 0;
    for (var k = 0; k < merged.length; k++) {
      var rg = merged[k];
      if (rg[0] > pos) nodes.push(String(title).slice(pos, rg[0]));
      nodes.push(V.utils.el('span', { className: 'vsc-video-title-tag' }, String(title).slice(rg[0], rg[1])));
      pos = rg[1];
    }
    if (pos < String(title).length) nodes.push(String(title).slice(pos));
    return nodes;
  }

  /**
   * v0.6.20 已渲染卡片 stat 热更新：后台预取（source-feed onData）刷新缓存后，
   * 原地更新 DOM 上已有卡片的播放/弹幕数——不重建 DOM、不动滚动位置。
   * list = feed.items()（最新合并 history，含 stat）。
   * 匹配：data-id 相同 + data-src 相同（防跨源同 id 碰撞，如 17c/kkav 纯数字 id）。
   * 组卡（data-id=grp:xxx）不在列表内自然跳过。cover 布局无 .vsc-video-stats 跳过。
   */
  function hotUpdateStats(list) {
    if (!list || !list.length) return;
    var map = {};
    list.forEach(function (it) {
      if (it && it.id) map[String(it.id)] = it;
    });
    var cards = document.querySelectorAll('.vsc-video-card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var vid = card.getAttribute('data-id');
      if (!vid || !map[vid]) continue;
      var it = map[vid];
      if (it.sourceId && card.getAttribute('data-src') !== it.sourceId) continue;
      if (!it.stat) continue;
      var nums = card.querySelectorAll('.vsc-video-stats .vsc-video-stats-num');
      if (!nums || !nums.length) continue;
      nums[0].textContent = V.utils.fmtCount(it.stat.view);
      if (nums[1] && it.stat.danmaku) nums[1].textContent = V.utils.fmtCount(it.stat.danmaku);
    }
  }

  V.videoCard = { create: create, hotUpdateStats: hotUpdateStats };
})();
