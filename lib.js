/*
 * Funções puras do gerador: montagem do conteúdo de cada tipo de QR Code,
 * payload Pix (BR Code) e desenho do código como um caminho vetorial.
 * Usadas pelo app.js no navegador e pelos testes em Node.
 */
(function (global) {
  'use strict';

  // ---------- Utilidades ----------

  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  function stripAccents(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Converte texto em uma "string binária" UTF-8 (1 caractere = 1 byte),
  // que é o que o codificador de QR Code espera no modo byte.
  function toUtf8Bytes(str) {
    var bytes = new TextEncoder().encode(str);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return out;
  }

  // Telefone em formato internacional, só dígitos. Números brasileiros
  // (10 ou 11 dígitos, com DDD) ganham o 55 na frente.
  function intlPhone(raw) {
    var s = String(raw || '').trim();
    var d = digits(s);
    if (!d) return '';
    if (s.charAt(0) === '+') return d;
    if (d.length >= 12 && d.indexOf('55') === 0) return d;
    if (d.length === 10 || d.length === 11) return '55' + d;
    return d;
  }

  // ---------- Conteúdo por tipo ----------

  function buildUrl(v) {
    var u = String(v.url || '').trim();
    if (!u) return { error: null, text: '' };
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u) && /^[^\s]+\.[^\s]{2,}$/.test(u)) u = 'https://' + u;
    return { text: u };
  }

  function buildText(v) { return { text: String(v.text || '') }; }

  function wifiEscape(s) { return String(s).replace(/([\\;,:"])/g, '\\$1'); }

  function buildWifi(v) {
    var ssid = String(v.wifi_ssid || '');
    if (!ssid.trim()) return { text: '' };
    var enc = v.wifi_enc || 'WPA';
    var pass = String(v.wifi_pass || '');
    if (enc !== 'nopass' && !pass) return { text: '', error: 'Digite a senha da rede (ou escolha “Sem senha”).' };
    var s = 'WIFI:T:' + enc + ';S:' + wifiEscape(ssid) + ';';
    if (enc !== 'nopass') s += 'P:' + wifiEscape(pass) + ';';
    if (v.wifi_hidden) s += 'H:true;';
    return { text: s + ';' };
  }

  function buildWhatsapp(v) {
    var phone = intlPhone(v.wa_phone);
    if (!phone) return { text: '' };
    if (phone.length < 8) return { text: '', error: 'Número muito curto. Inclua o DDD.' };
    var msg = String(v.wa_msg || '').trim();
    return { text: 'https://wa.me/' + phone + (msg ? '?text=' + encodeURIComponent(msg) : '') };
  }

  function buildEmail(v) {
    var to = String(v.email_to || '').trim();
    if (!to) return { text: '' };
    var q = [];
    if (v.email_subject) q.push('subject=' + encodeURIComponent(v.email_subject));
    if (v.email_body) q.push('body=' + encodeURIComponent(v.email_body));
    return { text: 'mailto:' + to + (q.length ? '?' + q.join('&') : '') };
  }

  function buildTel(v) {
    var p = intlPhone(v.tel);
    if (!p) return { text: '' };
    return { text: 'tel:+' + p };
  }

  function buildSms(v) {
    var p = intlPhone(v.sms_phone);
    if (!p) return { text: '' };
    return { text: 'SMSTO:+' + p + ':' + String(v.sms_msg || '') };
  }

  function vEsc(s) { return String(s || '').trim().replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n'); }

  function buildVcard(v) {
    var first = vEsc(v.vc_first), last = vEsc(v.vc_last);
    if (!first && !last && !v.vc_phone && !v.vc_email) return { text: '' };
    var lines = ['BEGIN:VCARD', 'VERSION:3.0',
      'N:' + last + ';' + first + ';;;',
      'FN:' + [first, last].filter(Boolean).join(' ')];
    if (v.vc_org) lines.push('ORG:' + vEsc(v.vc_org));
    if (v.vc_title) lines.push('TITLE:' + vEsc(v.vc_title));
    var p = intlPhone(v.vc_phone);
    if (p) lines.push('TEL;TYPE=CELL:+' + p);
    if (v.vc_email) lines.push('EMAIL:' + vEsc(v.vc_email));
    if (v.vc_url) {
      var u = buildUrl({ url: v.vc_url }).text;
      lines.push('URL:' + vEsc(u));
    }
    lines.push('END:VCARD');
    return { text: lines.join('\r\n') };
  }

  // ---------- Pix (BR Code estático, padrão EMV do Banco Central) ----------

  function tlv(id, value) {
    var len = String(value.length);
    if (len.length < 2) len = '0' + len;
    return id + len + value;
  }

  // CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF)
  function crc16(str) {
    var crc = 0xFFFF;
    for (var i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (var j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    var hex = crc.toString(16).toUpperCase();
    while (hex.length < 4) hex = '0' + hex;
    return hex;
  }

  function pixText(s, max, upper) {
    var t = stripAccents(s).replace(/[^A-Za-z0-9 .,\-\/]/g, '').replace(/\s+/g, ' ').trim();
    if (upper) t = t.toUpperCase();
    return t.slice(0, max).trim();
  }

  function normalizePixKey(type, raw) {
    var k = String(raw || '').trim();
    if (!k) return { key: '' };
    if (type === 'cpf') {
      var d = digits(k);
      if (d.length !== 11 && d.length !== 14) return { key: '', error: 'CPF deve ter 11 dígitos e CNPJ, 14.' };
      return { key: d };
    }
    if (type === 'phone') {
      var p = intlPhone(k);
      if (p.length < 12) return { key: '', error: 'Celular deve ter DDD + número.' };
      return { key: '+' + p };
    }
    if (type === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k)) return { key: '', error: 'E-mail da chave parece inválido.' };
      return { key: k.toLowerCase() };
    }
    // chave aleatória (EVP)
    var r = k.toLowerCase().replace(/\s/g, '');
    if (!/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/.test(r)) {
      return { key: '', error: 'Chave aleatória deve ter 32 caracteres (formato 0000aaaa-…).' };
    }
    if (r.indexOf('-') < 0) r = r.slice(0, 8) + '-' + r.slice(8, 12) + '-' + r.slice(12, 16) + '-' + r.slice(16, 20) + '-' + r.slice(20);
    return { key: r };
  }

  function parseAmount(raw) {
    var s = String(raw || '').trim().replace(/[R$\s]/g, '');
    if (!s) return { amount: '' };
    // aceita 1.234,56 / 1234,56 / 1234.56
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return { amount: '', error: 'Valor inválido. Use, por exemplo, 25,90.' };
    var n = Number(s);
    if (!(n > 0)) return { amount: '' };
    if (n > 9999999999.99) return { amount: '', error: 'Valor alto demais.' };
    return { amount: n.toFixed(2) };
  }

  function buildPix(v) {
    var keyInfo = normalizePixKey(v.pix_type || 'cpf', v.pix_key);
    var name = pixText(v.pix_name, 25, true);
    var city = pixText(v.pix_city, 15, true);
    if (!String(v.pix_key || '').trim() && !name && !city) return { text: '' };
    if (keyInfo.error) return { text: '', error: keyInfo.error };
    if (!keyInfo.key) return { text: '', error: 'Informe a chave Pix.' };
    if (!name) return { text: '', error: 'Informe o nome de quem recebe.' };
    if (!city) return { text: '', error: 'Informe a cidade de quem recebe.' };
    var amt = parseAmount(v.pix_amount);
    if (amt.error) return { text: '', error: amt.error };

    var gui = tlv('00', 'br.gov.bcb.pix');
    var keyField = tlv('01', keyInfo.key);
    var room = 99 - gui.length - keyField.length - 4;
    var desc = room > 0 ? pixText(v.pix_desc, Math.min(room, 72), false) : '';
    var mai = gui + keyField + (desc ? tlv('02', desc) : '');

    var txid = String(v.pix_txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';

    var payload =
      tlv('00', '01') +
      tlv('26', mai) +
      tlv('52', '0000') +
      tlv('53', '986') +
      (amt.amount ? tlv('54', amt.amount) : '') +
      tlv('58', 'BR') +
      tlv('59', name) +
      tlv('60', city) +
      tlv('62', tlv('05', txid)) +
      '6304';
    payload += crc16(payload);
    return { text: payload, pix: true };
  }

  var builders = {
    url: buildUrl, text: buildText, wifi: buildWifi, whatsapp: buildWhatsapp,
    pix: buildPix, email: buildEmail, tel: buildTel, sms: buildSms, vcard: buildVcard
  };

  function buildContent(type, values) {
    var fn = builders[type];
    return fn ? fn(values || {}) : { text: '' };
  }

  // ---------- Matriz do QR Code ----------

  function makeMatrix(text, ecl) {
    var Lib = global.QRLib;
    var qr = new Lib.QRCode(-1, Lib.ECL[ecl] !== undefined ? Lib.ECL[ecl] : Lib.ECL.M);
    qr.addData(toUtf8Bytes(text));
    try {
      qr.make();
    } catch (e) {
      return null; // conteúdo grande demais para um QR Code
    }
    var n = qr.getModuleCount();
    var rows = [];
    for (var r = 0; r < n; r++) {
      var row = [];
      for (var c = 0; c < n; c++) row.push(!!qr.isDark(r, c));
      rows.push(row);
    }
    return { n: n, rows: rows };
  }

  // ---------- Desenho vetorial ----------

  function num(x) { return Math.round(x * 1000) / 1000; }

  // Retângulo com raio individual por canto [tl, tr, br, bl], em unidades de módulo.
  function rectPath(x, y, w, h, r) {
    var tl = r[0], tr = r[1], br = r[2], bl = r[3];
    return 'M' + num(x + tl) + ' ' + num(y) +
      'H' + num(x + w - tr) + (tr ? 'A' + tr + ' ' + tr + ' 0 0 1 ' + num(x + w) + ' ' + num(y + tr) : '') +
      'V' + num(y + h - br) + (br ? 'A' + br + ' ' + br + ' 0 0 1 ' + num(x + w - br) + ' ' + num(y + h) : '') +
      'H' + num(x + bl) + (bl ? 'A' + bl + ' ' + bl + ' 0 0 1 ' + num(x) + ' ' + num(y + h - bl) : '') +
      'V' + num(y + tl) + (tl ? 'A' + tl + ' ' + tl + ' 0 0 1 ' + num(x + tl) + ' ' + num(y) : '') + 'Z';
  }

  function circlePath(cx, cy, rad) {
    return 'M' + num(cx - rad) + ' ' + num(cy) +
      'a' + rad + ' ' + rad + ' 0 1 0 ' + num(rad * 2) + ' 0' +
      'a' + rad + ' ' + rad + ' 0 1 0 ' + num(-rad * 2) + ' 0Z';
  }

  function isFinder(r, c, n) {
    return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  }

  // Área central reservada para o logo, alinhada à grade de módulos.
  function logoArea(n, hasLogo) {
    if (!hasLogo) return null;
    var size = Math.floor(n * 0.24);
    if ((n - size) % 2) size++;
    var start = (n - size) / 2;
    return { start: start, end: start + size, size: size };
  }

  // Gera um único "d" de path SVG para o código inteiro (fill-rule evenodd),
  // com origem já deslocada pela margem.
  function buildPath(m, style, margin, hasLogo) {
    var n = m.n, rows = m.rows, d = '';
    var hole = logoArea(n, hasLogo);
    function dark(r, c) { return r >= 0 && c >= 0 && r < n && c < n && rows[r][c]; }
    function inHole(r, c) { return hole && r >= hole.start && r < hole.end && c >= hole.start && c < hole.end; }

    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (!rows[r][c] || isFinder(r, c, n) || inHole(r, c)) continue;
        var x = c + margin, y = r + margin;
        if (style === 'dots') {
          d += circlePath(x + 0.5, y + 0.5, 0.48);
        } else if (style === 'rounded') {
          var up = dark(r - 1, c), dn = dark(r + 1, c), lf = dark(r, c - 1), rt = dark(r, c + 1);
          var R = 0.5;
          d += rectPath(x, y, 1, 1, [(!up && !lf) ? R : 0, (!up && !rt) ? R : 0, (!dn && !rt) ? R : 0, (!dn && !lf) ? R : 0]);
        } else {
          // junta módulos vizinhos na mesma linha para um path mais leve
          var len = 1;
          while (c + len < n && rows[r][c + len] && !isFinder(r, c + len, n) && !inHole(r, c + len)) len++;
          d += 'M' + x + ' ' + y + 'h' + len + 'v1h' + (-len) + 'Z';
          c += len - 1;
        }
      }
    }

    // Olhos (padrões de posição)
    var corners = [[0, 0], [0, n - 7], [n - 7, 0]];
    for (var i = 0; i < corners.length; i++) {
      var fy = corners[i][0] + margin, fx = corners[i][1] + margin;
      // Raios moderados: cantos muito redondos atrapalham alguns leitores.
      var ro = style === 'square' ? 0 : 1;
      var ri = style === 'square' ? 0 : 0.5;
      var rc = style === 'square' ? 0 : (style === 'dots' ? 1.5 : 1);
      d += rectPath(fx, fy, 7, 7, [ro, ro, ro, ro]);
      d += rectPath(fx + 1, fy + 1, 5, 5, [ri, ri, ri, ri]);
      d += rectPath(fx + 2, fy + 2, 3, 3, [rc, rc, rc, rc]);
    }
    return d;
  }

  global.QRApp = {
    buildContent: buildContent,
    makeMatrix: makeMatrix,
    buildPath: buildPath,
    logoArea: logoArea,
    toUtf8Bytes: toUtf8Bytes,
    crc16: crc16,
    intlPhone: intlPhone,
    parseAmount: parseAmount
  };
})(typeof window !== 'undefined' ? window : globalThis);
