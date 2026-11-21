async function loadMealsData(shouldRender = true) {
  const data = await apiGet({ api: 'meals' });
  mealData = data.entries || [];
  if (shouldRender) {
    renderNutritionView();
    if (diaryData.length > 0) renderDiary();
  }
}


function renderNutritionView() {
  const sumEl = document.getElementById('nutrition-summary');
  const listEl = document.getElementById('nutrition-list');
  const countEl = document.getElementById('nutrition-count');
  const asukenEl = document.getElementById('asuken-history-list');
  const asukenSumEl = document.getElementById('asuken-history-summary');

  const diarySummaryEntries = diaryData.filter(d =>
    (d.calories !== '' && d.calories !== undefined && d.calories !== null) || d.mealType || d.nutritionAdvice
  );

  // 直近7日間の日付リスト生成
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(today.getTime() - i * 86400000);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    days.push(iso);
  }
  const dayTotals = {};
  days.forEach(d => { dayTotals[d] = { kcal: 0, p: 0, f: 0, c: 0, count: 0, hasUnit: false }; });

  // 食事単位DB（mealData）を優先集計
  mealData.forEach(m => {
    if (dayTotals[m.date]) {
      dayTotals[m.date].kcal += Number(m.calories || 0);
      dayTotals[m.date].p += Number(m.protein || 0);
      dayTotals[m.date].f += Number(m.fat || 0);
      dayTotals[m.date].c += Number(m.carbs || 0);
      dayTotals[m.date].count++;
      dayTotals[m.date].hasUnit = true;
    }
  });
  // 食事単位DBがない日は日記DBの1日まとめで補完
  diarySummaryEntries.forEach(d => {
    if (dayTotals[d.date] && !dayTotals[d.date].hasUnit) {
      dayTotals[d.date].kcal += Number(d.calories || 0);
      dayTotals[d.date].p += Number(d.protein || 0);
      dayTotals[d.date].f += Number(d.fat || 0);
      dayTotals[d.date].c += Number(d.carbs || 0);
      dayTotals[d.date].count++;
    }
  });

  let weekKcal = 0, weekP = 0, weekF = 0, weekC = 0, weekDaysWithData = 0;
  days.forEach(d => {
    const v = dayTotals[d];
    if (v.count > 0) {
      weekDaysWithData++;
      weekKcal += v.kcal; weekP += v.p; weekF += v.f; weekC += v.c;
    }
  });

  const maxKcal = Math.max(2200, ...days.map(d => dayTotals[d].kcal));
  const avgKcal = weekDaysWithData ? Math.round(weekKcal / weekDaysWithData) : 0;
  const pEn = weekP * 4, fEn = weekF * 9, cEn = weekC * 4;
  const totEn = pEn + fEn + cEn || 1;
  const pPct = Math.round((pEn / totEn) * 100);
  const fPct = Math.round((fEn / totEn) * 100);
  const cPct = Math.max(0, 100 - pPct - fPct);

  const barsHtml = days.map(d => {
    const k = dayTotals[d].kcal;
    const w = Math.min(100, Math.round((k / maxKcal) * 100));
    const color = k > 2200 ? '#ef4444' : k > 0 ? '#0f9d58' : '#d1d5db';
    return `
      <div class="nut-bar-row">
        <div class="nut-bar-label">${d.slice(5)}</div>
        <div class="nut-bar-track"><div class="nut-bar-fill" style="width:${w}%;background:${color};"></div></div>
        <div class="nut-bar-val">${k ? k + ' kcal' : '-'}</div>
      </div>`;
  }).join('');

  sumEl.innerHTML = `
    <div style="font-size:13px;margin-bottom:8px;">
      週間平均（記録日 ${weekDaysWithData}日）: <strong>${avgKcal} kcal/日</strong>
    </div>
    ${barsHtml}
    <div style="margin-top:10px;font-size:12px;color:var(--muted);">
      週間PFC比率（目標目安 P:15% / F:25% / C:60%）:
      <strong>P ${pPct}% (${Math.round(weekP)}g) ・ F ${fPct}% (${Math.round(weekF)}g) ・ C ${cPct}% (${Math.round(weekC)}g)</strong>
    </div>
    <div class="pfc-ratio-bar">
      <div style="width:${pPct}%;background:#3b82f6;" title="タンパク質"></div>
      <div style="width:${fPct}%;background:#f59e0b;" title="脂質"></div>
      <div style="width:${cPct}%;background:#10b981;" title="炭水化物"></div>
    </div>`;

  // 日別・食事区分順（朝食→昼食→夕食→間食）セット描画
  const grouped = {};
  mealData.forEach(m => {
    if (!grouped[m.date]) grouped[m.date] = [];
    grouped[m.date].push(m);
  });
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  countEl.textContent = `食事単位セット記録: ${mealData.length}食（${sortedDates.length}日分）`;
  if (sortedDates.length === 0) {
    listEl.innerHTML = '<div class="loading">食事単位セットはまだ登録されていません。「＋ 食事を記録」またはデータ移行から追加できます。</div>';
  } else {
    listEl.innerHTML = sortedDates.map(date => {
      const items = grouped[date].sort((a, b) => (MEAL_ORDER[a.mealType] || 9) - (MEAL_ORDER[b.mealType] || 9));
      const dKcal = items.reduce((s, x) => s + Number(x.calories || 0), 0);
      const dP = Math.round(items.reduce((s, x) => s + Number(x.protein || 0), 0));
      const dF = Math.round(items.reduce((s, x) => s + Number(x.fat || 0), 0));
      const dC = Math.round(items.reduce((s, x) => s + Number(x.carbs || 0), 0));
      const dSugar = Math.round(items.reduce((s, x) => s + Number(x.sugar || 0), 0) * 10) / 10;
      const dFiber = Math.round(items.reduce((s, x) => s + Number(x.fiber || 0), 0) * 10) / 10;
      const dSalt = Math.round(items.reduce((s, x) => s + Number(x.salt || 0), 0) * 10) / 10;
      const hasAnySubCarb = items.some(x => (x.sugar !== '' && x.sugar !== undefined) || (x.fiber !== '' && x.fiber !== undefined));
      const subCarbSum = hasAnySubCarb ? ` [糖:${dSugar} 繊:${dFiber}]` : '';
      const rowsHtml = items.map(m => {
        const mtClass = m.mealType === '朝食' ? 'mt-朝' : m.mealType === '昼食' ? 'mt-昼' : m.mealType === '夕食' ? 'mt-夕' : 'mt-間';
        const hasPfc = m.protein !== '' || m.fat !== '' || m.carbs !== '';
        const subCarbParts = [
          m.sugar !== '' && m.sugar !== undefined ? `糖質:${esc(m.sugar)}g` : '',
          m.fiber !== '' && m.fiber !== undefined ? `繊維:${esc(m.fiber)}g` : '',
        ].filter(Boolean).join(' ');
        const subCarbText = subCarbParts ? ` [${subCarbParts}]` : '';
        const saltPart = m.salt !== '' && m.salt !== undefined ? ` / 塩分:${esc(m.salt)}g` : '';
        return `
          <div class="meal-set-row">
            <div style="flex:1;min-width:0;">
              <div>
                <span class="meal-type-pill ${mtClass}">${esc(m.mealType)}</span>
                <strong style="font-size:14px;">${esc(m.dishName)}</strong>
              </div>
              <div style="font-size:12px;color:#047857;font-weight:600;margin-top:2px;">
                ${m.calories !== '' ? `${esc(m.calories)} kcal` : 'カロリー未設定'}
                ${hasPfc ? `（P:${esc(m.protein || 0)}g / F:${esc(m.fat || 0)}g / C:${esc(m.carbs || 0)}g${subCarbText}${saltPart}）` : (subCarbText || saltPart ? `（${[subCarbParts, saltPart.replace(/^ \/ /, '')].filter(Boolean).join(' / ')}）` : '')}
              </div>
              ${m.memo ? `<div style="font-size:12px;color:var(--muted);margin-top:2px;">${esc(m.memo)}</div>` : ''}
            </div>
            <button class="btn-sm" onclick="openEditMealModal(${m.row}, '${esc(m.id)}')">✏️</button>
          </div>`;
      }).join('');
      return `
        <div class="card" id="meal-day-${esc(date)}">
          <div class="meal-day-head">
            <span>📅 ${esc(date)}</span>
            <button class="btn-sm primary" onclick="goToDiaryDate('${esc(date)}')">📓 日記を見る</button>
          </div>
          <div style="font-size:12px;color:#047857;font-weight:700;margin-bottom:6px;">
            合計: ${dKcal} kcal (P:${dP} F:${dF} C:${dC}${subCarbSum} 塩分:${dSalt}g)
          </div>
          ${rowsHtml}
        </div>`;
    }).join('');
  }

  // 〜2026-11-11 あすけん1日まとめ履歴（既存データ保持表示）
  asukenSumEl.textContent = `📊 1日まとめ履歴（〜2026-11-11 あすけん移行分等: ${diarySummaryEntries.length}日分）`;
  asukenEl.innerHTML = diarySummaryEntries.slice(0, 130).map(d => `
    <div class="card" style="padding:10px 12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;">
        <strong>${esc(d.date)} (${esc(d.weekday)}) ${esc(d.mealType || '1日まとめ')}</strong>
        <strong style="color:#047857;">${esc(d.calories)} kcal</strong>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px;">
        P:${esc(d.protein || 0)}g / F:${esc(d.fat || 0)}g / C:${esc(d.carbs || 0)}g ${d.nutritionAdvice ? `| ${esc(d.nutritionAdvice)}` : ''}
      </div>
    </div>`).join('');
}


