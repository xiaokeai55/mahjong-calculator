// ============ 牌数据 ============
const SUITS = [
  { id: 'm',  name: '万子', tiles: ['一万','二万','三万','四万','五万','六万','七万','八万','九万'], emoji: ['🀇','🀈','🀉','🀊','🀋','🀌','🀍','🀎','🀏'] },
  { id: 'p',  name: '筒子', tiles: ['一筒','二筒','三筒','四筒','五筒','六筒','七筒','八筒','九筒'], emoji: ['🀙','🀚','🀛','🀜','🀝','🀞','🀟','🀠','🀡'] },
  { id: 's',  name: '索子', tiles: ['一索','二索','三索','四索','五索','六索','七索','八索','九索'], emoji: ['🀐','🀑','🀒','🀓','🀔','🀕','🀖','🀗','🀘'] },
  { id: 'z',  name: '字牌', tiles: ['东','南','西','北','白','发','中'],         emoji: ['🀀','🀁','🀂','🀃','🀆','🀅','🀄'] },
];

const AKADORA_KEYS = new Set(['m-5', 'p-5', 's-5']);

// ============ 状态 ============
let handTiles = [];        // [{suit, num, isAkadora}] — 与副露合计不超过13张
let doraIndicators = [];   // [{suit, num}] 表宝牌表示牌
let uraDoraIndicators = [];// [{suit, num}] 裏宝牌表示牌
let doraMode = false;      // 'omote' | 'ura' | false
let winningTile = null;    // {suit, num, isAkadora} | null — 和牌 1张
let meldGroups = [];       // [{type:'pon'|'chi'|'minkan'|'ankan', tiles:[{suit,num}], calledFrom:null|number}]
let meldMode = null;       // 'ponchi' | 'minkan' | 'ankan' | null
let meldSelection = [];    // [{suit, num}] temporary selection for meld

// 牌使用量追踪（每张牌最多4枚，5万/5筒/5索为3枚常规+1枚赤）
let tileUsage = {};        // { 'm-1': 0, ..., 'aka-m-5': 0, ... }
function usageKey(suit, num, isAka) { return isAka ? 'aka-' + suit + '-' + num : suit + '-' + num; }
function tileMax(suit, num, isAka) {
  if (isAka) return 1;
  if (AKADORA_KEYS.has(suit + '-' + num)) return 3;
  return 4;
}
function tileRemaining(suit, num, isAka) {
  return tileMax(suit, num, isAka) - (tileUsage[usageKey(suit, num, isAka)] || 0);
}
function useTile(suit, num, isAka) { const k = usageKey(suit, num, isAka); tileUsage[k] = (tileUsage[k] || 0) + 1; }
function freeTile(suit, num, isAka) { const k = usageKey(suit, num, isAka); tileUsage[k] = Math.max(0, (tileUsage[k] || 0) - 1); }

function meldEffectiveCount() { return meldGroups.length * 3; }
function meldPhysicalTiles() { return meldGroups.flatMap(g => g.tiles); }

// ============ 辅助函数 ============
function getEmoji(sid, n) { return SUITS.find(x => x.id === sid).emoji[n - 1]; }
function getTileName(sid, n) { return SUITS.find(x => x.id === sid).tiles[n - 1]; }
function tileSort(a, b) { const o = { m: 0, p: 1, s: 2, z: 3 }; return o[a.suit] - o[b.suit] || a.num - b.num; }
function tileEq(a, b) { return a.suit === b.suit && a.num === b.num; }
function tileKey(s, n) { return s + '-' + n; }
function isHonor(s) { return s === 'z'; }
function isTerminal(s, n) { return s !== 'z' && (n === 1 || n === 9); }
function isTermOrHonor(s, n) { return isHonor(s) || isTerminal(s, n); }

// ============ 宝牌计算 ============
function getDoraTile(suit, num) {
  if (suit === 'z') {
    if (num <= 4) return { suit: 'z', num: (num % 4) + 1 };
    return { suit: 'z', num: ((num - 5 + 1) % 3) + 5 };
  }
  return { suit, num: (num % 9) + 1 };
}

function isOmoteDora(suit, num) {
  return doraIndicators.some(ind => {
    const d = getDoraTile(ind.suit, ind.num);
    return d.suit === suit && d.num === num;
  });
}

function isUraDora(suit, num) {
  return uraDoraIndicators.some(ind => {
    const d = getDoraTile(ind.suit, ind.num);
    return d.suit === suit && d.num === num;
  });
}

function isDora(suit, num) {
  return isOmoteDora(suit, num) || isUraDora(suit, num);
}

// ============ 渲染牌池 ============
function renderPool() {
  const c = document.getElementById('pool-container');
  c.innerHTML = '';
  const meldSelectedKeys = new Set(meldSelection.map(t => tileKey(t.suit, t.num)));

  for (const suit of SUITS) {
    const div = document.createElement('div'); div.className = 'pool-suit';
    const lbl = document.createElement('span'); lbl.className = 'suit-label'; lbl.textContent = suit.name;
    div.appendChild(lbl);
    const row = document.createElement('span'); row.className = 'tile-row';
    for (let n = 0; n < suit.tiles.length; n++) {
      const num = n + 1, key = tileKey(suit.id, num), isAkaSlot = AKADORA_KEYS.has(key);

      function makeBtn(isAka) {
        const btn = document.createElement('button');
        btn.className = 'tile-btn';
        if (isAka) btn.classList.add('akadora');
        if (doraMode || meldMode) btn.classList.add('dora-selectable');
        if (meldMode && meldSelectedKeys.has(key)) btn.classList.add('meld-selected');
        const remaining = tileRemaining(suit.id, num, isAka);
        btn.textContent = suit.emoji[n];
        btn.title = suit.tiles[n] + (isAka ? ' (赤宝牌)' : '') + ' 残' + remaining + '枚';
        if (remaining <= 0) {
          btn.classList.add('exhausted');
          btn.disabled = true;
        }
        btn.addEventListener('click', (e) => {
          if (remaining <= 0) return;
          // 闪烁反馈
          btn.classList.add('flash');
          setTimeout(() => btn.classList.remove('flash'), 300);
          if (doraMode) addDoraIndicator(suit.id, num);
          else addToHand(suit.id, num, isAka);
        });
        return btn;
      }

      row.appendChild(makeBtn(false));
      if (isAkaSlot) row.appendChild(makeBtn(true));
    }
    div.appendChild(row); c.appendChild(div);
  }
}

