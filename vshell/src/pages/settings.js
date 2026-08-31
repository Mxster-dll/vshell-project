/* ============================================================
 * settings — 设置页（v0.5.12 用户需求：设置不再用浮窗，改成页面
 *   #/settings；多源预取倍率 k 放到数据源列表顶部并改成拖动条）
 *
 * 原 components/settings-panel.js 浮窗形态整体移植为页面：
 *  - 主题：深色 / 浅色（V.theme.set，持久化）
 *  - 默认视图：视频墙 / 抖音刷（V.viewMode.set，onChange 各页重渲染）
 *  - 卡片布局：标准 / 封面（V.wall.setLayout，onLayoutChange 重渲染）
 *  - 卡片间距：拖动条（即时生效）
 *  - 数据源：预取倍率 k 拖动条（列表**顶部**）+ 插件行（多选启用/
 *    隐私标记/热更/删除/添加）
 *  - 数据：清除观看记录 / 清除缓存（二次确认变红）
 *  - 关于：版本信息
 * dirty 语义保持（v0.5.7）：数据源/预取改动**离开设置页时生效**——
 * destroy（路由切走）时统一遮罩 + reload；__VS_SETTINGS_OPEN__ 标记
 * 抑制 multisource onChange 广播（防页面闪动）。
 * 入口：导航栏设置按钮 → #/settings（V.pages.settings）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var dirty = false;  // 数据源勾选/预取倍率改动待生效标记（离开页面时应用）
  // 插件行缓存（web 注册表 ∪ VsStore sourceList 并集结果）——
  // 复用缓存立即渲染，不再每次异步重查（sourceList 桥往返导致
  // 插件行"闪没又出现"）；delBtn 删除 / 添加成功后失效重查。
  var pluginRowsCache = null;

  /** 离开设置页：数据源/预取改动**离开时才生效**（用户需求）——
   *  勾选只改状态，退出时统一遮罩 + reload 应用 */
  function applyPending() {
    // 设置操作结束——恢复 multisource onChange 广播
    try { delete window.__VS_SETTINGS_OPEN__; } catch (e) { window.__VS_SETTINGS_OPEN__ = undefined; }
    if (dirty) {
      dirty = false;
      if (V.switchOverlay) V.switchOverlay.show('正在应用设置…');
      setTimeout(function () {
        // 用户需求「更改数据源后自动回到主页」：reload 前先回 #/
        if (location.hash && location.hash !== '#/' && location.hash !== '') {
          location.hash = '#/';
        }
        location.reload();
      }, 200);
    }
  }

  /** 单选行组（复用 .vshell-radio：is-checked 驱动选中态，点击即应用并重绘）
   *  options = [{ value, label }]；valueOf() 返回当前值；onPick(v) 应用选择 */
  function radioGroup(options, valueOf, onPick) {
    var wrap = V.utils.el('div', { className: 'vshell-modal-opts' });
    var render = function () {
      wrap.innerHTML = '';
      var cur = valueOf();
      options.forEach(function (o) {
        var row = V.utils.el('div', {
          className: 'vshell-radio' + (o.value === cur ? ' is-checked' : ''),
          role: 'radio',
          'aria-checked': o.value === cur ? 'true' : 'false',
          tabindex: 0,
        }, [V.utils.el('span', { className: 'vshell-radio-label' }, o.label)]);
        row.addEventListener('click', function () {
          if (o.value !== valueOf()) { onPick(o.value); render(); }
        });
        row.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
        });
        wrap.appendChild(row);
      });
    };
    render();
    return wrap;
  }

  /** 设置分组：小标题 + 内容 */
  function sec(title, body) {
    var s = V.utils.el('div', { className: 'vshell-settings-sec' });
    s.appendChild(V.utils.el('div', { className: 'vshell-settings-sec-title' }, title));
    s.appendChild(body);
    return s;
  }

  function mount(outlet) {
    // 设置操作期间抑制 multisource onChange 广播（防页面闪动）；
    // 离开设置页整页 reload 重建一切，中间状态无需任何页面反应
    try { window.__VS_SETTINGS_OPEN__ = true; } catch (e) { /* noop */ }

    var page = V.utils.el('div', { className: 'vshell-page vshell-page-settings' });
    var head = V.utils.el('div', { className: 'vshell-page-head' }, [
      V.utils.el('button', {
        className: 'vshell-icon-btn vshell-page-back',
        type: 'button', 'aria-label': '返回',
        onclick: function () {
          if (history.length > 1) history.back();
          else V.router.nav('/');
        },
      }, V.utils.el('span', { className: 'codicon codicon-arrow-left' })),
      V.utils.el('h1', { className: 'vshell-page-title' }, '设置'),
    ]);
    page.appendChild(head);

    var body = V.utils.el('div', { className: 'vshell-settings-page' });

    // 主题
    body.appendChild(sec('主题', radioGroup(
      [{ value: 'dark', label: '深色' }, { value: 'light', label: '浅色' }],
      function () { return V.theme ? V.theme.current() : 'dark'; },
      function (v) { if (V.theme) V.theme.set(v); }
    )));
    // 默认视图
    body.appendChild(sec('默认视图', radioGroup(
      [{ value: 'wall', label: '视频墙' }, { value: 'feed', label: '抖音刷' }],
      function () { return V.viewMode ? V.viewMode.get() : 'wall'; },
      function (v) { if (V.viewMode) V.viewMode.set(v); }
    )));
    // 卡片布局
    body.appendChild(sec('卡片布局', radioGroup(
      [
        { value: 'standard', label: '标准（标题在图片下方）' },
        { value: 'cover', label: '封面（标题浮在图片上）' },
      ],
      function () { return V.wall ? V.wall.layout() : 'standard'; },
      function (v) { if (V.wall) V.wall.setLayout(v); }
    )));
    // 卡片间距（拖动条：视频卡间距 + 分类卡下边距共用；即时生效）
    body.appendChild(sec('卡片间距', (function () {
      var wrap = V.utils.el('div', { className: 'vshell-settings-slider' });
      var cur = V.cardGap ? V.cardGap.get() : 6;
      var valEl = V.utils.el('span', { className: 'vshell-settings-slider-val' },
          cur + 'px');
      var range = V.utils.el('input', {
        type: 'range',
        min: 0,
        max: 24,
        step: 1,
        className: 'vshell-settings-range',
        value: String(cur),
        'aria-label': '卡片间距',
      });
      range.addEventListener('input', function () {
        if (!V.cardGap) return;
        var v = parseInt(range.value, 10);
        V.cardGap.set(v);
        valEl.textContent = v + 'px';
      });
      wrap.appendChild(range);
      wrap.appendChild(valEl);
      wrap.appendChild(V.utils.el('div', { className: 'vshell-settings-slider-hint' },
          '视频卡片间距与分类卡片下边距'));
      return wrap;
    })()));
    // 数据源（v0.5.10 独立化：**无内置数据源**——acfun/bilibili 也是插件
    // 文件，由用户「添加数据源」手动注册；本区只渲染注册表行）。
    // v0.5.7 多源（用户需求）：**多选启用**（checkbox）——勾选 = 启用集
    // （multisource.enabledSources）；启动挂载 = 勾选 ∩ 非隐私；隐私源永不
    // 挂载（启动排除）；全部无 → 第一个非隐私源。
    // v0.5.12 用户需求：预取倍率 k 拖动条放到数据源列表**顶部**。
    body.appendChild(sec('数据源', (function () {
      var wrap = V.utils.el('div', { className: 'vshell-modal-opts vshell-settings-sources' });
      function isPriv(id) {
        return !!(V.dataSource && V.dataSource.isPrivate && V.dataSource.isPrivate(id));
      }
      function makeRow(value, label, extra) {
        var on = !!(V.multisource && V.multisource.isEnabled(value));
        var row = V.utils.el('div', {
          className: 'vshell-radio' + (on ? ' is-checked' : ''),
          role: 'checkbox',
          'aria-checked': on ? 'true' : 'false',
          tabindex: 0,
        }, [V.utils.el('span', { className: 'vshell-radio-label' }, label)]);
        if (extra) {
          (Array.isArray(extra) ? extra : [extra]).forEach(function (n) { row.appendChild(n); });
        }
        row.addEventListener('click', function () {
          var next = !(V.multisource && V.multisource.isEnabled(value));
          var en = (V.multisource && V.multisource.enabled())
            || (V.multisource ? V.multisource.activeSources() : []);
          if (next) {
            if (en.indexOf(value) < 0) en.push(value);
            // v0.5.7 用户澄清：勾选隐私源 = **手动加载**——写会话标记，
            // reload 后不再冷启动清洗（保持加载）；下次进程冷启动自动取消
            if (isPriv(value)) {
              try { sessionStorage.setItem('vshell.skipPrivCheck', '1'); } catch (e) { /* noop */ }
            }
          } else {
            en = en.filter(function (x) { return x !== value; });
          }
          if (V.multisource) V.multisource.setEnabled(en);
          if (next && V.dataSource && V.dataSource.isPlugin && V.dataSource.isPlugin(value)
              && V.dataSource.ensureLoaded) {
            V.dataSource.ensureLoaded(value);   // 预注入（离开设置页 reload 后生效）
          }
          dirty = true;   // v0.5.7：不立即 reload，离开设置页时统一应用
          // v0.5.8：局部更新行勾选态（不调 render()）——render 会清空重绘
          // 整个数据源区 + 插件行异步重查（sourceList 往返），页面闪动
          row.classList.toggle('is-checked', next);
          row.setAttribute('aria-checked', next ? 'true' : 'false');
        });
        row.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
        });
        return row;
      }
      /** 隐私标记按钮（v0.5.6 用户需求；v0.5.7 语义：隐私 = 启动时自动取消
       *  加载、设置里显示未勾选，但**允许手动加载**）。标记隐私时把该源从
       *  启用集剔除（即时反映"取消加载状态"）；局部 toggle 不整体重绘
       *  （避免 sourceList 异步重排），只同步行勾选态 */
      function privBtn(id) {
        var priv = isPriv(id);
        var b = V.utils.el('button', {
          className: 'vshell-settings-source-priv' + (priv ? ' is-priv' : ''),
          title: priv ? '隐私数据源：启动时自动取消加载（可手动加载）'
                      : '标记为隐私数据源（启动时自动取消加载）',
          'aria-label': '隐私数据源',
          'aria-pressed': priv ? 'true' : 'false',
          type: 'button',
          onclick: function (e) {
            e.stopPropagation();
            if (!V.dataSource || !V.dataSource.setPrivate) return;
            var nv = !V.dataSource.isPrivate(id);
            V.dataSource.setPrivate(id, nv);
            if (nv) {
              // v0.5.7 用户澄清：标记隐私 = 取消加载状态 → 从启用集剔除
              var en = (V.multisource && V.multisource.enabled()) || [];
              if (en.indexOf(id) >= 0 && V.multisource) {
                V.multisource.setEnabled(en.filter(function (x) { return x !== id; }));
              }
              dirty = true;   // 数据源改动：离开设置页时统一应用
            }
            b.classList.toggle('is-priv', nv);
            b.title = nv ? '隐私数据源：启动时自动取消加载（可手动加载）'
                         : '标记为隐私数据源（启动时自动取消加载）';
            b.setAttribute('aria-pressed', nv ? 'true' : 'false');
            var row = b.closest ? b.closest('.vshell-radio') : null;
            if (row) {
              row.classList.remove('is-checked');
              row.setAttribute('aria-checked', 'false');
            }
          },
        }, V.utils.el('span', { className: 'codicon codicon-lock' }));
        return b;
      }
      function delBtn(id) {
        var b = V.utils.el('button', {
          className: 'vshell-settings-source-del',
          title: '移除数据源',
          'aria-label': '移除数据源',
          type: 'button',
          onclick: function (e) {
            e.stopPropagation();
            var p = window.__VS_PLATFORM__;
            if (p && p.sourceRemove) {
              p.sourceRemove(id).then(function () {
                // v0.5.7 双删：web 注册表（权威）同步移除 + 写穿 VsStore——
                // 否则 refreshRegistry 并集又把删掉的源合回来
                try {
                  var rg = V.store.get('dataSources');
                  if (Array.isArray(rg)) {
                    var nx = rg.filter(function (s) { return !s || s.id !== id; });
                    V.store.set('dataSources', nx);
                    var b = window.__VS_STORE_BRIDGE__;
                    if (b && b.push) b.push('dataSources', JSON.stringify(nx));
                  }
                } catch (err) { /* noop */ }
                if (V.dataSource && V.dataSource.get() === id) {
                  // v0.5.10 独立化：无内置默认源——删除当前源后回退
                  // 注册表第一个非隐私（dataSource.set 内部处理），
                  // 注册表空 → null（无数据源空态）
                  var fb = V.dataSource.firstNonPrivate ? V.dataSource.firstNonPrivate() : null;
                  V.dataSource.set(fb || null);
                }
                dirty = true;   // v0.5.7：删除也是数据源改动，离开设置页时生效
                pluginRowsCache = null;   // v0.5.8：删除后缓存失效，render 重查
                render();
              });
            }
          },
        }, V.utils.el('span', { className: 'codicon codicon-close' }));
        return b;
      }
      /** 热更按钮（用户需求）：源码修改后点击——location.reload() 后
       *  ensureLoaded 的 loadedId 是内存态自动重置，重新 sourceLoad 读取
       *  最新文件内容注入，页面即用新适配器（无需重启应用） */
      function reloadBtn(id) {
        var b = V.utils.el('button', {
          className: 'vshell-settings-source-reload',
          title: '重新加载数据源（修改源码后点此热更）',
          'aria-label': '重新加载数据源',
          type: 'button',
          onclick: function (e) {
            e.stopPropagation();
            if (V.dataSource && V.dataSource.get() === id) {
              V.toast.ok('正在重新加载数据源…');
              setTimeout(function () { location.reload(); }, 150);
            } else {
              V.toast.info('当前未使用该数据源，无需重新加载');
            }
          },
        }, V.utils.el('span', { className: 'codicon codicon-refresh' }));
        return b;
      }
      function render() {
        wrap.innerHTML = '';
        // v0.5.10 独立化：**无内置数据源**——acfun/bilibili 也是插件，
        // 全部行走注册表（用户手动添加文件后出现，可启用/停用/删除/
        // 隐私标记/热更，与其他插件同权）。注册表行异步补。
        // v0.5.12：顺序 = 「k 拖动条（顶部）→ 数据源行 → 添加按钮」。
        var p = window.__VS_PLATFORM__;
        var regRows = [];
        try {
          var rg = V.store.get('dataSources');
          if (Array.isArray(rg)) regRows = rg;
        } catch (e) { /* noop */ }
        function makePluginRow(s) {
          return makeRow(s.id, s.name + '（插件）',
            [privBtn(s.id), reloadBtn(s.id), delBtn(s.id)]);
        }
        function commitRows(rows) {
          // k 拖动条（顶部）→ 行 → 添加按钮
          wrap.appendChild(kBlock);
          rows.forEach(function (s) {
            if (!s || !s.id) return;
            wrap.appendChild(makePluginRow(s));
          });
          wrap.appendChild(add);
        }
        // 预取倍率 k 拖动条（v0.5.12 用户需求：数据源列表**顶部** +
        // 拖动条）。默认 2.0；渲染窗口 = 视口页容量 × k。拖动实时写存储
        // （setK），离开设置页时 reload 生效（dirty）。
        var kCur = V.multisource ? V.multisource.k() : 2.0;
        var kBlock = V.utils.el('div', { className: 'vshell-settings-k' }, [
          V.utils.el('span', { className: 'vshell-radio-label' }, '多源预取倍率 k'),
        ]);
        var kSlider = V.utils.el('div', { className: 'vshell-settings-slider' });
        var kVal = V.utils.el('span', { className: 'vshell-settings-slider-val' },
            kCur.toFixed(1) + '×');
        var kRange = V.utils.el('input', {
          type: 'range',
          min: '0.5',
          max: '5',
          step: '0.5',
          className: 'vshell-settings-range',
          value: String(kCur),
          'aria-label': '多源预取倍率',
        });
        kRange.addEventListener('input', function () {
          var v = parseFloat(kRange.value);
          if (!isFinite(v) || v <= 0) { v = 2.0; kRange.value = '2'; }
          if (V.multisource) V.multisource.setK(v);
          kVal.textContent = v.toFixed(1) + '×';
          dirty = true;   // v0.5.7：离开设置页时生效
        });
        kSlider.appendChild(kRange);
        kSlider.appendChild(kVal);
        kSlider.appendChild(V.utils.el('div', { className: 'vshell-settings-slider-hint' },
            '渲染窗口 = 视口页容量 × k'));
        kBlock.appendChild(kSlider);
        // 添加按钮（v0.5.11：位于所有数据源行之后）
        var add = V.utils.el('button', {
          className: 'vshell-btn vshell-btn-secondary vshell-settings-source-add',
          type: 'button',
        }, [V.utils.el('span', { className: 'codicon codicon-add' }),
            V.utils.el('span', {}, '添加数据源')]);
        add.addEventListener('click', function () {
          var pf = window.__VS_PLATFORM__;
          if (!pf || !pf.sourceAdd) { V.toast.info('当前环境不支持添加数据源'); return; }
          pf.sourceAdd().then(function (r) {
            if (!r || !r.added) return;   // 用户取消
            pluginRowsCache = null;   // v0.5.8：新源不在缓存，render 重查
            render();
          });
        });
        if (pluginRowsCache) {
          // v0.5.8：缓存复用——render() 不再异步重查 sourceList（桥往返
          // 造成插件行"闪没又出现"），立即渲染缓存行
          commitRows(pluginRowsCache);
        } else if (p && p.sourceList) {
          p.sourceList().then(function (list) {
            if (!Array.isArray(list)) return;
            var byId = {};
            regRows.forEach(function (s) { if (s && s.id) byId[s.id] = s; });
            list.forEach(function (s) { if (s && s.id) byId[s.id] = s; });
            pluginRowsCache = Object.keys(byId).map(function (id) { return byId[id]; });
            commitRows(pluginRowsCache);
          });
        } else {
          pluginRowsCache = regRows;
          commitRows(pluginRowsCache);
        }
      }
      render();
      return wrap;
    })()));
    // 数据：清除观看记录 / 清除缓存（二次确认，同下载页清除按钮 .is-confirm 语义）
    body.appendChild(sec('数据', (function () {
      var wrap = V.utils.el('div', { className: 'vshell-settings-data' });
      // 右下角显示网络请求（调试）开关（v0.6.4：原硬编码固定开启，
      // 用户需求可关）——即时生效：reqDebugOn() 每次实时读 store 键，
      // 无需 dirty/reload
      var reqOn = !!(V.store && V.store.get('reqDebug', true) !== false);
      var reqRow = V.utils.el('div', {
        className: 'vshell-radio' + (reqOn ? ' is-checked' : ''),
        role: 'checkbox',
        'aria-checked': reqOn ? 'true' : 'false',
        tabindex: 0,
      }, [V.utils.el('span', { className: 'vshell-radio-label' },
        '右下角显示网络请求（调试）')]);
      reqRow.addEventListener('click', function () {
        var next = !reqOn;
        reqOn = next;
        if (V.store) V.store.set('reqDebug', next);
        reqRow.classList.toggle('is-checked', next);
        reqRow.setAttribute('aria-checked', next ? 'true' : 'false');
        (V.toast ? V.toast.ok : function (m) { alert(m); })(
          next ? '已开启网络请求显示' : '已关闭网络请求显示');
      });
      reqRow.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reqRow.click(); }
      });
      wrap.appendChild(reqRow);
      // 清除观看记录
      var btn = V.utils.el('button', {
        className: 'vshell-btn vshell-btn-secondary vshell-settings-clear',
        type: 'button',
      }, '清除观看记录');
      var confirming = false;
      btn.addEventListener('click', function () {
        if (!confirming) {
          confirming = true;
          btn.classList.add('is-confirm');
          btn.textContent = '再次点击确认清除';
          return;
        }
        var n = V.watched ? V.watched.clear() : 0;
        confirming = false;
        btn.classList.remove('is-confirm');
        btn.textContent = '清除观看记录';
        V.toast.ok(n ? ('已清除 ' + n + ' 条观看记录') : '没有观看记录');
      });
      wrap.appendChild(btn);
      // 清除缓存（用户需求：手动清除搜索/主页/角色聚合缓存按钮）——
      // 只清 searchCache 系列（vshell.searchCache.<源> + 无前缀遗留
      // searchCache.*），**用户数据键**（saved/watched/blacklist/characters
      // 等）一律不动；localStorage + VsStore 桥双删；清后 reload 复位
      // 内存缓存与页面状态（searchcache.js 模块级 cache 持有旧副本）。
      var cbtn = V.utils.el('button', {
        className: 'vshell-btn vshell-btn-secondary vshell-settings-clear vshell-settings-clear-cache',
        type: 'button',
      }, '清除缓存');
      var cConfirming = false;
      cbtn.addEventListener('click', function () {
        if (!cConfirming) {
          cConfirming = true;
          cbtn.classList.add('is-confirm');
          cbtn.textContent = '再次点击确认清除';
          return;
        }
        var n = 0, bytes = 0;
        try {
          for (var ci = localStorage.length - 1; ci >= 0; ci--) {
            var ck = localStorage.key(ci);
            if (!ck) continue;
            if (ck.indexOf('vshell.searchCache.') !== 0
                && ck.indexOf('searchCache.') !== 0) continue;
            var raw = localStorage.getItem(ck) || '';
            bytes += raw.length * 2;   // UTF-16 近似字节
            localStorage.removeItem(ck);
            var br = window.__VS_STORE_BRIDGE__;
            if (br && br.del) { try { br.del(ck); } catch (e) { /* noop */ } }
            n++;
          }
        } catch (e) { /* noop */ }
        // 当前源内存缓存同步复位（store.mem 里的副本 reload 后重建）
        if (V.searchCache && V.searchCache.reload) {
          try { V.searchCache.reload(); } catch (e) { /* noop */ }
        }
        cConfirming = false;
        cbtn.classList.remove('is-confirm');
        cbtn.textContent = '清除缓存';
        if (n > 0) {
          V.toast.ok('已清除 ' + n + ' 个缓存（约 ' + Math.round(bytes / 1024) + ' KB），正在刷新…');
          setTimeout(function () { location.reload(); }, 350);
        } else {
          V.toast.info('没有缓存需要清除');
        }
      });
      wrap.appendChild(cbtn);
      return wrap;
    })()));
    // 关于（版本号显示构建版本 v，与导航栏左上角一致）
    body.appendChild(sec('关于', V.utils.el('div', {
      className: 'vshell-settings-about',
    }, 'vshell ' + (V.version || '') + ' · VS Code Modern 主题')));

    page.appendChild(body);
    outlet.appendChild(page);
    // 离开设置页时应用待生效改动（数据源/预取倍率）
    return { destroy: applyPending };
  }

  V.pages = V.pages || {};
  V.pages.settings = { mount: mount };
})();