function openMealModal(presetDate) {
  editingMeal = null;
  document.getElementById('meal-modal-title').textContent = '🍽️ 食事を記録';
  document.getElementById('btn-save-meal').textContent = '食事を保存する';
  document.getElementById('btn-delete-meal').style.display = 'none';
  document.getElementById('m-date').value = presetDate || getLocalTodayIso();
  document.getElementById('m-type').value = '昼食';
  document.getElementById('m-dish').value = '';
  document.getElementById('m-cal').value = '';
  document.getElementById('m-p').value = '';
  document.getElementById('m-f').value = '';
  document.getElementById('m-c').value = '';
  document.getElementById('m-sugar').value = '';
  document.getElementById('m-fiber').value = '';
  document.getElementById('m-salt').value = '';
  document.getElementById('m-memo').value = '';
  document.getElementById('modal-meal').classList.add('open');
}

function openEditMealModal(row, id) {
  const m = mealData.find(x => (row && x.row === row) || String(x.id) === String(id));
  if (!m) return;
  editingMeal = m;
  document.getElementById('meal-modal-title').textContent = '✏️ 食事記録を編集';
  document.getElementById('btn-save-meal').textContent = '変更を保存する';
  document.getElementById('btn-delete-meal').style.display = 'block';
  document.getElementById('m-date').value = m.date || '';
  document.getElementById('m-type').value = m.mealType || '昼食';
  document.getElementById('m-dish').value = m.dishName || '';
  document.getElementById('m-cal').value = m.calories !== '' && m.calories !== undefined ? m.calories : '';
  document.getElementById('m-p').value = m.protein !== '' && m.protein !== undefined ? m.protein : '';
  document.getElementById('m-f').value = m.fat !== '' && m.fat !== undefined ? m.fat : '';
  document.getElementById('m-c').value = m.carbs !== '' && m.carbs !== undefined ? m.carbs : '';
  document.getElementById('m-sugar').value = m.sugar !== '' && m.sugar !== undefined ? m.sugar : '';
  document.getElementById('m-fiber').value = m.fiber !== '' && m.fiber !== undefined ? m.fiber : '';
  document.getElementById('m-salt').value = m.salt !== '' && m.salt !== undefined ? m.salt : '';
  document.getElementById('m-memo').value = m.memo || '';
  document.getElementById('modal-meal').classList.add('open');
}

