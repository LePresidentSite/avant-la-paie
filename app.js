// ============================================================
// Avant la Paie - Budget préventif TDAH
// Logique simple, sauvegarde locale (localStorage)
// ============================================================

const STORE_KEY = 'avantlapaie.v1';

const PRESETS = [
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

const EMOJIS = ['🏠','🛒','⚡','💧','📱','🌐','🚗','⛽','💊','🏥','🎉','☕','💰','🎁','👶','🐾','📚','👕','🎮','✈️','🍕','🧾'];

// État
let state = {
  income: 0,
  payDate: '',
  envelopes: []  // { id, emoji, name, amount, allocated }
};

let editingId = null;
let selectedEmoji = '🏠';

// Charger / sauvegarder
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) state = Object.assign(state, JSON.parse(raw));
  } catch(e) {}
}
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

// Format $
function fmt(n) {
  if (isNaN(n)) n = 0;
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 2
  }).format(n);
}

// Render
function render() {
  // Date du jour
  const today = new Date();
  document.getElementById('todayDate').textContent =
    today.toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });

  // Inputs paie
  document.getElementById('incomeInput').value = state.income || '';
  document.getElementById('dateInput').value = state.payDate || '';

  // Countdown
  const cd = document.getElementById('countdown');
  if (state.payDate) {
    const pay = new Date(state.payDate + 'T00:00:00');
    const now = new Date(); now.setHours(0,0,0,0);
    const diff = Math.round((pay - now) / 86400000);
    if (diff > 0) cd.innerHTML = `Paie dans <b>${diff} jour${diff>1?'s':''}</b> · profite-en pour planifier`;
    else if (diff === 0) cd.innerHTML = `<b>C'est aujourd'hui!</b> Coche tes enveloppes une fois l'argent reçu`;
    else cd.innerHTML = `Paie reçue il y a ${-diff} jour${-diff>1?'s':''}`;
  } else {
    cd.innerHTML = '';
  }

  // Total alloué
  const totalAlloc = state.envelopes.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
  const remain = (parseFloat(state.income)||0) - totalAlloc;

  // Affichage reste
  const amountEl = document.getElementById('remainingAmount');
  const subEl = document.getElementById('remainingSub');
  amountEl.textContent = fmt(remain);
  amountEl.classList.remove('good','warn','over');

  if (!state.income) {
    subEl.textContent = 'Commence par entrer ta paie ci-dessus';
  } else if (remain < 0) {
    amountEl.classList.add('over');
    subEl.textContent = `Tu dépasses ta paie de ${fmt(-remain)} — réduis une enveloppe`;
  } else if (remain === 0) {
    amountEl.classList.add('good');
    subEl.textContent = 'Chaque dollar a une mission. Bravo. 🎯';
  } else if (remain < state.income * 0.1) {
    amountEl.classList.add('good');
    subEl.textContent = 'Presque tout est attribué — il reste un petit coussin';
  } else {
    amountEl.classList.add('warn');
    subEl.textContent = 'Continue à répartir avant que la paie arrive';
  }

  // Progress bar
  const pct = state.income > 0 ? Math.min(100, (totalAlloc / state.income) * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';

  // Liste enveloppes
  const envBox = document.getElementById('envelopes');
  envBox.innerHTML = '';

  if (state.envelopes.length === 0) {
    envBox.innerHTML = '<div class="empty">Aucune enveloppe.<br>Touche le bouton orange pour en créer une.</div>';
  } else {
    state.envelopes.forEach(env => {
      const div = document.createElement('div');
      div.className = 'envelope' + (env.allocated ? ' allocated' : '');
      div.innerHTML = `
        <div class="env-emoji">${env.emoji}</div>
        <div class="env-info">
          <div class="env-name">${escapeHtml(env.name)}</div>
          <div class="env-amount">${fmt(env.amount)}</div>
        </div>
        <div class="env-actions">
          <button class="icon-btn check ${env.allocated?'on':''}" data-toggle="${env.id}" title="Marquer comme déposée">${env.allocated?'✓':'○'}</button>
          <button class="icon-btn" data-edit="${env.id}" title="Modifier">✎</button>
        </div>
      `;
      envBox.appendChild(div);
    });
  }

  // Compteur enveloppes
  const allocated = state.envelopes.filter(e => e.allocated).length;
  document.getElementById('envCount').textContent = `${allocated} / ${state.envelopes.length} déposées`;

  save();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// Modal
function openModal(env = null) {
  editingId = env ? env.id : null;
  document.getElementById('modalTitle').textContent = env ? 'Modifier l\'enveloppe' : 'Nouvelle enveloppe';
  document.getElementById('envName').value = env ? env.name : '';
  document.getElementById('envAmount').value = env ? env.amount : '';
  selectedEmoji = env ? env.emoji : '🏠';
  document.getElementById('deleteBtn').style.display = env ? 'block' : 'none';
  renderEmojiPick();
  renderPresets();
  document.getElementById('modal').classList.add('show');
}

function closeModal() {
  document.getElementById('modal').classList.remove('show');
  editingId = null;
}

function renderEmojiPick() {
  const box = document.getElementById('emojiPick');
  box.innerHTML = '';
  EMOJIS.forEach(em => {
    const b = document.createElement('button');
    b.textContent = em;
    if (em === selectedEmoji) b.classList.add('sel');
    b.onclick = (e) => { e.preventDefault(); selectedEmoji = em; renderEmojiPick(); };
    box.appendChild(b);
  });
}

function renderPresets() {
  const row = document.getElementById('presetRow');
  row.innerHTML = '';
  PRESETS.forEach(p => {
    const c = document.createElement('button');
    c.className = 'preset-chip';
    c.textContent = `${p.emoji} ${p.name}`;
    c.onclick = (e) => {
      e.preventDefault();
      document.getElementById('envName').value = p.name;
      selectedEmoji = p.emoji;
      renderEmojiPick();
    };
    row.appendChild(c);
  });
}

// Events
document.getElementById('incomeInput').addEventListener('input', e => {
  state.income = parseFloat(e.target.value) || 0;
  render();
});
document.getElementById('dateInput').addEventListener('change', e => {
  state.payDate = e.target.value;
  render();
});
document.getElementById('addBtn').onclick = () => openModal();
document.getElementById('cancelBtn').onclick = closeModal;

document.getElementById('saveBtn').onclick = () => {
  const name = document.getElementById('envName').value.trim();
  const amount = parseFloat(document.getElementById('envAmount').value) || 0;
  if (!name) { alert('Donne un nom à l\'enveloppe'); return; }
  if (editingId) {
    const env = state.envelopes.find(e => e.id === editingId);
    if (env) { env.name = name; env.amount = amount; env.emoji = selectedEmoji; }
  } else {
    state.envelopes.push({
      id: 'e_' + Date.now() + Math.random().toString(36).slice(2,6),
      emoji: selectedEmoji,
      name, amount,
      allocated: false
    });
  }
  closeModal();
  render();
};

document.getElementById('deleteBtn').onclick = () => {
  if (!editingId) return;
  if (confirm('Supprimer cette enveloppe?')) {
    state.envelopes = state.envelopes.filter(e => e.id !== editingId);
    closeModal();
    render();
  }
};

document.getElementById('envelopes').addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  const tid = t.dataset.toggle;
  const eid = t.dataset.edit;
  if (tid) {
    const env = state.envelopes.find(x => x.id === tid);
    if (env) { env.allocated = !env.allocated; render(); }
  } else if (eid) {
    const env = state.envelopes.find(x => x.id === eid);
    if (env) openModal(env);
  }
});

document.getElementById('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') closeModal();
});

document.getElementById('resetBtn').onclick = () => {
  if (confirm('Effacer toutes les données et recommencer à zéro?')) {
    state = { income: 0, payDate: '', envelopes: [] };
    save(); render();
  }
};

// Init
load();
render();
