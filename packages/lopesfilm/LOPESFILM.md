# v42
- **Projetos após atualizar**: um projeto cuja pasta sumiu da lista ("pasta não encontrada") agora é procurado de novo pelo id (`.film/id`) e pelo nome da pasta em todas as bibliotecas conhecidas (Lopes.Film, GlobalFilm, VerkzFilm, OpenFilm) e na escolhida em Configurações. Achando, a lista passa a apontar para ele. Se a pasta realmente não existe em lugar nenhum, continua aparecendo como ausente. Não reproduzi o seu caso exato: se acontecer de novo, me diga o caminho que aparece no erro.
- **Skill atrás do chat**: a página de uma skill (Testar agora / Instalar / Desinstalar) agora termina acima do compositor do chat, com espaço para rolar até o último botão.
- **Cursores do agente em tempo real**: andam mais rápido (e aceleram quando há fila), e enquanto o agente lê/pensa/renderiza passeiam pelos clipes e pelo cursor de reprodução, em vez de ficar parados. Barra de progresso no topo e uma pílula "Agente · ação · N alterações". Depende do app dizer que o agente está trabalhando; não testei no Electron.
- **Espectrograma**: painel SPEC refeito como os scopes do DaVinci: analisador de espectro (curva suave com preenchimento, linha de pico, grade em dB) e espectrograma com resolução real da tela, suavizado em frequência e tempo, paleta magma e escala de frequência (50 Hz–10 kHz). Verificado por captura de tela com áudio sintético.
- **Legendas**: transcrição agora usa o Whisper large-v3-turbo neste computador primeiro. O Voice Studio (ou outro serviço) só é usado se você escolher em Configurações > Serviços (o app lembra que foi escolha sua) ou com `--via`. Se o Whisper não puder rodar, cai no serviço como antes.
- **Skills de economia**: novas `economy-input` (ler menos), `economy-output` (escrever menos) e `economy-prompt` (formular certo de primeira), ligadas por padrão em toda sessão.
- **Feedback visual**: ver cursores acima.
- **Vídeo "Como usar"**: refeito como projeto Remotion (TSX: springs, TransitionSeries, cursor que opera a timeline, barra de progresso, check desenhado), 1280x720, pt-BR e en, renderizado pelo próprio Lopes.Film (`scripts/howto-remotion.mjs`). Serve também de teste da camada Remotion. Sem voz, música gerada.
- **Edição com Remotion**: não achei o defeito só pela descrição; o vídeo acima exercita a camada inteira (TSX, import, transitions, paths, noise) e renderiza sem erros. Preciso de um exemplo do que falhou (o código ou a mensagem).

# v41
- **Notificações no Windows**: o app agora registra sua identidade de notificação a cada início (chave `HKCU\Software\Classes\AppUserModelId` e atalho no Menu Iniciar com o ID), que é o que o Windows exige para mostrar o aviso. Nova opção **"Também com o Lopes.Film em primeiro plano"** e botão **"Testar notificação"** em Configurações > Notificações (diz se o Windows mostrou, recusou ou não respondeu; recusas vão para `studio.log`). Não consegui testar em Windows aqui: se o teste não mostrar nada, veja Assistente de foco/Não incomodar e me mande o `studio.log`.
- **Correção dos olhos**: agora há uma seção **"Correção dos olhos"** no painel de propriedades de qualquer clipe de vídeo (intensidade leve/média/total; o corrigido substitui o clipe, Desfazer volta). Antes só o agente podia usá-la.
- **Espectro circular** (estilo Premiere/Resolve): modelo `audio-spectrum-circular.html` com barras radiais espelhadas, pontos de pico e brilho, FFT real do áudio (idêntico em preview, scrub e exportação). Documentado no manual de motion. Verificado com capturas de tela; não testado com seu áudio nem na exportação do Studio.
- Correção do build: a janela Sobre (v39) usava `@/` dentro de `import.meta.glob`, que o Vite recusa ("Invalid glob") e quebrava o instalador do GlobalFilm. Agora usa caminho relativo.


## v23
- Remake do front end (desenhado antes no Figma, página "Telas"): Configurações (cartões por grupo com barra de acento, navegação com ícones em azulejo, brilho no topo, entrada animada), Início/Projetos (herói "Continuar" com brilho animado, cartões que sobem ao passar o mouse, busca/visualização na cor da marca) e Skills/Descobrir (abas em pílula, cartões animados, botão principal na cor da marca).
- Correção de marca: o tema escuro tinha lima fixo no botão primário, no brilho e no foco; agora tudo deriva de `var(--accent)` (Lopes, Global e Verkz).
- Animações respeitam `prefers-reduced-motion`.

