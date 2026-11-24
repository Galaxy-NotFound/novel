/* 小说架构本 —— 纯离线、无需 AI 的小说结构整理工具
 * 结构：数据层(db) → 路由(route) → 各页面渲染函数(view*) → 事件处理
 * 想加字段：在 newBook/newChar/newChapter/newThread 里加默认值，再在对应 view 里加输入框（data-f="字段名"）即可。
 */
'use strict';

// ============ 数据层：IndexedDB 保存全部作品 ============
const DB = {
  _db: null,
  open() {
    return new Promise((ok, fail) => {
      const r = indexedDB.open('novel-outliner', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { this._db = r.result; ok(); };
      r.onerror = () => fail(r.error);
    });
  },
  get(k) {
    return new Promise(ok => {
      const q = this._db.transaction('kv').objectStore('kv').get(k);
      q.onsuccess = () => ok(q.result);
    });
  },
  set(k, v) {
    return new Promise(ok => {
      const t = this._db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(v, k);
      t.oncomplete = ok;
    });
  },
};

let books = [];
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => DB.set('books', books), 300);
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const words = s => (s || '').replace(/\s/g, '').length;

function newBook() {
  return {
    id: uid(), title: '未命名作品', genre: '', audience: '', totalChapters: 30, wordsPerChapter: 3000,
    premise: '', world: '', outline: '', characters: [], chapters: [], threads: [], updated: Date.now(),
  };
}
function newChar() {
  return { id: uid(), name: '新角色', role: '', profile: '', status: '', alive: true, deathChapter: '', relations: [], timeline: [], images: [] };
}
function newChapter(no) {
  return { id: uid(), no, title: '', goal: '', conflict: '', hook: '', cast: [], text: '', status: 'plan', note: '' };
}
function newThread() {
  return { id: uid(), title: '新线索', type: '伏笔', plant: '', due: '', resolved: false, resolvedAt: '', note: '' };
}
const STATUS = { plan: '规划', draft: '草稿', final: '定稿' };
const THREAD_TYPES = ['主线', '支线', '伏笔'];

// ============ 路由：#/ 书房；#/b/书ID/页签/选中项ID ============
function route() {
  const [, kind, bid, tab = 'overview', sel = ''] = location.hash.split('/');
  return { kind: kind || '', bid, tab, sel };
}
const go = h => { location.hash = h; };
window.addEventListener('hashchange', render);

const app = document.getElementById('app');
function render() {
  const r = route();
  const book = books.find(b => b.id === r.bid);
  if (r.kind === 'b' && book) app.innerHTML = viewBook(book, r);
  else app.innerHTML = viewLibrary();
}

// ============ 书房 ============
function viewLibrary() {
  const list = [...books].sort((a, b) => b.updated - a.updated).map(b => {
    const fin = b.chapters.filter(c => c.status === 'final').length;
    const total = b.chapters.reduce((s, c) => s + words(c.text), 0);
    return `<div class="card book" data-act="open" data-id="${b.id}">
      <h3>${esc(b.title)}</h3>
      <div class="muted">${esc(b.genre || '未设类型')}</div>
      <div class="muted">角色 ${b.characters.length} · 蓝图 ${b.chapters.length}/${b.totalChapters} · 定稿 ${fin} · ${total} 字</div>
    </div>`;
  }).join('');
  return `<div class="top"><h1>📚 书房</h1><button data-act="importJson">导入备份</button><button data-act="exportJson">全部备份</button></div>
  <div class="wrap">
    <div class="row" style="margin-bottom:12px"><button class="pri" data-act="newBook">＋ 新建作品</button></div>
    <div class="grid">${list || '<p class="muted">还没有作品，点「新建作品」开始。</p>'}</div>
  </div>`;
}

