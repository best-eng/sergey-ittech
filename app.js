(function () {
  /* ---------------- Шапка и меню ---------------- */

  // шапка становится плотной после прокрутки
  var header = document.querySelector('.site-header');
  function onScroll() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 12);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  var nav = document.getElementById('nav');
  var toggle = document.querySelector('.menu-toggle');
  if (nav && toggle) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (ev) {
      if (ev.target.tagName === 'A') {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------------- Фильтр кейсов ---------------- */

  // без скрипта видны все кейсы
  var tabs = document.querySelectorAll('.tab[data-f]');
  var cases = document.querySelectorAll('.cases .case');
  tabs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = btn.dataset.f;
      tabs.forEach(function (x) {
        x.setAttribute('aria-pressed', String(x === btn));
      });
      cases.forEach(function (c) {
        c.hidden = f !== 'all' && c.dataset.s.split(' ').indexOf(f) < 0;
        c.classList.add('is-visible');
      });
    });
  });

  /* ---------------- Цели Метрики ---------------- */

  // Пока счётчик не загрузился или после отказа от cookie вызов ничего не делает.
  function goal(name) {
    if (typeof window.ym === 'function' && window.metrikaId) window.ym(window.metrikaId, 'reachGoal', name);
  }
  document.querySelectorAll('[data-goal]').forEach(function (link) {
    link.addEventListener('click', function () { goal(link.dataset.goal); });
  });

  /* ---------------- Рекламные метки ---------------- */

  // Человек пришёл по объявлению на одну страницу, а заявку оставил с другой:
  // метки из адреса запоминаем до закрытия вкладки и прикладываем к заявке.
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'gclid'];
  function readUtm() {
    try {
      var found = new URLSearchParams();
      new URLSearchParams(window.location.search).forEach(function (value, key) {
        if (UTM_KEYS.indexOf(key) >= 0 && value) found.set(key, value.slice(0, 80));
      });
      var fresh = found.toString();
      if (fresh) sessionStorage.setItem('utm', fresh);
      return fresh || sessionStorage.getItem('utm') || '';
    } catch (e) {
      return '';
    }
  }
  var utm = readUtm();

  /* ---------------- Форма заявки ---------------- */

  var form = document.querySelector('[data-lead-form]');
  if (form) {
    var status = form.querySelector('.form-status');
    var button = form.querySelector('button[type="submit"]');
    var token = '';
    var tokenAt = 0;

    // Метку времени берём, когда человек начал заполнять форму: сервер
    // по ней отличает живого посетителя от скрипта, шлющего форму мгновенно.
    var getToken = async function () {
      if (token && Date.now() - tokenAt < 6 * 60 * 60 * 1000) return token;
      var response = await fetch('/api/form-token', { headers: { Accept: 'application/json' } });
      var data = await response.json();
      if (!data.ok) throw new Error(data.error || 'token');
      token = data.token;
      tokenAt = Date.now();
      return token;
    };
    form.addEventListener('focusin', function () { getToken().catch(function () {}); }, { once: true });

    var clearErrors = function () {
      status.textContent = '';
      form.querySelectorAll('.is-error').forEach(function (node) { node.classList.remove('is-error'); });
      form.querySelectorAll('[aria-invalid]').forEach(function (node) { node.removeAttribute('aria-invalid'); });
    };

    var fail = function (message, field) {
      status.textContent = message;
      var input = field && form.elements[field];
      if (input) {
        var box = input.closest('.field, .check');
        if (box) box.classList.add('is-error');
        input.setAttribute('aria-invalid', 'true');
        input.focus();
      }
    };

    var done = function () {
      var panel = document.createElement('div');
      panel.className = 'form-done';
      panel.tabIndex = -1;
      var title = document.createElement('h3');
      title.textContent = 'Заявка отправлена';
      var text = document.createElement('p');
      text.textContent = 'Спасибо! Свяжусь с вами по указанному контакту: задам вопросы и вернусь с составом работ, сроком и ценой.';
      panel.append(title, text);
      form.replaceChildren(panel);
      panel.focus();
      goal('zayavka');
    };

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      clearErrors();

      var data = Object.fromEntries(new FormData(form));
      if (String(data.name || '').trim().length < 2) {
        fail('Укажите, как к вам обращаться.', 'name');
        return;
      }
      if (String(data.contact || '').trim().length < 5) {
        fail('Оставьте телефон, ник в Telegram (@name) или почту.', 'contact');
        return;
      }
      if (!form.elements.consent.checked) {
        fail('Отметьте согласие на обработку персональных данных.', 'consent');
        return;
      }

      button.disabled = true;
      try {
        data.token = await getToken();
        // Сервер не примет форму раньше чем через две секунды после выдачи метки.
        var wait = 2200 - (Date.now() - tokenAt);
        if (wait > 0) await new Promise(function (resolve) { setTimeout(resolve, wait); });
        data.consent = true;
        data.page = window.location.pathname;
        data.utm = utm;

        var response = await fetch('/api/zayavka', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data),
        });
        var result = await response.json().catch(function () { return {}; });
        if (result.ok) {
          done();
          return;
        }
        if (result.retry) token = '';
        fail(result.error || 'Не удалось отправить заявку. Попробуйте ещё раз или напишите напрямую.', result.field);
      } catch (e) {
        fail('Не удалось отправить заявку — проверьте подключение к интернету или напишите напрямую.');
      } finally {
        button.disabled = false;
      }
    });
  }

  /* ---------------- Cookie: уведомление и согласие ---------------- */

  // Сам сайт cookie не ставит, их ставит Метрика. Она включается сразу при открытии страницы,
  // уведомление об этом показывается один раз; «Отказаться» её выключает. Выбор хранится в браузере
  // и на сервер не уходит.
  var cookie = document.querySelector('[data-cookie]');
  var CONSENT_KEY = 'cookieConsent';

  var readConsent = function () {
    try {
      var saved = localStorage.getItem(CONSENT_KEY);
      return saved === 'yes' || saved === 'no' ? saved : '';
    } catch (e) {
      return '';
    }
  };
  var saveConsent = function (value) {
    try {
      if (value) localStorage.setItem(CONSENT_KEY, value);
      else localStorage.removeItem(CONSENT_KEY);
    } catch (e) {
      /* не страшно: спросим ещё раз на следующей странице */
    }
  };
  var loadMetrika = function () {
    var src = cookie && cookie.dataset.metrika;
    if (!src || document.querySelector('script[data-metrika-loaded]')) return;
    var script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.dataset.metrikaLoaded = '';
    document.head.append(script);
  };

  // Во фрейм сайт пускают только кабинет Метрики и Вебвизор (frame-ancestors в server.js): там его
  // открывает владелец, чтобы посмотреть карту кликов, — счётчик нужен без вопроса о cookie.
  var framed = false;
  try { framed = window.top !== window.self; } catch (e) { framed = true; }

  // Если Метрика уже загрузилась на этой странице, флаг disableYaCounter<номер> просит её
  // больше ничего не отправлять; на следующих страницах она просто не подключается.
  var stopMetrika = function () {
    var id = cookie && cookie.dataset.metrikaId;
    if (id) window['disableYaCounter' + id] = true;
  };

  if (cookie && framed) {
    loadMetrika();
  } else if (cookie) {
    var consent = readConsent();
    if (consent === 'no') stopMetrika();
    else loadMetrika();
    if (!consent) cookie.hidden = false;

    var choose = function (value) {
      saveConsent(value);
      cookie.hidden = true;
      if (value === 'yes') loadMetrika();
      else stopMetrika();
    };
    cookie.querySelector('[data-cookie-yes]').addEventListener('click', function () { choose('yes'); });
    cookie.querySelector('[data-cookie-no]').addEventListener('click', function () { choose('no'); });

    // «Настройки cookie» в подвале: выбор сбрасывается, уведомление показывается снова.
    // После отказа Метрика не вернётся сама — только если снова нажать «Понятно».
    document.querySelectorAll('[data-cookie-reset]').forEach(function (reset) {
      reset.addEventListener('click', function () {
        saveConsent('');
        cookie.hidden = false;
        cookie.querySelector('[data-cookie-yes]').focus();
      });
    });
  }

  /* ---------------- Появление блоков при прокрутке ---------------- */

  var items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) {
        en.target.classList.add('is-visible');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -4% 0px' });
  items.forEach(function (el) { io.observe(el); });
})();
