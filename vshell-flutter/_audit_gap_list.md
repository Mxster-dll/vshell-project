# vshell Flutter ↔ web 版差距审计清单（阶段①交付物）

# vshell Flutter 鈫?web 鐗堝樊璺濆璁℃竻鍗曪紙闃舵鈶犱氦浠樼墿锛?
> **澶氭暟鎹簮鏀寔锛?026-08-29锛岀敤鎴烽渶姹?+ grill 纭 7 椤瑰喅绛栵級**锛?> 1. 鍚姩鏃堕殣绉佹簮姘镐笉鎸傝浇锛涘叏闅愮/鏃?鈫?绗竴涓潪闅愮婧?> 2. 鎼滅储/涓婚〉/鍒嗙被澧欙細婧愯疆杞氦鏇匡紙abca鈫抌cab 鎺ョ画鎸囬拡锛? a*k 棰勫彇绐楀彛锛坅=瑙嗗彛椤靛閲忥紝k 榛樿 2.0 鍙皟锛?> 3. 寰呯湅/鏀惰棌/榛戝悕鍗曟寜婧愪繚瀛樸€佸苟闆嗘樉绀猴紙鎿嶄綔鎸夎棰戝綊灞炴簮鍐欏叆锛?> 4. 瑙掕壊骞堕泦锛堝悓鍚嶅叏灞€鍚堝苟锛夈€佽法婧愭坊鍔狅紙鐩爣婧愬缓瑙掕壊/澶嶅埗鍏抽敭璇嶏級銆佽鑹蹭富椤靛婧愯仛鍚?浠ｈ〃浣?> 5. 涓婚〉/鍒嗙被鍏ㄥ苟闆?浜ゆ浛锛?. 璁剧疆闈㈡澘澶氶€?闅愮閽?k 杈撳叆锛?. 澶嶅悎閿€屾簮id:瑙嗛id銆? URL #/video/<婧?:<id>锛堟棫閾炬帴鍥為€€涓绘簮锛?> - **鏂板 src/core/multisource.js**锛歛ctiveSources()=enabledSources鈭╅潪闅愮锛堥殣绉佹案涓嶆寕杞斤紝鍏ㄧ┖鈫抐irstNonPrivate锛夈€乸rimary()銆乲()/setK銆乸ageCapacity()锛堝<768 鍗曞垪/<1440 鍙屽垪/3 鍒楋紝琛岄珮 210 浼扮畻锛夈€亀indowSize()=a*k銆乲ey()澶嶅悎閿€乽nionGet/unionSet锛堝苟闆嗚鍐?sourceId 鏍囨敞锛夈€乺efreshRegistry()锛圴sStore 妗ユ敞鍐岃〃鈫抴eb localStorage 骞堕泦鍚堝苟鈥斺€旇ˉ缂哄紡 syncFromSync 涓嶈鐩栧凡鏈夐敭鑷?17c 绛変涪澶憋紝鍚姩 start() 鍓嶇疆鍚堝苟锛夈€乷nChange
> - **鏂板 src/core/multiwall.js**锛歏.multiwall.create(host,{fetch(srcId,pn),filter,doneCb})鈥斺€旀瘡婧愰槦鍒椼€佸叏灞€杞浆鎸囬拡 takeOne锛堟寚閽堢Щ鍒拌鍙栨簮涓嬩竴涓?鎺ョ画 abca鈫抌cab锛夈€乫illWindow 绐楀彛棰勭畻銆乵ore() 婊氬姩琛ュ崱锛堢┖婧愯ˉ椤垫瘡婧愪竴椤?杞級銆佸鍚堥敭鍘婚噸銆乮tem.sourceId 鏍囨敞銆佸崟婧愰€€鍖栭『搴忓彇
> - **鏀归€?*锛歞ata-source.js ensureLoaded(id) 鍙傛暟鍖?loadedIds 闆嗗悎锛泂ite-adapter.js adapterFor(id)+current() 涓绘簮鍖栵紱router.js /category/<婧?/<key> 涓?/video/<婧?:<id> 瑙ｆ瀽锛堟棫鏍煎紡鍏煎锛夛紱saved.js/blacklist.js 澶氭簮鍖栵紙loadSrc/persistSrc+union 缂撳瓨澶辨晥锛夛紱characters.js 婧愭暟鎹眰锛坰rcDataOf/persistSrcData/primaryId 涓绘簮閿級+ listAll 鍚屽悕鍚堝苟 + charForOn 鎸夋簮鍖归厤 + assignTo 璺ㄦ簮锛堢洰鏍囨簮=瑙掕壊鎵€灞炴簮锛岀己鍒欏缓骞跺鍒跺叧閿瘝锛? featuredOf/videosOf/find 骞堕泦锛沜har-picker edit/conflict 鍔?srcId 璧?assignTo锛泇ideo-card/feed/detail 璋冪敤鐐瑰甫 sourceId + 鍗＄墖 data-src + href 婧愬墠缂€锛沨ome.js 鍒嗙被骞堕泦锛坈hip data-src锛? multiwall锛泂earchtags.js 婧愪紭鍏堢粨鏋勶紙婧愯疆杞?婧愬唴鏍囩娣锋祦+绐楀彛鐩爣锛夛紱settings-panel 鏁版嵁婧愬尯鏀瑰閫?checkbox+k 杈撳叆锛沘pp.js start() 鍓嶇疆 refreshRegistry+鍏ㄦ縺娲绘彃浠舵敞鍏ャ€乥oot 鎸?multisource.onChange
> - **楠岃瘉锛?-multi-probe锛?*锛歛ctive=acfun,bilibili,testplug,hlstest锛坧riv={"kkav":true,"17c":true} 鐢ㄦ埛鏍囪闅愮姝ｇ‘鎺掗櫎 鉁擄級锛沜ardSeq=acfun,hlstest,acfun,hlstest 浜ゆ浛 鉁擄紱chips 37 涓苟闆嗗甫 data-src 鉁擄紱href=#/video/acfun:48810171 / #/video/hlstest:hl-1 鉁擄紱rolesN=8 骞堕泦 鉁擄紱watchlist 鍗＄墖 acfun:13619236 甯?data-src 鉁?> - **鐜鍧?*锛氣憼web localStorage dataSources 涓?VsStore 娉ㄥ唽琛ㄥ垎鍙夛紙refreshRegistry 鍚姩鍚堝苟瑙ｅ喅锛夆憽搴旂敤杩愯涓啓鐩樿鐩栨敞鍐岃〃锛坔lstest 鍙堜涪涓€娆★級鈶㈡ā鍧楀姞杞芥湡绂?V.multisource 璋冪敤锛坰aved/blacklist 鐨?union 缂撳瓨鐢ㄦ湰鍦?ckey鈥斺€攎ultisource 渚濊禆搴忓湪鍚庯紝浼氬穿榛戝睆锛夆懀bilibili 鍐呯疆閫傞厤鍣ㄧ洿杩炴棤妗ワ紙澶氭簮澧欓潤榛樺け璐ュ彲鍋滅敤锛?
# vshell Flutter 鈫?web 鐗堝樊璺濆璁℃竻鍗曪紙闃舵鈶犱氦浠樼墿锛?
> **灏侀潰甯冨眬鏍囬绌哄尯淇锛?026-08-29锛岀敤鎴峰弽棣堬級**锛?涓嶆樉绀鸿鑹插ご鍍忕殑瑙嗛鍗＄墖锛屽湪灏侀潰甯冨眬涓嬶紝
> 鏍囬宸︿晶绌轰簡涓€鍧楀尯鍩熲€︽垜甯屾湜涓嶆樉绀哄ご鍍忔椂锛屼笉瑕佺┖鍑烘潵"
> - **鏍瑰洜**锛歝omponents.css L714-715 .vsc-video-tag-icons ~ .vsc-video-title-cover { padding-left: 54px }
>   鐢ㄥ厔寮熼€夋嫨鍣?~ 閬胯瑙掓爣鈥斺€斾絾鏃犺鑹叉椂瑙掓爣鍏冪礌鍙槸 display:none锛坴ideo-card.js renderTagIcons
>   L295锛夛紝**鍏冪礌浠嶅湪 DOM 鈫?閫夋嫨鍣ㄧ収甯稿懡涓?鈫?鏃犺鑹插崱涔熺┖ 54px**銆?> - **淇**锛歷ideo-card.js renderTagIcons 鍔?	agIcons.classList.toggle('has-char', !!(roleChar2 || conflictChars2))锛?>   components.css 閫夋嫨鍣ㄦ敼 .vsc-video-tag-icons.has-char ~ .vsc-video-title-cover锛坵all + role-marquee
>   涓ゅ锛夛紱noTagIcon锛堣鑹蹭富椤碉級璺緞涓嶅彈褰卞搷锛堝厓绱犱笉 append锛岄€夋嫨鍣ㄦ湰灏变笉鍛戒腑锛夈€?> - **楠岃瘉**锛氬皝闈㈠竷灞€涓婚〉鎴浘锛坃title_cover.png锛夆€斺€旀棤瑙掕壊鍗℃爣棰樿捣鐐?x244/x1097锛堢墿鐞嗭級= 10px padding
>   姝ｅ父璧风偣锛屾棤 54px 绌哄尯锛涙湁瑙掓爣鍗¤蛋 has-char 绫讳粛姝ｇ‘閬胯锛圕SS 閫昏緫鐩存帴鐢熸晥锛夈€俛pp.html
>   vshell.user.js?v=3鈫?v=4 + main.dart URL v=7鈫抳=8锛圵ebView2 缂撳瓨锛夈€?
# vshell Flutter 鈫?web 鐗堝樊璺濆璁℃竻鍗曪紙闃舵鈶犱氦浠樼墿锛?
> **m3u8锛圚LS锛夋挱鏀炬敮鎸侊紙2026-08-29锛岀敤鎴烽渶姹傦級**锛?鏍规嵁 PROMPT_FRONTEND.md锛屽鍔犳挱鏀捐棰戠殑鏀寔"
> - **vshell/src/components/player.js**锛氬姞 hlsPlayer 鍙橀噺 + destroyHls()锛沗setSrc(url) 寮€澶?>   destroyDash(); destroyHls(); 鍚庢娴?m3u8鈥斺€擿typeof Hls !== 'undefined' && Hls.isSupported() &&
>   (/\.m3u8(\?|#|$)/i.test(url) || /^blob:/i.test(url)) 鈫?new Hls() 鈫?ERROR.fatal 鈫?destroy+娓?src+
>   toast('鎾斁閿欒锛?+details)锛汳ANIFEST_PARSED 鈫?state.duration = data.totalduration锛沴oadSource+
>   attachMedia锛坅ttach 鍓嶄笉璁?video.src锛夛紱opts.mutedAutoplay 鏃跺厛 ideo.muted=true锛涙湭鏀寔闄嶇骇鍘熺敓
>   video銆俿top()/destroy() 杩藉姞 destroyHls()銆?> - **vshell/src/pages/detail.js** setupPlayer锛氬姞 	ype:'hls' 鍒嗘敮锛圓cFun 妗ヨ繑鍥?>   {type:'hls',url:m3u8}鈥斺€旀鍓嶆棤鍒嗘敮浼氳蛋 else銆屾棤鍙敤鎾斁婧愩€? AcFun 鎾斁宸叉柇锛夛紱鏈?pi.master
>   锛坔264 鍚勬。鍚堟垚 playlist锛夆啋 blob URL锛坔ls.js 鍘熺敓 ABR锛夈€?> - **楠岃瘉**锛歨lstest 娴嬭瘯鎻掍欢锛坴shell-flutter/hlstest.js锛宮eta.id='hlstest'锛実etPlayInfo 杩斿洖
>   {type:'url', url:鍏叡娴嬭瘯娴?m3u8}锛?7c 鍚屽舰鎬侊級鈫?璇︽儏椤?blob: src + currentTime 鎺ㄨ繘 + duration 635
>   + videoWidth 1280 鍑哄抚 鉁擄紙_hls_playing.png锛夛紱AcFun 鍥炲綊锛?-acfun-check锛?/video/48800003 鐪熷疄瑙嗛
>   銆屼簯閫涘睍鍜綖鐪嬪畬涓€璧峰彂璐€?89s 鍑哄抚銆乼itle/src 姝ｇ‘銆佹棤 err锛夆湏銆?> - **17c 鏁版嵁婧?*锛圖:\Project\Lock\17c\17c.js锛宮eta.id='17c'锛夛細宸茬‘璁ゆ敞鍐岃〃+娉ㄥ叆+妗ラ檷绾ч摼璺叏閮ㄥ彲鐢?>   锛坰ourceLoad len=15708 鎵嬪姩娉ㄥ叆鎴愬姛銆乥ridge netFetch http 200/2376B鈥斺€攈ttps://app.local 椤甸潰
>   fetch http 琚?mixed content 鎷?鈫?net.js 鑷姩闄嶇骇 dio 妗ワ級锛?7c 浠?http锛坔ttps 鏃犺瘉涔︼級銆?> - **鐜鍧?*锛氣憼shared_preferences.json 鐨?dataSources 娉ㄥ唽琛ㄤ細琚簲鐢ㄨ繍琛屼腑鍐欑洏瑕嗙洊锛堟帰閽堟湡闂翠涪澶变竴娆?>   鈥斺€旈噸鏂版敞鍏?kkav/17c/hlstest锛夛紱鈶℃帰閽?executeScript 閲屼笉鑳界敤 V.xxx锛圴 鏄ā鍧楅棴鍖咃級鈥斺€斿繀椤?>   window.VShell.xxx锛涒憿--set-ds=17c 鐨?set鈫抮eload 绔炴€佹湭瀹屽叏瀹氫綅锛堣缃潰鏉胯矾寰?set+150ms reload 姝ｅ父锛夈€?> - **鎺㈤拡鏂板**锛?-hls-probe锛堝垏婧愨啋璇︽儏鈫掑嚭甯ц疆璇級/--src-probe锛坰ourceLoad 鐩磋皟+娉ㄥ叆锛?--acfun-check
>   锛坱ype:'hls' 鍥炲綊锛?--set-ds=<id>锛堟仮澶嶇幆澧冿級/--net-probe锛?7c 缃戠粶閾捐矾璇婃柇锛歮ixed content 鎷︽埅纭
>   + AbortSignal 鏀寔 + 閫傞厤鍣ㄧ洿璋冿級銆?> - 褰撳墠鐢ㄦ埛鐜锛歭ocalStorage vshell.dataSource="acfun"锛堟甯革級锛涘簲鐢ㄨ繍琛屼腑锛堜富椤靛唴瀹规甯革級銆?
> **数据源切换加载动画（2026-08-29，用户需求）**："点击切换数据源后，页面显示加载动画"
> - **新建 vshell/src/core/switchoverlay.js**（build.py 注册于 data-source.js 后）：
>   `V.switchOverlay = { show(msg), hide(), MARK='vshell.switching' }`——全屏遮罩
>   （fixed inset 0 z-99999、rgba(24,24,24,0.92)、28px spinner + 13px 文案）；
>   **遮罩挂 documentElement**（boot 的 body.innerHTML='' 不清掉；颜色带
>   var(--token, fallback) 兜底——html 可能尚未加 .vshell 类）
> - **settings-panel.js** makeRow click：切换时 `show('正在切换数据源…')` +
>   `sessionStorage.setItem(MARK,'1')` → onPick（150ms 后 reload）
> - **app.js**：模块级 `var switching`；start()（DOMContentLoaded，boot 前）读
>   MARK 并 removeItem → 有则 `show('正在加载数据源…')`（覆盖 ensureLoaded
>   等待期）；boot() 里 `V.router.start()` 后 `setTimeout(hide, 60)`（首帧
>   渲染提交后隐藏）
> - **components.css**：.vshell-switch-overlay/-spinner（28px 2px 边框
>   list-hover 底 charts-blue 顶、vshell-spin 0.8s linear infinite）/-text
> - **验证（--switch-probe，main.dart）**：S1 静态 show（15s 窗口截图
>   _r_switch.png——view_image 确认蓝色 spinner + "正在切换数据源…（TEST）" +
>   深灰遮罩 ✓）；S2 标记+show+reload → poll[0] reload 中 → poll[1] 页面接管
>   （app=true）遮罩 hidden → FINAL PASS。遮罩 DOM 保留（下次切换复用）
> - 测试参数：--switch-probe（main.dart）

> **隐私数据源（2026-08-29，用户需求）**：每个数据源一个隐私字段 + 启动规避。
> - **用户原话**："我希望给每个数据源一个是否隐私的字段，然后如果启动应用时，
>   上次打开的是隐私数据源，那么自动切至第一个非隐私数据源"
> - **data-source.js**：`PRIV_KEY='privateSources'`（`{id: true}` 映射，内置+插件
>   通吃）；`isPrivate(id)`、`setPrivate(id, bool)`（改映射+持久化+emit change）、
>   `firstNonPrivate()`（内置 acfun→bilibili → 插件注册表顺序第一个非隐私；
>   全隐私兜底 'acfun'）
> - **get() 启动规避（v2 修复）**：cur===null 首次读取时若 isPrivate(cur) →
>   cur=firstNonPrivate() + 持久化。**v2 修复（用户反馈"切换到隐私数据源不生效"）**：
>   原版规避在每次页面加载（含 settings-panel 切换后的 location.reload()）都执行
>   → 手动切隐私源被改回。修复：**set()（手动切换）写 sessionStorage
>   'vshell.skipPrivCheck'='1' 会话标记**；get() 规避前检查——有标记（本会话内
>   所有 reload）跳过规避；**sessionStorage 随应用进程退出清空 → 下次冷启动恢复
>   规避**。即：启动规避仅限冷启动，手动切换隐私源随时生效
> - **settings-panel.js**：makeRow 支持 extra 数组；新增 `privBtn(id)`（lock
>   codicon 20×20 r4、默认 descriptionForeground 0.75 透明、hover toolbarActive、
>   **is-priv=errorForeground 实色**；title '隐私数据源：启动时自动跳过'；onclick
>   stopPropagation + setPrivate + 局部 toggle class 不重绘）；内置 2 行 +
>   插件行（[privBtn, delBtn]）都挂
> - **components.css**：.vshell-settings-source-priv（对齐 source-del 几何，margin
>   right 2、icon 12px）
> - **验证（--priv-probe v2，main.dart）**：A 冷启动规避（kkav 隐私+当前 →
>   "kkav"→"acfun"）✓；B 非隐私保留 ✓；**C 手动切换隐私源生效（set('kkav')
>   + reload 后保持 "kkav"）✓**；cleanup 还原（kkav 取消隐私，当前源 kkav）。
>   FINAL PASS
> - 测试参数：--priv-probe（main.dart）

> **数据源隔离存储（2026-08-29，用户确认方案）**：收藏/待看/黑名单/角色/代表作
> 按数据源隔离（键加源后缀）。
> - **用户原话**："收藏/待看/黑名单/角色/代表作是不是都分数据源存储的"→ 答现状
>   全局一份 → ask_user_question → **用户选"按数据源隔离（键加前缀）"**
> - **store.js**：加 `scopedKey(base)`（base+'.'+当前源 id；data-source 未就绪回退
>   'acfun'）、`migrateScoped(base, scoped)`（无后缀旧键→当前源键一次性迁移；
>   **源键已有 → 删除无后缀残留**防 __VS_SYNC__ 重建后误迁）、`syncFromSync(sync)`
>   （__VS_SYNC__ 快照补缺式同步：本地已有键不覆盖；SCOPED_BASES 集合
>   ['saved','watched','blacklist','characters','videoChars','charConflicts',
>   'charLocks','charManuals','charVideos','charFollows','charRemoved',
>   'searchCache'] 落到当前源 scopedKey，全局设置键补原键）——导出全部
> - **data-source.js**：加 Emitter（set 变更 emit 'change'）+ onChange；模块末尾
>   调 `V.store.syncFromSync(window.__VS_SYNC__)`（此时 data-source 已就绪，
>   scoped 键补到当前源；app.js boot 的 reload 随后按当前源重读）
> - **saved/watched/blacklist/characters/searchcache.js**：键全改
>   `V.store.scopedKey(KEY)`（characters 8 键：KEY+VIDSKEY 等，加载段抽 loadAll()）；
>   各加 `reload()`（重读当前源键 + emit/notify → UI 重渲染）；load 时
>   migrateScoped（一次性迁移旧无后缀数据）
> - **app.js boot()**：开头统一 reload ×5 + 挂 V.dataSource.onChange 监听
>   （reload 各数据模块）
> - **迁移事故与恢复（重要教训）**：首次部署后 --store-probe 发现 characters 系列
>   新键全 2B 空（旧键已删）——**根因链**：①Js 侧持久化双向桥（__VS_STORE_BRIDGE__
>   push / __VS_SYNC__ merge）在 build.py 重建时已丢失（src/产物均无引用，
>   main.dart 注入的 __VS_SYNC__ 是死变量；localStorage 旧键=桥时代残留）→
>   ②merge 缺失期间 dataSource='kkav'（用户设置的 KKAV 插件源，kkav.js 在
>   vshell-flutter/）→ ③首版 syncFromSync 不存在、模块加载期 migrateScoped 回退
>   'acfun' 读到已被 boot reload 迁移到 .kkav 删掉的无后缀键 → 空迁移。
>   **数据未丢**（VsStore shared_preferences.json 完整备份 36 键）→ **修复**：
>   ④store.js 加 syncFromSync（补缺式、scoped 感知）；⑤--fix-scope 探针
>   （main.dart）：删空 .acfun 键（[]/{}）→ location.reload() → __VS_SYNC__ 补缺
>   → poll 验证 chars/videoChars/conflicts/charVideos 全部恢复 ✓
> - **验证（--ds-probe）**：ds="kkav"（当前源=KKAV）；无后缀残留已清理；
>   .acfun/.kkav 两组并存完整（characters 1292×2、videoChars 811/824——kkav 组
>   多 254267 手动赋值）；saved.acfun=245 待看 13619236 ✓；应用正常模式运行
>   （kkav 源，读取 .kkav 组）
> - **遗留**：vshell.watch/vshell.fav（1136/916）无主 demo 残留（web saved.js 用
>   'saved' 单键不读；__VS_SYNC__ 每次重建）——无害保留；切 bilibili 源时空库
>   （无 .bilibili 组，符合隔离语义）
> - 测试参数：--fix-scope / --ds-probe（main.dart）

> **netFetch 返回结构放宽（2026-08-29）：{ok,status,text} → {ok,status,text,finalUrl,headers}**
> 用户："在 web_bridge.dart 的 netFetch 里把 resp.realUri.toString()（dio 跟随
> 重定向后的最终 URL）和 resp.headers 一并回传，flutter-adapter 与 net.js 同步
> 放宽返回结构为 {ok,status,text,finalUrl,headers}"。
> - **web_bridge.dart netFetch case**：成功分支加 `'finalUrl': resp.realUri.toString()`
>   与 `'headers':`（resp.headers.forEach 多值 `values.join(', ')` 转 Map<String,String>）；
>   注释同步更新
> - **net.js**：fetchNative 加 `finalUrl: r.url`（fetch 自动跟随重定向，Response.url
>   即最终 URL）与 `headers:`（`r.headers.forEach(function(v,k){h[k]=v})` ES5 手写循环）；
>   fetchBridge 纯透传（桥字段自动带出）；文件头返回结构注释更新
> - **output/flutter-adapter.js**：netFetch 纯透传无需改代码，注释更新说明新结构
> - **验证（--probe-nf 探针，main.dart 新参数）**：__VS_PLATFORM__.netFetch('http://www.baidu.com')
>   → `{step:done, ok:true, status:200, hasFinalUrl:true, finalUrl:"http://www.baidu.com",
>   headerCount:15, sampleHeaders:{connection, cache-control, set-cookie...}, textLen:28918}`
>   ✓ 字段完整回传（本次百度未重定向故 finalUrl 同请求 URL；dio followRedirects
>   默认 true，realUri 语义保证最终 URL）。web bundle 2093044B 已部署 install\web\
> - 构建链：web=workdir vshell + python build.py + node --check + copy install\web\
>   （vshell.user.js + flutter-adapter.js 两个文件都要 copy）；flutter=workdir
>   vshell-flutter + 删 flutter.bat.lock + flutter build + copy exe

> **点「完成」卡顿修复（2026-08-29）：resolveConflict 1.9s → 18ms**
> 用户反馈链："为什么点击后会卡顿一下"（OOM 修复后残留）。
> **根因（探针分段铁证）**：`removedIds`（charRemoved 数据）是历史数据遗留的
> **稀疏数组**——`removedIds["48800003"] = true` 对数组做数字索引赋值 →
> **length = 48800004**（ac 号是数字索引），`JSON.stringify` 遍历 length 级数：
> storeDiag 分段实测 `norm: 360ms`（slice 复制稀疏数组）+ `str: 1450ms`
> （stringify 稀疏数组），且 `isArr: true` 实锤数组身份；而手动
> `set('diagTest', {x:true})` 0ms、click 前后普通 stringify 0ms、模拟 2 万
> delete 的 dictionary-mode 对象 0ms——逐一排除环境性/字典模式，最终
> `Array.isArray(value)===true` 定位稀疏数组。落盘因 stringify 超时+quota
> 失败，localStorage 永远残留旧值 "{}"（数据未丢，但每次保存卡 1.9s）。
> - **修复（两层）**：①store.js `normalize()` 稀疏数组防御——Array.isArray
>   分支用 **Object.keys（只返回实际元素）** 重建紧凑数组（for-in/`slice()`
>   都遍历 length 级数，必须 Object.keys）；②characters.js 加载时数组→对象
>   迁移（`Array.isArray(rm)` → 逐键 `rmObj[key]=true`），防复活标记语义不变
>   （`if (removedIds[id])` 兼容 false 值标记）；③顺手把 3 处
>   `delete removedIds[id]` 改 `removedIds[id] = false`（值标记防 dictionary
>   退化，`if (removedIds[id])` falsy 兼容）。
> - **验证**：主页场景 resolveConflict 1886ms→**17.6ms**、clickMs 1887→**18ms**、
>   set:charRemoved 1861→**0ms**；详情页场景（--nav-video）resolveConflict
>   **0.2ms**；charRemoved 恢复正常落盘（17B `{"48800003":true}`，此前一直
>   失败）。alive[0..9]+FINAL 全过、内存稳定。
> - **教训**：WebView2 的 V8 对"稀疏数组 + 数字索引赋值"是最坏形态；
>   探针分层（patch 层 → store 内部 norm/str/mem 分段 → isArr/constructor
>   检查）是唯一能穿透"1.9s 卡在同步代码里但每段都快"迷雾的手段。
> - 测试参数保留：--oom-probe / --click-char / --nav-video（探针已精简，
>   TEMP-DIAG 全清）。

> **OOM 崩溃修复（2026-08-28 深夜）：点「完成」崩溃 "此页存在问题 Out of Memory"**
> 用户反馈链："点击选择角色就出错" → "新增/更改角色/解决角色冲突，点完成的那一刻"。
> **根因**（二分实验链，全部带内存监控与崩前采样铁证）：
> - **localStorage 单键全量写**：store.js 的 set() 每次 `JSON.stringify(mem)` +
>   `localStorage.setItem('vshell.mem', ...)` 写整个 mem（715KB，含 localVideos
>   598KB base64 封面）。persistVideo（resolveConflict 保存）一次 7 连 set →
>   WebView2 渲染进程 OOM（renderer 峰值 1.09-1.25GB → 崩溃重启，Windows
>   RADAR_PRE_LEAK_64 事件）。**已排除**：墙重建（差量更新后仍崩）、JS 堆
>   （崩前 heap 仅 15-18MB 平稳）、DOM（nodes 平稳）、notify 链、toast、桥。
> - **实验链**：notify 禁用→仍崩；persistVideo 禁用→不崩；手动单次 715KB
>   setItem→不崩；批处理微任务 flush（7 连写合并 1 次）→仍崩；批处理宏任务
>   flush→click 完成但 2.5s 后 +726MB 仍崩；flush 全禁（只更新内存）→不崩；
>   →**唯一差异 = localStorage 全量落盘本身**（即使 1 次，与差量 DOM 更新同帧
>   组合触发 WebView2 内存放大）。
> - **修复（第二版，已生效）**：store.js 改**分键存储**——每个 `vshell.<key>`
>   独立 localStorage key，set/del 只写单键（<1KB），彻底移除全量
>   JSON.stringify/setItem；启动时一次性迁移旧 'vshell.mem' 单键（拆分到独立
>   键 + removeItem）。启动加载改为遍历全部 vshell.* 独立键。
> - **附带修复**：①差量更新（video-card.js `card.__updateChar` 重建角标/标题
>   高亮/meta 行；wall.js `V.wall.updateChars(host)`；home/category/search/
>   watchlist/blacklist/searchtags 的 characters.onChange 改差量，布局切换仍全量）
>   ——消除角色变更时 80 卡 poster/video 重建解码峰值；②探针（main.dart
>   --oom-probe：JS 侧 500ms 采样 heap/nodes/cards/wallConn 经 postWebMessage
>   推 Dart 落盘 oom_probe.log，崩前最后采样定位暴涨域；--nav-video 对照实验）。
> - **验证**：主页场景（conflict 打开+点完成）：alive[0..9] + FINAL 全过，
>   clickMs≈1.5s、after.cards=80（差量生效无重建）、jsHeap 稳定 245MB；
>   详情页场景（--click-char --nav-video=48800003）：poll[0..14] 全过、
>   renderer 480-585MB 稳定（修复前 +481MB→崩）；store-probe：33 独立键
>   （最大 localVideos 598KB 单键，其余 <8KB）；TEMP-DIAG 全清。
> - 遗留：charFor 内部会自动 persistVideo（characters.js L352/364/369 命中
>   关键词时）——分键后无害（单键小写），保留原语义。
> - 测试参数保留：--oom-probe / --click-char / --nav-video / --store-probe /
>   --scroll-stress。

> **架构终态（2026-08-28 二次拍板）：UI 全部走 web，Flutter 只做壳 + 性能敏感后端**
> 用户原话："我们现在不需要flutter ui了，所有都用web ui"。
> - **原生 Flutter UI 冻结**（lib/ui/ 20+ 文件保留不删，见 lib/ui/README.md）：
>   main.dart `--native` 入口已忽略（`if (true)` 恒走 WebviewShell 壳），
>   native 装配代码保留为 dead code（编译但不运行）。
> - **UI 迭代路径**：只改 web userscript（vshell/src/ → `python build.py` →
>   output/vshell.user.js → 同步 install/web/），Flutter 侧不再做视觉还原。
> - **性能敏感项下沉**：数据桥 WebBridge（lib/services/web_bridge.dart）、
>   下载 hls_downloader.dart（medl 桥已通：JS downloadStart → DownloadManager →
>   进度/终态回传 __VS_DL__）、持久化 vs_store.dart（双向桥 __VS_STORE_BRIDGE__ /
>   __VS_SYNC__ 注入）。
> - **窗口修复**：删除 windowManager.setBackgroundColor（Windows 上走
>   SetWindowCompositionAttribute + ACCENT_ENABLE_GRADIENT DWM 合成，点击时
>   系统标题栏闪动）；WebView2 背景改不透明 #181818（透明纹理 + Texture 合成
>   与 Flutter 帧不同步也致闪）。
>
> ---
>
> 以下为历史审计与修复记录（web 壳落地前的 Flutter 原生 UI 复刻阶段）。

> **架构转向（2026-08-28）：web 版前端 + Flutter 后端（用户拍板）**
> 用户原话："整体换成web版前端，但是性能敏感处的后端用flutter实现"。
> **WebviewShell 已设为默认入口**（无参数启动即 web 版；--native 回退原生 UI）：
> - Flutter 窗口（1440x900）内嵌 WebView2（webview_windows 0.4.0），加载
>   `http://127.0.0.1:8931/app.html`（output/ 下新入口页：干净无探针无演示数据，
>   仅引 hls.min.js + flutter-adapter.js + vshell.user.js）。
> - **桥**：flutter-adapter.js（output/）定义 `window.__VSHELL_ADAPTER__`（9 方法全
>   Promise）→ `window.chrome.webview.postMessage({id,method,args})` → Dart
>   WebBridge（lib/services/web_bridge.dart）→ AcfunSource 真实 API → 回传
>   `__VS_FLUTTER_RESOLVE__`（executeScript）。**getPlayInfo 返回 type:'hls' +
>   m3u8Url**（AcFun ksPlayJson 是 m3u8；web 播放器原只支持 DASH → vshell.user.js
>   加了 setHls/loadHls + attach hls 分支，hls.js 1.5.13 放 _vs-fixtures/）。
> - **持久化双向桥**：web V.store.set/del → `__VS_STORE_BRIDGE__.push` → storeSet/
>   storeDel → VsStore；启动时 VsStore.exportAll() 经
>   addScriptToExecuteOnDocumentCreated 注入 `window.__VS_SYNC__`（vshell.user.js
>   store 初始化后 merge）。**键名互通**：web 'vshell.' 前缀 = VsStore 'vshell.'
>   前缀（文件层 flutter.vshell.* 是 shared_preferences_windows 平台前缀，正常）。
> - **API 要点（webview_windows 0.4.0）**：`Webview(_controller)` 位置参数、Dart→JS
>   用 `executeScript`、**webMessage 已解码为 Map 非 String**、环境初始化用
>   `WebviewController.initializeEnvironment()`（可重复调用会抛异常→catch）。
> - **坑**：Dart 字符串插值 `${` 内表达式以 `{` 开头报解析错（先算变量再拼接）；
>   **install\ 的 kernel_blob.bin 必须 cmake_install 更新**（只 Copy exe 会跑旧
>   Dart 代码）；WebView2 缓存旧页 → URL 加 ?v=N；hls.js 用 python requests 下载
>   （schannel 废）；桥日志 bridge.log（install\ 工作目录）+ 3s 环境探针仍在
>   main.dart（用后删）。
> - 验证：真实 AcFun 数据全链路（getHomeSections/getHomeFeed/getPlayInfo/search
>   全 ok + 视频真实播放）；__VS_SYNC__ 28 键注入；storeSet 落盘
>   shared_preferences.json（bridgeProbe2 实证）；默认入口干净无测试痕迹
>   （_r146_default.png）。
>
> **实施状态（2026-08-25 复刻完成）**：除标注「裁剪/记录」的 P2 项外全部完成并验证。
> - ✅ 第十轮 分类卡取消浮动（2026-08-28）：用户原话"没有把分类卡片的浮动布局
>   取消掉"——第 9 轮只做了导航栏悬浮，分类卡仍在 Column 顶层（滚动容器外、
>   固定不滚）。web 权威：分类卡（.vshell-sections）在 .vshell-page-home 滚动
>   容器**内部**（overflow-y auto），随页面滚动滚走。修复（home_page.dart）：
>   Column[分类卡, Expanded(墙)] → **单一 CustomScrollView（controller: _scroll）
>   slivers = [SliverToBoxAdapter(分类卡), SliverPadding(SliverGrid 墙)]**——分类卡
>   与视频墙同滚动容器；feed 分支保持 Column+FeedView。
>   **关键坑①（重要教训）**：SliverToBoxAdapter（无界主轴 maxHeight=Infinity）内
>   **shrinkWrap GridView 与动态高度 Column 全部塌陷为 0**（整卡消失、无异常日志、
>   LayoutBuilder 照常执行）——**必须给内容显式高度**：手动等宽网格（Row/Expanded
>   chips 9 列 2 行）+ `SizedBox(height: rows*34+(rows-1)*8)` 包 Column。
>   **关键坑②**：Container 不能同时给 color 和 decoration（断言
>   'Cannot provide both a color and a decoration'——临时涂红调试触发，整卡消失）。
>   **坐标教训**：PrintWindow 位图 y = 客户区逻辑 y × 1.485 + **48**（标题栏偏移，
>   之前一直用 +0 分析导致误判"分类卡塌陷"为真——红块实验（ColoredBox
>   SizedBox(150)）定位正确位置 y134-357 后重算才确认）。
>   验证（--scroll-test 延迟 3s→6s 防与截图竞争）：top（未滚）y144-288 = chips
>   两行（49/86/73/49 特征）+ 错误日志空；scrolled（jumpTo 300）分类区完全滚走
>   （y160+ 全卡片 433）、导航栏悬浮原位、毛玻璃透出内容变化。截图 _r17_top/
>   _r17_scrolled.png。**另注意**：--scroll-test jumpTo 后无输入时位置会继续漂移
>   （实测 300→633=300+55% 视口，原因未深究，不影响功能）。
> - ✅ 第九轮 悬浮导航模型（2026-08-28）：用户原话"分类卡片不需要悬浮，需要悬浮的
>   导航栏，去原脚本把对应逻辑搬过来"。web 权威（css:14833-14856 + 18134-18166 +
>   navbar.js L3683-3689）：**.vshell-navbar position:fixed 悬浮**（不占文档流、毛玻璃
>   浮在内容上方）、`.vshell-outlet padding:56px 0 0` 顶部让位（内容/滚动条从导航栏
>   下方开始）、滚动 `root.classList.toggle('is-scrolled', y>0)` → `box-shadow
>   0 2px 10px rgba(0,0,0,0.45)` 150ms；.vshell-sections 普通文档流（hover 仅
>   list-hoverBackground 背景，无 transform/上浮）。Flutter 重构（shell.dart）：
>   Column[NavBar, Expanded] 占位布局 → **Stack[ Positioned.fill(NotificationListener
>   > Padding(top: feedFullscreen?0:56) > _body), if(!feedFullscreen) Positioned
>   (top:0,l:0,r:0, _NavBar), ThumbHost ]**——与 web 完全同构（outlet padding-top 56 +
>   navbar fixed）；滚动监听移入 body 侧（NavBar 不在滚动冒泡路径）。验证：新增
>   --scroll-test 参数（HomePage._scroll.jumpTo(300) 3s 后；鼠标/键盘事件注入对
>   Flutter Windows 无效——mouse_event 滚轮/PageDown/SetForegroundWindow+Alt 全失败，
>   必须程序化滚动）；日志证实 navScrolled=true px=300 → AnimatedContainer 阴影
>   （navScrollShadow 0x73000000 blur10 offset(0,2) = web 0.45 10px (0,2) ✓）；
>   滚动前后像素 diff 98218 证明内容位移；view_image 确认导航悬浮+阴影+内容从下方
>   滚过；分类区随滚动滚走（不悬浮 ✓）；错误日志干净。附：**themeLight 持久化曾为
>   "true"**（遗留注入），已改回 false；themeLight/feedMode/coverLayout 等 bool 值为
>   JSON 编码字符串（"true"带引号），python 文本替换注意转义。
> - ✅ 第八轮 角色列表遮罩参数对齐+亮线缝隙修复（2026-08-28）：用户反馈"角色列表页
>   半透明遮罩也有亮线缝隙，参数调至和原脚本一致"。web 权威：**charRow 长条遮罩 =
>   `linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0.78))`**（vshell.user.js
>   L4464，char-picker/char-list 共用）；char-panel detail-idrow = 0.35→0.72（L4113）；
>   角色页 banner = 0.45→0.82（L12321）。Flutter 原误用 0.45→0.82（注释引用角色页参数）。
>   修复（4 处，均 Container Clip.antiAlias + radius 8 内）：**①char_list_dialog.dart
>   + char_picker_dialog.dart 长条遮罩 `0x73000000→0xD1000000` 改 `0x73000000→
>   0xC7000000`（0.45→0.78，0.78×255=199=0xC7）**；②char_panel_dialog.dart idrow
>   （0x59000000→0xB8000000 已正确）+ role_page.dart banner（0x73000000→0xD9000000
>   已正确）参数不动；③四处遮罩 `Positioned.fill` 改 `Positioned(left:0,right:0,
>   top:-2,bottom:-2)`——垂直渐变上下各溢出 2px 被外层 Clip 裁掉（同 video_card 方案，
>   消除渐变末端插值不满+border 抗锯齿的亮线）。验证：main.dart 加 `--char-list`
>   测试参数（shell.dart initState 2s 后 showCharListDialog）；_r13_charlist.png +
>   单列剖面：行为大赏卡（y 683-766 物理）border 43 → 渐变首行 27 → 白字 170-200 →
>   渐变末行 15-18 → border 43，**顶部/底部均无亮线突起**；热门集锦卡恒 37（圆环图案
>   亮部×0.45 遮罩的数学值 37.4）渐变平滑；view_image 双确认；错误日志干净。
> - ✅ 第七轮 卡片 meta 行改显角色（2026-08-28）：用户要求"视频卡片底部不要显示 up，
>   而是显示'角色'"。web 权威（vshell.user.js L5086-5113 + css:15864-15920）：meta 左
>   = .vsc-video-meta-owner——**v0.5.4 起原 UP 位置显示角色**：[codicon-account 12px +
>   角色名 11px]（title='角色：{名}——点击进入角色主页'、点击 nav('/role/{名}')）；
>   冲突 → span.is-conflict 红字「冲突」（errorForeground+600）；都无 → .no-owner
>   （flex-end 只日期靠右）；feed 卡 meta 无 owner（web 无 feed-owner 元素）。
>   实现：video_card.dart meta 行三支（conflict→红字「冲突」onTap picker / char→
>   [account+角色名] onTap go(PageType.role) / none→空占位）；_OwnerName 注释更新；
>   feed_view.dart 删除 ownerName Text（web 无）。验证：--page=watchlist 注入
>   999001（title"行为大赏：年度高光时刻盘点"命中角色关键词）→ meta 行 [图标+行为大赏]+日期
>   （view_image 确认）；无角色卡 meta 左空白只日期（.no-owner 语义）。
>   数据教训：shared_preferences.json 注入必须 python 转义感知扫描（值内 `\"` 转义使
>   `"[^"]*"` 正则截断值 + PowerShell Get/Set 管道中文字节误读）；**文件编码自始正确，
>   pwsh 控制台按 GBK 显示 UTF-8 输出造成"乱码"假象——以字节检查为准**；watch 原
>   13619236 项在注入事故中丢失（fav 里仍有，数据未全失）。
> - ✅ 第六轮 卡片渐变边界缝隙修复（2026-08-28）：用户反馈"渐变阴影在边界处有缝隙，
>   底部图片突然变亮，边沿亮线"。根因 = ①cover ratio 公式 `(w-2)*9/16+2` 使 cell 比
>   媒体区高 0.875 逻辑 → Column 底部留白缝（背景 #181818 夹在渐变末端与卡 border 之间）；
>   ②渐变末端（LinearGradient 光栅化最后一行插值不满）与 border 抗锯齿过渡产生亮带。
>   修复（双保险）：**①六页 cover ratio 改 `w / (w*9/16 + 2)`**（cell=媒体区+border，
>   home/watchlist/search/local/blacklist/agg）**②video_card.dart 三处渐变向边界外溢出
>   2px**：shade 与底部渐变条 `Positioned(bottom:-2)`（渐变条 SizedBox 44→46）、标题浮层
>   `Positioned(top:-2)`——末端颜色越过边界被卡片 Clip 裁掉，可见区最后一行必为末端色。
>   **关键坑：Positioned 必须直接是 Stack 的子项**（初版写成 AnimatedOpacity>Positioned
>   → ParentDataWidget 断言子树不渲染，渐变全消失，剖面 med 恒 117）；正确结构
>   Positioned>AnimatedOpacity>DecoratedBox。验证（行分割法+剖面，_r8_clean/_r8_cover）：
>   shade 末端 #1F1F1F 精确覆盖（standard 卡底 y~795 全 31）；cover 底部渐变条
>   640→800 平滑压暗到 15 → border 41，无亮带无缝隙；错误日志干净。
>   坐标教训：SetWindowPos 宽高是物理像素；PrintWindow 位图 = 客户区逻辑 × DPI(1.485)，
>   窗口物理 1440x900 → 逻辑 970x606 → 主页变 1 列（测量基准必须先用行分割法标定布局）；
>   封面红字 (255,49,50) 与暗部 (8,4,1) 同行的亮度差是封面图内容非渐变异常（勿误判）。
> - ✅ 第五轮 分类栏背景+间距统一变量（2026-08-28）：**①分类区背景 #181818**
>   （web --vscode-surface-background: #181818（css:336）/light #FFFFFF——原误用
>   VsTheme.surface #1F1F1F，改 VsTheme.bg，像素实测 5 点全 (24,24,24)）
>   **②gridGap 统一间距变量**（AppState.gridGap 默认 6.0 clamp 2-16、VsStore 'gridGap'
>   持久化、_loadSaved 读回；home/watchlist/search/local/blacklist/agg 六页视频墙 gap
>   全改用 state.gridGap（local 页修复残留 const 重复声明）；分类区下边距 = gridGap
>   （web sections 下 3 + wall-host padding-top 3 = 6 视觉间距）；设置页「外观」区新增
>   「卡片间距」行：Slider 2-16 divisions 7 accent 色 + 副标题显示当前 px——主题行下方。
>   验证：gap=6 卡 2 顶 border 物理 948 / 注入 gridGap=12 → 967（位移 19px≈12 逻辑=Δgap ✓）、
>   分类区底→卡 1 顶间距同步 12；设置页滑块截图 ✓；错误日志干净。
>   教训：SetWindowPos 的 w/h 是**物理像素**（1440x900 物理 = 970 逻辑 → 变 1 列布局，
>   测量基准全错——验证前必须确认窗口逻辑尺寸）。
> - ✅ 第四轮 搜索框全特性复刻（2026-08-27）：**①聚合搜索页 AggSearchPage**
>   （lib/ui/pages/agg_search_page.dart，web searchtags.js 混流取数全移植：每标签独立
>   分页 {pn,queue,done,failed,loading,retryAt}、黑名单过滤、失败 retryAt 3s+toast.error+
>   自动重拉、首屏轮转每源至少一条→纯随机 pickOne、seen 去重、BATCH8/MAX_STEPS128/
>   waiters 挂起唤醒、标签变更整页重渲染、本地视频标题命中任一标签注入、空态文案原文、
>   页头=返回钮+「聚合搜索」18/600+副标题；Enter/搜索按钮 → PageType.aggregate
>   （web /tagsearch 路由），--page=aggregate 验证 2 标签 3 列混流墙+错误日志干净）
>   **②中间框宽度 +2**（web max(8,ceil(textW)+2)，原 +10 修正）**③盒子 padding 动画**
>   （web st-box：首盒 0/hover3、其余 2/hover4，AnimatedPadding 120ms）
>   **④就近聚焦**（web v0.3.60 点击空白按 |(left+width/2)-x| 最近输入框——纯数学定位
>   [累计宽+半宽-横滚偏移]，**GlobalKey 挂在 LayoutBuilder 动态子树会
>   retakeInactiveElement 撕裂 element 树：LateInitializationError: _children 崩溃 +
>   Duplicate GlobalKey（浮层插入同帧两树持同 key）——弃用 key 方案**）
>   **⑤浮层 leaving 动画**（popCtrl 140ms reverse 淡出上移 4px（ReverseAnimation 显示时
>   无位移）、_closing 防重入、聚焦取消 leaving 恢复显示、关闭后不回焦=web blur 语义；
>   dispose 同步移除浮层）验证：--search-pop 覆盖式 head（胶囊+输入框+clear 14+
>   竖线+搜索钮 20）+角色 chips；主页 #181818 胶囊背景回归；聚合页/主页错误日志干净。
>   裁剪记录：agg 本地缓存（web aggKey）、聚合页 feed 模式（Flutter feed 仅主页）。
> - ✅ 第三轮 P2 遗留全修（2026-08-26）：**F14 黑名单页**（lib/ui/pages/blacklist_page.dart、
>   无页头 margin-top6、网格 400/6 动态比例、导航 6 钮=角色/待看/收藏/黑名单(circleSlash)/本地/
>   下载，设置钮移除=web 语义；真实黑名单数据 2 卡验证）**F9 代表作 640 跑马灯**（_FeaturedMarquee：
>   卡宽 640 封面布局、track 双 half 36s 无限平移、hover 暂停、0.35s featuredhost 展开、内容超宽
>   才滚；注入 charVideos 13619236 后验证 1 代表作 640 卡渲染）**FAB**（_VsFab 右下 20,20 胶囊
>   44 r22 widgetBg+border+shadow、hover 上浮、icon17 chartsBlue+计数 badge+总进度条 60×4；
>   drawer 320 maxH62vh r12 vshell-pop 0.18s：head 下载任务 13/600+close 26、_FabRow 任务行
>   56×36 thumb+title12+4px 状态色 bar（LayoutBuilder 宽）+meta 11 百分比/状态、foot 清除已完成/
>   全部取消 _HoverBtn；--fab-open 截图验证）**D4 peek**（player_view：控制条隐藏态子控件各
>   opacity0+IgnorePointer，_peekedId 鼠标命中单显，120ms；渐变恒有透明底保 hit test）
>   **G4 light**（activeFg token light #000000/dark #FFFFFF，home 分类 chip/char_panel 选中行/
>   shell 胶囊删除钮替换；light 主页截图验证激活 chip 黑字）**G5**（grep 确认无 fontFamily 漏项）
>   **搜索浮层改 web 覆盖式 head**（浮层卡片覆盖搜索框 top/left/right:-1px、head=编辑器+clear+
>   竖线+searchBtn、body=maxH min(420,60vh) 角色 tagpop chips；框内浮层开时留静态胶囊摘要；
>   **关键修复：OverlayEntry 直插 root Overlay 无 Material 祖先 → TextField 断言
>   "No Material widget found" 红屏错误 → 浮层卡片最外层包 Material(transparency)**
>   （与 E4 轮 showGeneralDialog 同源教训）；--search-pop 截图验证胶囊+角色 chips 正常）
> - ✅ 第二轮 7 项还原度修复（2026-08-25 晚）：①feed 整屏滑卡（PageView 垂直、媒体铺满、
>   黑底、导航栏下全高、翻页自动播放、全屏 scale1.5）②搜索框胶囊编辑器完整复刻（多输入框/
>   胶囊交替、Enter 全量封装+搜索、Ctrl+Enter 单封装、Backspace/Delete 删胶囊合并、方向键
>   跨框、胶囊 hover 12×12 圆删除钮骑跨 -4px、聚焦浮层=角色快捷区 tagpop-chip、clear 14×14/
>   竖线/搜索钮 20×20、searchTags 持久化；浮层从搜索框下方展开保证编辑器可输入）
>   ③角色管理改 640 两栏浮窗（char-panel：head/侧 220 行 44 高 r4/详情头卡 min-h88 背景图
>   0.35→0.72 遮罩/bigthumb 64/banner-set/kwchip 24 高悬停删除/kwadd/底部完成；关闭回角色
>   列表 web v0.5.6 十七轮；--page=characters 复用 asPage 模式）④cover 布局网格比例改
>   16:9（含 1px 边框补偿 w/((w-2)*9/16+2)，修复 0.875px 溢出）⑤文字区固定高 92 → meta 贴底
>   ⑥char_list/char_picker 长条与面板头卡 Stack alignment=center（控件偏上根因）
>   ⑦角色默认背景 = 8 张手绘 SVG 按名 hash 分配（lib/theme/char_banners.dart 全量移植，
>   has-bg 恒真 + 0.45→0.82 遮罩 + 白字；web JS 12318-12346 确认）
> - ✅ A 全部（token 闭环：radiusXSmall/XLarge、toolbarHover/Active 半透明、accentHover、placeholder、
>   widgetBg/Border、scrollbar 6px 半透明、watchBlue #59A4F9、favRed #F85149、localGreen #0DBC79、
>   chartsOrange #EA5C0055；死 getter 清理；vs_tokens 保留 GENERATED 标注）
> - ✅ B 全部（hover 全补、搜索框 hover、版本 v0.5.6、日志清理；B7 搜索胶囊**已实现**（本轮 ②））
> - ✅ C 全部（padding 上6左右8下8、圆点色、hover 滑入 120ms、操作钮 r4 半透明+web 激活色、
>   静音/黑名单钮、2px 预览进度条、占位渐变 160°、cover 浮层 10/10/20、owner hover 冲突红；
>   文字区 spaceBetween 替代 Spacer——Spacer 与媒体区组合触发 Windows 渲染黑屏（已修）；
>   卡片网格动态 childAspectRatio=宽/(宽×9/16+92) 防窄窗口溢出）
> - ✅ D 全部（分段 fill accent+glow、进度条去重、控制钮 hover、中心钮 hover；D4 peek 裁剪 P2；
>   450ms 宽过渡保持取舍）
> - ✅ E 全部（弹窗 radius12/widgetBg、picker 行 hover、0E639C→accent、backdrop blur(3px)+0.5、
>   toast 自绘统一、FAB 未做=记录 P2、空态对齐；E6 local 删除钮移位修复）
> - ✅ F 全部（主页分类卡、全站网格 400/6 动态列、详情 0/40/0/60+浮动返回钮+侧栏 min(25%,320)+
>   相关推荐 push、role 头卡实现、feed 4 动作钮（详情/待看/收藏/黑名单，chartsOrange 激活）、
>   下载卡 r12/thumb/chip/6px bar/hover 上浮、watchlist 无页头、页面入场 0.22s；
>   F9 代表作 640 滚动、F14 黑名单页 = 记录 P2）
> - ✅ G 全部（日志清理、search controller、snackbar→toast、G4/G5 记录）
> - ✅ ⑧ 代码探针 `_verify_tokens.py` 46/46 PASS；⑨ 截图对比：主页/详情/待看/下载/feed 与 web 一致
>   （差异=数据内容：web harness demo 封面 vs Flutter 占位/真实 AcFun 封面）
> - 验证入口：`flutter build windows --debug` + install\vshell.exe，参数 --video= / --page= /
>   --feed / --demo-data / --dl-demo / --search-pop（自动聚焦搜索框弹浮层）/ --fab-open
>   （FAB drawer 初始展开）；本轮截图 _r4_*.png 留档 vshell-flutter/
> - ✅ 第四轮 卡片渐变/角标/按钮审计（2026-08-26）：**①渐变参数与 web 完全一致并实测渲染正常**
>   ——shade `linear-gradient(180deg, transparent 55%, editorBg #1F1F1F)`（css:2066-2073，standard 也有）、
>   标题浮层 `0.8→0.4→transparent`（css:2130-2149，仅 cover）、底部 44px `0.55 黑→transparent`
>   （css:2171-2183，**仅 .is-cover/.vshell-role-marquee**，Flutter `if (cover)` 一致）；像素剖面验证：
>   Flutter 卡1媒体区顶部亮图 → 逻辑 55% 位置（~367）起单调压暗 → 底部 28（editorBg+渐变条）。
>   用户观感差异来源：对比基准 web harness 是 standard 布局（无底部渐变条）+SVG 渐变封面；
>   Flutter 真实照片亮、shade 后仍亮（200→156 vs web SVG 77→23）。**②角标层级**：_CharBadge 移到
>   标题浮层之后（用户要求头像在渐变上方；web DOM 顺序 title 最后但按用户需求改），--page=role:热门集锦
>   截图验证角标完整清晰未被渐变盖住。**③悬停按钮**：star=isFav?heartFilled:heart、watch=isWatch?
>   check:add（原误用 bookmark/star 已修，码点 0xEB05/0xEC04/0xEA60/0xEAB2 确认）；feature=
>   starFull:star 仅 showFeatureBtn 场景显示（主页不显示=web 语义）；mute/unmute、blacklist circleSlash
>   不变；28×28 r4 icon16 白、未激活 toolbarHover 0x50 半透明、激活 favRed/accent、hover
>   toolbarActive——hover 截图实测：左上实心心形（卡1已收藏 ✓）、右上加号（未待看 ✓）、右下喇叭 ✓。
>   **诊断教训**：截图采样必须先对齐坐标系（Flutter 截图 y=客户区+48，web 无标题栏）；主页"分类区"
>   背景 #1F1F1F 易被误判为卡片媒体区；edit 误插重复块（标题浮层复制到角标位）导致布局错乱，
>   以红/绿/蓝临时诊断色一次构建定位后删除。本轮截图 _r5_final/_r5_hover/_r5_role.png 留档。

> 目的：逐项列出 web 版（userscript v0.5.6）与 Flutter 版（vshell-flutter/）的像素级差异，作为复刻施工单。
> 参考：web 规范 = `_audit_web_spec.md`（`css:行号` 引自 `_web_css_extract.css`）；Flutter 现状 = `_audit_flutter_state.md`（`f:` 行号为 `vshell-flutter/lib/ui/…` 内文件行号）。
> 优先级：**P0**=直接可见差异，必修；**P1**=细节/交互差异，应修；**P2**=复杂交互或桌面端扩展差异，裁剪/记录。
> 色值未注明主题均为 dark。Flutter 路径前缀 `lib/ui/`。

---

## A. 全局 Token（阶段②）

| # | web 值（权威） | Flutter 现状 | 动作 | 优先级 |
|---|---|---|---|---|
| A1 | 圆角阶梯 2/4/6/8/12/9999（css:24-29）；4px=控制件/小按钮、8px=卡片/浮层、12px=xLarge | vs_theme 仅 radiusSmall/Medium/Large=4/6/8 | 补 radiusXSmall=2、radiusXLarge=12、radiusCircle；按组件改用对应档 | P0 |
| A2 | toolbar-hoverBackground = rgba(90,93,94,0.3137)（#5a5d5e50，半透明） | toolbarHover = #5A5D5E 实色 | getter 改 `Color(0x505A5D5E)`（0x50≈31.4%）——hover 叠底才与 web 一致 | P0 |
| A3 | toolbar-activeBackground = rgba(106,109,110,0.3137) | 无 | 新增 getter `Color(0x506D6E6F)` | P0 |
| A4 | button-hoverBackground = #026EC1 | 无；弹窗按钮硬编码 #0E639C | 新增 `accentHover` getter；替换全部 #0E639C | P0 |
| A5 | input-placeholderForeground = #989898 | hint 色 ≈ fgDim #9D9D9D | 新增 `placeholder` getter = #989898（light #767676），inputTheme 引用 | P0 |
| A6 | editorWidget-background = #202020（fab/toast/modal/dl-card/浮层底） | overlayBg = #252526 | 新增 `widgetBg` = #202020；弹窗/浮层改用它 | P0 |
| A7 | 滚动条：6px 宽、thumb rgba(121,121,121,0.6) r3、hover 0.8（css:1358-1379）；scrollbarSlider-background rgba(121,121,121,0.4) | thickness 10、thumb #424242 实色 | vs_theme scrollbar：6px + `Color(0x99797979)`（0.6）+ hover 0.8 | P0 |
| A8 | 圆点/watch 蓝 charts-blue = **#59A4F9**（css:118） | watchBlue = #4DAFEC | 改 watchBlue = #59A4F9（light #0063d3） | P0 |
| A9 | 收藏红 = errorForeground **#F85149** | favRed = #F14C4C | favRed 改 #F85149（light 同为 #F85149）；error 已是 #F85149 ✓ | P0 |
| A10 | 本地绿 = terminal-ansiGreen **#0DBC79**（已定义，fallback #89d185） | localGreen = #89D185 | 改 #0DBC79（light #107C10） | P0 |
| A11 | 代表作金 = editorLightBulb-foreground（未定义 → 实际 fallback **#ffcc00**） | featGold = #FFCC00 ✓ | 无需改 | — |
| A12 | 激活按钮蓝 = button-background **#0078D4**（watch/feature 激活、hover #026EC1）；star 激活 = errorForeground #F85149（hover terminal-ansiRed #cd3131） | 激活用 watchBlue/favRed/featGold 实色 | 卡片 hover 操作钮按 web 语义重写（见 C 节） | P0 |
| A13 | 死代码清理 | VsTheme.maskBg/cardBg/link 无人用；vs_tokens.dart 587 行仅 2 处引用 | 删死 getter；vs_tokens 标注 GENERATED 弃用或接入 | P1 |
| A14 | 过渡时长：120ms hover/140ms 弹窗控件/150ms 按钮/200ms 播放器控件/220ms toast/0.22s 页入/0.32s 卡片/450ms linear 进度条宽 | 卡片 320ms ✓；播放器 200ms ✓；进度条宽 450ms 已注释（高频重建冻结，性能取舍） | 保持取舍并记录；补 0.22s 页面入场、toast 220ms | P1 |
| A15 | spacing 阶梯 2/4/6/8/10/12/16/20/24/28/32/36/40 | 散落硬编码 | 复刻时优先用 2px 阶梯，不强制建类 | P1 |

## B. 导航栏（阶段③）

| # | web 值 | Flutter 现状 | 动作 | 优先级 |
|---|---|---|---|---|
| B1 | nav-btn hover：toolbar-hoverBackground（120ms）；home 36×36 hover 底 + scale(1.06) | **全部按钮无 hover 态**（shell.dart:216-320） | 补 hover：半透明底 + scale；home 1.06、icon-btn 1.05 | P0 |
| B2 | 滚动阴影：仅 scrollTop>0 → `0 2px 10px rgba(0,0,0,0.45)`，150ms 过渡（css:1461-1467） | navScrollShadow 0x73000000 blur10 offset(0,2) 值 ✓ 但无过渡 | 加 AnimatedContainer 150ms | P1 |
| B3 | 搜索框：hover → bg #181818（css:1538-1540）；focus-within 边框不变 ✓ | 无 hover 变化；focus InputBorder.none ✓ | MouseRegion hover 换底 | P0 |
| B4 | nav-btn 带文字标签 12px（gap 6、padding 0 10px） | 纯图标 34×34 | 补文字标签（待看/收藏/…）12px | P1 |
| B5 | 版本号 brand-ver "v0.5.6" 11px opacity 0.8 | "v1.0.0"（settings 页 "0.1.0"） | 统一 "v0.5.6"（与 web 一致） | P1 |
| B6 | 角色按钮 active 态 = 无底色（web 无 is-active 规则，仅 hover） | page==characters 时图标白 + listActive 底（shell.dart:235 疑似 bug） | 截图确认 web 无 active 底 → 移除底色，仅 hover | P0 |
| B7 | 搜索胶囊编辑器 + 聚焦浮层（chip/多输入框/popover，css:1553-1944） | 简单 TextField（无胶囊无浮层） | **裁剪 P2**：保持简单输入框视觉一致（520×30/r8/边框/hover 底），浮层与胶囊交互记录为裁剪项 | P2 |
| B8 | 搜索框内 search-btn 20×20 + clear + divider（浮层内） | 无 | 随 B7 裁剪；搜索框右侧可加 20×20 搜索钮（P2） | P2 |
| B9 | 布局：左 brand(14px 600+发光点)+theme/mode/layout（组内 margin -6px）；中 home+search；右 6 钮 | 左 brand+3 视图钮、右 6 钮 ✓ 结构一致 | 组间距 -6px（4px）细节对齐 | P1 |
| B10 | 调试残留 `_tapLog`→D:/vshell_btn.log、`_layoutLog`→D:/vshell_layout.log（shell.dart:275-300） | 同左 | 删除（含 main.dart D:/vshell_pt.log、其他 6 处） | P0 |

## C. 视频卡片（阶段④）

| # | web 值 | Flutter 现状 | 动作 | 优先级 |
|---|---|---|---|---|
| C1 | body padding `6px 8px 8px`（上6 左右8 下8，css:2447-2451） | 8,6,8,8（video_card.dart） | 改 `EdgeInsets.only(top:6,left:8,bottom:8,right:8)` | P0 |
| C2 | 状态点颜色：watch #59A4F9 / fav #F85149 / local #0DBC79 / feat #ffcc00（css:2240-2248） | watchBlue/favRed/localGreen/featGold 旧值 | 随 A8-A11 改；_DotsGrid 阴影 0x80000000+0x24000000 ✓ | P0 |
| C3 | hover 操作层：opacity 0→1 + translateY(-4px)→0，120ms（css:2323-2366） | 直接 show/hide 无滑入 | AnimatedSlide/AnimatedOpacity 120ms | P0 |
| C4 | 操作按钮：28×28 **radius 4**、bg toolbar-hover 半透明、hover toolbar-active、icon 16 | 28×28 radius 6、底 0x4F5A5D5E 实色 | radius→4；底色换 A2/A3 半透明 | P0 |
| C5 | 激活色：watch=#0078D4（hover #026EC1）、star=#F85149（hover #cd3131）、feature=#0078D4 | watch=watchBlue、fav=favRed、feature=featGold | 按 web 重写（feature 激活是**蓝**不是金） | P0 |
| C6 | 静音钮：右下 4,4 28×28 r4 toolbar-hover、预览时 bottom 6、120ms 滑入；黑名单钮：左下 4,4 同款 hover 变红（css:2372-2418） | **缺失**（video_card.dart 无 mute/blacklist） | 补两钮 + 滑入动画 + previewing 位移 | P0 |
| C7 | 卡片进度条：2px 贴底、track rgba(255,255,255,0.28)、fill #0078D4、仅 is-previewing 显示（css:2421-2435） | **缺失** | 补（预览播放时 120ms 浮现） | P0 |
| C8 | 占位底：linear-gradient(160deg,#2a2d2e,#181818) | 纯 #232323 | 改渐变 160° | P1 |
| C9 | 封面布局：标题浮层 padding `10px 10px 20px`（css:2141-2143） | 16,14,16,44 | 改 10/10/20（渐变/阴影/54px 让位 ✓） | P1 |
| C10 | cover 标题 hover 淡出 ✓（120ms） | 已有 ✓ | — | — |
| C11 | meta owner：icon 12 + name、hover → foreground、冲突=红 600（css:2520-2533） | 12px fgDim 无 hover/冲突态 | 补 hover 变色 + 冲突红 600 | P1 |
| C12 | 标题关键词高亮框（standard）：#1c1c1c 底/1px #484848/r8/shadow 0 0 4px #272727/pad 2px 6px/lh1/margin 0 3px（css:2506-2512） | 无 | 搜索高亮时套框（需数据支持，见 search 页） | P1 |
| C13 | hover:none 触屏 actions 常显、mute/blacklist 隐藏 | 桌面应用忽略 | 记录 | P2 |
| C14 | 卡片其余 ✓：border/radius8/shadow 0x24@12/16:9/入场 320ms+22ms/shade/stats/时长/角标 40×40/dots 3×3 顺序（本地→收藏→代表作→待看 5 2 1/6 4 3/9 8 7） | 已对齐 | — | — |

## D. 播放器（阶段⑤）

| # | web 值 | Flutter 现状 | 动作 | 优先级 |
|---|---|---|---|---|
| D1 | 分段进度条 fill = kk-progress-color #0078D4 + glow 0 0 6px（css:2854-2859） | **0xFF0000FF 纯蓝**（player_view.dart:891） | 改 accent + glow | P0 |
| D2 | 进度条只渲染一次 | `Positioned(_bar())` 渲染两次（:254 与 :299） | 删一处 | P0 |
| D3 | 控制按钮 hover：rgba(255,255,255,0.18) + scale(1.08) 120ms（css:2667-2670） | _ctlBtn 恒 transparent（:377-392） | 补 hover | P0 |
| D4 | 控制条隐藏态 peek 模式（悬停控件单显） | 无 | **裁剪 P2**（简化：隐藏即整体隐藏，鼠标移入 0.7s 重显已实现） | P2 |
| D5 | 中心钮：rgba(0,0,0,0.55)、hover 0.75、scale 0.92→1 + opacity 200ms | 0x8C000000 ✓ scale 200ms；hover 缺失 | 补 hover 0.75 | P1 |
| D6 | 全屏：border-radius → 0（css:2974-2976） | setFullScreen 时 ClipRRect 仍 r10？ | 全屏时 radius 0 | P1 |
| D7 | 进度条其余 ✓：19px 命中/轨道 4→8/0.38+buffer 0.35/450ms 宽过渡（取舍保留）/拖动期 transition none/seek 预览 160/152×86/bottom22/0xD1000000/panelBorder/shadow ✓/分镜 hover 单段 8px/段空隙（web SVG mask 挖空 vs Flutter 2px 空隙，视觉等效） | 已对齐 | — | — |
| D8 | 时间 96px 12px tabular ✓；音量 64×14/0.25/白 ✓；gap 滑块 96×4/0.2/指数档 ✓；loading rgba(0,0,0,0.35)+spinner 22 ✓ | 已对齐 | — | — |

## E. 弹窗 / 浮层 / toast / FAB（阶段⑥）

| # | web 值 | Flutter 现状 | 动作 | 优先级 |
|---|---|---|---|---|
| E1 | 通用 modal：宽 420、radius **12**、bg editorWidget **#202020**、1px widget-border、padding 18、shadow 0 16px 50px 0.5（css:3535-3601） | Dialog overlayBg #252526 radius 8 | 弹窗样式统一：radius 12、widgetBg、padding 18 | P1 |
| E2 | picker：radius 8、padding 20、title 16/600/lh1.3 ✓、两列 56px 行 ✓、thumb 36 圆 ✓、选中 ✓ 徽章 18px top/right 6 listActive+勾 2.2 ✓、冲突 3px 竖条+tint 0.16 ✓、follow 26 圆 + 红点 6 ✓ | 基本对齐；hover 行（focusBorder 边框+白 0.08 tint）缺失 | 补行 hover；完成按钮 margin-left:auto 推右确认 | P1 |
| E3 | 添加/完成按钮：32×32/32 高 r6、button-background #0078D4、hover #026EC1 | 硬编码 **0xFF0E639C**×4（char_picker/characters/_AddCharDialog） | 全替换为 accent + accentHover | P0 |
| E4 | picker backdrop：blur(3px) + rgba(0,0,0,0.5)（css:4265-…） | barrierColor 0x99000000 无 blur | BackdropFilter blur 3px（性能可控时） | P1 |
| E5 | 角色管理面板：640px 两栏；行高 44、radius **4**、thumb 30；kwcount badge 11px；行 del 10×10 r4 close 10px 常显 | characters 为全页（结构差异）；行 28 头像 radius 6 | 页内元素对齐（行高 44/r4/thumb 30/del 常显） | P1 |
| E6 | local-panel：宽 520、dashed drop 区（hover focusBorder）、行 thumb 64×36 r6、del 24×24 | local 页：**删除钮 top2 right2 与圆点区重叠**；无 dashed 区 | 修重叠（del 移右下或圆点旁）；补 drop 区 | P0 |
| E7 | sniffer-panel：宽 **560**、URL 输入行 + 下载钮 56px、行 r6 1px panel-border bg editor-background、disabled 0.55 | downloads 添加弹窗宽 460 | 宽改 560；行样式对齐 | P1 |
| E8 | toast：右 20/bottom 76、max-w 320、r8、bg #202020、widget-border + **左 3px accent 条**、shadow 0 6px 20px 0.35、220ms 右滑入、2400ms；error 红条/ok 蓝条 | SnackBar floating r6 无左条、位置 bottom-center、时长不一 | 自绘 toast 组件统一替换（位置/圆角/左条/动画） | P1 |
| E9 | FAB 下载胶囊：right20 bottom20、44px radius 22、bg #202020、widget-border、shadow 0 6px 24px 0.35、hover 上浮 2px + 0 10px 30px；抽屉 320px max-h 62vh r12（css:3296-3473） | **无 FAB** | 补 FAB 胶囊 + 下载抽屉（下载页复用） | P1 |
| E10 | 空态：icon 42px opacity 0.55、text 14px、gap 12、padding 60/20（css:3890-3903） | icon 36 fgDim + 13px | 对齐 | P1 |
| E11 | 骨架屏 pulse 1.3s | 无（-600 spinner） | P2 可选 | P2 |

## F. 页面布局（阶段⑦）

| # | web 值 | Flutter 现状 | 动作 | 优先级 |
|---|---|---|---|---|
| F1 | 主页分类导航：surface 卡片（1px sideBar-border、r8、shadow-lg、padding 16）+ grid minmax(112px,1fr) gap 8 + chip 34px 高 r4 13px hover list-hover（css:4864-4904） | chips 栏 40 高胶囊 r14 padding h12 | 改：卡片容器 + 34px r4 chips 网格 | P0 |
| F2 | 视频墙：minmax(400px,1fr) gap 6（全站统一） | home 400/6/1.2 ✓；watchlist/search/fav 网格 **320/16/1.52** | 全站统一 400/6；ratio ≈ 1.2 | P0 |
| F3 | 详情页 padding `0 40px 0 60px`（左60右40，页面本身不滚） | padding 20,16,20,40 + 页滚 | 改 0/40/0/60；滚动模型对齐（主列不滚仅侧栏滚） | P1 |
| F4 | 侧栏宽：25% 列（1280 → 300px） | 固定 320 | 改 min(25%宽, 320)；gap 30 ✓ | P1 |
| F5 | 详情返回钮：absolute 左上 24×24 r6 button-secondary 底 shadow 0 1px 4px 0.35（css:…-detail-back） | **无返回钮** | 补浮动返回钮（或确认桌面导航方式后对齐） | P0 |
| F6 | 详情标题行 ✓ 19/600；复制钮 20×20 ✓ | 已有 ✓ | — | — |
| F7 | 相关推荐：push 保留返回栈 | pushReplacement（detail_page.dart） | 改 push（保持前进/返回） | P1 |
| F8 | 角色主页头卡：banner 卡片（r8/1px border/padding 20/渐变 135° listActive→editorBg、has-bg cover）+ 头像 64 r8 + name **20px/600** + chips（st-chip 22px）+ stats 12px | **品红/绿/蓝占位**（role_page.dart:223-233）+ banner 150 全宽 | 实现头卡（avatar 64 r8、name 20、chips、stats）；banner 改卡片式（非 150 全宽） | P0 |
| F9 | 代表作滚动排：卡 **640px**（封面布局）、marquee 36s 自动滚动 hover 暂停、featuredhost 展开动画 0.35s | 横向 ListView 卡 400 高 262 | 卡宽 640；自动滚动可选（P2 简化） | P1 |
| F10 | 页面入场 0.22s translateY(8px)（css:4758-4761） | 无页面切换动画 | 页面切换包 AnimatedSwitcher 0.22s | P1 |
| F11 | 页头：page-head padding 18px 0 12px、title 18px/600、sub 11px | watchlist 标题 16 w600 padding 20,14,20,4 | 对齐 18px/600 + sub | P1 |
| F12 | 下载卡：r12、1px panel-border、bg #202020、thumb 112×63 r8、chip badge 11px、bar 6px、track 4px fill **charts-blue**、hover 上浮 1px + widget-border、op 28px（css:5518-5666） | 任务卡 surface r6 状态色 bar | 对齐（r12/bg/thumb/hover/状态色） | P1 |
| F13 | feed：4 动作钮（详情/待看/收藏/黑名单）44 圆 20px、label 11px、hover scale 1.1+0.65 底；激活色 watch=charts-blue、fav=errorForeground、black=#EA5C00；poster opacity 0.55；avatar is-add dashed | 仅 2 钮（待看/收藏）；无 poster | 补详情+黑名单钮；激活色随 A 系改；poster 0.55 | P1 |
| F14 | 黑名单页 #/blacklist 存在 | Flutter 无黑名单页（导航以设置页替代） | 记录为桌面端差异，保留 | P2 |
| F15 | 断点 1080 单列 / 1280 侧栏 300 | 断点 1120 单列 | 对齐 1080/1280（桌面窗口 1440 为主场景，低优先） | P2 |
| F16 | 角色管理（web 弹窗 640）vs Flutter 全页（--page=characters） | 结构差异 | 记录；元素级对齐见 E5 | P2 |
| F17 | search 结果网格同 wall（400/6） | 同 watchlist 320/16 | 随 F2 统一 | P0 |
| F18 | 详情简介：collapsed max-height 64px（≈3 行）+ toggle 12px textLink | maxLines3 + linkBlue ✓ | 对齐 | P1 |

## G. 工程杂项

| # | 项 | 现状 | 动作 | 优先级 |
|---|---|---|---|---|
| G1 | 调试日志绝对路径（D:/vshell_btn.log、_layout.log、_pt.log 等 6 处） | 残留 | 全删 | P0 |
| G2 | search_page 输入 controller 每帧重建（:118） | 性能 bug | 移入 State 字段 | P1 |
| G3 | snackbar 风格不统一（toast 见 E8） | 多处 SnackBar 参数不一 | 统一自绘 toast | P1 |
| G4 | light 主题硬编码白字黑底 | 多处 | 随主题 token 清理 | P1 |
| G5 | TextStyle 漏 fontFamily Segoe UI（㉑） | 散落 | 统一经 theme 获取 | P1 |
| G6 | hover 隐藏用 opacity 0 仍占位命中 | 卡片/播放器 | 隐藏态加 IgnorePointer | P2 |
| G7 | 原生标题栏未定制 | main.dart 未配 titleBarStyle | P2 可选（WindowCaption 仿 web 无 chrome 风格） | P2 |

---

## 施工顺序（对应 Todo ②-⑨）

1. **A 全局 token**（vs_theme.dart 增改 getter + scrollbar/input 对齐）→ 构建
2. **B 导航栏**（hover/搜索框 hover/版本/角色钮底/日志清理）→ 构建+截图
3. **C 视频卡片**（padding/圆点色/hover 层/操作钮/静音/黑名单/进度条）→ 构建+截图
4. **D 播放器**（fill 色/去重/hover）→ 构建+截图
5. **E 弹窗系**（#0E639C→accent、local 重叠、toast、FAB、空态）→ 构建+截图
6. **F 页面布局**（home 分类卡、网格统一、详情返回/侧栏/padding、role 头卡、feed 动作、页头、下载卡）→ 构建+截图
7. **G 杂项**（日志/controller/snackbar/light/字体）
8. 最终全页面对比截图（Flutter 截图 vs web harness 截图，逐项核对）

## 验证基线（后续每阶段用）

- **web 参照**：`python -m http.server 8931` 服务 `output/` → Edge headless `--headless=new --window-size=1440,1100 --screenshot=... http://127.0.0.1:8931/harness.html`；路由 #/、#/watchlist、#/fav、#/downloads、#/video/<ac>、#/search?q=…；已有参考图 `output/_vs-final-home.png` 等。
- **Flutter 截图**：构建 debug → 运行 exe（1440×900）→ PowerShell `[System.Drawing]` CopyFromScreen 捕获窗口 → 与 web 图并排目视 + 探针比对关键色值/尺寸。
- **代码探针**：对每个复刻项写小断言（颜色值、padding、radius、字号），`flutter test` 或 grep 级验证。

## 第 12 轮：卡片边缘异常诊断（已完成）
用户反馈：1. 亮线又出现（媒体区底 vs 文字区亮度台阶）；2. 部分卡片顶部黑线；3. 画面盖住卡片圆角。
**诊断过程（7 个排除实验 + 像素分析）**：shade 禁用/占位符品红/纯绿 _cover/去阴影/圆角 0/Clip.none/固定高 SizedBox/最简纯红 Container——顶部"灰带+43 线"全部依旧 → 确认为**正常渲染**：y297 43 线 = 分类卡 border 底、y298-307 灰带 = 分类区 gridGap padding + 分类卡阴影（web shadow-lg 同值）、y309 黑线 = cover 布局标题浮层黑渐变叠封面（web 同样有）、截图暗带（y776-784 15-19）= AnimatedOpacity hover 动画中间帧（截图时鼠标在窗口内）。
**真实缺陷 2 处（已修）**：
1. **媒体区缺 border-bottom 1px sideBar-border**（web 有，video_card.dart:120 注释没实现）→ 媒体区底与文字区 1px 亮度台阶 = "亮线"。修复：Stack 最末加 `Positioned(l0,r0,bottom:0, Container(height:1, color: VsTheme.border))`。
2. **媒体区 Stack 无 clip**（默认 hardEdge 不够）→ 封面/渐变可能溢出圆角。修复：Stack 加 `clipBehavior: Clip.antiAlias`。
**验证**：像素确认 y788 分隔线 41-43 ✓；view_image 确认无异常线、圆角干净 ✓；截图 _r18_fixed.png。教训：Positioned 溢出（bottom:-2/top:-2）现在被 Stack clip 裁掉，但 border 线提供同等分隔效果；shade 渐变末端仍按第 8 轮逻辑溢出（被裁无碍）。

## 第 13 轮：卡片图片未填满修复（已完成+验证）
用户反馈："视频卡片里的图片没有填满整个卡片——封面布局下上下都有空，标准布局下上方有空隙"。
**根因 1（下方空隙）**：6 页网格 childAspectRatio 公式 cell 高 > 卡实际高（cover `w*9/16+2`=324.3 vs 实际 `(w-2)*9/16`=321.2，差 3.1；standard `(w-2)*9/16+94` vs 实际 +92，差 2）→ tight 约束拉伸 Column → 卡片底部露卡片背景。修复：6 页（home/watchlist/search/local/blacklist/agg_search）统一 `cover ? w/((w-2)*9/16+0.5) : w/((w-2)*9/16+92.5)`（0.5 防 DPI 舍入 overflow）。
**根因 2（上方空隙）**：分类区 SliverToBoxAdapter 底部 padding 用 gridGap(6) 而 web `.vshell-sections margin 3px 0 3px` 是 3 → 卡片上方暗带（6px+分类阴影）过大。修复：home_page.dart 两处 padding 底 gridGap→3。
**验证**：standard 封面 y306 起 = 卡顶+1px border（无内部偏移）；cover 卡底 y781 无缝（shade 渐变末端）、gap 6、第二行卡 y790；view_image 确认封面紧贴顶部/底部无空白/间距紧凑（_r19_cover2.png/_r19_std3.png）。
**环境注意**：shared_preferences.json 改 coverLayout 用 pwsh `-replace 'coverLayout":"false', 'coverLayout":"true'`（正则，.NET Replace 单引号字符串有时不匹配——原因未明）；python 读写该文件曾超时卡死（疑似文件锁）。

## 第 14 轮：bottom overflow 修复（已完成+验证）
用户反馈："视频卡片提示 bottom overflow"（黄黑条纹）。
**根因**：上一轮 cell 高公式保险系数 +0.5 不足——AspectRatio 实际高比公式 `(w-2)*9/16` 估算大 1.5（AspectRatio 实际宽 ≈ 内容宽，DPI 舍入），溢出 "A RenderFlex overflowed by 1.5 pixels on the bottom"（114 次，约束 h=316.4 vs AspectRatio 需要 317.87）。
**修复**：6 页保险系数 +0.5→+2.5（cover `w/((w-2)*9/16+2.5)`）、+92.5→+94.5（standard `w/((w-2)*9/16+94.5)`）——cell 高 = AspectRatio 实际需要 + 0.5 保险，下方空隙 0.5 逻辑（0.7px）不可见。
**验证**：vshell_error.log 未生成（CLEAN）；黄色像素分布全部在封面内容区域（y600-609 封面黄色元素），无溢出条纹；卡底几何正常（渐变末端→border 线→gap→下一行卡）（_r20_fixed.png）。
**教训**：cell 高公式不能按"理论 AspectRatio 高"给 0.5 级保险——DPI 舍入使实际渲染高比公式大 1.5；用 +2.5 级保险（视觉 0.5 逻辑空隙 vs 溢出条纹二选一，选前者）。

## 第 17 轮：底部 border-bottom 删除 + 调试色残留清除（2026-08-26）
- 用户原话：\"把这个删除了\"（指 1px border-bottom 亮线）
- 删除 video_card.dart 媒体区 Stack 末的 Positioned 1px VsTheme.border 线（web .vsc-video-media border-bottom 复刻，用户要求移除）
- **顺带清除 2 处第 12 轮诊断残留**：L113 卡片外圈环 const Color(0xFF00FF00) → VsTheme.border（#2B2B2B）；L127 卡片底 const Color(0xFFFF0000) → VsTheme.bg——**此前所有截图里卡片外圈边框一直是纯绿色（luma 174）而非 #2B2B2B**，是长期潜伏的视觉 bug
- 验证（_r25_clean.png，pid 17876）：绿行全图无；卡顶边框 43 值行 y297/791/1278 ✓；媒体区底 y766 全暗渐变无亮线 ✓；view_image 目视无异常
- feed_view.dart vshell_fs.log 是 --feed-fs-test 参数守卫的测试设施，保留

## 第 18 轮：圆角混色根治（2026-08-26）
- 用户反馈："视频在圆角处还是会和边框混色"
- **根因①（渐变越界）**：第 8 轮为防"渐变末端亮线"给三处渐变（shade/底部渐变条 44px/标题浮层）加了 bottom:-2 / top:-2 溢出——渐变层在圆角处越过 ClipRRect(r7) 裁剪边界铺到边框环上混色。**已删溢出**（回 bottom:0/top:0，渐变条 46→44 恢复 web 44px）
- **根因②（ClipRRect AA 过渡带）**：媒体区 Stack 的 ClipRRect(r7) 抗锯齿过渡带（~1px）叠在 bg #181818 上——亮色封面在圆角处产生"封面色×α+bg×(1-α)"亮灰过渡紧贴环色 43
- **修复：圆角掩膜**——Stack 最末（所有内容之上、IgnorePointer）加 _CornerEdgePaint CustomPainter：**只画四段 90° 弧**（drawArc，圆心各角 r7 处、描边 1.6px、颜色 editorBg #1F1F1F）——盖住弧线过渡带，圆角处露出媒体区底色（= web overflow:hidden 裁出 .vsc-video-media 背景的语义）；**不画直线边**（直线处无混色问题，且避免盖底边环线——第一版 drawRRect 全描边把弧线带底边环淡化 42→23，改四段弧后底边环完整 n=417）
- **顺带清除 2 处第 12 轮调试残留**：video_card.dart L113 卡片外圈环 0xFF00FF00 纯绿（此前所有截图卡片边框都是绿的！）→ VsTheme.border；L127 卡片底 0xFFFF0000 → VsTheme.bg
- 验证（_r28_mask2.png，pid 31740）：弧线带过渡链 = 封面(16) → editorBg(31) → 环(42) → 背景(24)，无亮色混色；四角掩膜带在位；底边环完整；view_image 目视四角干净、边框连续
- 遗留：hover 态圆角（渐变隐藏时掩膜仍在，逻辑上同样被盖，未单独截图验证——鼠标注入对 Flutter Windows 无效的老问题）

## 第 19 轮：圆角改硬裁（用户指定方案："图片直接裁剪到正好比边框小一圈（1px）"）
- 用户不满意掩膜方案，指定：图片直接裁剪到比边框小一圈（1px）——图片边缘在边框内缘（r7）干净截止
- **实现**：删除 _CornerEdgePaint 掩膜（含 math import）；ClipRRect(r7) clipBehavior: Clip.antiAlias → **Clip.hardEdge**——图片/渐变在弧线处硬切，无 AA 过渡带（AA 过渡带叠在环带上=混色根源）
- 验证（_r29_hardclip.png，pid 43648）：弧线带 = 图片色(15-18) 直接 → 环色(42/43)，无 22-36 AA 渐变序列；底边环完整 n=417；view_image 目视无混色、无锯齿、底边框连续
- 代价：圆角弧线为 1px 像素阶梯（硬切本质），1.485 DPI 下不可见

## 第 20 轮：卡片边框渲染色修正（用户反馈："框线比 web 里粗很多"）
- 实测（_web_r30.png harness + _r30_center.png Flutter 逐像素）：**宽度相同（都是 1px），差异在颜色**——web 边框渲染 = #1C1C1E（28-30，box-shadow 0 0 12px rgba(0,0,0,0.14) 叠加在边框上压暗，几乎融入背景 23）；Flutter 环 43（#2B2B2B 纯色，阴影在环外不压环）→ 对比度强显"粗"
- **修复**：vs_theme.dart 加 cardBorder getter（dark #1C1C1E / light #DCDCDC）；video_card.dart 环色 VsTheme.border → VsTheme.cardBorder
- 验证（_r31_borderc.png，pid 54960）：四边环色全部 28-30（顶 y303/左 x225/右 x1074/底 y780）；view_image 确认边框很淡融入背景、粗细观感与 web 一致
- 注意：y297 的 43 是分类区底部边框（panel-border），非卡片环——卡片顶环实际在 y303

## 第 21 轮：卡片边框"四边不等宽"根治（用户反馈："框线和底部的框线不等宽，是不是混色的问题"）
- **排查过程**：28-30 压暗色过浅（用户否）→ 阴影不是元凶（无阴影对照实验底边仍 28）→ 根因 = Border/环描边 1.485 物理 px（DPI 1.485）光栅化按面积分配——顶 41/左 43/右 39+37（2 列）/底 25-28（被 shade 内容盖住内侧半）——非整数 DPI 固有物理，无法像素级统一
- **修复**：①**环方案 → Border.all**（Container decoration border 1px + color bg；Border 四边同一描边对称渲染；ClipRRect r7 硬裁保证内容在边框内缘 r7.5 之外不重叠，圆角不混色）——第 12 轮弃用 Border.all 的理由（描边压内容）已被 hardEdge 裁剪化解；②**shade 渐变末端 editorBg(31) → #1A1A1A(26)**（web 的 31 被 box-shadow 压暗成 26-29 与背景 23 几乎同色——底部"框线感"弱才显细）；③阴影恢复 0x1A blur5
- 验证（_r37_shadedark.png，pid 32872）：底部暗带 26/25 融入背景（24）无框线感；左右 1px 43；view_image 四边粗细一致、无异常边
- 括号教训：edit 删一层 widget（Padding）必须同步删对应闭合括号（曾致 3 次编译失败 MSB8066）

## 第 22 轮：边框四边物理像素对齐（用户反馈："左侧边完美，其他三边略粗"）
- 根因：Border.all/环描边 1.485 物理 px（DPI 1.485）光栅化取整——边是否恰好对齐像素网格决定渲染 1 列全强度（左缘 x225.0）还是 2 列半强度（右缘 .4→39+37、底线被 shade 内容盖）
- **修复**：弃 Border.all → 媒体区 Stack 最末加 _BorderLinePainter（Positioned.fill + IgnorePointer + CustomPaint）：线宽 = 1/devicePixelRatio（0.673 逻辑 = 1 物理 px）+ **边缘坐标物理对齐** (v*dpr).round()/dpr（顶/底/左/右四条 Rect 落在整数物理像素）→ 四边恰 1 物理像素全强度
- 验证（_r40_aligned.png，pid 35132）：43 线行 y297(分类底)/y781(卡底 566)/y929 + 列 x1085(全高 275)；view_image 四卡四边清晰均匀无缺失
- 注意：构建偶发挂死（flutter.bat.lock 残留，删后重跑 114.8s 成功）

## 第 24 轮：上下渐变亮线 + 圆角锯齿（用户反馈，已完成）

**问题**：1. 上下渐变出现亮线 2. 圆角处很奇怪

**亮线根因（决定性）**：painter 局部 0 = 位图 y303（红条探针验证）→ 卡片 Stack 高 319 逻辑 × 1.5 DPR = 478.5 物理（非整数）→ 底边落位图 781.5 = **行 781 像素中心恰在渲染边界** → 所有内容图层（封面/shade/渐变条）该行只收到部分 alpha（实测 23.5%）→ 封面亮色透出 = 亮线。顶部边界行（303）被顶边框线恰好盖住所以顶部无亮线。shade 溢出（-2/-6/-12）与 ClipPath 方案均无效（-12 实测仍 23.5%）。

**修复**：①**painter 移出内容 Container 之外**（结构改 Stack[Positioned.fill(Container(decoration+clip)), Positioned(bottom:-1, painter)]——Container 的 antiAlias 圆角裁剪会裁掉 painter 扩展画布）；②**底边框线画在卡片底边界行**：bottom = align(h-1) = 319.0 → 位图 781.5 → 行 781 中心，与顶边框盖顶部边界行对称；③painter 画布 bottom:-1 扩展 1 逻辑容纳。

**圆角锯齿根因**：1px AA 弧线强度被分散到过渡带（~60%），圆角处明显比直线淡 → 与直线衔接断档 = 锯齿感（非像素阶梯）。**修复**：弧线 strokeWidth 3 物理（lw*3）AA=true——1-2px AA 弧线实测不渲染（光栅化吞掉），4px 渲染但视觉粗，3px 折中（像素验证 y304-314 x225-236 弧线 43 色平滑弯曲）。

**验证**：_r67_fix2（cover）/ _r68_std（standard）四边线：顶 y303（41-43，830px）、底 y781/y919（43 全强度=原亮线行）、左 x225（n=603 贯穿媒体区+文字区）、右 x1075（n=604）；亮线消失（y772-780 渐变平滑压暗 19→13 → 边框 → 间隙）；圆角 3px 弧平滑无锯齿、与直线衔接自然、粗细一致（view_image 4 项全过）；错误日志 clean。

**教训**：①精确 ==43 扫描会漏 41 色顶线（GPU 光栅化 1px 线非整数对齐时强度微降 0.8%）；②非 AA 2px 直线渲染为 41（vs 43）；③painter 在 Container 内会被其圆角裁剪。

**后续调整（用户反馈"圆角太粗"）**：3px 弧线视觉粗 3 倍 → 改 **1px AA 弧线 × 2 遍**（同弧 drawArc 循环 2 次，单遍强度 ~60% AA 分散、2 遍叠加 ~84-100%，视觉宽度保持 1px 与直线一致）——像素验证弧线 42-47 ≈ 直线 43、每行仅 1-2 列（vs 3px 版 3-4 列）；view_image 确认粗细一致/无锯齿/衔接自然。最终 _r76_arc1x2.png。

## 第 25 轮：圆角仍怪 + 分类区圆角（用户反馈，已完成）

**用户**："现在感觉圆角太粗" → 弧线 3px 改 1px AA × 2 遍（宽度 1px 与直线一致，强度叠加 ~84-100%）→ "感觉圆角还是有点怪，尤其是视频卡片附近的那两个圆角"。

**定位**：卡1 弧线平滑（painter 2 遍 AA）✓，但**分类区（.vshell-sections 卡）底边框圆角 = 普通 Container Border.all 光栅化 → 弧线有缺口/阶梯**（实测 y290-291 x226 → 缺口 → y294-296 x228-234 跳跃）——"视频卡片附近的那两个圆角" = 分类区底边框两端圆角。

**修复**：
1. **抽公共 painter** lib/ui/widgets/vs_border_painter.dart（VsBorderPainter：四边 1px 物理对齐非 AA + 圆角弧 1px AA × 2 遍 + 底边线 align(h-1) 盖底边界行 + radius 参数默认 8）——video_card.dart 删本地 _BorderLinePainter 改引用；home_page.dart 分类区同方案。
2. **分类区改造**（home_page.dart _sectionsCard）：Container(Border.all) → SizedBox(显式高, Stack[Positioned.fill(Container(去 border)), Positioned(bottom:-1, painter)])。
3. **两个坑**：①Stack 子项全 Positioned 在 SliverToBoxAdapter 无界约束下塌陷为 0（分类区整卡消失 + 'size.isFinite' 断言，错误日志 2189 行）→ SizedBox(width: infinity, height: rows*34+(rows-1)*8+32) 显式高；②Stack 默认 hardEdge 裁掉 painter 底部溢出 1 逻辑 → 分类区底边框缺失（顶/左/右渲染、底线被裁）→ Stack 加 clipBehavior: Clip.none（video_card 外层 Stack 早已加）。

**验证**（_r81_final.png，像素 + view_image）：分类区四边完整（顶 y134、底 y296 全宽 847 采样）、左下弧 y283-295 连续平滑无缺口；卡1 顶线 y300/左 x225/右 x1075/底 y916 完整；视频卡片圆角平滑；错误日志 clean（exit code 1 是 Remove-Item 无文件，非构建失败）。

**教训**：①任何"物理对齐 painter + 底部溢出"方案都必须在挂载 Stack 设 Clip.none；②Container Border 在非整数 DPI 下圆角弧光栅化有缺口——统一用 VsBorderPainter；③SliverToBoxAdapter 内的 Stack（全 Positioned 子项）必须显式高度。

## 第 26 轮：顶部圆角暗线根治（用户反馈"顶部的圆角还是会有一道圆角暗线"，已完成+验证）

**根因**：内容层 Container `clipBehavior: Clip.antiAlias` 的圆角裁剪在亮封面上产生 0.5-1px AA 过渡带（图片色→背景半透明带）；弧线外移版（radius+0.5lw）后过渡带裸露在弧线内侧 = 用户看到的"圆角暗线"（实测 _r91 y300 x231-235 渐变 49→98、y301 x229-230 暗 53/45）。画布原点/弧线几何均已验证正确（_r94_origin2.png：painter (0,0)=位图(224,300)、x=8→位图236）——暗线非几何错位。

**修复**（video_card.dart L128）：`clipBehavior: Clip.antiAlias` → `Clip.hardEdge`——图片圆角硬切，无 AA 过渡带 = 无暗线；shade/渐变条/标题浮层同为暗色渐变硬切无影响；hover 操作层按钮在圆角弧内不溢出。

**验证**（_r95_hardedge.png）：y301 硬切干净（x230=31 背景 → x232=95 图片直接跳变，旧暗带 53/45 消失）；图片圆角硬切边缘 r12 正确（y301 x232 → y302 x230 → y303 x228 → y305 x226 平滑弧）；view_image 确认无暗线/无缝隙/无锯齿/贴合自然。应用已启动（pid 43420，standard 布局）。

**教训**：亮图圆角的"暗线"= 图片自身 AA 裁剪过渡带，任何"弧线盖在图片外"的方案都盖不住它——只有内容层 hardEdge 硬切（代价 r12 圆角 1px 像素化，实测不可见）或弧线宽 2px 盖过过渡带两种解法。

## 第 27 轮：顶部圆角图片侵入微调（用户反馈"现在感觉顶部圆角图片侵入的程度比侧边大一点点"，已完成+验证）

**根因**：内容层 hardEdge 像素化在 58° 弧线处凸出 0.4px（像素中心判定：凸出像素 (226,305) 距圆心 [12.10, 12.35]，图片边缘比弧线凸 0.4px）；侧边（垂直弧）无像素化凸出 + 图片左缘 x226 vs 直线 x225.5 内 0.5px——顶部"侵入"比侧边大 0.9px。

**修复**（vs_border_painter.dart）：弧线半径 `radius + 0.5*lw`（12.5 物理）→ `radius + 0.2`（12.3 物理）——弧线带 [11.97, 12.63] 覆盖凸出像素范围 [12.10, 12.35]，顶部圆角与侧边视觉一致；弧线内缘 11.97 略盖图片边缘 0.03px（线在图上，正常）。

**验证**（_r96_arc.png，ASCII 像素图）：四角均匀、顶部无凸出、无缝隙；view_image 确认左上/左下圆角一致。应用已启动（pid 31960，standard 布局）。

**部署教训**：Copy-Item 失败（vshell.exe 被占用——Stop-Process 后需 Start-Sleep 2s 再 copy）会静默启动旧 exe——截图验证前必须确认 copy 成功（输出 'copied'）。

## 第 28 轮：顶部圆角侵入终修（用户反馈"还是有些过度侵入"，已完成+验证）

**根因**：第 26 轮的 hardEdge 内容层圆角产生**像素化凸出**——1px 整块像素（中心在 r12 弧内）凸出到弧线外，1px 弧线最多覆盖像素 60%，凸出 40% 可见（实测 y301 图片边缘 x232 比弧线 x231.1 凸 0.9px）。弧线半径微调（12.5→12.3）无法根治——像素化凸出是二值的（要么凸 0.4px 要么内缩）。

**修复**（video_card.dart）：内容层回 **antiAlias**（圆角平滑无像素化）+ 内容圆角 **8.2**（= 弧线 radius+0.2 = 12.3 物理，同圆心同半径）——antiAlias 裁剪过渡带 [11.8, 12.8] 被弧线带 [11.97, 12.63] 覆盖主体，仅剩 0.17px 微过渡（不可见）；无凸出、无缝隙、无暗线。

**验证**（_r97_aa.png + _r97_corner_zoom.png 4x 放大）：view_image 确认**图片圆角边缘与黑色弧线完全重合**——无缝隙、无凸出、无暗带/亮带、圆角平滑。应用已启动（pid 3512，standard 布局）。

**教训**：hardEdge 像素化凸出（1px 块）无法被 1px 弧线完全覆盖（最多盖 60%）——正确组合 = **antiAlias 内容圆角（半径 = 弧线半径）**：过渡带与弧线带同心同半径，弧线盖住过渡带主体，剩余亚像素过渡不可见。

> **vhost 自包含（2026-08-28 16:05）：去掉 http server 依赖（goal 第 1 轮）**
> - main.dart WebviewShell：ddVirtualHostNameMapping('app.local', <exe 目录>\web, WebviewHostResourceAccessKind.allow) + URL https://app.local/app.html?v=2（webview_windows 0.4.0 L484；枚举 enums.dart L44 = deny/allow/denyCors）。
> - install\web\ 自包含装配：app.html + vshell.user.js + flutter-adapter.js + _vs-fixtures\hls.min.js（开发迭代需同步复制）。
> - 清理：main.dart 探针块（3s 环境探测）与 bridge.log 写盘全删（保留 debugPrint）。
> - 验证：kernel_blob.bin 含 'app.local'×6 / '127.0.0.1:8931'×0；杀 8931 端口（pid 39908/39496 两个 python server）→ 重启应用 → _r148_noserver.png 页面完整正常。**零 http server 依赖 ✓**。
> - 注意：lutter build windows --debug 自带 install 步骤（kernel_blob 自动落 install\data\flutter_assets）；exe 是 C++ 壳不重链；cmake.exe 不在 PATH 无需手工 cmake_install。
> - 遗留：medl 下载在 https://app.local origin 下 fetch AcFun CDN 跨域可能被 CORS 拒——下载性能敏感路径待桥 Flutter 下载器（HlsDownloader 已有）；多清晰度切换未映射。

> **下载桥（2026-08-28 17:10）：medl 下载委托 Flutter 原生引擎（goal 第 2 轮）**
> - 动机：AcFun CDN 实测 ccess-control-allow-origin: *（tx-safety-video.acfun.cn，_probe_cors.py）——浏览器 medl 可直下；但 mp4box transmux 合并是 CPU 密集占 WebView 主线程 → 性能敏感路径原生化。
> - **JS（output/vshell.user.js medl 模块）**：V.medl.download() 开头桥分支（检测 window.__VSHELL_ADAPTER__.downloadStart）→ ridgeDownload(url, opts)：downloadStart 拿 taskId → 注册 __VS_DL_EVENTS__[taskId] = {onProgress, onDone, onError} → signal abort → downloadCancel；返回 Promise（done→resolve{bytes:0,kind:'bridge'} / 失败→reject）→ addMedl 的 then/catch 照常收尾（done/failed/canceled 任务状态）。
> - **flutter-adapter.js**：adapter 加 downloadStart(args)/downloadCancel(id)；window.__VS_DL__(taskId, json) 分发器（JSON.parse → status done/failed/canceled/其他=progress → 对应回调）。
> - **Dart**：web_bridge.dart 加 downloadStart（DownloadManager.add → 返回 task.id）/downloadCancel（byId → handle.cancel()）；downloads_page.dart DownloadTask 加 id 字段（'dl_'+时间戳36进制+序号）+ DownloadManager.byId；main.dart WebviewShell 加 DownloadManager.addListener(_onDlChanged)（遍历 tasks，per-task 节流：progress 变化 ≥2% 或终态才 executeScript __VS_DL__(id, json)，json={status,progress,error,savePath}）。
> - **验证（--probe-dl 探针，main.dart _runProbeDl）**：adapter 等待就绪（60×200ms 重试）→ getPlayInfo('48800003') → downloadStart({url,name:'probe-dl-test'}) → 注册监听 → 轮询 __PROBE_DL__.evs → 实测事件流 ['done']、文件落 C:\Users\Mxster\probe-dl-test.mp4（79.8MB，MP4/avc1 ftyp 容器有效，ffmpeg 合并成功——_defaultDownloadsDir 因 ~/Downloads 目录不存在回退 home）。清理了 probe_dl.log + 测试文件。
> - 注意：事件竞态——监听注册在 downloadStart resolve 后，最初几个进度事件可能丢失（无碍终态）。
> - 遗留：多清晰度切换未映射（bridge getPlayInfo 只回 best；qualities 全量已提取）；ffmpeg 不在 PATH 时合并走 TS 拼接路径。

> **多清晰度 ABR（2026-08-28 17:40，goal 第 2 轮续）**
> - bridge getPlayInfo 返回 master 字段（web_bridge.dart _masterM3u8：h264 各档合成 master playlist 文本，#EXT-X-STREAM-INF:BANDWIDTH 从档名 hls_1080p_h264_6m 推断（6m=6,000,000；无档名按 label 1080/720/480/360 映射），RESOLUTION 按 label；HEVC 排除；<2 档返回空串）。
> - JS：详情页 setupPlayer 加 hlsUrl(pi) helper（master 含 STREAM-INF 时转 blob: URL → player.loadHls）；feed attach 的 HLS 分支同样内联处理（hls.js 原生 ABR 自动切清晰度，无需播放器 UI）。
> - 验证（--probe-abr 探针，main.dart _runProbeAbr）：getPlayInfo → master 2348 字符含 STREAM-INF → new Hls().loadSource(blob) → **MANIFEST_PARSED（step:parsed，无 fatal）** ✓。
> - 下载桥同轮完成（见上节）：端到端 done 事件 + 79.8MB 有效 MP4（avc1）。
> - 测试参数：--probe-dl（下载链路）/ --probe-abr（ABR 链路），日志 probe_dl.log / probe_abr.log（install\ 工作目录）。

## OOM 崩溃修复（2026-08-28，用户："点击选择角色→此页存在问题 Out of Memory"）

**根因**：WebView2 ExecuteScript 高频调用内存泄漏——滚动桥原实现每次滚轮 executeScript 一次（返回 scrollY 字符串），Windows 事件日志 16:53 RADAR_PRE_LEAK_64 实锤 msedgewebview2 泄漏；渲染进程内存随浏览积累 → 点角色弹窗分配失败 → "Out of Memory" 错误页。

**修复**：
- vshell/src/core/scrollbridge.js：新增 chrome.webview message 监听（postWebMessage 通道，无返回值对象不泄漏）；e.data 兼容对象/字符串两种类型（插件 PostWebMessageAsJson 把消息解析成 JSON 对象，JSON.parse(对象) 会抛错静默失败——第一版 bug）
- main.dart：滚动桥 executeScript → postWebMessage(jsonEncode({t:'scroll',dy,x,y}))；删 D:/vshell_scrollY.log 诊断写入
- __VS_SCROLL__ 保留兼容 executeScript 通道

**验证**：
- --scroll-stress（postWebMessage 300 次高频滚动）：渲染进程内存稳定（565→545MB 无增长）；scrollTop 15628px = 页面滚到底（滚动生效；window.scrollY 恒 0 属正常——.vshell-outlet/.vshell-page 是滚动容器，body 不滚）
- --click-char（executeScript 模拟点击导航栏角色列表 + V.charPicker.conflict 12 角色行渲染）：不崩、JS 堆 14MB 稳定
- 测试参数保留：--click-char / --scroll-stress（复现验证用）
- 进程排查：3 组 WebView2 进程 = 1 组 vshell + 2 组 Windows 系统组件（Widgets.exe 小组件/SearchHost.exe 搜索）——非泄漏，虚惊

## 插件数据源轮 + 黑屏根因（2026-08-28 晚）

**用户需求**：设置面板「数据源」项——Flutter 添加数据源只记本地文件路径，切换时才加载对应 JS 适配器。

**实施（全部完成+验证）**：
- web_bridge.dart 5 case：sourceAdd（文件对话框选 .js → VsStore 'dataSources' [{id,name,path}]）/sourceList/sourceRemove/sourceLoad（读文件 {ok,code,path}）/netFetch（dio 代理，{ok,status,text}）
- output/flutter-adapter.js 加 window.__VS_PLATFORM__（netFetch/sourceAdd/sourceList/sourceRemove/sourceLoad；源在 output/ 非 build.py 产物，改后必须手动 copy install\web\）
- 新建 core/net.js：V.net.fetch 双路径（原生 fetch → 网络层失败降级平台桥）
- core/data-source.js 重写：值=任意适配器 id、BUILTIN=['acfun','bilibili']、isPlugin、ensureLoaded（幂等 sourceLoad→script 注入→loadedId）、模块末尾自动 ensureLoaded
- site-adapter.js current() 三分支：'bilibili'→内置；插件 id→adapters 匹配（未注入 null）；默认 acfun→桥优先+match；头部契约注释插件文件格式示例（**坑：注释里 { /* ... */ } 嵌套块注释导致 node --check 语法错——占位改 { ... }**）
- settings-panel.js 数据源项：makeRow（.vshell-radio 复用）+ delBtn（sourceRemove+回退 acfun）+ 内置 2 行 + 异步补插件行 + 添加按钮
- components.css：.vshell-settings-sources/-source-del/-source-add
- main.dart --open-settings 探针（打开面板+DOM/桥/切换采样写 settings.log）

**重大黑屏 bug（用户视角=页面全黑）+ 根因链**：
- 现象：web 壳窗口全黑（PrintWindow/CopyFromScreen 均 12,12,12；--native 正常 24,24,24）
- 排查排除：setBackgroundColor（透明/不透明都黑，已回透明）、WebView2 缓存（v=3→v=4 无效）、渲染进程（18 进程正常 CPU 低）、JS 错误（注入全局 error 捕获 jsErr=null）
- **铁证（探针）**：vKeys 完整 + vshellStyle=true（bundle 完整执行）但 htmlClass=""、bodyKids=3、hasApp=false——boot 挂载了但没接管；boot 插桩（__BOOT__）显示 {mounted:'listener', step:'no-adapter', adapter:'null'}——**boot 在 DOMContentLoaded 时 current()=null 放弃接管**
- **根因**：插件数据源启动竞态——data-source.js 模块末尾自动 ensureLoaded() 是**异步桥调用**（sourceLoad），DOMContentLoaded 时插件适配器未注入 → current() 返回 null（插件未注册分支）→ boot「放弃接管」→ 页面空白。探针 t+4s 时注入已完成所以手动 current() 返回 testplug（迷惑性）
- **修复**：app.js 末尾改 start()：dataSource 是插件 id 时 V.dataSource.ensureLoaded().then(boot)（等注入完成再接管），否则直接 boot；acfun/bilibili 无竞态
- **验证**：testplug 模式接管成功（htmlClass="vshell theme-dark"、navbar=true）；acfun 模式真实封面图渲染（nonbg 55007）；设置面板数据源 3 行+添加按钮+checked 状态正确；探针切换 set('acfun')+reload 生效
- **双层 JSON 转义教训**：手工注入 shared_preferences 的 path 反斜杠需四重（文件层 \\P→\P 后 VsStore jsonDecode 再遇 \P 非法转义抛异常→get 返回 null）；真实 sourceAdd 流（jsonEncode）无此问题
- **web 侧 dataSource 权威在 localStorage**（vshell.dataSource），shared_preferences 无此键；切回 acfun 用探针 V.dataSource.set('acfun')+reload
- boot 插桩已清（start 修复保留）；测试插件 D:\Project\Ongoing\vsc-ui\vshell-test-source.js（IIFE + V.siteAdapters.register，meta.id='testplug'）留档
- 截图：_r13~_r15 系列（vshell-flutter/）；应用运行中（acfun 主页 pid 45564）

## 移动端适配 + 取消窗口最小宽度（2026-09）
- 用户需求："做一下移动端适配吧，然后不要限制窗口最小宽度"
- main.dart：删两处 setMinimumSize(960,600)（web 分支 L89 / native 分支 L155）——窗口可拖到任意窄
- responsive.css：
  - 768 断点加：.vshell-role-page padding 20px 14px 48px（10%→紧凑）；.vshell-role-marquee .vshell-role-mcard2 width min(640px, calc(100vw-28px))（代表作卡缩放，aspect-ratio 16/9 自动高）
  - 480 断点加：.vshell-nav-btn padding 0 6px（7 钮+搜索一行）；.vshell-modal max-width calc(100vw-28px)；.vshell-bannerpick-vp width calc(100vw-56px) max-640 aspect-ratio 16/9
  - 新增 400 断点：.vshell-wall 单列 minmax(0,1fr)；.vshell-nav-btn padding 0 4px；.vshell-nav-search min-width 0
  - 已有：1280 详情侧栏 300px、1080 详情单列+墙 240px min+搜索 320、768 导航折叠（brand 文字隐藏/搜索 flex:1/墙 170px min/feed 动作/FAB）、480 墙 2 列/弹窗 14px/下载卡、hover:none 动作常显
- _shot_pw.ps1 加 -NoResize 参数（验证窄窗口时跳过内部 SetWindowPos 2160x1350 重置）
- 验证：窗口缩 465/345 逻辑宽——主页导航完整无挤压、墙 2 列/单列自适应、无横向滚动；角色页 465 宽代表作排缩放无溢出；最小宽度限制确实已除（能缩到 345 逻辑）
- 截图 _r_resp_480/_r_resp_360/_r_resp_role480.png

## 移动端导航重构（2026-09）
- 用户需求："移动端导航栏的vshell字样和版本号都隐藏，然后按钮都放到底部，顶部只保留搜索框和两个显示模式切换按钮，一个放到搜索框左边，一个右边"
- navbar.js：右端 7 按钮（tag/watch/fav/black/local/dl/settings）包进 .vshell-nav-actions 容器（桌面布局无影响）
- responsive.css 768 断点：.vshell-nav-brand/.vshell-nav-home display:none；order 重排 mode=1 center=2 layout=3（顶部左/中/右）；.vshell-nav-actions fixed bottom 52px flex 均分 7 按钮（rgba(24,24,24,0.92)+blur10+上边框，light 白底变体）；让位：outlet padding-bottom 64、FAB bottom 70、feed-actions bottom 108、toast-host bottom 130；feed 页高度 calc(100dvh-108px)；.vshell-fs 全屏隐藏工具条
- player.js fullscreenchange 加 document.documentElement.classList.toggle('vshell-fs')（全屏隐藏底部工具条）
- 验证：--nav-probe 探针铁证（w=525 mq768=true actions=fixed/bottom=0 brand=none mode/center/layout order=1/2/3 home=none）；像素分析 _r_mnav3_360.png（顶部仅 mode/layout 图标+搜索暗底、底部 7 按钮行、无品牌文字）——**view_image 对该布局多次幻觉误判（说成旧布局），以像素/探针为准**
- main.dart URL v=5→v=6（WebView2 缓存 bundle）；新增 --nav-probe 探针参数；_shot_pw.ps1 加 -NoResize

## 移动端导航重构 v2（2026-09，用户反馈"电脑端布局一点都不能动"）
- v1 缺陷：actions 容器使 7 按钮不再是 nav 直接 flex item（.vshell-nav-center + .vshell-nav-btn 兄弟选择器失效 → 桌面右端按钮组不再靠右）——桌面被破坏
- v2 修复：components.css .vshell-nav-actions { display: contents; }（桌面无盒子、7 按钮直接参与 navbar flex、与原 DOM 完全等效）；选择器补 .vshell-nav-center + .vshell-nav-actions .vshell-nav-btn:first-child { margin-left: auto; }；768 内覆盖为 fixed flex + first-child margin-left 0
- 验证（像素）：桌面 2160 宽——brand 亮 116 + 搜索框 #313131 1875px + 右端按钮 191（x1600-2100 靠右）✓ 与原布局一致；移动 518 宽——顶部 mode x38/layout x501（搜索框中间暗底）、底部 7 按钮工具条 316px ✓
- 截图 _r_desktop_check.png/_r_mnav4_360.png

## 移动端导航 v3（2026-09，用户反馈"我说的底部是屏幕底部，顶部的搜索框现在也看不到了"）
- 根因①工具条位置：navbar 的 ackdrop-filter: blur(10px) 创建 containing block → fixed 后代的 .vshell-nav-actions 相对 navbar 定位（落在导航栏下方，非视口底部）——探针 bottom=0px 是计算值，实际渲染位置错误
- 修复：navbar.js mount() 把 actions document.body.appendChild（body 直系无 backdrop-filter）；桌面 actions 改 position: fixed; top:0; right:0; height:56px; gap:10px; padding:0 16px; z-index:60（fixed 对齐导航栏右端=原布局等价，删除 display:contents 方案与 margin-left:auto 选择器）；768 覆盖 ottom:0; top:auto; height:52px; padding:0
- 验证：移动 540 物理窗口——工具条在视口底部（位图 h-85 区域 4660 亮像素）、顶部仅 mode/layout 图标（y77-97 10-15px/行）、搜索框存在（y67-109 310-330px 宽）；桌面 2160——brand 127/搜索框 2885/右端按钮 191 ✓
- 注：搜索框移动端有胶囊时背景 #181818 融入导航栏（web 语义，非缺失）；探针误判教训——computed style bottom=0px 不保证渲染位置（containing block）
- 截图 _r_mnav5b.png/_r_desktop3.png

## 移动端隐藏主页滚动条（2026-09，用户："移动端不显示主页滚动条"）
- responsive.css 768 断点开头加 .vshell-page::-webkit-scrollbar { display: none; width:0; height:0; }（覆盖 base.css L106-125 的 6px 自绘滚动条；桌面 >768 不受影响）
- 验证：800×1000 物理窗口（=533 CSS px，命中断点）截图 _r_mnoscroll.png——右缘 16px 无 thumb（rgba(121,121,121,0.6)~73 灰）无轨道，滚动正常无滚动条视觉痕迹 ✓；底部工具条仍在（y1314+ 亮像素 13174）✓
- 教训：GetWindowRect 与 PrintWindow 位图尺寸关系因 DPI 感知模式混杂难归一——滚动条检查以"右缘像素带扫描"为准，不看位图绝对尺寸

## Android APK 封装（2026-09，用户："封装apk给我"）
- 架构：flutter_inappwebview 6.1.5（Android 壳）替代 WebView2——**file:///android_asset/flutter_assets/assets/web/app.html** 加载（Flutter 把 pubspec assets 打包到 APK assets/flutter_assets/ 下）；数据全走 vsBridge 桥（Dart dio），页面无 CORS 跨域
- 桥：flutter-adapter.js 平台分发（isInApp()=flutter_inappwebview.callHandler('vsBridge', json) 直接返回结果自动序列化回 Promise / WebView2 chrome.webview.postMessage+RESOLVE）；Dart 侧 addJavaScriptHandler 返回值 {ok,result|error}
- 关键坑（全部已修）：
  ① InAppWebView 不能条件渲染（_controller 由 onWebViewCreated 创建——if(_controller!=null) 死锁永不创建）
  ② **Flutter asset bundler 忽略下划线开头目录**（_vs-fixtures 未打包）→ 改名 fixtures + pubspec 显式声明 assets/web/fixtures/hls.min.js（目录声明增量构建缓存不可靠）
  ③ app.html script src 必须**相对路径**（file:// 下绝对 /xx.js 解析到文件系统根）
  ④ FLUTTER_STORAGE_BASE_URL 用户级 TUNA 缺 flutter_embedding 包 → 构建命令必须显式 https://mirrors.tuna.tsinghua.edu.cn/flutter='https://storage.googleapis.com'（setx 无效——job 继承父进程旧 env）；官方 base 不带 /flutter
  ⑤ flutter_inappwebview_windows 子包需 nuget 拖垮 Windows 构建 → **vendored 主包（vendor/flutter_inappwebview）删 windows 依赖+platforms 条目**（Windows 端用 webview_windows；Android 子包从 pub 缓存解析）
- 其他：AndroidManifest 加 INTERNET 权限（flutter create --platforms android --org com.vshell 生成骨架）；下载目录 Android 分支=path_provider getDownloadsDirectory（应用专属，分区存储免权限）；_syncScripts=initialUserScripts AT_DOCUMENT_START（__VS_SYNC__ + 错误捕获）；allowUniversalAccessFromFileURLs:true（file:// 页 hls.js 跨域拉流）；onConsoleMessage/onReceivedError/桥 debugPrint 日志（logcat 过滤 vs-android）
- 验证：Pixel_9_Pro_XL 模拟器（swiftshader_indirect + -no-snapshot-load 解决卡 boot；-gpu host 卡死）安装运行——界面完整（分类 3×3/视频卡片墙/缩略图/标题/播放量/时长/底部工具条 7 钮）+ 真实 AcFun 数据（桥 getHomeSections/getHomeFeed 正常）+ hls.min.js 无 404；Windows 回归：构建 ✓ + 启动界面正常（相对路径/flutter-adapter 平台分发不影响 WebView2 分支）
- 产物：vshell-flutter/vshell-debug.apk（= build\app\outputs\flutter-apk\app-debug.apk，debug 签名）
- 遗留：release 签名包未做；播放器（hls.js 拉流）未在模拟器实测；下载保存目录=应用专属 Download；模拟器冷启动约 3-5 分钟
