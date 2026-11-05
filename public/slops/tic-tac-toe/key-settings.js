import { createKeyStore } from './modules/credentials.js';

export function mountKeySettings({onChange = () => {}, onOpen = () => {}, jevProxy = false} = {}) {
  const storage = name => { try { return window[name]; } catch { return undefined; } };
  const store = createKeyStore(storage('sessionStorage'), storage('localStorage'));
  const host = document.createElement('section');
  host.className = 'key-settings';
  host.innerHTML = `<button type="button" id="key-settings-open" class="key-settings-button">Key settings</button>
    <dialog id="key-dialog" class="key-dialog" aria-labelledby="key-title">
      <form id="key-form">
        <div class="key-dialog-heading"><h2 id="key-title">Play with Jev</h2><button type="button" id="key-close" aria-label="Close key settings">×</button></div>
        <p>${jevProxy ? 'Enter your own Jev key to play. It is forwarded securely to Jev for each move and is not saved on the server.' : 'Your personal key goes directly from this browser to Jev.'}</p>
        <label class="key-label" for="jev-key">Jev API key</label>
        <div class="key-input-row"><input id="jev-key" name="jev-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="1024" placeholder="Paste your API key" aria-describedby="key-storage-note"><button type="button" id="key-show">Show</button></div>
        <label class="key-remember"><input type="checkbox" id="key-remember"> Remember on this device</label>
        <p id="key-storage-note" class="key-small">By default, the key lasts for this tab. Remembering stores it in this browser until you clear it. Use only a device you trust.</p>
        ${jevProxy ? '' : '<p class="key-small">Jev must allow requests from this website.</p>'}
        <p id="key-feedback" role="status" class="key-feedback"></p>
        <div class="key-actions"><button type="submit" id="key-save">Save key & play</button><button type="button" id="key-clear">Clear saved key</button><button type="button" id="key-cancel">Cancel</button></div>
      </form>
    </dialog><p id="key-summary" class="key-summary" role="status"></p>`;
  (document.getElementById('key-controls') || document.body).append(host);
  const get = id => host.querySelector('#'+id), dialog = get('key-dialog'), input = get('jev-key'), feedback = get('key-feedback');
  let cachingWorked = true;
  const summarize = () => { get('key-summary').textContent = store.key ? (cachingWorked ? store.remembered ? 'Jev key remembered on this device' : 'Jev key saved for this tab' : 'Jev key available for this page only; browser storage unavailable') : 'Your Jev API key is required to play'; };
  const close = () => { input.value = ''; input.type = 'password'; get('key-show').textContent = 'Show'; dialog.close(); };
  const open = (message = '') => { input.type = 'password'; get('key-show').textContent = 'Show'; store.cancel(); onOpen(); input.value = ''; input.required = !store.key; get('key-remember').checked = store.remembered; feedback.textContent = message || (store.key ? 'A key is saved. Paste a new one to replace it.' : ''); get('key-clear').disabled = !store.key; dialog.showModal(); input.focus(); };
  get('key-settings-open').onclick = () => open();
  get('key-show').onclick = () => { input.type = input.type === 'password' ? 'text' : 'password'; get('key-show').textContent = input.type === 'password' ? 'Show' : 'Hide'; };
  get('key-cancel').onclick = close;
  get('key-close').onclick = close;
  get('key-form').onsubmit = event => {
    event.preventDefault();
    try {
      if (input.value.trim()) cachingWorked = store.save(input.value, get('key-remember').checked);
      else if (!store.key) throw new Error('Enter your Jev API key.');
      summarize(); close(); onChange();
    } catch (error) { feedback.textContent = error.message; }
  };
  const forget = () => {
    const removed = store.clear(); summarize(); onChange();
    open(removed ? 'Key cleared. Enter your Jev API key to play.' : 'Key cleared from this page. Browser storage could not be cleared; remove this site’s data in browser settings.');
  };
  get('key-clear').onclick = forget;
  dialog.addEventListener('close', () => { input.value = ''; input.type = 'password'; get('key-show').textContent = 'Show'; get('key-settings-open').focus(); });
  for (const name of ['keydown','keyup']) dialog.addEventListener(name, event => event.stopPropagation());
  summarize(); if (!store.key) open();
  return {requireKey: message => { store.clear(); summarize(); open(message); }, getKey: () => store.key, getSignal: () => store.signal, open};
}
