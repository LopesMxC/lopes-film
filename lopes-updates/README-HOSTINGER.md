# Site de atualizações Lopes (Hostinger)

Site em PHP puro, sem banco de dados. Guarda os instaladores, gera o feed que os apps leem e mostra a página pública de downloads.

## 1. Subir
1. No hPanel da Hostinger, abra **Arquivos → Gerenciador de arquivos** e entre em `public_html` (ou na pasta do subdomínio, ex.: `updates.seudominio.com`).
2. Envie **todo o conteúdo** da pasta `lopes-updates/` (não a pasta em si). Ficam `index.php`, `api.php`, `lib.php`, `partials.php`, `.htaccess`, `assets/`, `admin/`, `data/`, `feed/`.
3. Em **Avançado → Configuração do PHP**, use PHP 8.1 ou superior.
4. Aumente os limites só se quiser (o envio é feito em pedaços de 2 MB, então o padrão já funciona).
5. Confira que `data/` e `feed/` são graváveis (permissão 755 costuma bastar; se der erro ao publicar, use 775).

## 2. Primeiro acesso
Abra `https://SEU-SITE/admin/`. Na primeira vez, o painel pede para **criar a senha** (mínimo 10 caracteres). Depois disso só entra com ela. Após 8 tentativas erradas em 15 minutos, o IP fica bloqueado por um tempo.

## 3. Publicar uma versão
1. Compile o app (`COMPILAR.bat`) e pegue o `*-Setup-x64.exe`.
2. Em **Enviar versão**, solte o `.exe`, confira app e versão, escolha o canal e escreva as notas:
   - `+ algo novo`  `~ algo melhorado`  `! algo corrigido`
3. **Publicar versão**. O site calcula o SHA-512 e gera `feed/<app>/latest.yml` (ou `beta.yml`).

A versão deve ser **maior** que a instalada para o app oferecer a atualização.

## 4. Ligar os apps ao site
O endereço do feed do Lopes.Film é `https://SEU-SITE/feed/lopes-film` (HTTPS obrigatório).
- Em `brands/lopes/brand.json`, preencha `"updates": "https://SEU-SITE/feed/lopes-film"`, **ou**
- compile com a variável `LOPESFILM_UPDATE_FEED=https://SEU-SITE/feed/lopes-film`.

Sem esse endereço, o app não procura atualização (de propósito: nunca consulta o feed do projeto original).

Outros apps: crie em **Aplicativos** com um identificador (ex.: `lopes-tools`); o feed fica em `.../feed/lopes-tools`.

## 5. Como o usuário vê
O app confere ao abrir e de tempos em tempos, baixa em segundo plano e mostra a janela com as notas: **Atualizar agora** ou **Depois** (instala ao fechar; se continuar pendente, avisa de novo ao abrir). Na primeira abertura depois de atualizar, mostra a janela de novidades.

## Segurança
- `data/` guarda a senha (hash) e a lista de versões: o `.htaccess` bloqueia o acesso direto. Teste abrindo `https://SEU-SITE/data/config.json` (deve dar 403/404).
- Faça backup de `data/` e `feed/` de vez em quando.