// ============ 渲染手牌 ============
function renderHand() {
  const area = document.getElementById('hand-area');
  document.getElementById('hand-count').textContent = '(' + handTiles.length + '/13 张)';
  if (handTiles.length === 0) {
    area.innerHTML = '<span class="placeholder">点击牌池中的牌加入手牌，点击手牌即可移除</span>'; return;
  }
  area.innerHTML = '';
  handTiles.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = 'hand-tile';
    if (t.isAkadora) el.classList.add('akadora');
    if (isDora(t.suit, t.num)) el.classList.add('is-dora');
    el.textContent = getEmoji(t.suit, t.num);
    el.title = getTileName(t.suit, t.num) + (t.isAkadora ? ' [赤]' : '') + (isDora(t.suit, t.num) ? ' [宝牌]' : '');
    el.addEventListener('click', () => {
      freeTile(t.suit, t.num, t.isAkadora);
      handTiles.splice(i, 1);
      renderHand(); renderPool();
    });
    area.appendChild(el);
  });
}

// ============ 渲染宝牌表示牌 ============
function renderDoraIndicators() {
  const area = document.getElementById('dora-indicators');
  if (doraIndicators.length === 0) {
    area.innerHTML = '<span class="placeholder">点击上方按钮后，在牌池中选择表示牌（最多4张）</span>';
  } else {
    area.innerHTML = '';
    doraIndicators.forEach((ind, i) => {
      const dora = getDoraTile(ind.suit, ind.num);
      const w = document.createElement('div'); w.className = 'dora-indicator';
      const it = document.createElement('div'); it.className = 'indicator-tile';
      it.textContent = getEmoji(ind.suit, ind.num);
      it.title = '表示牌: ' + getTileName(ind.suit, ind.num) + ' (点击删除)';
      it.addEventListener('click', () => { freeTile(ind.suit, ind.num, false); doraIndicators.splice(i, 1); renderDoraIndicators(); renderDoraResult(); renderHand(); renderWinningTile(); renderPool(); });
      const ar = document.createElement('span'); ar.className = 'arrow'; ar.textContent = '→';
      const dt = document.createElement('div'); dt.className = 'dora-tile';
      dt.textContent = getEmoji(dora.suit, dora.num); dt.title = '宝牌: ' + getTileName(dora.suit, dora.num);
      w.appendChild(it); w.appendChild(ar); w.appendChild(dt); area.appendChild(w);
    });
  }
  renderDoraResult();
}

function renderUraDoraIndicators() {
  const area = document.getElementById('ura-dora-indicators');
  if (uraDoraIndicators.length === 0) {
    area.innerHTML = '<span class="placeholder">立直后和牌时，额外开示</span>';
  } else {
    area.innerHTML = '';
    uraDoraIndicators.forEach((ind, i) => {
      const dora = getDoraTile(ind.suit, ind.num);
      const w = document.createElement('div'); w.className = 'dora-indicator';
      const it = document.createElement('div'); it.className = 'indicator-tile';
      it.textContent = getEmoji(ind.suit, ind.num);
      it.title = '裏表示牌: ' + getTileName(ind.suit, ind.num) + ' (点击删除)';
      it.addEventListener('click', () => {
        freeTile(ind.suit, ind.num, false);
        uraDoraIndicators.splice(i, 1);
        renderUraDoraIndicators(); renderDoraResult(); renderHand(); renderWinningTile(); renderPool();
      });
      const ar = document.createElement('span'); ar.className = 'arrow'; ar.textContent = '→';
      const dt = document.createElement('div'); dt.className = 'dora-tile';
      dt.textContent = getEmoji(dora.suit, dora.num);
      dt.title = '裏宝牌: ' + getTileName(dora.suit, dora.num);
      w.appendChild(it); w.appendChild(ar); w.appendChild(dt); area.appendChild(w);
    });
  }
}

function renderDoraResult() {
  const r = document.getElementById('dora-result');
  if (doraIndicators.length === 0) { r.textContent = ''; return; }
  let omoteCnt = 0, uraCnt = 0, akaCnt = 0;
  const allT = [...handTiles, ...meldPhysicalTiles()];
  if (winningTile) allT.push(winningTile);
  allT.forEach(t => {
    if (isOmoteDora(t.suit, t.num)) omoteCnt++;
    if (isUraDora(t.suit, t.num)) uraCnt++;
    if (t.isAkadora) akaCnt++;
  });
  const totalCnt = omoteCnt + uraCnt + akaCnt;
  const parts = [];
  if (doraIndicators.length > 0) {
    const names = doraIndicators.map(ind => {
      const d = getDoraTile(ind.suit, ind.num);
      return getTileName(d.suit, d.num);
    });
    parts.push('表: ' + names.join('、'));
  }
  if (uraDoraIndicators.length > 0) {
    const names = uraDoraIndicators.map(ind => {
      const d = getDoraTile(ind.suit, ind.num);
      return getTileName(d.suit, d.num);
    });
    parts.push('裏: ' + names.join('、'));
  }
  r.textContent = (parts.length > 0 ? parts.join('  |  ') : '')
    + (totalCnt > 0 ? '  |  宝牌数: ' + totalCnt + ' 枚' : '');
}

