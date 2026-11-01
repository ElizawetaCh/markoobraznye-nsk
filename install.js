(() => {
  'use strict';
  const banner = document.getElementById('installBanner');
  const installButton = document.getElementById('installNow');
  const dismissButton = document.getElementById('installDismiss');
  const dialog = document.getElementById('installHelp');
  const helpBody = document.getElementById('installHelpBody');
  const closeButton = document.getElementById('installHelpClose');
  const doneButton = document.getElementById('installHelpDone');
  if (!banner || !installButton || !dialog) return;

  let deferredPrompt = null;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isSafari = isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  const sessionKey = 'mnsk_install_banner_dismissed';

  function isDismissed() {
    try { return sessionStorage.getItem(sessionKey) === '1'; } catch (_) { return false; }
  }
  function rememberDismissal() {
    try { sessionStorage.setItem(sessionKey, '1'); } catch (_) {}
  }
  function updateBanner() {
    banner.hidden = isStandalone() || isDismissed() || !isAndroid && !isIOS;
  }

  function showHelp() {
    helpBody.replaceChildren();
    const intro = document.createElement('p');
    const steps = document.createElement('ol');
    let lines;
    if (isIOS) {
      intro.textContent = isSafari
        ? 'На iPhone приложение добавляется на экран «Домой» через Safari.'
        : 'Для установки на iPhone откройте эту страницу в Safari.';
      lines = [
        'Откройте ссылку в Safari.',
        'Нажмите кнопку «Поделиться» (квадрат со стрелкой).',
        'Выберите «На экран Домой» и нажмите «Добавить».',
        'Запускайте «Маркообразные» через появившийся значок.'
      ];
    } else {
      intro.textContent = 'Если автоматическая установка недоступна, используйте меню браузера.';
      lines = [
        'Откройте ссылку напрямую в Chrome, не во встроенном браузере Telegram или ВК.',
        'Нажмите меню ⋮ и найдите «Добавить на главный экран» или «Установить приложение».',
        'Если такого пункта нет, обновите Chrome через Play Маркет и попробуйте снова.',
        'Если пункт всё равно отсутствует, проверьте установку через другой браузер с поддержкой PWA.'
      ];
    }
    helpBody.append(intro);
    for (const line of lines) {
      const li = document.createElement('li');
      li.textContent = line;
      steps.append(li);
    }
    helpBody.append(steps);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open','');
  }
  function closeHelp() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    updateBanner();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    banner.hidden = true;
    rememberDismissal();
  });

  installButton.addEventListener('click', async () => {
    if (isStandalone()) { banner.hidden = true; return; }
    if (!deferredPrompt) { showHelp(); return; }
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice && choice.outcome === 'accepted') {
        banner.hidden = true;
        rememberDismissal();
      }
    } catch (error) {
      console.warn('PWA install prompt unavailable:', error);
      showHelp();
    }
  });

  dismissButton.addEventListener('click', () => {
    rememberDismissal();
    banner.hidden = true;
  });
  closeButton.addEventListener('click', closeHelp);
  doneButton.addEventListener('click', closeHelp);
  dialog.addEventListener('click', e => { if (e.target === dialog) closeHelp(); });

  updateBanner();
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', updateBanner);
  window.addEventListener('pageshow', updateBanner);
})();
