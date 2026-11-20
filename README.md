# Gerador de QR Code Grátis

Gerador de QR Code 100% gratuito, sem cadastro, sem marca d'água e sem data de validade.
Tudo roda no navegador: nenhum dado é enviado para servidores.

**Acesse:** https://matheusmcz.github.io/gerador-qrcode/

## O que dá para gerar

| Tipo | O que acontece ao escanear |
| --- | --- |
| Link | Abre o site |
| Texto | Mostra o texto |
| Wi-Fi | Conecta na rede sem digitar a senha |
| WhatsApp | Abre conversa com o número (com mensagem inicial opcional) |
| Pix | Pagamento Pix estático (BR Code), com valor opcional e "Pix Copia e Cola" |
| E-mail | Abre um e-mail já endereçado |
| Telefone | Oferece ligar para o número |
| SMS | Abre um SMS já endereçado |
| Contato | Salva o contato (vCard) na agenda |

## Personalização

- Cor do código e do fundo (ou fundo transparente), com aviso de pouco contraste
- Estilos quadrado, arredondado ou pontos
- Logo no centro (a correção de erros vai para Máxima automaticamente)
- Margem, nível de correção de erros e tamanho do download (até ~2048 px)
- Download em **PNG** ou **SVG**, ou copiar a imagem direto

Dá para abrir direto em um tipo pelo endereço: `#wifi`, `#whatsapp`, `#pix`, `#email`, `#tel`, `#sms`, `#vcard`, `#text`.

## Segurança e privacidade

O site não tem servidor, banco de dados, login nem cookies. Mesmo assim:

- **Nada sai do navegador.** Uma Content-Security-Policy bloqueia qualquer conexão externa
  (`connect-src 'none'`), então senhas de Wi-Fi, chaves Pix e textos nunca são enviados.
- **Só roda código do próprio site.** Sem scripts inline, sem CDN, sem rastreadores.
- **Campos com limite de tamanho** e opções validadas contra listas fixas, também no JavaScript.
- **Upload de logo restrito:** PNG, JPG, WebP ou SVG de até 2 MB. A imagem é sempre redesenhada
  como PNG antes de entrar no QR Code, então o arquivo original (inclusive um SVG com código)
  nunca vai para o SVG exportado.
- **Uma única dependência**, copiada para o repositório com origem e hash em `vendor/README.md`.

O GitHub Pages não permite configurar cabeçalhos HTTP, por isso a política de segurança vai em
tags `<meta>`. Cabeçalhos como `X-Frame-Options` e HSTS só são possíveis em outra hospedagem
(Vercel, Netlify, Cloudflare Pages).

## Rodando localmente

É um site estático, sem build e sem dependências externas:

```bash
git clone https://github.com/matheusmcz/gerador-qrcode.git
cd gerador-qrcode
python3 -m http.server 8000
# abra http://localhost:8000
```

## Estrutura

```
index.html        página
style.css         estilos (tema claro e escuro automáticos)
lib.js            conteúdo de cada tipo, payload Pix e desenho vetorial
app.js            interface, pré-visualização e downloads
vendor/qrcode.js  codificador QR Code (Kazuhiko Arase, licença MIT)
vendor/README.md  origem e hash da dependência
```

## Licença

MIT. O codificador em `vendor/qrcode.js` é de Kazuhiko Arase, também sob licença MIT.
"QR Code" é marca registrada da DENSO WAVE INCORPORATED.
