// ============================================================
// Avant la Paie - v2
// Gestion de revenus multiples + enveloppes de dépenses
// ============================================================

const STORE_KEY = 'avantlapaie.v2';
const STORE_KEY_OLD = 'avantlapaie.v1';

// Presets pour ENVELOPPES (dépenses)
const PRESETS_ENV = [
  { emoji: '🏠', name: 'Loyer / Hypothèque' },
  { emoji: '🛒', name: 'Épicerie' },
  { emoji: '⚡', name: 'Électricité' },
  { emoji: '📱', name: 'Téléphone' },
  { emoji: '🌐', name: 'Internet' },
  { emoji: '🚗', name: 'Transport' },
  { emoji: '⛽', name: 'Essence' },
  { emoji: '💊', name: 'Médicaments' },
  { emoji: '🏥', name: 'Santé' },
  { emoji: '🎉', name: 'Plaisir' },
  { emoji: '☕', name: 'Café / Resto' },
  { emoji: '💰', name: 'Épargne' },
  { emoji: '🎁', name: 'Cadeaux' },
  { emoji: '👶', name: 'Enfants' },
  { emoji: '🐾', name: 'Animaux' }
];

// Presets pour REVENUS
const PRESETS_REV = [
  { emoji: '💼', name: 'Paie principale' },
  { emoji: '💵', name: 'Paie secondaire' },
  { emoji: '🏛️', name: 'Allocation famille' },
  { emoji: '👶', name: 'Soutien aux enfants' },
  { emoji: '📊', name: 'Aide sociale' },
  { emoji: '🤝', name: 'Pension alimentaire' },
  { emoji: '💸', name: 'Travail à côté' },
  { emoji: '🎯', name: 'Contrat ponctuel' },
  { emoji: '🎁', name: 'Cadeau / Remboursement' },
  { emoji: '📈', name: 'Placement / Dividende' },
  { emoji: '🏖️', name: 'Pension / Retraite' }
];

const EMOJIS_ENV = ['🏠','🛒','⚡','💧','📱','🌐','🚗','⛽','💊','🏥','🎉','☕','💰','🎁','👶','🐾','📚','👕','🎮','✈️','🍕','🧾'];
const EMOJIS_REV = ['💼','💵','💰','🏛️','📊','🤝','💸','🎯','🎁','📈','🏖️','👶','📱','🏠','🎨','✨','💎','🪙'];

// État
let state = {
  revenus: [],     // { id, emoji, name, amount, date, received }
  envelopes: []    // { id, emoji, name, amount, allocated }
};

let editing = { type: null, id: null }; // type: 'revenu' | 'envelope'
let selectedEmoji = '💼';

// =======================================================
// Persistance
// =======================================================
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      state = Object.assign(state, JSON.parse(raw));
      return;
    }
    // Migration v1 -> v2 si données existent
    const oldRaw = localStorage.getItem(STORE_KEY_OLD);
    if (oldRaw) {
      const old = JSON.parse(oldRaw);
      if (old.income && old.income > 0) {
        state.revenus.push({
          id: 'r_' + Date.now(),
          emoji: '💼',
          name: 'Paie principale',
          amount: old.income,
          date: old.payDate || '',
          received: false
        });
      }
      if (old.envelopes) state.envelopes = old.envelopes;
      save();
    }
  } catch(e) {}
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

// =======================================================
// Utilitaires
// =======================================================
function fmt(n) {
  if (isNaN(n)) n = 0;
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 2
  }).format(n);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function formatDateShort(dStr) {
  if (!dStr) return '';
  const d = new Date(dStr + 'T00:00:00');
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
}

function daysUntil(dStr) {
  if (!dStr) return null;
  const target = new Date(dStr + 'T00:00:00');
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((target - now) / 86400000);
}