// ============ 渲染副露 ============
function renderMelds() {
  const area = document.getElementById('meld-area');
  document.getElementById('meld-count').textContent = '(' + meldEffectiveCount() + ' 张)';
  if (meldGroups.length === 0) {
    area.innerHTML = '<span class="placeholder">选择碰/吃/明槓/暗槓后在牌池中选牌</span>';
    return;
  }
  area.innerHTML = '';
  const typeNames = { pon: '碰', chi: '吃', minkan: '明槓', ankan: '暗槓' };
  meldGroups.forEach((g, gi) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'meld-group';
    const label = document.createElement('span');
    label.className = 'meld-label';
    label.textContent = typeNames[g.type];
    wrapper.appendChild(label);

    g.tiles.forEach((t, ti) => {
      const el = document.createElement('div');
      el.className = 'meld-tile';
      if (ti === g.calledFrom) el.classList.add('called');
      if (g.type === 'ankan') el.classList.add('ankan-tile');
      if (t.isAkadora) el.classList.add('akadora');
      el.textContent = getEmoji(t.suit, t.num);
      el.title = getTileName(t.suit, t.num)
        + (t.isAkadora ? ' [赤]' : '')
        + (ti === g.calledFrom ? ' (他家打)' : '');
      wrapper.appendChild(el);
    });

    // 点击整个副露组删除
    wrapper.title = '点击删除此副露组';
    wrapper.style.cursor = 'pointer';
    wrapper.addEventListener('click', () => {
      g.tiles.forEach(t => freeTile(t.suit, t.num, !!t.isAkadora));
      meldGroups.splice(gi, 1);
      renderMelds(); renderHand(); renderDoraResult(); renderPool(); updateButtonStates();
    });

    area.appendChild(wrapper);
  });
}

// ============ 渲染和牌 ============
function renderWinningTile() {
  const area = document.getElementById('win-area');
  const count = document.getElementById('win-count');
  if (winningTile) {
    count.textContent = '(1/1 张)';
    area.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'win-tile';
    if (winningTile.isAkadora) el.classList.add('akadora');
    if (isDora(winningTile.suit, winningTile.num)) el.classList.add('is-dora');
    el.textContent = getEmoji(winningTile.suit, winningTile.num);
    el.title = getTileName(winningTile.suit, winningTile.num)
      + (winningTile.isAkadora ? ' [赤]' : '')
      + (isDora(winningTile.suit, winningTile.num) ? ' [宝牌]' : '')
      + ' (点击移除)';
    el.addEventListener('click', () => {
      freeTile(winningTile.suit, winningTile.num, winningTile.isAkadora);
      winningTile = null;
      renderWinningTile(); renderDoraResult(); renderPool();
    });
    area.appendChild(el);
  } else {
    count.textContent = '(0/1 张)';
    area.innerHTML = '<span class="placeholder">手牌满13张后，再选牌会放入和牌区</span>';
  }
}

// ============ 操作 ============
function addToHand(suitId, num, isAkadora) {
  if (meldMode) { handleMeldSelect(suitId, num, isAkadora); return; }
  if (tileRemaining(suitId, num, !!isAkadora) <= 0) return;
  useTile(suitId, num, !!isAkadora);
  if (handTiles.length + meldEffectiveCount() >= 13) {
    winningTile = { suit: suitId, num: num, isAkadora: !!isAkadora };
    renderWinningTile(); renderDoraResult(); renderPool();
    return;
  }
  handTiles.push({ suit: suitId, num: num, isAkadora: !!isAkadora });
  renderHand(); renderDoraResult(); renderPool();
}

// ============ 副露操作 ============
function setMeldMode(mode) {
  if (doraMode) { doraMode = false; renderPool(); }
  if (meldMode === mode) { clearMeldMode(); return; }
  clearMeldMode();
  meldMode = mode;
  const btnId = mode === 'ponchi' ? 'meld-ponchi' : 'meld-' + mode;
  document.getElementById(btnId).classList.add('active');
  renderPool();
  renderMeldPreview();
}

function clearMeldMode() {
  if (meldMode) {
    const btnId = meldMode === 'ponchi' ? 'meld-ponchi' : 'meld-' + meldMode;
    document.getElementById(btnId).classList.remove('active');
  }
  meldMode = null;
  clearMeldSelection();
}

function detectPonchiType(tiles) {
  if (tiles.length < 3) return null;
  const suits = new Set(tiles.map(t => t.suit));
  const nums = tiles.map(t => t.num);
  const numsSet = new Set(nums);
  if (suits.size === 1 && numsSet.size === 1) return 'pon';
  if (suits.size === 1) {
    const sorted = [...nums].sort((a, b) => a - b);
    if (sorted[0] + 1 === sorted[1] && sorted[1] + 1 === sorted[2]) return 'chi';
  }
  return null;
}

function renderMeldPreview() {
  const preview = document.getElementById('meld-selection-preview');
  if (!meldMode || meldSelection.length === 0) {
    preview.classList.remove('show');
    preview.innerHTML = '';
    return;
  }
  preview.classList.add('show');
  const emojis = meldSelection.map(t => getEmoji(t.suit, t.num)).join(' ');
  let typeHtml = '';
  if (meldMode === 'ponchi' && meldSelection.length === 3) {
    const detected = detectPonchiType(meldSelection);
    if (detected) {
      typeHtml = ' → <span class="preview-type">' + (detected === 'pon' ? '碰' : '吃') + '</span>';
    } else {
      typeHtml = ' → <span style="color:#e74c3c">无效组合</span>';
    }
  }
  const modeLabel = { ponchi: '碰/吃', minkan: '明槓', ankan: '暗槓' }[meldMode] || '';
  const clearBtn = '<button class="preview-clear-btn" title="取消全部选中">✕</button>';
  preview.innerHTML = clearBtn + '<span style="color:#889">' + modeLabel + '選択中:</span> ' + emojis + typeHtml;

  // × 按钮事件
  preview.querySelector('.preview-clear-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    clearMeldSelection();
  });
}

function handleMeldSelect(suitId, num, isAkadora) {
  const need = meldMode === 'minkan' || meldMode === 'ankan' ? 4 : 3;
  if (meldSelection.length >= need) return;
  if (tileRemaining(suitId, num, !!isAkadora) <= 0) return;
  useTile(suitId, num, !!isAkadora);
  meldSelection.push({ suit: suitId, num: num, isAkadora: !!isAkadora });

  renderPool();
  renderMeldPreview();

  if (meldSelection.length >= need) {
    if (meldMode === 'ponchi') {
      const detected = detectPonchiType(meldSelection.slice(0, 3));
      if (!detected) { renderMeldPreview(); return; }
    }
    finalizeMeld();
  }
}

function clearMeldSelection() {
  meldSelection.forEach(t => freeTile(t.suit, t.num, !!t.isAkadora));
  meldSelection = [];
  renderPool();
  renderMeldPreview();
}