async function estimateMealModal() {
  const dish = document.getElementById('m-dish').value.trim();
  if (!dish) { alert('料理名を入力してください'); return; }
  const btn = document.getElementById('btn-m-est');
  btn.disabled = true; btn.textContent = '推定中...';
  try {
    const res = await apiPost('analyzeMeal', {
      title: dish,
      body: `${dish} ${document.getElementById('m-memo').value}`,
      mealType: document.getElementById('m-type').value,
      save: false,
    });
    if (res && res.ok && res.analysis) {
      const a = res.analysis;
      document.getElementById('m-cal').value = a.calories !== undefined ? a.calories : '';
      document.getElementById('m-p').value = a.protein !== undefined ? a.protein : '';
      document.getElementById('m-f').value = a.fat !== undefined ? a.fat : '';
      document.getElementById('m-c').value = a.carbs !== undefined ? a.carbs : '';
      if (!document.getElementById('m-memo').value.trim() && a.advice) {
        document.getElementById('m-memo').value = a.advice;
      }
    }
  } catch (err) {
    alert(`推定エラー: ${err.message || err}`);
  } finally {
    btn.disabled = false; btn.textContent = '✨ 推定';
  }
}

function sortMealsList(arr) {
  return arr.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (MEAL_ORDER[a.mealType] || 9) - (MEAL_ORDER[b.mealType] || 9) || Number(a.id || 0) - Number(b.id || 0);
  });
}

