/* Family Council — weekly planner board */

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_COLORS = ['#ffe8cc', '#fff3bf', '#d3f9d8', '#c5f6fa', '#d0ebff', '#e5dbff', '#ffdeeb'];
const EMOJIS = ['🧹', '🍽️', '🗑️', '🧺', '🐕', '🛒', '📚', '⚽', '🌱', '🎂', '🚗', '🧸', '🎨', '🛏️', '⭐'];
const ROLES = ['Mom', 'Dad', 'Kid', 'Teen', 'Grandma', 'Grandpa', 'Pet', 'Member'];
const COLORS = ['#FF6B6B', '#FFA94D', '#FFD43B', '#69DB7C', '#38C8B9', '#5AB3F0', '#9B7EDE', '#F783AC'];

const state = {
  weekStart: null,
  members: [],
  instances: [],
  familyName: '',
  newEmoji: EMOJIS[0],
  newType: 'weekly',
};

// ---------- helpers ----------

const $ = (sel, root = document) => root.querySelector(sel);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mondayOf(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d;
}

function shortDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

let toastTimer;
function toast(text, warn = false) {
  clearTimeout(toastTimer);
  $('#toast-root').innerHTML = `<div class="toast ${warn ? 'warn' : ''}">${esc(text)}</div>`;
  toastTimer = setTimeout(() => ($('#toast-root').innerHTML = ''), 2600);
}

