(function () {
  'use strict';

  var App = window.QRApp;
  var $ = function (s, root) { return (root || document).querySelector(s); };
  var $$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };

  var form = $('#form');
  var custom = $('.custom');
  var canvas = $('#qr');
  var box = $('#qr-box');
  var msg = $('#msg');
  var btnPng = $('#dl-png');
  var btnSvg = $('#dl-svg');
  var btnCopy = $('#copy-img');
  var pixBox = $('#pix-copy');
  var pixPayload = $('#pix-payload');

  var TYPES = ['url', 'text', 'wifi', 'whatsapp', 'pix', 'email', 'tel', 'sms', 'vcard'];
  var state = { type: 'url', content: '', matrix: null, logo: null };

  // ---------- Leitura dos campos ----------

  function formValues() {
    var v = {};
    $$('input, textarea, select', form).forEach(function (el) {
      if (!el.name) return;
      v[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return v;
  }

  function options() {
    var style = ($('input[name="style"]:checked', custom) || {}).value || 'square';
    var ecl = $('select[name="ecl"]', custom).value;
    if (state.logo && ecl !== 'H') ecl = 'H';
    return {
      fg: $('input[name="fg"]', custom).value,
      bg: $('input[name="bg"]', custom).value,
      transparent: $('input[name="transparent"]', custom).checked,
      style: style,
      size: parseInt($('select[name="size"]', custom).value, 10),
      margin: parseInt($('input[name="margin"]', custom).value, 10),
      ecl: ecl
    };
  }

  // ---------- Desenho ----------

  function geometry(n, margin, targetPx) {
    var total = n + margin * 2;
    var cell = Math.max(1, Math.floor(targetPx / total));
    return { total: total, cell: cell, px: cell * total };
  }

  function drawToCanvas(cv, targetPx) {
    var m = state.matrix, o = options();
    var g = geometry(m.n, o.margin, targetPx);
    cv.width = g.px;
    cv.height = g.px;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, g.px, g.px);
    if (!o.transparent) {
      ctx.fillStyle = o.bg;
      ctx.fillRect(0, 0, g.px, g.px);
    }
    ctx.save();
    ctx.scale(g.cell, g.cell);
    ctx.fillStyle = o.fg;
    ctx.fill(new Path2D(App.buildPath(m, o.style, o.margin, !!state.logo)), 'evenodd');
    ctx.restore();

    var hole = App.logoArea(m.n, !!state.logo);
    if (hole && state.logo) {
      var pad = 0.5;
      var x = (hole.start + o.margin + pad) * g.cell;
      var s = (hole.size - pad * 2) * g.cell;
      var img = state.logo.img;
      var ratio = Math.min(s / img.naturalWidth, s / img.naturalHeight);
      var w = img.naturalWidth * ratio, h = img.naturalHeight * ratio;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, x + (s - w) / 2, x + (s - h) / 2, w, h);
    }
    return g;
  }

  function buildSvg() {
    var m = state.matrix, o = options();
    var g = geometry(m.n, o.margin, o.size);
    var parts = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + g.total + ' ' + g.total +
        '" width="' + g.px + '" height="' + g.px + '"' + (o.style === 'square' ? ' shape-rendering="crispEdges"' : '') + '>'
    ];
    if (!o.transparent) parts.push('<rect width="' + g.total + '" height="' + g.total + '" fill="' + o.bg + '"/>');
    parts.push('<path fill="' + o.fg + '" fill-rule="evenodd" d="' + App.buildPath(m, o.style, o.margin, !!state.logo) + '"/>');
    var hole = App.logoArea(m.n, !!state.logo);
    if (hole && state.logo) {
      var pad = 0.5;
      var x = hole.start + o.margin + pad, s = hole.size - pad * 2;
      parts.push('<image x="' + x + '" y="' + x + '" width="' + s + '" height="' + s +
        '" preserveAspectRatio="xMidYMid meet" href="' + state.logo.dataUrl + '" xlink:href="' + state.logo.dataUrl + '"/>');
    }
    parts.push('</svg>');
    return parts.join('\n');
  }

  // ---------- Contraste ----------

  function luminance(hex) {
    var n = parseInt(hex.slice(1), 16);
    var rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }

  function contrastWarning(o) {
    var lf = luminance(o.fg);
    if (o.transparent) {
      return lf > 0.6 ? 'Código claro em fundo transparente: só vai funcionar sobre um fundo escuro.' : '';
    }
    var lb = luminance(o.bg);
    if (lf > lb) return 'O código está mais claro que o fundo. Muitos leitores não conseguem ler assim.';
    var ratio = (lb + 0.05) / (lf + 0.05);
    if (ratio < 3) return 'Pouco contraste entre as cores. Alguns celulares podem não ler.';
    return '';
  }

  // ---------- Atualização ----------

  function setMsg(text, warn) {
    msg.textContent = text || '';
    msg.classList.toggle('warn', !!warn);
  }

  function setReady(ready) {
    box.classList.toggle('is-empty', !ready);
    btnPng.disabled = btnSvg.disabled = btnCopy.disabled = !ready;
  }

  function update() {
    var res = App.buildContent(state.type, formValues());
    state.content = res.text || '';
    pixBox.hidden = !(res.pix && state.content);
    if (res.pix) pixPayload.value = state.content;

    if (!state.content) {
      state.matrix = null;
      setReady(false);
      setMsg(res.error || '', !!res.error);
      return;
    }

    var o = options();
    var m = App.makeMatrix(state.content, o.ecl);
    if (!m) {
      state.matrix = null;
      setReady(false);
      setMsg('Conteúdo grande demais para um QR Code. Encurte o texto ou reduza a correção de erros.', true);
      return;
    }
    state.matrix = m;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    drawToCanvas(canvas, Math.round(box.clientWidth * dpr) || 640);
    canvas.style.imageRendering = o.style === 'square' ? 'pixelated' : 'auto';
    setReady(true);

    var warn = contrastWarning(o);
    if (warn) setMsg(warn, true);
    else {
      var g = geometry(m.n, o.margin, o.size);
      setMsg(m.n + '×' + m.n + ' módulos · download em ' + g.px + '×' + g.px + ' px' + (state.logo ? ' · correção máxima (logo)' : ''));
    }
  }

  var timer = null;
  function scheduleUpdate() {
    clearTimeout(timer);
    timer = setTimeout(update, 90);
  }

  // ---------- Abas ----------

  function selectType(type, focus) {
    if (TYPES.indexOf(type) < 0) type = 'url';
    state.type = type;
    $$('.tabs [role="tab"]').forEach(function (b) {
      var on = b.dataset.type === type;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (on && focus) { b.focus(); }
      if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    $$('fieldset[data-type]', form).forEach(function (f) { f.hidden = f.dataset.type !== type; });
    try { history.replaceState(null, '', type === 'url' ? location.pathname + location.search : '#' + type); } catch (e) { /* ignora */ }
    update();
  }

  $$('.tabs [role="tab"]').forEach(function (b) {
    b.addEventListener('click', function () { selectType(b.dataset.type); });
    b.addEventListener('keydown', function (e) {
      var i = TYPES.indexOf(state.type);
      if (e.key === 'ArrowRight') { e.preventDefault(); selectType(TYPES[(i + 1) % TYPES.length], true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); selectType(TYPES[(i - 1 + TYPES.length) % TYPES.length], true); }
    });
  });

  // Placeholder da chave Pix acompanha o tipo escolhido
  var pixPlaceholders = { cpf: '000.000.000-00', phone: '(11) 91234-5678', email: 'voce@email.com', random: '123e4567-e89b-12d3-a456-426614174000' };
  $('select[name="pix_type"]').addEventListener('change', function (e) {
    $('input[name="pix_key"]').placeholder = pixPlaceholders[e.target.value];
  });

  form.addEventListener('input', scheduleUpdate);
  form.addEventListener('change', scheduleUpdate);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  custom.addEventListener('input', function (e) {
    var out = $('output[data-for="' + e.target.name + '"]', custom);
    if (out) out.textContent = e.target.type === 'color' ? e.target.value.toUpperCase() : e.target.value;
    scheduleUpdate();
  });
  custom.addEventListener('change', scheduleUpdate);
  window.addEventListener('resize', scheduleUpdate);

  // ---------- Logo ----------

  var logoInput = $('input[name="logo"]', custom);
  var logoThumb = $('#logo-thumb');
  var logoRemove = $('#logo-remove');

  logoInput.addEventListener('change', function () {
    var file = logoInput.files && logoInput.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Escolha um arquivo de imagem.'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        state.logo = { img: img, dataUrl: reader.result };
        logoThumb.src = reader.result;
        logoThumb.hidden = false;
        logoRemove.hidden = false;
        update();
      };
      img.onerror = function () { toast('Não foi possível abrir essa imagem.'); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  logoRemove.addEventListener('click', function () {
    state.logo = null;
    logoInput.value = '';
    logoThumb.hidden = true;
    logoThumb.removeAttribute('src');
    logoRemove.hidden = true;
    update();
  });

  // ---------- Download e cópia ----------

  function fileName(ext) {
    return 'qrcode-' + state.type + '.' + ext;
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function exportCanvas() {
    var cv = document.createElement('canvas');
    drawToCanvas(cv, options().size);
    return cv;
  }

  btnPng.addEventListener('click', function () {
    if (!state.matrix) return;
    exportCanvas().toBlob(function (blob) {
      if (!blob) { toast('Não foi possível gerar o PNG.'); return; }
      downloadBlob(blob, fileName('png'));
      toast('PNG baixado!');
    }, 'image/png');
  });

  btnSvg.addEventListener('click', function () {
    if (!state.matrix) return;
    downloadBlob(new Blob([buildSvg()], { type: 'image/svg+xml' }), fileName('svg'));
    toast('SVG baixado!');
  });

  btnCopy.addEventListener('click', function () {
    if (!state.matrix) return;
    var cv = exportCanvas();
    try {
      var item = new ClipboardItem({
        'image/png': new Promise(function (resolve, reject) {
          cv.toBlob(function (b) { b ? resolve(b) : reject(new Error('blob')); }, 'image/png');
        })
      });
      navigator.clipboard.write([item]).then(
        function () { toast('Imagem copiada! Cole onde quiser.'); },
        function () { toast('Seu navegador não deixou copiar. Use “Baixar PNG”.'); }
      );
    } catch (e) {
      toast('Seu navegador não deixou copiar. Use “Baixar PNG”.');
    }
  });

  $('#copy-pix').addEventListener('click', function () {
    var text = pixPayload.value;
    function fallback() {
      pixPayload.select();
      try { document.execCommand('copy'); toast('Código Pix copiado!'); }
      catch (e) { toast('Selecione o texto e copie manualmente.'); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Código Pix copiado!'); }, fallback);
    } else fallback();
  });

  // ---------- Toast ----------

  var toastEl = $('#toast'), toastTimer = null;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
  }

  // ---------- Início ----------

  selectType((location.hash || '').slice(1) || 'url');
  window.addEventListener('hashchange', function () { selectType((location.hash || '').slice(1) || 'url'); });
})();