function finalizeMeld() {
  const need = meldMode === 'minkan' || meldMode === 'ankan' ? 4 : 3;
  const tiles = meldSelection.slice(0, need);
  let actualType = meldMode;

  if (meldMode === 'ponchi') {
    const detected = detectPonchiType(tiles);
    if (!detected) return;
    actualType = detected;
  }
  if (meldMode === 'minkan' || meldMode === 'ankan') {
    const suits = new Set(tiles.map(t => t.suit));
    const nums = new Set(tiles.map(t => t.num));
    if (suits.size !== 1 || nums.size !== 1) { clearMeldMode(); return; }
  }

  const calledFrom = actualType === 'ankan' ? null : need - 1;
  meldGroups.push({ type: actualType, tiles: [...tiles], calledFrom });
  // 直接清空选区，不释放牌（牌已归副露组所有）
  if (meldMode) {
    const btnId = meldMode === 'ponchi' ? 'meld-ponchi' : 'meld-' + meldMode;
    document.getElementById(btnId).classList.remove('active');
  }
  meldMode = null;
  meldSelection = [];
  renderPool();
  renderMeldPreview();
  renderMelds(); renderHand(); renderDoraResult(); updateButtonStates();
}

// ============ 宝牌表示牌操作 ============
function addDoraIndicator(suitId, num) {
  const list = doraMode === 'ura' ? uraDoraIndicators : doraIndicators;
  const exists = list.some(ind => ind.suit === suitId && ind.num === num);
  if (exists) {
    freeTile(suitId, num, false);
    if (doraMode === 'ura') {
      uraDoraIndicators = uraDoraIndicators.filter(ind => !(ind.suit === suitId && ind.num === num));
    } else {
      doraIndicators = doraIndicators.filter(ind => !(ind.suit === suitId && ind.num === num));
    }
  } else {
    if (list.length >= 4 || tileRemaining(suitId, num, false) <= 0) return;
    useTile(suitId, num, false);
    list.push({ suit: suitId, num: num });
  }
  renderDoraIndicators(); renderUraDoraIndicators(); renderHand(); renderWinningTile(); renderPool();
}

function setDoraMode(mode) {
  // 立直未勾选时禁止进入裏宝牌模式
  if (mode === 'ura' && !document.getElementById('riichi-flag').checked) return;

  if (doraMode === mode) {
    doraMode = false;
  } else {
    doraMode = mode;
  }
  const omoteBtn = document.getElementById('dora-mode-btn');
  const uraBtn = document.getElementById('ura-dora-mode-btn');
  omoteBtn.classList.toggle('active', doraMode === 'omote');
  uraBtn.classList.toggle('active', doraMode === 'ura');
  omoteBtn.textContent = doraMode === 'omote' ? '選択中…' : '選択';
  uraBtn.textContent = doraMode === 'ura' ? '選択中…' : '選択';
  renderPool();
}

function updateButtonStates() {
  const riichiChecked = document.getElementById('riichi-flag').checked;
  const doubleRiichiChecked = document.getElementById('double-riichi-flag').checked;
  const anyRiichi = riichiChecked || doubleRiichiChecked;
  const hasOpenMeld = meldGroups.some(g => g.type !== 'ankan');

  // 裏宝牌按钮：只有立直（或両立直）时可用
  const uraBtn = document.getElementById('ura-dora-mode-btn');
  uraBtn.disabled = !anyRiichi || hasOpenMeld;

  // 立直/一発/両立直：有副露时不可用
  const riichiCb = document.getElementById('riichi-flag');
  const ippatsuCb = document.getElementById('ippatsu-flag');
  const doubleRiichiCb = document.getElementById('double-riichi-flag');
  const riichiLabel = riichiCb.parentElement;
  const ippatsuLabel = ippatsuCb.parentElement;
  const doubleRiichiLabel = doubleRiichiCb.parentElement;

  if (hasOpenMeld) {
    riichiCb.disabled = true; ippatsuCb.disabled = true; doubleRiichiCb.disabled = true;
    riichiLabel.classList.add('disabled'); ippatsuLabel.classList.add('disabled'); doubleRiichiLabel.classList.add('disabled');
    if (riichiCb.checked) { riichiCb.checked = false; ippatsuCb.checked = false; doubleRiichiCb.checked = false; }
  } else {
    riichiCb.disabled = false; ippatsuCb.disabled = false; doubleRiichiCb.disabled = false;
    riichiLabel.classList.remove('disabled'); ippatsuLabel.classList.remove('disabled'); doubleRiichiLabel.classList.remove('disabled');
  }

  // 立直/両立直被取消时退出裏宝牌模式并清空裏宝牌
  if (!anyRiichi && doraMode === 'ura') {
    doraMode = false;
    uraBtn.classList.remove('active');
    uraBtn.textContent = '選択';
    renderPool();
  }
  if (!anyRiichi && uraDoraIndicators.length > 0) {
    uraDoraIndicators.forEach(ind => freeTile(ind.suit, ind.num, false));
    uraDoraIndicators = [];
    renderUraDoraIndicators();
    renderDoraResult();
    renderHand();
    renderWinningTile();
    renderPool();
  }
}

// ===================================================================
// 算点引擎
// ===================================================================

// ---- 手牌分解（含副露） ----
function meldToInternal(g) {
  return {
    type: g.type === 'chi' ? 'shuntsu' : 'koutsu',
    tiles: g.tiles.map(t => ({ suit: t.suit, num: t.num })),
    open: g.type !== 'ankan',
    isKan: g.type === 'minkan' || g.type === 'ankan'
  };
}

function findAllDecompositionsWithMelds(handTilesRaw, melds, winningTile) {
  const preFormed = melds.map(meldToInternal);
  const remainingSlots = 4 - preFormed.length;
  const toDecompose = [...handTilesRaw];
  if (winningTile) toDecompose.push(winningTile);

  if (toDecompose.length !== remainingSlots * 3 + 2) return [];

  const results = [];
  const sorted = [...toDecompose].sort(tileSort);
  const seen = new Set();

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (!tileEq(sorted[i], sorted[j])) continue;
      const k = tileKey(sorted[i].suit, sorted[i].num);
      if (seen.has(k)) continue;
      seen.add(k);
      const pair = [sorted[i], sorted[j]];
      const rest = sorted.filter((_, idx) => idx !== i && idx !== j);
      const meldSets = decomposeMelds(rest);
      if (meldSets) {
        for (const ms of meldSets) {
          results.push({ pair, melds: [...preFormed, ...ms] });
        }
      }
    }
  }
  return results;
}