## v23.1
- Correção: o app instalado não abria o Studio ("Studio stopped as it started (1)"). `studio/server/packs-manifest.json` (v22) não estava na lista `files` do pacote, então não ia para o instalador e o servidor caía ao ler o arquivo. Agora está na lista, com teste que impede de voltar.

## v24
- Aba ativa de Skills/Exemplos ficava invisível (a regra global de `[role=tab]` pintava o texto de vermelho sobre o fundo vermelho): corrigido.
- Hovers: botões sem borda não ganham mais contorno ao passar o mouse; botões grandes não encolhem ao clicar; cartões de projeto não "sobem duas vezes"; hover do botão primário sem deslocamento nem brilho que era cortado.
- Guia: o fim sai com fade (antes sumia de uma vez), o confete fica atrás do texto, a etapa do navegador reserva o lugar do "Vinculado" e a área rolável ganhou folga embaixo.
- Windows: a aba nova recebe repintura forçada ao ser exibida (novo projeto só aparecia ao apertar outro botão).
- Exportação concluída/falhou: aviso dentro do app além da notificação do sistema; recusas do sistema vão para o log.
- Aba Sons: o pack de SFX instalado aparece na biblioteca (um grupo por pasta do pack) e pode ser usado no projeto.
- Lateral: abas, caixas de navegação, estado vazio e compositor do chat redesenhados (Figma "Telas").

## v45

