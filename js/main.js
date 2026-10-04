/* ==========================================================================
   Лендинг мастера — скрипты. Чистый JavaScript, без библиотек.
   Править здесь ничего не нужно: адрес обработчика формы и номер Метрики
   лежат в js/config.js.
   Всё написано так, чтобы удаление любой секции из HTML ничего не ломало.
   ========================================================================== */
(function () {
  "use strict";

  var cfg = window.SITE_CONFIG || {};
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- Ссылки на удалённые секции прячем ---------- */
  function hideDanglingLinks() {
    $$('a[href^="#"]').forEach(function (a) {
      var id = a.getAttribute("href").slice(1);
      if (id && !document.getElementById(id)) a.hidden = true;
    });
  }

  /* ---------- Меню строится по секциям с атрибутом data-nav ---------- */
  function buildMenu() {
    var nav = $("#site-nav");
    var header = $(".site-header");
    if (!nav) return;
    var sections = $$("main [data-nav]");
    if (!sections.length) { nav.hidden = true; return; }

    var ul = document.createElement("ul");
    sections.forEach(function (sec) {
      if (!sec.id) return;
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "#" + sec.id;
      a.textContent = sec.getAttribute("data-nav");
      li.appendChild(a);
      ul.appendChild(li);
    });
    nav.appendChild(ul);

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "nav-toggle is-ready";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "site-nav");
    toggle.setAttribute("aria-label", "Меню");
    toggle.appendChild(document.createElement("span"));
    header.querySelector(".container").appendChild(toggle);

    function setOpen(open) {
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    }
    toggle.addEventListener("click", function () { setOpen(!nav.classList.contains("is-open")); });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });

    // Подсветка текущей секции
    if ("IntersectionObserver" in window) {
      var links = $$("a", nav);
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          links.forEach(function (l) { l.classList.toggle("is-active", l.getAttribute("href") === "#" + en.target.id); });
        });
      }, { rootMargin: "-35% 0px -60% 0px" });
      sections.forEach(function (s) { io.observe(s); });
    }

    // Тонкая линия под шапкой после прокрутки
    function onScroll() { header.classList.toggle("is-stuck", window.scrollY > 8); }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Просмотр фото на весь экран со свайпом ---------- */
  function initLightbox() {
    var links = $$("a[data-lightbox]");
    if (!links.length || typeof HTMLDialogElement === "undefined") return;

    var dlg = document.createElement("dialog");
    dlg.className = "lightbox";
    dlg.setAttribute("aria-label", "Просмотр фото");
    dlg.innerHTML =
      '<div class="lb-stage"><img alt=""></div>' +
      '<button type="button" class="lb-btn lb-close" aria-label="Закрыть">&times;</button>' +
      '<button type="button" class="lb-btn lb-prev" aria-label="Предыдущее фото">&#8249;</button>' +
      '<button type="button" class="lb-btn lb-next" aria-label="Следующее фото">&#8250;</button>' +
      '<div class="lb-info" aria-live="polite"></div>';
    document.body.appendChild(dlg);

    var stage = $(".lb-stage", dlg);
    var img = $("img", dlg);
    var info = $(".lb-info", dlg);
    var group = [];
    var index = 0;

    function show(i) {
      index = (i + group.length) % group.length;
      var a = group[index];
      var thumb = $("img", a);
      img.src = a.getAttribute("href");
      img.alt = (thumb && thumb.alt) || "";
      var cap = a.getAttribute("data-caption") || img.alt;
      info.textContent = (cap ? cap + " — " : "") + (index + 1) + " / " + group.length;
      var single = group.length < 2;
      $(".lb-prev", dlg).hidden = single;
      $(".lb-next", dlg).hidden = single;
      // подгружаем соседние фото заранее
      [index - 1, index + 1].forEach(function (n) {
        if (!single) new Image().src = group[(n + group.length) % group.length].getAttribute("href");
      });
    }
    function open(a) {
      var name = a.getAttribute("data-lightbox");
      group = links.filter(function (l) { return l.getAttribute("data-lightbox") === name; });
      show(group.indexOf(a));
      dlg.showModal();
    }

    links.forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); open(a); });
    });
    $(".lb-close", dlg).addEventListener("click", function () { dlg.close(); });
    $(".lb-prev", dlg).addEventListener("click", function () { show(index - 1); });
    $(".lb-next", dlg).addEventListener("click", function () { show(index + 1); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target === stage) dlg.close(); });
    dlg.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") show(index - 1);
      if (e.key === "ArrowRight") show(index + 1);
    });
    dlg.addEventListener("close", function () { img.removeAttribute("src"); });

    // Свайп пальцем (и мышью) влево/вправо
    var startX = null, startY = null;
    stage.addEventListener("pointerdown", function (e) { startX = e.clientX; startY = e.clientY; });
    stage.addEventListener("pointerup", function (e) {
      if (startX === null) return;
      var dx = e.clientX - startX, dy = e.clientY - startY;
      startX = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && group.length > 1) show(index + (dx < 0 ? 1 : -1));
    });
    stage.addEventListener("pointercancel", function () { startX = null; });
  }

  /* ---------- Карта Яндекса: подгружается, когда до неё докрутили ---------- */
  function initMap() {
    var box = $(".map[data-src]");
    if (!box) return;
    function load() {
      if (box.querySelector("iframe")) return;
      var f = document.createElement("iframe");
      f.src = box.getAttribute("data-src");
      f.title = box.getAttribute("data-title") || "Карта";
      f.loading = "lazy";
      f.setAttribute("allowfullscreen", "");
      box.appendChild(f);
      var ph = $(".map-placeholder", box);
      if (ph) ph.hidden = true;
    }
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); load(); }
      }, { rootMargin: "300px 0px" });
      io.observe(box);
    } else {
      load();
    }
  }

  /* ---------- Форма заявки ---------- */
  // Из любого ввода получаем до 10 цифр номера без кода страны
  function phoneDigits(raw) {
    var d = String(raw).replace(/\D/g, "");
    if (/^\s*\+\s*7/.test(raw)) d = d.slice(1);
    if (d.length > 10 && (d.charAt(0) === "7" || d.charAt(0) === "8")) d = d.slice(1);
    return d.slice(0, 10);
  }
  function formatDigits(d) {
    if (!d) return "";
    var s = "+7 (" + d.slice(0, 3);
    if (d.length >= 3) s += ")";
    if (d.length > 3) s += " " + d.slice(3, 6);
    if (d.length > 6) s += "-" + d.slice(6, 8);
    if (d.length > 8) s += "-" + d.slice(8, 10);
    return s;
  }
  function formatPhone(raw) {
    var d = phoneDigits(raw);
    return { text: formatDigits(d), digits: d };
  }

  function initForm() {
    var form = $("#lead-form");
    if (!form) return;
    var phone = form.elements.phone;
    var name = form.elements.name;
    var select = form.elements.service;
    var status = $(".form-status", form);
    var submit = $(".form-submit", form);
    var shownAt = Date.now();

    // Список услуг берём из карточек раздела «Услуги»
    $$("#services .card h3").forEach(function (h) {
      var o = document.createElement("option");
      o.value = o.textContent = h.textContent.trim();
      select.appendChild(o);
    });
    // Кнопка «Записаться» на карточке подставляет услугу в форму
    $$("[data-service]").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-service");
        $$("option", select).forEach(function (o) { if (o.value === v) select.value = v; });
      });
    });

    // Маска телефона
    var lastDigits = "";
    phone.addEventListener("input", function (e) {
      var f = formatPhone(phone.value);
      // Удалили символ оформления (скобку, пробел) — убираем и соседнюю цифру
      if (e.inputType === "deleteContentBackward" && f.digits === lastDigits && f.digits) {
        var d = f.digits.slice(0, -1);
        f = { digits: d, text: formatDigits(d) };
      }
      lastDigits = f.digits;
      phone.value = f.text;
    });
    phone.addEventListener("focus", function () { if (!phone.value) phone.value = "+7 ("; });
    phone.addEventListener("blur", function () { if (formatPhone(phone.value).digits === "") phone.value = ""; });

    function setError(field, msg) {
      var wrap = field.closest(".field");
      if (!wrap) return;
      wrap.classList.toggle("has-error", !!msg);
      var err = $(".field-error", wrap);
      if (err) err.textContent = msg || "";
      field.setAttribute("aria-invalid", msg ? "true" : "false");
    }
    function validate() {
      var first = null;
      function check(field, msg) { setError(field, msg); if (msg && !first) first = field; }
      check(name, name.value.trim().length < 2 ? "Введите имя" : "");
      check(phone, formatPhone(phone.value).digits.length !== 10 ? "Введите номер полностью: 10 цифр после +7" : "");
      check(form.elements.consent, form.elements.consent.checked ? "" : "Нужно согласие на обработку персональных данных");
      if (first) first.focus();
      return !first;
    }
    [name, phone, form.elements.consent].forEach(function (f) {
      f.addEventListener("input", function () { setError(f, ""); });
      f.addEventListener("change", function () { setError(f, ""); });
    });

    function showStatus(kind, html) {
      status.className = "form-status form-status--" + kind;
      status.innerHTML = html;
    }
    function setBusy(busy) {
      submit.disabled = busy;
      submit.innerHTML = busy ? '<span class="spinner" aria-hidden="true"></span> Отправляю…' : submit.getAttribute("data-label");
    }
    submit.setAttribute("data-label", submit.textContent.trim());

    function errorHtml(message) {
      var fb = $(".form-fallback", form);
      return "<strong>" + message + "</strong>" + (fb ? "<br>" + fb.innerHTML : "");
    }

    function send(payload) {
      if (cfg.demo && window.LandingDemo && window.LandingDemo.submit) return window.LandingDemo.submit(payload);
      var ctrl = "AbortController" in window ? new AbortController() : null;
      var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 15000);
      return fetch(cfg.formEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, data: data }; });
      }).finally(function () { if (timer) clearTimeout(timer); });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.className = "form-status"; status.textContent = "";
      if (!validate()) return;
      setBusy(true);
      var payload = {
        name: name.value.trim(),
        phone: formatPhone(phone.value).text,
        service: select.value,
        comment: form.elements.comment.value.trim(),
        consent: true,
        website: form.elements.website.value, // поле-ловушка: у людей всегда пустое
        t: shownAt                             // когда форма появилась на странице
      };
      Promise.resolve(send(payload)).then(function (r) {
        if (r && r.data && r.data.ok) {
          form.reset();
          shownAt = Date.now();
          lastDigits = "";
          showStatus("ok", "<strong>Спасибо! Заявка отправлена.</strong><br>Свяжусь с вами в ближайшее время, чтобы подтвердить запись.");
          if (cfg.metrikaId && window.ym) window.ym(cfg.metrikaId, "reachGoal", "lead");
        } else if (r && r.status === 429) {
          showStatus("err", errorHtml("Слишком много заявок подряд. Подождите несколько минут."));
        } else {
          showStatus("err", errorHtml("Не получилось отправить заявку."));
        }
      }).catch(function () {
        showStatus("err", errorHtml("Не получилось отправить заявку: нет связи."));
      }).then(function () { setBusy(false); });
    });
  }

  /* ---------- Яндекс Метрика (необязательно, номер в js/config.js) ---------- */
  function initMetrika() {
    var id = Number(cfg.metrikaId);
    if (!id) return;
    function load() {
      (function (m, e, t, r, i, k, a) {
        m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
        m[i].l = 1 * new Date();
        k = e.createElement(t); a = e.getElementsByTagName(t)[0];
        k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
      })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
      window.ym(id, "init", { clickmap: true, trackLinks: true, accurateTrackBounce: true });
    }
    // грузим после полной загрузки страницы, чтобы не тормозить показ
    if (document.readyState === "complete") load(); else window.addEventListener("load", load);
  }

  hideDanglingLinks();
  buildMenu();
  initLightbox();
  initMap();
  initForm();
  initMetrika();
})();