function findAllDecompositions(tiles) {
  const results = [];
  const sorted = [...tiles].sort(tileSort);

  // 找对子
  const seen = new Set();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (!tileEq(sorted[i], sorted[j])) continue;
      const k = tileKey(sorted[i].suit, sorted[i].num);
      if (seen.has(k)) continue;
      seen.add(k);
      const pair = [sorted[i], sorted[j]];
      const rest = sorted.filter((_, idx) => idx !== i && idx !== j);
      const meldSets = decomposeMelds(rest);
      if (meldSets) {
        for (const ms of meldSets) {
          results.push({ pair, melds: ms });
        }
      }
    }
  }
  return results;
}

function decomposeMelds(tiles) {
  if (tiles.length === 0) return [[]];
  if (tiles.length % 3 !== 0) return null;

  const sorted = [...tiles].sort(tileSort);
  const first = sorted[0];
  const allResults = [];

  // 尝试刻子
  const sameIdx = [0];
  for (let i = 1; i < sorted.length && sameIdx.length < 3; i++) {
    if (tileEq(sorted[i], first)) sameIdx.push(i);
  }
  if (sameIdx.length >= 3) {
    const koutsu = sameIdx.slice(0, 3).map(i => sorted[i]);
    const rest = sorted.filter((_, i) => !sameIdx.slice(0, 3).includes(i));
    const sub = decomposeMelds(rest);
    if (sub) {
      for (const s of sub) {
        allResults.push([{ type: 'koutsu', tiles: koutsu, open: false, isKan: false }, ...s]);
      }
    }
  }

  // 尝试顺子（仅数牌）
  if (first.suit !== 'z') {
    const i2 = sorted.findIndex((t, i) => i > 0 && t.suit === first.suit && t.num === first.num + 1);
    const i3 = sorted.findIndex((t, i) => i > i2 && t.suit === first.suit && t.num === first.num + 2);
    if (i2 >= 0 && i3 >= 0) {
      const shuntsu = [sorted[0], sorted[i2], sorted[i3]];
      const rest = sorted.filter((_, i) => i !== 0 && i !== i2 && i !== i3);
      const sub = decomposeMelds(rest);
      if (sub) {
        for (const s of sub) {
          allResults.push([{ type: 'shuntsu', tiles: shuntsu, open: false, isKan: false }, ...s]);
        }
      }
    }
  }

  return allResults.length > 0 ? allResults : null;
}

// ---- 役种检测 ----
function detectYaku(decomp, params) {
  const { isTsumo, isRiichi, isIppatsu, isMenzen, bakaze, jikaze } = params;
  const yaku = [];
  let totalHan = 0;

  const add = (name, han, cond) => { if (cond) { yaku.push({ name, han }); totalHan += han; } };

  // 立直 / 両立直 / 一発
  const isDoubleRiichi = document.getElementById('double-riichi-flag').checked;
  const isRinshan = document.getElementById('rinshan-flag').checked;
  const isHaitei = document.getElementById('haitei-flag').checked;
  const isHoutei = document.getElementById('houtei-flag').checked;
  const isTenhou = document.getElementById('tenhou-flag').checked;
  const isChiihou = document.getElementById('chiihou-flag').checked;
  const isChankan = document.getElementById('chankan-flag').checked;

  if (isTenhou) { add('天和', 13, true); return { yaku, totalHan }; }
  if (isChiihou) { add('地和', 13, true); return { yaku, totalHan }; }

  if (isRiichi || isDoubleRiichi) {
    if (isDoubleRiichi) { add('両立直', 2, true); }
    else { add('立直', 1, true); }
    if (isIppatsu) add('一発', 1, true);
  }

  // 嶺上開花
  add('嶺上開花', 1, isRinshan);
  // 海底撈月（自摸）
  add('海底撈月', 1, isHaitei && isTsumo);
  // 河底撈魚（栄和）
  add('河底撈魚', 1, isHoutei && !isTsumo);
  // 搶槓（栄和）
  add('搶槓', 1, isChankan && !isTsumo);

  const melds = decomp.melds;
  const pairTile = decomp.pair[0];
  const allTiles = [...decomp.pair, ...melds.flatMap(m => m.tiles)];

  // 門前清自摸和
  add('門前清自摸和', 1, isMenzen && isTsumo);

  // 役牌：場風/自風/三元
  const bakazeName = { east: '东', south: '南', west: '西', north: '北' }[bakaze];
  const jikazeName = { east: '东', south: '南', west: '西', north: '北' }[jikaze];
  for (const m of melds) {
    if (m.type !== 'koutsu') continue;
    const t = m.tiles[0];
    if (t.suit !== 'z') continue;
    const name = getTileName('z', t.num);
    if (name === bakazeName) add('役牌 場風 ' + name, 1, true);
    if (name === jikazeName) add('役牌 自風 ' + name, 1, true);
    if (name === '白' || name === '发' || name === '中') add('役牌 ' + name, 1, true);
  }

  // 平和：门前、全顺子、雀头非役牌、两面待
  const allShuntsu = melds.every(m => m.type === 'shuntsu');
  const pairNotYakuhai = !isYakuhaiPair(pairTile, bakaze, jikaze);
  const pinfuForm = allShuntsu && pairNotYakuhai;
  const waitType = detectWait(decomp, params.winningTile);
  const isPinfu = pinfuForm && isMenzen && waitType === 'ryanmen';
  if (isPinfu) add('平和', 1, true);

  // 断幺九
  const tanyao = allTiles.every(t => !isTermOrHonor(t.suit, t.num));
  add('断幺九', 1, tanyao);

  // 对对和：全刻子
  const toitoi = melds.every(m => m.type === 'koutsu');
  add('対々和', 2, toitoi);

  // 三暗刻：三组暗刻（非副露的刻子）
  const ankou = melds.filter(m => m.type === 'koutsu' && !m.open).length;
  add('三暗刻', 2, ankou >= 3);

  // 三色同顺
  const shuntsuMelds = melds.filter(m => m.type === 'shuntsu');
  let sanshoku = false;
  const seqKeys = {};
  for (const m of shuntsuMelds) {
    const k = m.tiles[0].suit + '-' + m.tiles[0].num;
    seqKeys[k] = (seqKeys[k] || 0) + 1;
  }
  for (let n = 1; n <= 7; n++) {
    if (['m', 'p', 's'].every(s => seqKeys[s + '-' + n])) { sanshoku = true; break; }
  }
  add('三色同順', isMenzen ? 2 : 1, sanshoku);

  // 一气通贯
  let ittsuu = false;
  for (const s of ['m', 'p', 's']) {
    if (shuntsuMelds.filter(m => m.tiles[0].suit === s && m.tiles[0].num === 1).length &&
        shuntsuMelds.filter(m => m.tiles[0].suit === s && m.tiles[0].num === 4).length &&
        shuntsuMelds.filter(m => m.tiles[0].suit === s && m.tiles[0].num === 7).length) {
      ittsuu = true; break;
    }
  }
  add('一気通貫', isMenzen ? 2 : 1, ittsuu);

  // 一盃口（门前清，两组完全相同的顺子）
  if (isMenzen) {
    const shuntsuCount = {};
    for (const m of shuntsuMelds) {
      if (m.open) continue;
      const k = m.tiles[0].suit + '-' + m.tiles[0].num;
      shuntsuCount[k] = (shuntsuCount[k] || 0) + 1;
    }
    const hasIipeikou = Object.values(shuntsuCount).some(c => c >= 2);
    add('一盃口', 1, hasIipeikou);
  }

  // 混一色
  const suits = new Set(allTiles.map(t => t.suit));
  const numSuits = [...suits].filter(s => s !== 'z');
  const hasHonor = suits.has('z');
  add('混一色', isMenzen ? 3 : 2, numSuits.length === 1 && hasHonor);

  // 清一色
  add('清一色', isMenzen ? 6 : 5, suits.size === 1 && !suits.has('z'));

  // 小三元 / 大三元
  let dragonKoutsu = 0;
  for (const m of melds) {
    if (m.type === 'koutsu' && m.tiles[0].suit === 'z' && m.tiles[0].num >= 5) dragonKoutsu++;
  }
  const dragonPair = pairTile.suit === 'z' && pairTile.num >= 5;
  if (dragonKoutsu === 3) add('大三元', 13, true);
  else if (dragonKoutsu === 2 && dragonPair) add('小三元', 2, true);

  return { yaku, totalHan };
}