// ============ 作品页框架 ============
const TABS = [['overview', '概览'], ['arch', '架构'], ['chars', '角色'], ['plan', '蓝图'], ['threads', '伏笔'], ['write', '正文'], ['check', '检查']];
function viewBook(b, r) {
  const nav = TABS.map(([k, n]) => `<a href="#/b/${b.id}/${k}" class="${r.tab === k ? 'on' : ''}">${n}</a>`).join('');
  const views = { overview: viewOverview, arch: viewArch, chars: viewChars, plan: viewPlan, threads: viewThreads, write: viewWrite, check: viewCheck };
  return `<div class="top"><button data-act="home">‹ 书房</button><h1>${esc(b.title)}</h1><button data-act="exportTxt">导出 TXT</button></div>
  <div class="layout"><nav class="nav">${nav}</nav><div class="main"><div class="wrap">${(views[r.tab] || viewOverview)(b, r)}</div></div></div>`;
}

// 输入框统一写法：data-f 是字段名，data-o 指明修改哪个对象
const inp = (o, f, v, ph = '', type = 'text') => `<input data-o="${o}" data-f="${f}" type="${type}" value="${esc(v)}" placeholder="${esc(ph)}">`;
const txt = (o, f, v, ph = '', cls = '') => `<textarea class="${cls}" data-o="${o}" data-f="${f}" placeholder="${esc(ph)}">${esc(v)}</textarea>`;

// ============ 概览 + 设定 ============
function viewOverview(b) {
  const fin = b.chapters.filter(c => c.status === 'final').length;
  const total = b.chapters.reduce((s, c) => s + words(c.text), 0);
  const open = b.threads.filter(t => !t.resolved).length;
  return `<div class="card"><h2>进度</h2>
    <div class="row"><span class="tag">蓝图 ${b.chapters.length}/${b.totalChapters}</span><span class="tag ok">定稿 ${fin}</span>
    <span class="tag">正文 ${total} 字</span><span class="tag">角色 ${b.characters.length}</span><span class="tag warn">未回收线索 ${open}</span></div></div>
  <div class="card"><h2>设定</h2>
    <label>书名</label>${inp('book', 'title', b.title)}
    <label>类型</label>${inp('book', 'genre', b.genre, '如：悬疑 / 仙侠 / 都市')}
    <label>受众</label>${inp('book', 'audience', b.audience)}
    <div class="row"><div class="sp"><label>总章数</label>${inp('book', 'totalChapters', b.totalChapters, '', 'number')}</div>
    <div class="sp"><label>每章目标字数</label>${inp('book', 'wordsPerChapter', b.wordsPerChapter, '', 'number')}</div></div>
  </div>
  <div class="card"><button class="danger" data-act="delBook">删除这部作品</button></div>`;
}

// ============ 架构四节 ============
function viewArch(b) {
  const names = b.characters.map(c => `<span class="tag">${esc(c.name)}${c.role ? '·' + esc(c.role) : ''}</span>`).join('') || '<span class="muted">去「角色」页添加</span>';
  return `<div class="card"><h2>故事前提</h2>${txt('book', 'premise', b.premise, '一句话：谁，想要什么，阻碍是什么，代价是什么')}</div>
  <div class="card"><h2>角色名单</h2>${names}</div>
  <div class="card"><h2>世界观</h2>${txt('book', 'world', b.world, '时代、地理、规则、势力……')}</div>
  <div class="card"><h2>情节大纲</h2>${txt('book', 'outline', b.outline, '开端 / 发展 / 高潮 / 结局，或分卷大纲', 'editor')}</div>`;
}

