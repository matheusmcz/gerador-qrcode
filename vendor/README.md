# Dependências copiadas para o projeto

O site não usa npm nem CDN em produção. A única dependência fica neste diretório,
para que nada de fora possa ser trocado sem passar por um commit.

## qrcode.js

- **O que é:** codificador de QR Code de Kazuhiko Arase (licença MIT).
- **De onde veio:** cópia incluída no pacote npm `qrcode-terminal` versão `0.12.0`
  (`vendor/QRCode/*.js`), juntada em um único arquivo para o navegador.
- **SHA-256:** `5327da98a530dfb9f6a89a5890bea69f21ef6be03d63bf9a4bc1560d82323deb`

Para conferir se o arquivo não foi alterado:

```bash
sha256sum vendor/qrcode.js
```

Se precisar atualizar, troque o arquivo em um commit separado, explique a origem
na mensagem do commit e atualize o hash acima.
