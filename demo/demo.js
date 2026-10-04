/* ==========================================================================
   Только для демо-версии (GitHub Pages). В архив для покупателя не входит.
   1. Переключатель трёх палитр.
   2. Форма ничего не отправляет, а показывает, как заявка выглядела бы в Telegram.
   ========================================================================== */
(function () {
  "use strict";

  var PALETTES = [
    { id: "soft", label: "Нежная" },
    { id: "strict", label: "Строгая" },
    { id: "bright", label: "Яркая" }
  ];
  var root = document.documentElement;

  function savedPalette() {
    try { return sessionStorage.getItem("demo-palette"); } catch (e) { return null; }
  }
  function setPalette(id) {
    root.setAttribute("data-palette", id);
    try { sessionStorage.setItem("demo-palette", id); } catch (e) { /* без сохранения тоже работает */ }
    Array.prototype.forEach.call(document.querySelectorAll(".demo-bar [data-palette-id]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-palette-id") === id));
    });
  }

  function buildBar() {
    var bar = document.createElement("div");
    bar.className = "demo-bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Демо: выбор палитры");
    var label = document.createElement("span");
    label.className = "demo-bar__label";
    label.textContent = "Демо-версия шаблона. Палитра:";
    bar.appendChild(label);
    PALETTES.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = p.label;
      b.setAttribute("data-palette-id", p.id);
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () { setPalette(p.id); });
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
    document.body.classList.add("has-demo-bar");
  }

  /* ---------- Предпросмотр заявки «как в Telegram» ---------- */
  var dlg;
  function ensureDialog() {
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.className = "demo-tg";
    dlg.setAttribute("aria-label", "Как заявка выглядит в Telegram");
    dlg.innerHTML =
      '<div class="demo-tg__note"></div>' +
      '<div class="demo-tg__phone">' +
      '<div class="demo-tg__head"><span class="demo-tg__ava">B</span><span><b>Бот заявок</b><small>бот</small></span></div>' +
      '<div class="demo-tg__chat"><div class="demo-tg__bubble"></div></div></div>' +
      '<button type="button" class="btn demo-tg__close">Понятно</button>';
    dlg.querySelector(".demo-tg__note").textContent =
      "Это демо: данные никуда не отправляются. В рабочем сайте такое сообщение придёт вам в Telegram:";
    dlg.querySelector(".demo-tg__close").addEventListener("click", function () { dlg.close(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
    return dlg;
  }

  function line(parent, icon, label, value) {
    var p = document.createElement("p");
    p.appendChild(document.createTextNode(icon + " "));
    var b = document.createElement("b");
    b.textContent = label ? label + ": " : "";
    p.appendChild(b);
    p.appendChild(document.createTextNode(value));
    parent.appendChild(p);
  }

  function showTelegramPreview(data) {
    var d = ensureDialog();
    var bubble = d.querySelector(".demo-tg__bubble");
    bubble.textContent = "";
    var title = document.createElement("p");
    var tb = document.createElement("b");
    tb.textContent = "🆕 Новая заявка с сайта";
    title.appendChild(tb);
    bubble.appendChild(title);
    line(bubble, "👤", "Имя", data.name);
    line(bubble, "📞", "Телефон", data.phone);
    line(bubble, "💅", "Услуга", data.service || "—");
    if (data.comment) line(bubble, "💬", "Комментарий", data.comment);
    var time = document.createElement("small");
    var now = new Date();
    time.textContent = "🕒 " + now.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    bubble.appendChild(time);
    d.showModal();
    d.querySelector(".demo-tg__close").focus();
  }

  window.LandingDemo = {
    submit: function (payload) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          showTelegramPreview(payload);
          resolve({ status: 200, data: { ok: true } });
        }, 600);
      });
    }
  };

  var params = new URLSearchParams(location.search);
  var initial = params.get("palette") || savedPalette() || root.getAttribute("data-palette") || "soft";
  if (!PALETTES.some(function (p) { return p.id === initial; })) initial = "soft";
  buildBar();
  setPalette(initial);
})();