function isYakuhaiPair(tile, bakaze, jikaze) {
  if (tile.suit !== 'z') return false;
  const name = getTileName('z', tile.num);
  const bakazeName = { east: '东', south: '南', west: '西', north: '北' }[bakaze];
  const jikazeName = { east: '东', south: '南', west: '西', north: '北' }[jikaze];
  return name === bakazeName || name === jikazeName || ['白', '发', '中'].includes(name);
}

// ---- 符数计算 ----
function calculateFu(decomp, params) {
  const { isTsumo, isMenzen } = params;
  const details = [];
  let fu = 20;
  details.push('基本符: 20符');

  const pairTile = decomp.pair[0];
  const allMelds = decomp.melds;
  const allShuntsu = allMelds.every(m => m.type === 'shuntsu');
  const pairNotYakuhai = !isYakuhaiPair(pairTile, params.bakaze, params.jikaze);
  const isPinfu = allShuntsu && pairNotYakuhai && isMenzen;

  // 平和自摸：20符固定
  if (isPinfu && isTsumo) {
    return { fu: 20, details: ['平和自摸: 20符固定'] };
  }

  // 门清荣和 +10符
  if (isMenzen && !isTsumo) {
    fu += 10;
    details.push('門前栄和: +10符');
  }

  // 自摸 +2符（平和除外）
  if (isTsumo && !isPinfu) {
    fu += 2;
    details.push('自摸: +2符');
  }

  // 雀头
  if (isYakuhaiPair(pairTile, params.bakaze, params.jikaze)) {
    fu += 2;
    details.push('役牌雀頭: +2符 (' + getTileName(pairTile.suit, pairTile.num) + ')');
  }

  // 待牌形
  const wait = detectWait(decomp, params.winningTile);
  if (wait === 'kanchan') { fu += 2; details.push('嵌張待: +2符'); }
  if (wait === 'penchan') { fu += 2; details.push('辺張待: +2符'); }
  if (wait === 'tanki') { fu += 2; details.push('単騎待: +2符'); }

  // 面子符
  for (const m of allMelds) {
    if (m.type === 'shuntsu') continue;
    const t = m.tiles[0];
    const termHonor = isTermOrHonor(t.suit, t.num);
    if (m.isKan) {
      const val = m.open ? (termHonor ? 16 : 8) : (termHonor ? 32 : 16);
      const label = (m.open ? '明' : '暗') + '槓';
      fu += val; details.push(label + ' (' + getTileName(t.suit, t.num) + '): +' + val + '符');
    } else {
      const val = m.open ? (termHonor ? 4 : 2) : (termHonor ? 8 : 4);
      const label = m.open ? '明刻' : '暗刻';
      if (val > 0) {
        fu += val; details.push(label + ' (' + getTileName(t.suit, t.num) + '): +' + val + '符');
      }
    }
  }

  const rawFu = fu;
  fu = Math.ceil(fu / 10) * 10;
  if (fu < 20) fu = 20;
  if (fu !== rawFu) details.push('端数切上: ' + rawFu + '符 → ' + fu + '符');

  return { fu, details };
}

function detectWait(decomp, winningTile) {
  if (!winningTile) return 'ryanmen';
  // 判断 winningTile 在哪个面子/对子中的角色
  const wt = winningTile;
  // 检查是否在对子中（单骑）
  if (tileEq(decomp.pair[0], wt) || tileEq(decomp.pair[1], wt)) return 'tanki';
  // 检查在哪个面子中
  for (const m of decomp.melds) {
    if (!m.tiles.some(t => tileEq(t, wt))) continue;
    if (m.type === 'koutsu') return 'shanpon';
    // 顺子：判断是边张、嵌张还是两面
    const nums = m.tiles.map(t => t.num).sort((a, b) => a - b);
    const wnum = wt.num;
    if (wnum === nums[1]) return 'kanchan'; // 中间牌 → 嵌张
    if ((wnum === 1 && nums[0] === 1) || (wnum === 9 && nums[2] === 9)) return 'penchan'; // 边缘 → 边张
    return 'ryanmen';
  }
  return 'ryanmen';
}