// ============ 角色 ============
function viewChars(b, r) {
  const c = b.characters.find(x => x.id === r.sel);
  const list = b.characters.map(x => `<div class="item ${x.id === r.sel ? 'on' : ''}" data-act="sel" data-id="${x.id}">
    <b>${esc(x.name)}</b> ${x.alive ? '' : '<span class="tag warn">已死</span>'}<div class="muted">${esc(x.role)}</div></div>`).join('');
  let detail = '';
  if (c) {
    const opts = id => b.characters.filter(x => x.id !== c.id).map(x => `<option value="${x.id}" ${x.id === id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    const rels = c.relations.map((rl, i) => `<div class="row" style="margin-bottom:6px">
      <select style="width:40%" data-o="rel:${i}" data-f="targetId"><option value="">选择角色</option>${opts(rl.targetId)}</select>
      <input class="sp" style="width:auto" data-o="rel:${i}" data-f="desc" value="${esc(rl.desc)}" placeholder="关系，如：师徒 / 宿敌">
      <button class="sm danger" data-act="delRel" data-i="${i}">✕</button></div>`).join('');
    const tl = [...c.timeline].map((t, i) => ({ ...t, i })).sort((a, b2) => (+a.chapter || 0) - (+b2.chapter || 0)).map(t => `<div class="row" style="margin-bottom:6px">
      <input style="width:80px" type="number" data-o="tl:${t.i}" data-f="chapter" value="${esc(t.chapter)}" placeholder="章">
      <input class="sp" style="width:auto" data-o="tl:${t.i}" data-f="note" value="${esc(t.note)}" placeholder="这一章起的状态/关系变化">
      <button class="sm danger" data-act="delTl" data-i="${t.i}">✕</button></div>`).join('');
    detail = `<div class="card"><div class="row"><button class="back-m sm" data-act="unsel">‹ 列表</button><span class="sp"></span><button class="sm danger" data-act="delChar">删除角色</button></div>
      <label>姓名</label>${inp('char', 'name', c.name)}
      <label>身份/定位</label>${inp('char', 'role', c.role, '主角 / 反派 / 导师……')}
      <label>基础设定</label>${txt('char', 'profile', c.profile, '外貌、性格、背景、动机、口头禅')}
      <label>当前状态</label>${txt('char', 'status', c.status, '位置、处境、掌握的信息')}
      <div class="row"><label style="margin:0"><input type="checkbox" style="width:auto" data-o="char" data-f="alive" ${c.alive ? 'checked' : ''}> 存活</label>
      ${c.alive ? '' : `<span class="muted">死于第</span><input style="width:80px" type="number" data-o="char" data-f="deathChapter" value="${esc(c.deathChapter)}"><span class="muted">章</span>`}</div>
    </div>
    <div class="card"><div class="row"><h3 class="sp">设定图</h3><button class="sm" data-act="addImg">＋ 上传图片</button></div>
      <div class="imgs">${(c.images || []).map((im, i) => `<figure>
        <img src="${im.src}" data-act="viewImg" data-i="${i}" alt="">
        <input data-o="img:${i}" data-f="caption" value="${esc(im.caption)}" placeholder="说明，如：正面立绘">
        <button class="sm danger" data-act="delImg" data-i="${i}">删除</button></figure>`).join('') || '<p class="muted">可上传多张：立绘、服装、表情、武器……</p>'}</div></div>
    <div class="card"><div class="row"><h3 class="sp">关系图谱</h3><button class="sm" data-act="addRel">＋ 关系</button></div>${rels || '<p class="muted">暂无</p>'}</div>
    <div class="card"><div class="row"><h3 class="sp">状态时间线</h3><button class="sm" data-act="addTl">＋ 变化</button></div>${tl || '<p class="muted">按章记录人物的变化，例如「第5章 得知身世」</p>'}</div>`;
  }
  return `<div class="split ${c ? 'has-detail' : ''}"><div class="list card"><button class="pri" style="width:100%;margin-bottom:8px" data-act="addChar">＋ 新角色</button>${list}</div>
    <div class="detail">${detail || '<p class="muted">选择一个角色</p>'}</div></div>`;
}

// ============ 章节蓝图 ============
function viewPlan(b, r) {
  const ch = b.chapters.find(x => x.id === r.sel);
  const list = b.chapters.map(x => `<div class="item ${x.id === r.sel ? 'on' : ''}" data-act="sel" data-id="${x.id}">
    <b>第${x.no}章</b> ${esc(x.title)} <span class="tag ${x.status === 'final' ? 'ok' : ''}">${STATUS[x.status]}</span></div>`).join('');
  let detail = '';
  if (ch) {
    const cast = b.characters.map(c => `<label style="display:inline-block;margin-right:12px;color:var(--ink)"><input type="checkbox" style="width:auto" data-act="cast" data-id="${c.id}" ${ch.cast.includes(c.id) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('') || '<span class="muted">先添加角色</span>';
    const due = b.threads.filter(t => !t.resolved && +t.due === ch.no).map(t => `<span class="tag warn">${esc(t.title)}</span>`).join('');
    detail = `<div class="card"><div class="row"><button class="back-m sm" data-act="unsel">‹ 列表</button>
      <button class="sm" data-act="moveCh" data-d="-1">↑ 上移</button><button class="sm" data-act="moveCh" data-d="1">↓ 下移</button>
      <span class="sp"></span><button class="sm" data-act="toWrite">去写正文 ›</button><button class="sm danger" data-act="delCh">删除</button></div>
      <h2>第${ch.no}章</h2>
      <label>标题</label>${inp('ch', 'title', ch.title)}
      <label>主角小目标</label>${txt('ch', 'goal', ch.goal)}
      <label>冲突与转折</label>${txt('ch', 'conflict', ch.conflict)}
      <label>悬念钩子</label>${txt('ch', 'hook', ch.hook)}
      <label>出场人物</label><div>${cast}</div>
      ${due ? `<label>本章到期线索</label><div>${due}</div>` : ''}
    </div>`;
  }
  return `<div class="split ${ch ? 'has-detail' : ''}"><div class="list card"><button class="pri" style="width:100%;margin-bottom:8px" data-act="addCh">＋ 新章节</button>${list}</div>
    <div class="detail">${detail || '<p class="muted">选择一章</p>'}</div></div>`;
}

// ============ 伏笔线索 ============
function viewThreads(b) {
  const maxNo = Math.max(0, ...b.chapters.filter(c => c.status !== 'plan').map(c => c.no));
  const rows = b.threads.map((t, i) => {
    const overdue = !t.resolved && t.due && +t.due <= maxNo;
    return `<div class="card"><div class="row">
      <select style="width:90px" data-o="th:${i}" data-f="type">${THREAD_TYPES.map(x => `<option ${x === t.type ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <input class="sp" style="width:auto" data-o="th:${i}" data-f="title" value="${esc(t.title)}">
      ${t.resolved ? '<span class="tag ok">已回收</span>' : overdue ? '<span class="tag warn">已到期/逾期</span>' : ''}
      <button class="sm danger" data-act="delTh" data-i="${i}">✕</button></div>
      <div class="row" style="margin-top:6px"><span class="muted">埋设</span><input style="width:70px" type="number" data-o="th:${i}" data-f="plant" value="${esc(t.plant)}">
      <span class="muted">到期</span><input style="width:70px" type="number" data-o="th:${i}" data-f="due" value="${esc(t.due)}">
      <label style="margin:0;color:var(--ink)"><input type="checkbox" style="width:auto" data-o="th:${i}" data-f="resolved" ${t.resolved ? 'checked' : ''}> 已回收</label>
      ${t.resolved ? `<span class="muted">于第</span><input style="width:70px" type="number" data-o="th:${i}" data-f="resolvedAt" value="${esc(t.resolvedAt)}"><span class="muted">章</span>` : ''}</div>
      <input style="margin-top:6px" data-o="th:${i}" data-f="note" value="${esc(t.note)}" placeholder="备注：怎么埋、打算怎么收"></div>`;
  }).join('');
  return `<div class="row" style="margin-bottom:12px"><h2 class="sp">剧情与伏笔</h2><button class="pri" data-act="addTh">＋ 线索</button></div>${rows || '<p class="muted">记录主线、支线、伏笔在哪章埋设、哪章该回收。</p>'}`;
}

// ============ 正文 ============
function viewWrite(b, r) {
  const ch = b.chapters.find(x => x.id === r.sel);
  const list = b.chapters.map(x => `<div class="item ${x.id === r.sel ? 'on' : ''}" data-act="sel" data-id="${x.id}">
    <b>第${x.no}章</b> ${esc(x.title)}<div class="muted">${words(x.text)} 字 · ${STATUS[x.status]}</div></div>`).join('');
  let detail = '';
  if (ch) {
    const castNames = ch.cast.map(id => b.characters.find(c => c.id === id)?.name).filter(Boolean).join('、');
    detail = `<div class="card"><div class="row"><button class="back-m sm" data-act="unsel">‹ 列表</button>
      <b>第${ch.no}章 ${esc(ch.title)}</b><span class="sp"></span>
      <select style="width:auto" data-o="ch" data-f="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === ch.status ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <details style="margin:8px 0"><summary class="muted">本章蓝图</summary><div class="muted">
        目标：${esc(ch.goal) || '—'}<br>冲突：${esc(ch.conflict) || '—'}<br>钩子：${esc(ch.hook) || '—'}<br>出场：${esc(castNames) || '—'}</div></details>
      ${txt('ch', 'text', ch.text, '开始写……（Tab 插入段首缩进）', 'editor')}
      <div class="muted" id="wc">${words(ch.text)} / ${b.wordsPerChapter} 字</div></div>`;
  }
  return `<div class="split ${ch ? 'has-detail' : ''}"><div class="list card">${list || '<p class="muted">先在「蓝图」页添加章节</p>'}</div>
    <div class="detail">${detail || '<p class="muted">选择一章</p>'}</div></div>`;
}

// ============ 规则检查（不依赖 AI） ============
function viewCheck(b) {
  const issues = [];
  const name = id => b.characters.find(c => c.id === id)?.name || '?';
  const written = Math.max(0, ...b.chapters.filter(c => c.status !== 'plan').map(c => c.no));
  for (const ch of b.chapters) {
    for (const id of ch.cast) {
      const c = b.characters.find(x => x.id === id);
      if (c && !c.alive && c.deathChapter && ch.no > +c.deathChapter) issues.push(['warn', `第${ch.no}章：${c.name} 已于第${c.deathChapter}章死亡，却仍在出场名单里`]);
    }
    if (!ch.goal && !ch.conflict) issues.push(['', `第${ch.no}章：蓝图还没写目标和冲突`]);
  }
  for (const t of b.threads) {
    if (!t.resolved && t.due && +t.due <= written) issues.push(['warn', `线索「${t.title}」应在第${t.due}章回收，目前已写到第${written}章`]);
    if (t.due && +t.due > b.totalChapters) issues.push(['warn', `线索「${t.title}」的到期章(${t.due})超出总章数(${b.totalChapters})`]);
    if (!t.due) issues.push(['', `线索「${t.title}」没有设置到期章`]);
  }
  for (const c of b.characters) {
    const apps = b.chapters.filter(ch => ch.cast.includes(c.id)).map(ch => ch.no);
    if (!apps.length) issues.push(['', `角色 ${c.name} 还没在任何章节出场`]);
    else if (c.alive && b.chapters.length && Math.max(...b.chapters.map(x => x.no)) - Math.max(...apps) >= 10) issues.push(['', `角色 ${c.name} 已经 ${Math.max(...b.chapters.map(x => x.no)) - Math.max(...apps)} 章没出场了`]);
    for (const rl of c.relations) if (!rl.targetId) issues.push(['', `角色 ${c.name} 有一条关系没选对象`]);
  }
  const short = b.chapters.filter(ch => ch.status === 'final' && words(ch.text) < b.wordsPerChapter * 0.6);
  for (const ch of short) issues.push(['', `第${ch.no}章已定稿但只有 ${words(ch.text)} 字（目标 ${b.wordsPerChapter}）`]);
  return `<h2>检查</h2><div class="card">${issues.length ? issues.map(([k, s]) => `<div style="margin:6px 0"><span class="tag ${k}">${k ? '矛盾' : '提醒'}</span> ${esc(s)}</div>`).join('') : '<p>没有发现问题 👍</p>'}</div>`;
}

// ============ 事件处理 ============
function cur() {
  const r = route();
  return { r, b: books.find(x => x.id === r.bid) };
}
function renumber(b) { b.chapters.forEach((c, i) => { c.no = i + 1; }); }
function touch(b) { b.updated = Date.now(); save(); }
function download(name, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: type + ';charset=utf-8' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// 图片压缩：长边最多 1600px，转成 JPEG 存进数据库，避免手机照片过大
function compressImage(file, max = 1600) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src);
      ok(cv.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = fail;
    img.src = URL.createObjectURL(file);
  });
}

function bookToTxt(b) {
  const L = [];
  L.push(`《${b.title}》`, `类型：${b.genre}　受众：${b.audience}`, '');
  L.push('【故事前提】', b.premise, '', '【世界观】', b.world, '', '【情节大纲】', b.outline, '');
  L.push('【角色】');
  for (const c of b.characters) {
    L.push(`■ ${c.name}（${c.role}）${c.alive ? '' : ` 死于第${c.deathChapter}章`}`, c.profile, `当前状态：${c.status}`);
    for (const rl of c.relations) L.push(`  关系：${b.characters.find(x => x.id === rl.targetId)?.name || '?'} —— ${rl.desc}`);
    for (const t of [...c.timeline].sort((a, b2) => a.chapter - b2.chapter)) L.push(`  第${t.chapter}章：${t.note}`);
    L.push('');
  }
  L.push('【伏笔线索】');
  for (const t of b.threads) L.push(`[${t.type}] ${t.title}　埋设:${t.plant || '-'} 到期:${t.due || '-'} ${t.resolved ? `已回收(第${t.resolvedAt}章)` : '未回收'}　${t.note}`);
  L.push('', '【章节蓝图】');
  for (const ch of b.chapters) L.push(`第${ch.no}章 ${ch.title}`, `  目标：${ch.goal}`, `  冲突：${ch.conflict}`, `  钩子：${ch.hook}`);
  L.push('', '==================== 正文 ====================', '');
  for (const ch of b.chapters) if (ch.text) L.push(`第${ch.no}章 ${ch.title}`, '', ch.text, '', '');
  return L.join('\r\n');
}

app.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const act = el.dataset.act;
  const { r, b } = cur();
  const base = b ? `#/b/${b.id}/${r.tab}` : '#/';
  const c = b?.characters.find(x => x.id === r.sel);
  const ch = b?.chapters.find(x => x.id === r.sel);
  switch (act) {
    case 'home': return go('#/');
    case 'open': return go(`#/b/${el.dataset.id}/overview`);
    case 'newBook': { const nb = newBook(); books.push(nb); save(); return go(`#/b/${nb.id}/overview`); }
    case 'delBook': if (confirm(`确定删除《${b.title}》？此操作不能撤销。`)) { books = books.filter(x => x !== b); save(); go('#/'); } return;
    case 'sel': return go(`${base}/${el.dataset.id}`);
    case 'unsel': return go(base);
    case 'addChar': { const n = newChar(); b.characters.push(n); touch(b); return go(`${base}/${n.id}`); }
    case 'delChar': if (confirm(`删除角色 ${c.name}？`)) { b.characters = b.characters.filter(x => x !== c); b.chapters.forEach(x => { x.cast = x.cast.filter(id => id !== c.id); }); touch(b); go(base); } return;
    case 'addRel': c.relations.push({ targetId: '', desc: '' }); break;
    case 'delRel': c.relations.splice(+el.dataset.i, 1); break;
    case 'addImg': {
      const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*'; f.multiple = true;
      f.onchange = async () => {
        c.images = c.images || [];
        for (const file of f.files) c.images.push({ src: await compressImage(file), caption: '' });
        touch(b); render();
      };
      return f.click();
    }
    case 'delImg': if (confirm('删除这张图？')) { c.images.splice(+el.dataset.i, 1); break; } return;
    case 'viewImg': {
      const v = document.createElement('div'); v.className = 'viewer';
      v.innerHTML = `<img src="${c.images[+el.dataset.i].src}">`;
      v.onclick = () => v.remove();
      return document.body.appendChild(v);
    }
    case 'addTl': c.timeline.push({ chapter: '', note: '' }); break;
    case 'delTl': c.timeline.splice(+el.dataset.i, 1); break;
    case 'addCh': { const n = newChapter(b.chapters.length + 1); b.chapters.push(n); touch(b); return go(`${base}/${n.id}`); }
    case 'delCh': if (confirm(`删除第${ch.no}章（含正文）？`)) { b.chapters = b.chapters.filter(x => x !== ch); renumber(b); touch(b); go(base); } return;
    case 'moveCh': {
      const i = b.chapters.indexOf(ch), j = i + +el.dataset.d;
      if (j < 0 || j >= b.chapters.length) return;
      [b.chapters[i], b.chapters[j]] = [b.chapters[j], b.chapters[i]]; renumber(b); break;
    }
    case 'toWrite': return go(`#/b/${b.id}/write/${ch.id}`);
    case 'addTh': b.threads.push(newThread()); break;
    case 'delTh': b.threads.splice(+el.dataset.i, 1); break;
    case 'exportTxt': return download(`${b.title}.txt`, bookToTxt(b));
    case 'exportJson': return download(`小说架构本备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(books), 'application/json');
    case 'importJson': {
      const f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json';
      f.onchange = async () => {
        try {
          const data = JSON.parse((await f.files[0].text()).replace(/^\ufeff/, ''));
          let n = 0;
          for (const nb of data) { const i = books.findIndex(x => x.id === nb.id); if (i >= 0) books[i] = nb; else books.push(nb); n++; }
          save(); render(); alert(`已导入 ${n} 部作品（同一作品会被备份覆盖）`);
        } catch { alert('文件格式不对'); }
      };
      return f.click();
    }
    default: return;
  }
  touch(b); render();
});

// 复选框：出场人物
app.addEventListener('change', e => {
  const el = e.target;
  const { r, b } = cur();
  if (el.dataset.act === 'cast') {
    const ch = b.chapters.find(x => x.id === r.sel);
    ch.cast = el.checked ? [...ch.cast, el.dataset.id] : ch.cast.filter(id => id !== el.dataset.id);
    touch(b);
    return;
  }
  if (el.dataset.f && (el.type === 'checkbox' || el.tagName === 'SELECT')) { applyField(el); render(); }
});

// 文本输入：实时保存，不重新渲染（保持光标）
app.addEventListener('input', e => {
  const el = e.target;
  if (!el.dataset.f || el.type === 'checkbox' || el.tagName === 'SELECT') return;
  applyField(el);
  if (el.dataset.f === 'text') {
    const { b } = cur(); const wc = document.getElementById('wc');
    if (wc) wc.textContent = `${words(el.value)} / ${b.wordsPerChapter} 字`;
  }
});

function applyField(el) {
  const { r, b } = cur();
  const [o, idx] = el.dataset.o.split(':');
  const f = el.dataset.f;
  const v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : +el.value) : el.value;
  const c = b.characters.find(x => x.id === r.sel);
  const target = {
    book: b, char: c, ch: b.chapters.find(x => x.id === r.sel),
    rel: c?.relations[idx], tl: c?.timeline[idx], th: b.threads[idx], img: c?.images?.[idx],
  }[o];
  if (!target) return;
  target[f] = v;
  touch(b);
}

// 正文 Tab 键插入两个全角空格
app.addEventListener('keydown', e => {
  if (e.key === 'Tab' && e.target.dataset?.f === 'text') {
    e.preventDefault();
    document.execCommand('insertText', false, '\u3000\u3000');
  }
});

// ============ 启动 ============
(async () => {
  await DB.open();
  books = (await DB.get('books')) || [];
  if (navigator.storage?.persist) navigator.storage.persist();
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
})();