- **EffectCraft** (motion graphics, After Effects-style) as a local engine: setup guide installs it (~60 MB, sha256-checked, pinned to v0.4.0); agent verb `effectcraft` (`--steps` JSON or `--script` .jsx, `--commands` to list, renders transparent WebM/ProRes into `assets/video`); notes in the motion skill. Tested with a stub CLI only; verified earlier on Linux that the real CLI makes an alpha WebM. **Not tested:** the Windows download/extract, the alpha clip surviving the Studio's final export.
- **Fix:** the v43 "make a skill?" hook sat after an early return in `ProjectView` (React error #310 could blank the project). Moved above it.
- **Economy:** skills rewritten as budgets; Claude Code gets only a harmless setting by default (no side model calls); the limits (compaction, output caps) are opt-in with `"limits": true`. Off with `~/.lopesfilm/economy.json` `{"enabled":false}`. Savings **not measured**; other agents get only the skill text.
- **Look:** squarer corners everywhere (radius tokens), own clip colours and accent playhead. Not seen in the real editor (screenshots only reached the setup guide).

## v46

- **Fix:** model download answered `416` (a part file as long as the whole one, or a stale one, was "resumed"): now it starts again from the first byte (`providers/localimage.mjs`, test `fetch-resume.test.mjs`).
- **Canvas look:** tool bar is a vertical rail at the left (was a pill at the foot), zoom/map/wires bar at the top right, the five starter cards are one numbered list, all icons have square ends and mitred corners (`svg.lucide` in `globals.css`). Tooltips of the rail open below (they have no "right" side yet). Not seen in the real app: only built and type-checked.

## v47

- **Fix:** the Z-Image-Turbo model (3.86 GB) failed with "File size is greater than 2 GiB": the checksum was read with `readFile`, which refuses a file over 2 GiB. It is now hashed in pieces (`sha256Of`, `providers/localimage.mjs`; test in `fetch-resume.test.mjs`). Tested with a small file only; the real 3.86 GB download was not run.

## v48

- **Fix:** "Wan 2.1 1.3B: fetch failed" (and the same for any big model): a dropped connection stopped the whole download. Now it goes on by itself from the part already fetched (up to 12 tries, waiting 1 s, 2 s, 4 s… up to 30 s), a 404/403 is not retried, and the final message names the real cause (`ECONNRESET`, `ENOTFOUND`…) instead of "fetch failed". Tested with a local server that drops half way; **not tested** against Hugging Face from your network. If it still fails, the message now says why.

## v49

- **Menu "/" no chat:** digitar `/` (no início ou depois de espaço) abre a biblioteca de comandos (Editar, Mídia, Animação e efeitos, Som, Skills, Projeto), filtrável digitando; escolher insere um pedido pronto no campo. PT/EN (os outros idiomas mostram inglês). `apps/desktop/chat/src/components/prompt-editor/slash-menu.ts` + `SlashMenuPlugin.tsx`, teste `apps/desktop/src/slash-menu.test.mjs`. Não testado: digitando no app real (só a lógica e a tipagem).
- **Barra superior:** o botão único "Edição" virou um seletor de duas posições Edição | Canvas (a ativa em destaque).
- **Ícones:** 36 ícones redesenhados no traço próprio (layout, histórico, ponteiro, mão, biblioteca/Shapes, mapa, teclado, lista, grade, usuário, zoom…) em `studio/ui/src/lib/icons.tsx`; os demais seguem com pontas retas por CSS. Ainda restam ícones da biblioteca padrão (cerca de 100).
- Conferido por captura de tela do Studio aqui (edição e canvas), não no Electron.

## v50

- **Fix:** "De um vídeo" (Skills) did nothing: it asked the server for a file dialog first (on Windows it can open behind the window, or the click's permission is gone by then) and swallowed every error. Now the page's own file chooser opens right in the click, a toast says what is happening, and any failure is shown. Not tested in the real Electron app, only type-checked and built.

## v51 (auditoria)

- **Achado/corrigido:** o guia de primeiro uso cobria a tela nos 19 testes de navegador (perfil novo sempre o abre); os testes agora o marcam como visto.
- **Achado/corrigido:** o seletor Edição | Canvas da v49 quebrou testes que dependiam de um único botão; agora é um botão só com os dois lados visíveis (o ativo em destaque), mantendo `data-work-mode`.
- **Achado/corrigido (bug real):** a lista inicial do Canvas vazio capturava o duplo clique no centro, que deveria adicionar um nó; agora só as linhas da lista são clicáveis.
- **Achado, NÃO corrigido:** os 185 itens `text/*` da biblioteca não têm `about` nem `tags` (teste `library-words` falha): a busca `lopesfilm get` não os acha por significado. Funciona, só não é encontrável por descrição.
- **Achado, não verificado:** `canvas-video.test` falha ao ver o primeiro quadro do vídeo (provável falta de decodificador no Chromium headless daqui; não confirmado).
- Varredura de hooks do React (hook depois de return): 0 casos em 174 arquivos. `tsc` do servidor mantém os ~31 erros antigos de tipagem (projects, acestep, localimage), sem efeito em execução.
- O instalador .exe enviado não foi inspecionado (sem 7z aqui).

## v52 (pendências da auditoria)

- **Biblioteca de texto:** os 185 itens `text/*` agora têm `about` e `tags` do vocabulário (`scripts/library-text-words.mjs`, usado por `scripts/library-text.mjs` e aplicado ao `library/index.json`). A busca `lopesfilm get` os acha por "neon", "typewriter", "lower third" etc. As descrições são geradas pelo nome do item: servem para achar, não são textos escritos à mão.
- **Sons importados:** 139 sons dos pacotes Kenney e Lopes só tinham tags do pacote (`sci-fi`, `drone`…); ganharam uma tag do vocabulário (`tech-sound`, `ambience`, `impact`…) em `library/catalogs/sounds-*.json`.
- **`library-words.test`:** passa a aceitar as tags próprias de um pacote importado, desde que haja ao menos uma do vocabulário.
- **`canvas-video.test`:** não era decodificador: o teste dava duplo clique no centro, onde agora fica a lista inicial, e depois no canto, onde o nó saía da tela. Clique movido; passa (testado também com o Chrome do sistema).

## v53

- **Fontes do pacote "Fontes" (Montserrat, Bebas Neue) baixavam mas não apareciam:** (1) a lista de fontes instaladas era lida uma vez por sessão (servidor e tela) e nunca relida; agora o servidor relê a pasta de fontes ao terminar o pacote e a tela pergunta de novo após 8 s; (2) o pacote contava como "instalado" só por ter baixado os arquivos, sem conferir a cópia para a pasta de fontes do usuário (se a cópia falhasse, nunca era refeita); agora só conta quando as fontes estão na pasta; (3) no Windows, depois de registrar, o app avisa os programas abertos (WM_FONTCHANGE). Não testado no Windows/Electron: se o menu ainda não listar, feche e abra o app uma vez.