// ---- 点数计算 ----
function calculatePoints(han, fu, isDealer, isTsumo) {
  // 满贯以上
  if (han >= 13) return manganPlus('役満', 32000, 48000, isDealer, isTsumo);
  if (han >= 11) return manganPlus('三倍満', 24000, 36000, isDealer, isTsumo);
  if (han >= 8)  return manganPlus('倍満', 16000, 24000, isDealer, isTsumo);
  if (han >= 6)  return manganPlus('跳満', 12000, 18000, isDealer, isTsumo);
  if (han === 5 || (han === 4 && fu >= 40) || (han === 3 && fu >= 70))
    return manganPlus('満貫', 8000, 12000, isDealer, isTsumo);

  const base = Math.min(fu * Math.pow(2, han + 2), 2000);

  if (isTsumo) {
    if (isDealer) {
      const pay = ceil100(base * 2);
      return { name: han + '番' + fu + '符', ron: null, tsumo: pay, tsumoDetail: '親 · ツモ: 各' + pay + '点' };
    } else {
      const koPay = ceil100(base);
      const dealerPay = ceil100(base * 2);
      return { name: han + '番' + fu + '符', ron: null, tsumo: koPay, tsumoDealer: dealerPay,
        tsumoDetail: '子 · ツモ: 親' + dealerPay + '点 / 子' + koPay + '点' };
    }
  } else {
    const ron = isDealer ? ceil100(base * 6) : ceil100(base * 4);
    return { name: han + '番' + fu + '符', ron, tsumo: null,
      ronDetail: (isDealer ? '親' : '子') + ' · ロン: ' + ron + '点' };
  }
}

function manganPlus(name, childRon, dealerRon, isDealer, isTsumo) {
  if (isTsumo) {
    if (isDealer) { const p = Math.round(dealerRon / 3 / 100) * 100; return { name, ron: null, tsumo: p, tsumoDetail: '親 · ツモ: 各' + p + '点' }; }
    const ko = Math.round(childRon / 4 / 100) * 100;
    const d = Math.round(childRon / 2 / 100) * 100;
    return { name, ron: null, tsumo: ko, tsumoDealer: d, tsumoDetail: '子 · ツモ: 親' + d + '点 / 子' + ko + '点' };
  }
  return { name, ron: isDealer ? dealerRon : childRon, tsumo: null, ronDetail: (isDealer ? '親' : '子') + ' · ロン: ' + (isDealer ? dealerRon : childRon) + '点' };
}

function ceil100(n) { return Math.ceil(n / 100) * 100; }

// ---- 主计算 ----
function calculate(isTsumo) {
  const allTilesFromHand = handTiles.map(t => ({ suit: t.suit, num: t.num }));
  const allTilesFromMeld = meldPhysicalTiles().map(t => ({ suit: t.suit, num: t.num }));
  const allTiles = [...allTilesFromHand, ...allTilesFromMeld];
  if (winningTile) allTiles.push({ suit: winningTile.suit, num: winningTile.num });

  const expectedTotal = 14 + meldGroups.filter(g => g.type === 'minkan' || g.type === 'ankan').length;
  if (allTiles.length !== expectedTotal) {
    const err = document.getElementById('hand-error');
    if (err) err.textContent = '需要手牌+副露+和牌共' + expectedTotal + '张（当前' + allTiles.length + '张）';
    return;
  }

  document.getElementById('hand-error').textContent = '';

  const isRiichi = document.getElementById('riichi-flag').checked;
  const isIppatsu = document.getElementById('ippatsu-flag').checked;
  const bakaze = document.getElementById('bakaze').value;
  const jikaze = document.getElementById('jikaze').value;
  const isDealer = document.querySelector('input[name="oyako"]:checked').value === 'oya';

  const wt = winningTile ? { suit: winningTile.suit, num: winningTile.num } : allTiles[allTiles.length - 1];
  const hasOpenMeld = meldGroups.some(g => g.type !== 'ankan');
  const isMenzen = !hasOpenMeld;

  const decomps = findAllDecompositionsWithMelds(handTiles.map(t => ({ suit: t.suit, num: t.num })), meldGroups, wt);

  if (decomps.length === 0) {
    displayNoResult('无法组成有效的和牌形（需要4面子+1雀头）');
    return;
  }

  let bestScore = -1;
  let bestResult = null;

  for (const dec of decomps) {
    const params = { isTsumo, isRiichi, isIppatsu, isMenzen, bakaze, jikaze, winningTile: wt };
    const { yaku, totalHan } = detectYaku(dec, params);
    if (yaku.length === 0) continue;

    // 宝牌加成
    let omoteDoraHan = 0, uraDoraHan = 0;
    for (const t of allTiles) {
      if (isOmoteDora(t.suit, t.num)) omoteDoraHan++;
      if (isUraDora(t.suit, t.num)) uraDoraHan++;
    }
    const akadoraCount = handTiles.filter(t => t.isAkadora).length
      + meldPhysicalTiles().filter(t => t.isAkadora).length
      + (winningTile && winningTile.isAkadora ? 1 : 0);
    const doraHan = omoteDoraHan + uraDoraHan + akadoraCount;
    const fullHan = totalHan + doraHan;

    const { fu, details: fuDetails } = calculateFu(dec, params);
    const pts = calculatePoints(fullHan, fu, isDealer, isTsumo);

    let score = 0;
    if (isTsumo) score = pts.tsumo * (isDealer ? 3 : 1) + (pts.tsumoDealer || 0);
    else score = pts.ron || 0;

    if (score > bestScore) {
      bestScore = score;
      bestResult = { yaku, totalHan, doraHan, omoteDoraHan, uraDoraHan, akadoraCount, fullHan, fu, fuDetails, pts, isTsumo, isDealer, dec };
    }
  }

  if (!bestResult) {
    displayNoResult('无役（役なし）—— 当前手牌组合不满足任何役种');
    return;
  }

  displayResults(bestResult);
}

