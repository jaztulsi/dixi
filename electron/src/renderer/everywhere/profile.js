// The profile window: what you type here is the only way your name, address and phone reach Dixi. Saving
// goes through the preload (profile.cjs); main checks every field again before it writes.
const FIELDS = ['name', 'email', 'phone', 'street', 'city', 'state', 'zip', 'birthday'];
const form = document.getElementById('form');
const status = document.getElementById('status');
const field = (k) => form.elements.namedItem(k);

// What's saved, then the cursor in the first empty box.
const saved = (await window.profile.load().catch(() => null)) ?? {};
for (const k of FIELDS) field(k).value = saved[k] ?? '';
(FIELDS.map(field).find((el) => !el.value) ?? field('name')).focus();

// Save: a problem is read out (role="alert") and the cursor goes to that box.
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  for (const k of FIELDS) { field(k).removeAttribute('aria-invalid'); field(k).removeAttribute('aria-describedby'); }
  status.textContent = '';
  const r = await window.profile.save(Object.fromEntries(FIELDS.map((k) => [k, field(k).value]))).catch(() => null);
  if (r?.ok) { status.textContent = 'Saved.'; return; }   // main closes the window
  const el = r?.field && field(r.field);
  if (el) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', 'status'); el.focus(); }
  status.textContent = r?.error ?? "Dixi couldn't save that. Try again.";
});
document.getElementById('cancel').addEventListener('click', () => window.profile.close());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.profile.close(); });