// =======================================================
// Rendu principal
// =======================================================
function render() {
  // Date du jour
  const today = new Date();
  document.getElementById('todayDate').textContent =
    today.toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });

  // ---------- REVENUS ----------
  const totalRevenus = state.revenus.reduce((s,r) => s + (parseFloat(r.amount)||0), 0);
  const receivedCount = state.revenus.filter(r => r.received).length;

  document.getElementById('revenusCount').textContent =
    `${receivedCount} / ${state.revenus.length} reçus`;

  const totalBox = document.getElementById('totalRevenusBox');
  if (state.revenus.length > 0) {
    totalBox.style.display = 'block';
    document.getElementById('totalRevenusAmount').textContent = fmt(totalRevenus);

    // Trouver la prochaine paie à venir
    const upcoming = state.revenus
      .filter(r => r.date && !r.received)
      .map(r => ({ ...r, days: daysUntil(r.date) }))
      .filter(r => r.days !== null && r.days >= 0)
      .sort((a,b) => a.days - b.days);

    const cd = document.getElementById('countdown');
    if (upcoming.length > 0) {
      const next = upcoming[0];
      if (next.days > 0) {
        cd.innerHTML = `Prochain revenu : ${escapeHtml(next.name)} dans <b>${next.days} jour${next.days>1?'s':''}</b>`;
      } else {
        cd.innerHTML = `<b>${escapeHtml(next.name)} est prévu aujourd'hui!</b>`;
      }
    } else if (state.revenus.every(r => r.received)) {
      cd.innerHTML = `Tous les revenus sont reçus 🎉`;
    } else {
      cd.innerHTML = `Ajoute une date pour suivre les paies à venir`;
    }
  } else {
    totalBox.style.display = 'none';
  }

  const revBox = document.getElementById('revenusList');
  revBox.innerHTML = '';
  state.revenus.forEach(r => {
    const days = daysUntil(r.date);
    let when = '';
    if (r.date) {
      if (days === 0) when = `<span class="when">aujourd'hui</span>`;
      else if (days > 0) when = `<span class="when">dans ${days}j</span>`;
      else when = `<span class="when">${formatDateShort(r.date)}</span>`;
    }
    const div = document.createElement('div');
    div.className = 'item' + (r.received ? ' received' : '');
    div.innerHTML = `
      <div class="item-emoji">${r.emoji}</div>
      <div class="item-info">
        <div class="item-name">${escapeHtml(r.name)}</div>
        <div class="item-amount"><strong class="green">${fmt(r.amount)}</strong>${when}</div>
      </div>
      <div class="item-actions">
        <button class="icon-btn check ${r.received?'on':''}" data-rev-toggle="${r.id}" title="Marquer reçu">${r.received?'✓':'○'}</button>
        <button class="icon-btn" data-rev-edit="${r.id}" title="Modifier">✎</button>
      </div>
    `;
    revBox.appendChild(div);
  });

  // ---------- RESTE À ALLOUER ----------
  const totalAlloc = state.envelopes.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
  const remain = totalRevenus - totalAlloc;

  const amountEl = document.getElementById('remainingAmount');
  const subEl = document.getElementById('remainingSub');
  amountEl.textContent = fmt(remain);
  amountEl.classList.remove('good','warn','over');

  if (state.revenus.length === 0) {
    subEl.textContent = 'Commence par ajouter tes revenus ci-dessus';
  } else if (remain < 0) {
    amountEl.classList.add('over');
    subEl.textContent = `Tu dépasses tes revenus de ${fmt(-remain)} — réduis une enveloppe`;
  } else if (remain === 0) {
    amountEl.classList.add('good');
    subEl.textContent = 'Chaque dollar a une mission. Bravo. 🎯';
  } else if (totalRevenus > 0 && remain < totalRevenus * 0.1) {
    amountEl.classList.add('good');
    subEl.textContent = 'Presque tout est attribué — il reste un petit coussin';
  } else {
    amountEl.classList.add('warn');
    subEl.textContent = 'Continue à répartir avant que la paie arrive';
  }

  const pct = totalRevenus > 0 ? Math.min(100, (totalAlloc / totalRevenus) * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';

  // ---------- ENVELOPPES ----------
  const envBox = document.getElementById('envelopesList');
  envBox.innerHTML = '';

  if (state.envelopes.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:18px;text-align:center;color:var(--ink-soft);font-style:italic;font-size:13px;';
    empty.textContent = 'Aucune enveloppe encore.';
    envBox.appendChild(empty);
  } else {
    state.envelopes.forEach(env => {
      const div = document.createElement('div');
      div.className = 'item' + (env.allocated ? ' allocated' : '');
      div.innerHTML = `
        <div class="item-emoji">${env.emoji}</div>
        <div class="item-info">
          <div class="item-name">${escapeHtml(env.name)}</div>
          <div class="item-amount">${fmt(env.amount)}</div>
        </div>
        <div class="item-actions">
          <button class="icon-btn check ${env.allocated?'on':''}" data-env-toggle="${env.id}" title="Marquer déposée">${env.allocated?'✓':'○'}</button>
          <button class="icon-btn" data-env-edit="${env.id}" title="Modifier">✎</button>
        </div>
      `;
      envBox.appendChild(div);
    });
  }

  const allocCount = state.envelopes.filter(e => e.allocated).length;
  document.getElementById('envCount').textContent =
    `${allocCount} / ${state.envelopes.length} déposées`;

  save();
}