function displayNoResult(msg) {
  const panel = document.getElementById('result-panel');
  if (!panel) return;
  panel.classList.add('show');
  document.getElementById('yaku-list').innerHTML = '<span style="color:#e74c3c">' + msg + '</span>';
  document.getElementById('total-han').textContent = '';
  document.getElementById('fu-detail').textContent = '';
  document.getElementById('points-big').textContent = '—';
  document.getElementById('points-detail').textContent = '';
}

function displayResults(r) {
  const panel = document.getElementById('result-panel');
  if (!panel) return;
  panel.classList.add('show');

  // 役种
  const yl = document.getElementById('yaku-list');
  let yhtml = r.yaku.map(y => '<div class="yaku-item"><span class="name">' + y.name + '</span><span class="han">' + y.han + '番</span></div>').join('');
  if (r.doraHan > 0) {
    let doraParts = [];
    if (r.omoteDoraHan > 0) doraParts.push('表宝牌 +' + r.omoteDoraHan + '番');
    if (r.uraDoraHan > 0) doraParts.push('裏宝牌 +' + r.uraDoraHan + '番');
    if (r.akadoraCount > 0) doraParts.push('赤宝牌 +' + r.akadoraCount + '番');
    yhtml += '<div class="yaku-item"><span class="name">宝牌</span><span class="han">' + doraParts.join(', ') + '</span></div>';
  }
  yl.innerHTML = yhtml;
  document.getElementById('total-han').textContent = '合计: ' + r.fullHan + '番';

  // 符数
  const fuHtml = r.fuDetails.map(d => '<div>' + d + '</div>').join('')
    + '<div style="margin-top:6px;font-weight:bold;color:#e8c040">符数合计: ' + r.fu + '符</div>';
  document.getElementById('fu-detail').innerHTML = fuHtml;

  // 点数
  const big = document.getElementById('points-big');
  const detail = document.getElementById('points-detail');
  if (r.isTsumo) {
    const total = r.isDealer ? r.pts.tsumo * 3 : r.pts.tsumoDealer + r.pts.tsumo * 2;
    big.textContent = total.toLocaleString() + '点';
    detail.textContent = r.pts.tsumoDetail;
  } else {
    big.textContent = r.pts.ron.toLocaleString() + '点';
    detail.textContent = r.pts.ronDetail;
  }
}

// ============ 按钮事件 ============
document.getElementById('dora-mode-btn').addEventListener('click', () => setDoraMode('omote'));
document.getElementById('ura-dora-mode-btn').addEventListener('click', () => setDoraMode('ura'));
document.getElementById('riichi-flag').addEventListener('change', updateButtonStates);
document.getElementById('double-riichi-flag').addEventListener('change', updateButtonStates);

// 副露模式按钮
document.getElementById('meld-ponchi').addEventListener('click', () => setMeldMode('ponchi'));
document.getElementById('meld-minkan').addEventListener('click', () => setMeldMode('minkan'));
document.getElementById('meld-ankan').addEventListener('click', () => setMeldMode('ankan'));

document.getElementById('btn-clear').addEventListener('click', () => {
  handTiles = []; doraIndicators = []; uraDoraIndicators = []; winningTile = null;
  meldGroups = []; clearMeldMode();
  tileUsage = {}; // 重置牌使用量
  if (doraMode) { doraMode = false; }
  const omoteBtn = document.getElementById('dora-mode-btn');
  const uraBtn = document.getElementById('ura-dora-mode-btn');
  omoteBtn.classList.remove('active'); omoteBtn.textContent = '選択';
  uraBtn.classList.remove('active'); uraBtn.textContent = '選択';
  renderHand(); renderMelds(); renderWinningTile(); renderDoraIndicators(); renderUraDoraIndicators(); renderDoraResult(); updateButtonStates();
  const panel = document.getElementById('result-panel');
  if (panel) panel.classList.remove('show');
});

document.getElementById('btn-tsumo').addEventListener('click', () => calculate(true));
document.getElementById('btn-ron').addEventListener('click', () => calculate(false));

// ============ 役种一览悬浮窗 ============
const YAKU_LIST = [
  { han: '1番', yaku: ['立直', '一発', '門前清自摸和', '平和', '断幺九', '役牌 場風', '役牌 自風', '役牌 白/發/中', '一盃口', '嶺上開花', '海底撈月', '河底撈魚', '搶槓'] },
  { han: '2番', yaku: ['両立直', '対々和', '三暗刻', '三色同順', '一気通貫', '小三元'] },
  { han: '3番', yaku: ['混一色'] },
  { han: '6番', yaku: ['清一色'] },
  { han: '役満', yaku: ['大三元 (13番)', '天和 (13番)', '地和 (13番)'] },
  { han: '宝牌', yaku: ['表宝牌 (+1/枚)', '裏宝牌 (+1/枚)', '赤宝牌 (+1/枚)'] },
];

function renderYakuTable() {
  const body = document.getElementById('modal-body');
  let html = '<table class="yaku-table"><thead><tr><th>番数</th><th>役种</th></tr></thead><tbody>';
  for (const row of YAKU_LIST) {
    html += '<tr><td class="han-col">' + row.han + '</td><td>' + row.yaku.join('、') + '</td></tr>';
  }
  html += '</tbody></table>';
  html += '<p style="color:#667;font-size:0.8em;margin-top:12px">注：立直/一発/両立直/嶺上/海底/河底/搶槓/天和/地和需手动勾选</p>';
  body.innerHTML = html;
}

document.getElementById('yaku-list-btn').addEventListener('click', () => {
  document.getElementById('yaku-modal').classList.add('show');
  renderYakuTable();
});

document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('yaku-modal').classList.remove('show');
});

document.getElementById('yaku-modal').addEventListener('click', (e) => {
  if (e.target.id === 'yaku-modal') document.getElementById('yaku-modal').classList.remove('show');
});

// ============ 初始化 ============
renderPool(); renderHand(); renderMelds(); renderWinningTile(); renderDoraIndicators(); renderUraDoraIndicators(); updateButtonStates();