async function apiCall(url, options = {}) {
  const res = await fetch(url, {
    headers: options.body && !(options.body instanceof File) ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('unauthenticated');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast(data.error || 'That did not work.', true);
    throw new Error(data.error || 'request failed');
  }
  return data;
}

// ---------- data ----------

async function loadWeek() {
  const data = await apiCall(`/api/week?start=${state.weekStart}`);
  state.members = data.members;
  state.instances = data.instances;
  state.familyName = data.familyName;
  render();
}

async function patchInstance(id, body) {
  try {
    const { instance } = await apiCall(`/api/instances/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    state.instances = state.instances.map((i) => (i.id === id ? instance : i));
    render();
    return true;
  } catch {
    return false;
  }
}

// ---------- rendering ----------

function avatarHtml(member, size) {
  if (member.image) {
    return `<img class="avatar" src="/api/images/${esc(member.image)}" alt="${esc(member.name)}"
      style="border-color:${esc(member.color)};width:${size}px;height:${size}px" draggable="false" />`;
  }
  return `<div class="avatar-letter" style="background:${esc(member.color)};width:${size}px;height:${size}px">
    ${esc((member.name[0] || '?').toUpperCase())}</div>`;
}

function taskCardHtml(inst) {
  const member = inst.member_id ? state.members.find((m) => m.id === inst.member_id) : null;
  const check =
    inst.day != null
      ? `<button class="t-check ${inst.completed ? 'done' : ''}" data-action="toggle" data-id="${inst.id}"
           title="${inst.completed ? 'Mark as not done' : 'Mark as done'}">${inst.completed ? '✓' : ''}</button>`
      : '';
  const badge =
    inst.day == null
      ? `<span class="t-badge ${inst.type}">${inst.type === 'weekly' ? '🔁 weekly' : '1️⃣ once'}</span>`
      : '';
  let assignee = '';
  if (inst.is_family) {
    assignee = `<span title="Whole family — click to unassign" data-action="unassign" data-id="${inst.id}"
      style="cursor:pointer;font-size:20px">👨‍👩‍👧‍👦</span>`;
  } else if (member) {
    const chip = member.image
      ? `<img class="t-avatar" src="/api/images/${esc(member.image)}" alt="${esc(member.name)}"
           style="border-color:${esc(member.color)}" draggable="false" />`
      : `<span class="t-avatar-letter" style="background:${esc(member.color)}">${esc((member.name[0] || '?').toUpperCase())}</span>`;
    assignee = `<span title="${esc(member.name)} — click to unassign" data-action="unassign" data-id="${inst.id}"
      style="cursor:pointer">${chip}</span>`;
  }
  return `<div class="task-card ${inst.completed ? 'completed' : ''}" draggable="true" data-instance="${inst.id}">
    ${check}<span class="t-emoji">${inst.emoji}</span><span class="t-title">${esc(inst.title)}</span>
    ${badge}${assignee}
    <button class="t-del" data-action="delete" data-id="${inst.id}" title="Remove from this week">✕</button>
  </div>`;
}

function render() {
  const monday = state.weekStart;
  const sunday = addDays(monday, 6);
  $('#week-label').textContent = `${shortDate(addDays(monday, 0))} – ${shortDate(sunday)}`;
  $('#family-name').textContent = state.familyName;

  // members row
  const counts = {};
  let familyCount = 0;
  for (const i of state.instances) {
    if (i.is_family) familyCount++;
    else if (i.member_id != null) counts[i.member_id] = (counts[i.member_id] || 0) + 1;
  }
  $('#members-row').innerHTML =
    state.members
      .map(
        (m) => `<div class="member-card" data-drop="member-${m.id}" data-action="edit-member" data-id="${m.id}"
          title="Drop a task on ${esc(m.name)}, or click to edit">
          ${counts[m.id] ? `<span class="m-count">${counts[m.id]}</span>` : ''}
          ${avatarHtml(m, 64)}
          <div class="m-name">${esc(m.name)}</div>
          <div class="m-role">${esc(m.role)}</div>
        </div>`
      )
      .join('') +
    `<div class="member-card family" data-drop="family" title="Drop a task here to assign it to the whole family">
      ${familyCount ? `<span class="m-count">${familyCount}</span>` : ''}
      <div style="font-size:44px;line-height:64px">👨‍👩‍👧‍👦</div>
      <div class="m-name">Everyone</div><div class="m-role">whole family</div>
    </div>
    <div class="member-card add" data-action="add-member">
      <div style="font-size:34px">＋</div><div>Add member</div>
    </div>`;

  // pile
  const unassigned = state.instances.filter((i) => i.member_id == null && !i.is_family && i.day == null);
  const ready = state.instances.filter((i) => (i.member_id != null || i.is_family) && i.day == null);
  $('#pile-unassigned').innerHTML = unassigned.length
    ? unassigned.map(taskCardHtml).join('')
    : '<div class="empty-hint">Pile is empty. Add a task above! 🎈</div>';
  $('#pile-ready-wrap').hidden = !ready.length;
  $('#pile-ready').innerHTML = ready.map(taskCardHtml).join('');

  // week grid
  const todayStr = fmtDate(new Date());
  $('#week-grid').innerHTML = DAY_NAMES.map((name, d) => {
    const date = addDays(monday, d);
    const cards = state.instances.filter((i) => i.day === d).map(taskCardHtml).join('');
    return `<div class="day-col ${fmtDate(date) === todayStr ? 'today' : ''}" data-drop="day-${d}"
      style="background:${DAY_COLORS[d]}">
      <div class="d-name">${name}</div>
      <div class="d-date">${shortDate(date)}</div>
      ${cards}
    </div>`;
  }).join('');

  // emoji row + type toggle (selection state)
  $('#emoji-row').innerHTML = EMOJIS.map(
    (em) => `<button type="button" class="emoji-pick ${state.newEmoji === em ? 'selected' : ''}" data-emoji="${em}">${em}</button>`
  ).join('');
  for (const btn of document.querySelectorAll('#type-toggle button')) {
    btn.classList.toggle('on', btn.dataset.type === state.newType);
  }
}

// ---------- drag & drop ----------

document.addEventListener('dragstart', (e) => {
  const card = e.target.closest?.('[data-instance]');
  if (!card) return;
  e.dataTransfer.setData('text/plain', card.dataset.instance);
  e.dataTransfer.effectAllowed = 'move';
  requestAnimationFrame(() => card.classList.add('dragging'));
});

document.addEventListener('dragend', (e) => {
  e.target.closest?.('[data-instance]')?.classList.remove('dragging');
  clearHover();
});

function clearHover() {
  for (const el of document.querySelectorAll('.droppable-hover')) el.classList.remove('droppable-hover');
}

document.addEventListener('dragover', (e) => {
  const target = e.target.closest?.('[data-drop]');
  if (!target) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (!target.classList.contains('droppable-hover')) {
    clearHover();
    target.classList.add('droppable-hover');
  }
});

document.addEventListener('dragleave', (e) => {
  const target = e.target.closest?.('[data-drop]');
  if (target && !target.contains(e.relatedTarget)) target.classList.remove('droppable-hover');
});

document.addEventListener('drop', async (e) => {
  const target = e.target.closest?.('[data-drop]');
  if (!target) return;
  e.preventDefault();
  clearHover();
  const id = Number(e.dataTransfer.getData('text/plain'));
  if (!id) return;
  const drop = target.dataset.drop;

  if (drop.startsWith('member-')) {
    await patchInstance(id, { member_id: Number(drop.slice(7)) });
  } else if (drop === 'family') {
    await patchInstance(id, { is_family: 1 });
  } else if (drop === 'pile') {
    await patchInstance(id, { member_id: null, is_family: 0, day: null });
  } else if (drop.startsWith('day-')) {
    const inst = state.instances.find((i) => i.id === id);
    if (inst && inst.member_id == null && !inst.is_family) {
      toast('Drop it on a family member first! 🖐️', true);
      return;
    }
    await patchInstance(id, { day: Number(drop.slice(4)) });
  }
});

// ---------- clicks ----------

document.addEventListener('click', async (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const { action, id } = actionEl.dataset;
  const inst = id ? state.instances.find((i) => i.id === Number(id)) : null;

  if (action === 'toggle' && inst) {
    if (!inst.completed) toast('Nice work! 🎉');
    await patchInstance(inst.id, { completed: inst.completed ? 0 : 1 });
  } else if (action === 'unassign' && inst) {
    await patchInstance(inst.id, { member_id: null, is_family: 0, day: null });
  } else if (action === 'delete' && inst) {
    const msg =
      inst.type === 'weekly'
        ? `Remove "${inst.title}" from this week? (It will still come back next week — delete it again there if you want it gone for good.)`
        : `Delete "${inst.title}"?`;
    if (!confirm(msg)) return;
    await apiCall(`/api/instances/${inst.id}`, { method: 'DELETE' });
    await loadWeek();
  } else if (action === 'edit-member') {
    // ignore clicks that landed on a drop just now
    const member = state.members.find((m) => m.id === Number(id));
    if (member) openMemberModal(member);
  } else if (action === 'add-member') {
    openMemberModal(null);
  }
});

// ---------- add task ----------

$('#add-task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('#new-title').value.trim();
  if (!title) return;
  await apiCall('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ title, emoji: state.newEmoji, type: state.newType, weekStart: state.weekStart }),
  });
  $('#new-title').value = '';
  toast(state.newType === 'weekly' ? 'Added! It will return every week 🔁' : 'Added to the pile! 🗂️');
  await loadWeek();
});

$('#emoji-row').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-emoji]');
  if (!btn) return;
  state.newEmoji = btn.dataset.emoji;
  render();
});

$('#type-toggle').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-type]');
  if (!btn) return;
  state.newType = btn.dataset.type;
  render();
});

// ---------- header ----------

$('#prev-week').addEventListener('click', () => {
  state.weekStart = fmtDate(addDays(state.weekStart, -7));
  loadWeek();
});
$('#next-week').addEventListener('click', () => {
  state.weekStart = fmtDate(addDays(state.weekStart, 7));
  loadWeek();
});
$('#today-btn').addEventListener('click', () => {
  state.weekStart = fmtDate(mondayOf(new Date()));
  loadWeek();
});
$('#logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/';
});

// ---------- member modal ----------

function openMemberModal(member) {
  const isNew = member == null;
  let current = member; // saved member row (null until first save for new members)
  const m = {
    name: member?.name ?? '',
    role: member?.role ?? 'Kid',
    color: member?.color ?? COLORS[0],
  };

  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-backdrop" id="modal-backdrop">
    <div class="modal">
      <button class="close-x" id="modal-close">✕</button>
      <h2>${isNew ? 'Add a family member 🎈' : `Edit ${esc(member.name)}`}</h2>
      <div class="avatar-edit">
        <span id="modal-avatar"></span>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn yellow small" id="upload-btn">📸 Upload photo</button>
          <input type="file" id="file-input" accept="image/png,image/jpeg,image/webp" hidden />
          <button class="btn small" id="cartoonify-btn" hidden>🪄 Cartoonify my photo</button>
        </div>
      </div>
      <label class="field" for="m-name">Name</label>
      <input id="m-name" class="input" placeholder="e.g. Emma" value="${esc(m.name)}" />
      <label class="field" for="m-role">Role</label>
      <select id="m-role" class="input">
        ${ROLES.map((r) => `<option ${r === m.role ? 'selected' : ''}>${r}</option>`).join('')}
      </select>
      <label class="field">Color</label>
      <div class="color-row" id="color-row">
        ${COLORS.map((c) => `<button type="button" class="color-dot ${c === m.color ? 'selected' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
      </div>
      <div class="ai-box">
        <h3>✨ AI cartoon avatar</h3>
        <p class="hint">Describe them and generate a family-friendly cartoon portrait — or upload a photo above and hit “Cartoonify”.</p>
        <input class="input" id="m-description" placeholder="e.g. curly red hair, big smile, loves dinosaurs" />
        <button class="btn small" id="generate-btn" style="margin-top:10px">🎨 Generate cartoon</button>
      </div>
      <div class="modal-actions">
        <button class="btn ghost small" id="remove-btn" style="color:var(--coral-dark)" ${current ? '' : 'hidden'}>🗑️ Remove</button>
        <button class="btn teal" id="save-btn">Save</button>
      </div>
    </div>
  </div>`;

  const refreshAvatar = () => {
    const color = m.color;
    $('#modal-avatar').innerHTML = current?.image
      ? `<img src="/api/images/${esc(current.image)}" alt="" style="border-color:${esc(color)}" />`
      : `<div class="avatar-letter-big" style="background:${esc(color)};border-color:${esc(color)}">
          ${esc((($('#m-name')?.value || '?')[0]).toUpperCase())}</div>`;
    $('#cartoonify-btn').hidden = !current?.photo;
  };
  refreshAvatar();

  const close = () => (root.innerHTML = '');
  $('#modal-close').addEventListener('click', close);
  $('#modal-backdrop').addEventListener('mousedown', (e) => {
    if (e.target.id === 'modal-backdrop') close();
  });
  $('#m-name').addEventListener('input', refreshAvatar);
  $('#color-row').addEventListener('click', (e) => {
    const dot = e.target.closest('[data-color]');
    if (!dot) return;
    m.color = dot.dataset.color;
    for (const d of root.querySelectorAll('.color-dot')) d.classList.toggle('selected', d === dot);
    refreshAvatar();
  });

  // The avatar tools need a member row to attach images to, so save first.
  async function ensureSaved() {
    const name = $('#m-name').value.trim();
    if (!name) {
      toast('Give them a name first! ✏️', true);
      return null;
    }
    const payload = JSON.stringify({ name, role: $('#m-role').value, color: m.color });
    const data = current
      ? await apiCall(`/api/members/${current.id}`, { method: 'PATCH', body: payload })
      : await apiCall('/api/members', { method: 'POST', body: payload });
    current = data.member;
    $('#remove-btn').hidden = false;
    return current;
  }

  function withBusy(btn, fn) {
    return async (...args) => {
      const original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spin">⏳</span> Working…';
      try {
        await fn(...args);
      } catch {
        /* toast already shown by apiCall */
      } finally {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    };
  }

  $('#upload-btn').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await withBusy($('#upload-btn'), async () => {
      const saved = await ensureSaved();
      if (!saved) return;
      const res = await fetch(`/api/members/${saved.id}/image`, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const data = await res.json();
      if (!res.ok) return toast(data.error || 'Upload failed.', true);
      current = data.member;
      refreshAvatar();
      toast('Photo uploaded! 📸');
    })();
  });

  async function generate(mode) {
    const saved = await ensureSaved();
    if (!saved) return;
    const data = await apiCall(`/api/members/${saved.id}/generate`, {
      method: 'POST',
      body: JSON.stringify({ mode, description: $('#m-description').value }),
    });
    current = data.member;
    refreshAvatar();
    toast(
      data.source === 'openai'
        ? 'Fresh AI cartoon, hot off the easel! 🎨'
        : 'Cartoon created with the built-in artist 🖍️ (add an OpenAI key for AI portraits)'
    );
  }

  $('#generate-btn').addEventListener('click', (e) => withBusy(e.currentTarget, () => generate('description'))());
  $('#cartoonify-btn').addEventListener('click', (e) => withBusy(e.currentTarget, () => generate('photo'))());

  $('#save-btn').addEventListener('click', async () => {
    const saved = await ensureSaved();
    if (!saved) return;
    close();
    await loadWeek();
  });

  $('#remove-btn').addEventListener('click', async () => {
    if (!current) return;
    if (!confirm(`Remove ${current.name} from the family? Their tasks go back to the pile.`)) return;
    await apiCall(`/api/members/${current.id}`, { method: 'DELETE' });
    close();
    await loadWeek();
  });
}

// ---------- boot ----------

state.weekStart = fmtDate(mondayOf(new Date()));
loadWeek();