// =======================================================
// Modal
// =======================================================
function openModal(type, item = null) {
  editing = { type, id: item ? item.id : null };

  const isRev = type === 'revenu';
  const emojis = isRev ? EMOJIS_REV : EMOJIS_ENV;
  const presets = isRev ? PRESETS_REV : PRESETS_ENV;

  selectedEmoji = item ? item.emoji : (isRev ? '💼' : '🏠');

  // Titre
  const title = item ? (isRev ? 'Modifier le revenu' : 'Modifier l\'enveloppe')
                     : (isRev ? 'Nouveau revenu' : 'Nouvelle enveloppe');
  const badge = isRev ? '<span class="badge green">Revenu</span>' : '<span class="badge">Dépense</span>';
  document.getElementById('modalTitle').innerHTML = title + ' ' + badge;

  // Labels
  document.getElementById('nameLabel').textContent = isRev ? 'Source du revenu' : 'Nom de l\'enveloppe';
  document.getElementById('amountLabel').textContent = isRev ? 'Montant prévu' : 'Montant à mettre de côté';
  document.getElementById('dateField').style.display = isRev ? 'block' : 'none';
  document.getElementById('presetsLabel').textContent = isRev ? 'Sources rapides' : 'Suggestions rapides';

  // Placeholder
  document.getElementById('itemName').placeholder = isRev ? 'ex. Paie principale' : 'ex. Épicerie';

  // Bouton primaire couleur
  const primary = document.getElementById('saveBtn');
  primary.classList.toggle('green', isRev);

  // Pré-remplir
  document.getElementById('itemName').value = item ? item.name : '';
  document.getElementById('itemAmount').value = item ? item.amount : '';
  document.getElementById('itemDate').value = item && item.date ? item.date : '';
  document.getElementById('deleteBtn').style.display = item ? 'block' : 'none';

  renderEmojiPick(emojis, isRev);
  renderPresets(presets);

  document.getElementById('modal').classList.add('show');

  // Mettre à jour le bouton date
  updateDateButton();
}

// =======================================================
// Calendrier custom
// =======================================================
let calCurrentMonth = new Date();
calCurrentMonth.setDate(1);

function updateDateButton() {
  const val = document.getElementById('itemDate').value;
  const btn = document.getElementById('itemDateBtn');
  const lbl = document.getElementById('itemDateLabel');
  if (val) {
    const d = new Date(val + 'T00:00:00');
    lbl.textContent = d.toLocaleDateString('fr-CA', {
      weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'
    });
    btn.classList.remove('empty');
  } else {
    lbl.textContent = 'Choisir une date';
    btn.classList.add('empty');
  }
}

function openCalendar() {
  // Initialiser le mois affiché sur la date sélectionnée si elle existe, sinon aujourd'hui
  const val = document.getElementById('itemDate').value;
  if (val) {
    const d = new Date(val + 'T00:00:00');
    calCurrentMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  } else {
    const today = new Date();
    calCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  }
  renderCalendar();
  document.getElementById('calOverlay').classList.add('show');
}

function closeCalendar() {
  document.getElementById('calOverlay').classList.remove('show');
}

function renderCalendar() {
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const year = calCurrentMonth.getFullYear();
  const month = calCurrentMonth.getMonth();
  document.getElementById('calTitle').textContent = `${months[month]} ${year}`;

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  // Premier jour du mois
  const firstDay = new Date(year, month, 1);
  // Lundi = 0, Dimanche = 6 (ajustement pour FR)
  let startWeekday = firstDay.getDay() - 1;
  if (startWeekday < 0) startWeekday = 6;

  // Jours du mois précédent
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'cal-day other';
    d.textContent = prevMonthLastDay - i;
    d.disabled = true;
    grid.appendChild(d);
  }

  // Jours du mois courant
  const lastDay = new Date(year, month + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);
  const selectedVal = document.getElementById('itemDate').value;
  const selected = selectedVal ? new Date(selectedVal + 'T00:00:00') : null;

  for (let d = 1; d <= lastDay; d++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-day';
    btn.textContent = d;

    const thisDate = new Date(year, month, d);
    if (thisDate.getTime() === today.getTime()) btn.classList.add('today');
    if (selected && thisDate.getTime() === selected.getTime()) btn.classList.add('selected');

    btn.onclick = () => {
      const yyyy = year;
      const mm = String(month + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      document.getElementById('itemDate').value = `${yyyy}-${mm}-${dd}`;
      updateDateButton();
      closeCalendar();
    };
    grid.appendChild(btn);
  }

  // Jours du mois suivant pour compléter la dernière ligne
  const totalCells = grid.children.length;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'cal-day other';
    d.textContent = i;
    d.disabled = true;
    grid.appendChild(d);
  }
}