async function submitMeal() {
  const dishName = document.getElementById('m-dish').value.trim();
  if (!dishName) { alert('料理名を入力してください'); return; }

  const isEdit = Boolean(editingMeal);
  const targetMeal = editingMeal;
  const payload = {
    date: document.getElementById('m-date').value,
    mealType: document.getElementById('m-type').value,
    dishName,
    calories: document.getElementById('m-cal').value,
    protein: document.getElementById('m-p').value,
    fat: document.getElementById('m-f').value,
    carbs: document.getElementById('m-c').value,
    sugar: document.getElementById('m-sugar').value,
    fiber: document.getElementById('m-fiber').value,
    salt: document.getElementById('m-salt').value,
    memo: document.getElementById('m-memo').value,
  };
  if (isEdit) {
    payload.row = targetMeal.row;
    payload.id = targetMeal.id;
  }

  // 楽観的更新：即座にモーダルを閉じて画面へ仮反映
  const snapshot = mealData.map(x => ({ ...x }));
  const tempKey = isEdit ? targetMeal.id : `temp-${Date.now()}`;
  const optimisticItem = {
    row: isEdit ? targetMeal.row : 0,
    id: tempKey,
    date: payload.date,
    mealType: payload.mealType,
    dishName: payload.dishName,
    calories: payload.calories !== '' ? Number(payload.calories) : '',
    protein: payload.protein !== '' ? Number(payload.protein) : '',
    fat: payload.fat !== '' ? Number(payload.fat) : '',
    carbs: payload.carbs !== '' ? Number(payload.carbs) : '',
    sugar: payload.sugar !== '' ? Number(payload.sugar) : '',
    fiber: payload.fiber !== '' ? Number(payload.fiber) : '',
    salt: payload.salt !== '' ? Number(payload.salt) : '',
    memo: payload.memo,
    source: isEdit ? targetMeal.source : 'webapp',
  };
  if (isEdit) {
    const idx = mealData.findIndex(x => (targetMeal.row && x.row === targetMeal.row) || String(x.id) === String(targetMeal.id));
    if (idx >= 0) mealData[idx] = optimisticItem;
  } else {
    mealData.push(optimisticItem);
  }
  sortMealsList(mealData);
  editingMeal = null;
  closeModals();
  renderNutritionView();
  if (diaryData.length > 0) renderDiary();
  showToast('食事記録を保存中...', 'info', null, 0);

  const sendMeal = async () => {
    try {
      const res = await apiPost(isEdit ? 'updateMeal' : 'addMeal', payload);
      if (!res || !res.ok || !res.entry) throw new Error((res && res.error) || '保存に失敗しました');
      const idx = mealData.findIndex(x => String(x.id) === String(tempKey) || (res.entry.row && x.row === res.entry.row));
      if (idx >= 0) mealData[idx] = res.entry;
      else mealData.push(res.entry);
      sortMealsList(mealData);
      renderNutritionView();
      if (diaryData.length > 0) renderDiary();
      showToast('食事記録を保存しました', 'success', null, 2200);
    } catch (err) {
      mealData = snapshot;
      renderNutritionView();
      if (diaryData.length > 0) renderDiary();
      showToast(`食事保存失敗（元に戻しました）: ${err.message || err}`, 'error', () => {
        mealData = isEdit
          ? snapshot.map(x => ((targetMeal.row && x.row === targetMeal.row) || String(x.id) === String(targetMeal.id)) ? optimisticItem : x)
          : sortMealsList([...snapshot, optimisticItem]);
        renderNutritionView();
        sendMeal();
      }, 0);
    }
  };
  sendMeal();
}