document.getElementById('itemDateBtn').addEventListener('click', function(e) {
  e.preventDefault();
  e.stopPropagation();
  openCalendar();
});
document.getElementById('calOverlay').addEventListener('click', function(e) {
  if (e.target.id === 'calOverlay') closeCalendar();
});
document.getElementById('calClose').addEventListener('click', closeCalendar);
document.getElementById('calPrev').addEventListener('click', function(e) {
  e.preventDefault();
  calCurrentMonth.setMonth(calCurrentMonth.getMonth() - 1);
  renderCalendar();
});
document.getElementById('calNext').addEventListener('click', function(e) {
  e.preventDefault();
  calCurrentMonth.setMonth(calCurrentMonth.getMonth() + 1);
  renderCalendar();
});
document.getElementById('calToday').addEventListener('click', function(e) {
  e.preventDefault();
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  document.getElementById('itemDate').value = `${yyyy}-${mm}-${dd}`;
  updateDateButton();
  closeCalendar();
});
document.getElementById('calClear').addEventListener('click', function(e) {
  e.preventDefault();
  document.getElementById('itemDate').value = '';
  updateDateButton();
  closeCalendar();
});

function closeModal() {
  document.getElementById('modal').classList.remove('show');
  editing = { type: null, id: null };
}

function renderEmojiPick(emojis, isRev) {
  const box = document.getElementById('emojiPick');
  box.innerHTML = '';
  emojis.forEach(em => {
    const b = document.createElement('button');
    b.textContent = em;
    if (em === selectedEmoji) {
      b.classList.add('sel');
      if (isRev) b.classList.add('green');
    }
    b.onclick = (e) => {
      e.preventDefault();
      selectedEmoji = em;
      renderEmojiPick(emojis, isRev);
    };
    box.appendChild(b);
  });
}

function renderPresets(presets) {
  const row = document.getElementById('presetRow');
  row.innerHTML = '';
  presets.forEach(p => {
    const c = document.createElement('button');
    c.className = 'preset-chip';
    c.textContent = `${p.emoji} ${p.name}`;
    c.onclick = (e) => {
      e.preventDefault();
      document.getElementById('itemName').value = p.name;
      selectedEmoji = p.emoji;
      const isRev = editing.type === 'revenu';
      const emojis = isRev ? EMOJIS_REV : EMOJIS_ENV;
      renderEmojiPick(emojis, isRev);
    };
    row.appendChild(c);
  });
}

// =======================================================
// Events
// =======================================================
document.getElementById('addRevenuBtn').onclick = () => openModal('revenu');
document.getElementById('addEnvBtn').onclick = () => openModal('envelope');
document.getElementById('cancelBtn').onclick = closeModal;

document.getElementById('saveBtn').onclick = () => {
  const name = document.getElementById('itemName').value.trim();
  const amount = parseFloat(document.getElementById('itemAmount').value) || 0;
  const date = document.getElementById('itemDate').value;
  if (!name) { alert('Donne un nom'); return; }

  if (editing.type === 'revenu') {
    if (editing.id) {
      const r = state.revenus.find(x => x.id === editing.id);
      if (r) { r.name = name; r.amount = amount; r.emoji = selectedEmoji; r.date = date; }
    } else {
      state.revenus.push({
        id: 'r_' + Date.now() + Math.random().toString(36).slice(2,6),
        emoji: selectedEmoji, name, amount, date,
        received: false
      });
    }
  } else {
    if (editing.id) {
      const e = state.envelopes.find(x => x.id === editing.id);
      if (e) { e.name = name; e.amount = amount; e.emoji = selectedEmoji; }
    } else {
      state.envelopes.push({
        id: 'e_' + Date.now() + Math.random().toString(36).slice(2,6),
        emoji: selectedEmoji, name, amount,
        allocated: false
      });
    }
  }
  closeModal();
  render();
};

document.getElementById('deleteBtn').onclick = () => {
  if (!editing.id) return;
  if (!confirm('Supprimer cet élément?')) return;
  if (editing.type === 'revenu') {
    state.revenus = state.revenus.filter(r => r.id !== editing.id);
  } else {
    state.envelopes = state.envelopes.filter(e => e.id !== editing.id);
  }
  closeModal();
  render();
};

document.body.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.revToggle) {
    const r = state.revenus.find(x => x.id === t.dataset.revToggle);
    if (r) { r.received = !r.received; render(); }
  } else if (t.dataset.revEdit) {
    const r = state.revenus.find(x => x.id === t.dataset.revEdit);
    if (r) openModal('revenu', r);
  } else if (t.dataset.envToggle) {
    const e2 = state.envelopes.find(x => x.id === t.dataset.envToggle);
    if (e2) { e2.allocated = !e2.allocated; render(); }
  } else if (t.dataset.envEdit) {
    const e2 = state.envelopes.find(x => x.id === t.dataset.envEdit);
    if (e2) openModal('envelope', e2);
  }
});

document.getElementById('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') closeModal();
});

document.getElementById('resetBtn').onclick = () => {
  if (confirm('Effacer toutes les données et recommencer à zéro?')) {
    state = { revenus: [], envelopes: [] };
    save(); render();
  }
};

// Init
load();
render();