async function deleteCurrentMeal() {
  if (!editingMeal) return;
  if (!confirm(`「${editingMeal.date} ${editingMeal.mealType}: ${editingMeal.dishName}」を削除しますか？`)) return;
  const target = editingMeal;
  const snapshot = mealData.map(x => ({ ...x }));
  mealData = mealData.filter(x => !(target.row && x.row === target.row) && String(x.id) !== String(target.id));
  editingMeal = null;
  closeModals();
  renderNutritionView();
  if (diaryData.length > 0) renderDiary();
  showToast('食事記録を削除中...', 'info', null, 0);

  try {
    const res = await apiPost('deleteMeal', { row: target.row, id: target.id });
    if (!res || !res.ok) throw new Error((res && res.error) || '削除に失敗しました');
    showToast('食事記録を削除しました', 'success', null, 2200);
  } catch (err) {
    mealData = snapshot;
    renderNutritionView();
    if (diaryData.length > 0) renderDiary();
    showToast(`削除失敗（元に戻しました）: ${err.message || err}`, 'error', null, 5000);
  }
}


async function analyzeMealInModal() {
  const title = document.getElementById('d-title').value.trim();
  const body = document.getElementById('d-body').value.trim();
  const imageIds = editingDiary ? (editingDiary.imageIds || []) : [];
  if (!title && !body && imageIds.length === 0) {
    alert('分析する本文または写真が必要です');
    return;
  }
  const btn = document.getElementById('btn-analyze-meal');
  btn.disabled = true; btn.textContent = '分析中...';
  try {
    const res = await apiPost('analyzeMeal', {
      title, body, imageIds,
      mealType: document.getElementById('d-meal-type').value,
      save: false,
    });
    if (res && res.ok && res.analysis) {
      const a = res.analysis;
      document.getElementById('d-meal-type').value = a.mealType || '昼食';
      document.getElementById('d-cal').value = a.calories !== undefined ? a.calories : '';
      document.getElementById('d-p').value = a.protein !== undefined ? a.protein : '';
      document.getElementById('d-f').value = a.fat !== undefined ? a.fat : '';
      document.getElementById('d-c').value = a.carbs !== undefined ? a.carbs : '';
      document.getElementById('d-nut-advice').value = a.advice || '';
    } else {
      alert('栄養分析に失敗しました');
    }
  } finally {
    btn.disabled = false; btn.textContent = '✨ 本文・写真から自動分析';
  }
}

async function quickAnalyzeMeal(row, id) {
  const entry = diaryData.find(x => (row && x.row === row) || String(x.id) === String(id));
  if (!entry) return;
  const card = document.getElementById(`dcard-${Number(entry.row || 0)}`);
  if (card) card.style.opacity = '0.6';
  try {
    const res = await apiPost('analyzeMeal', {
      row: entry.row,
      id: entry.id,
      title: entry.title,
      body: entry.body,
      imageIds: entry.imageIds || [],
      mealType: entry.mealType || '',
      save: true,
    });
    if (res && res.ok && res.entry) {
      const idx = diaryData.findIndex(x => (res.entry.row && x.row === res.entry.row) || String(x.id) === String(res.entry.id));
      if (idx >= 0) diaryData[idx] = res.entry;
      renderDiary();
      if (document.getElementById('view-nutrition').style.display !== 'none') renderNutritionView();
    } else {
      alert('栄養分析に失敗しました');
    }
  } finally {
    if (card) card.style.opacity = '1';
  }
}

