# Lopes.Film

Fork do Lopes.Film (MIT) por Lopes. Marca, tema lima e as funções abaixo

- **Tokens** — `apps/desktop/src/lopesfilm-optimizer.mjs`: usa um proxy local (ex.: Headroom em http://127.0.0.1:8787) só se ligado e acessível. Ligue com `LOPESFILM_TOKEN_PROXY=1` ou `~/.lopesfilm/optimizer.json` `{"enabled":true,"url":"http://127.0.0.1:8787"}`. Só loopback; nunca toca em chaves. Seção "Economy" no prompt do agente.
- **Roteador de IA** — `chat/src/lib/ai-router.ts`, ligado em `App.tsx`: quando um agente bate no limite, o turno continua no próximo agente pronto, com a conversa até então. Ordem em `localStorage["lopesfilm.router"]` (`{"enabled":true,"order":["claude","codex"]}`).
- **Voice Studio** — provider `voicestudio` (voz, TTS, transcrição) em `http://127.0.0.1:3900` ou `LOPESFILM_VOICESTUDIO_URL`. Rode o Voice Studio à parte.
- **GLB 3D** e **pesquisa** — skills `skills/lopesfilm-3d` e `skills/lopesfilm-research` (instale pela URL do GitHub ou copie para suas skills).

Não testado: UI no Electron (sem tela no ambiente), ícones .icns (macOS), proxy com login por assinatura.

## v44

- **Cursores dos agentes** (`AgentCursor.tsx`) reescritos: um único laço de animação (60 fps, direto no DOM, sem render do React por quadro) move cada cursor com mola criticamente amortecida, então o caminho nunca dá tranco. Enquanto o agente só lê, pensa ou roda comando, o cursor **nunca fica parado**: passeia pelos clips e pelo playhead e respira em micro-movimento; ao editar, voa até o clip, com anel e clique. Testado num navegador com sinal de "trabalhando" simulado: 242 quadros em 4 s, zero saltos, zero quadros parados. Não testado: no Electron, com o sinal real da aba.
- **Atalho fixado na barra de tarefas sobrevive à atualização**: o app guarda uma cópia do atalho fixado a cada abertura e, na primeira abertura de uma versão nova, devolve o atalho se a atualização o levou (`apps/desktop/src/taskbar-pin.mjs`, com teste; quem desafixa à mão não é desfeito). O instalador (`build/installer.nsh`) faz o mesmo do lado dele. O `.nsh` compila no makensis (só os dois macros); não testado: uma atualização real no Windows; o ícone fixado pode só reaparecer depois de reiniciar o Explorer.
- **Logo do OpenFilm removida**: o toast do Windows agora leva o ícone da marca (registro `IconUri` + `icon` na notificação + ícone no atalho), `icon-dev.*`, `logo-1024.png`, o `icon.icns` da marca Verkz e os `docs/logo-*.svg` eram o "F" do OpenFilm e foram trocados pelo LS; o favicon padrão e a imagem do README (captura do OpenFilm) saíram. Ficam apenas identificadores internos que não aparecem (cabeçalhos de commit `Openfilm-Version`, endereços de serviço openfilm.dev, créditos de licença).

## v43

- **Medidor de tokens** abaixo da barra do chat (`chat/src/components/TokenMeter.tsx`, `lib/token-ledger.ts`): usados, economizados (lidos do cache), custo ≈ US$ e média por turno; clique abre o detalhe. Cada turno é contado uma vez, ao terminar, a partir do log; soma guardada por projeto neste computador. O dólar é **estimativa** por preço de tabela da família do modelo (assinatura Claude Code/Codex não cobra por token: é o que custaria na API). "Economizados" = tokens lidos do cache, não mede o efeito das skills de economia.
- **Menu "Deseja fazer uma skill padrão deste vídeo?"** (`studio/ui/src/components/SkillOffer.tsx`, montado em `ProjectView`): aparece quando o agente termina uma rodada que mudou o filme. Sim escreve o pedido no campo do chat (você envia); Não fecha; "Não perguntar mais" fica guardado.
- **Efeitos sonoros locais**: provider `stableaudio` (Stable Audio Open 1.0) + servidor em `tools/sfx-server` (`INICIAR.bat`, porta 8002 ou `LOPESFILM_SFX_URL`). Precisa aceitar a licença do modelo no Hugging Face e fazer `huggingface-cli login`.

- **Remotion com várias composições**: o `src` de um clip no film.html não aceita `?composition=` (era esse o erro "is no clip a film plays"). Agora uma página com o nome da composição a desenha (`remo/Abertura.html` → `<Composition id="Abertura">`); `index.html` desenha a primeira. A skill `remotion` foi corrigida para ensinar isso.

Não testado: o servidor Python/GPU (sem GPU aqui; só o provider com servidor simulado), o medidor com logs reais do Electron, o menu no app instalado.

## Novidades (2ª leva)
- **Filtro de Skills** por categoria (Edição, Otimização, Função, Personalização): `category` no `lopesfilm.json` ou no cabeçalho do SKILL.md; sem ela, é deduzida do texto.
- **Sound Pack** (99 sons, convertidos para MP3) na biblioteca padrão: `library/sounds/pack-*.mp3`. Licença: a do autor do pacote.
- **Música da web**: `lopesfilm get web-music --prompt "..." --out nome` (Jamendo, chave grátis em Configurações → Serviços); a skill `lopesfilm-music` coloca no vídeo e credita.
- **8 transições novas** (diagonal, persianas, serrilhado, ondas, barras, pontos, portas, estrias) e **8 efeitos de palavra nas legendas** (deslizar, queda, zoom, giro, inclinar, tremor, brilho, glitch).

## Novidades (3ª leva)
- **Limpeza de áudio** (local, só ffmpeg): `lopesfilm get audio-clean --src <gravação> --out nome [--denoise light|medium|strong] [--voice] [--eq voice|podcast|warm|bright|bass-cut|telephone] [--hum 50|60] [--normalize -16|off]` → `assets/audio/clean/<nome>.m4a`. Remove ruído (afftdn) e zumbido, realça voz (de-esser, compressor, presença), equaliza e normaliza (loudnorm). `get audio-clean --help` mostra as opções.
- **Voz embutida** (`Lopes.Film voice`, provider `supertonic`): Supertonic 3, 31 idiomas (inclui português), 10 vozes (`pt-F3`, `en-M1`…), roda na CPU, sem conta nem chave. Estudei o Voice Studio: o motor padrão dele (OmniVoice) tem licença não comercial e pede 2,4 GB + Python; o Supertonic tem SDK MIT e pesos OpenRAIL-M. Baixa ~400 MB do Hugging Face no primeiro uso para `~/.lopesfilm/models/supertonic-3`. Usa `onnxruntime-web` (WASM, já vem no pacote); se você rodar `npm i onnxruntime-node` fica ~5× mais rápido.
- **Imagem embutida** (`Lopes.Film image`, provider `localimage`): Z-Image-Turbo (Apache-2.0) quantizado Q4_K + stable-diffusion.cpp (Vulkan; qualquer GPU NVIDIA/AMD/Intel), com o texto-encoder na RAM: precisa de ~4 GB de VRAM, cabe na RTX 3050 6 GB. Baixa ~7 GB no primeiro uso para `~/.lopesfilm/models/image` (retoma se cair). `lopesfilm get image --prompt "..." --out nome --ratio 16:9 --quality low|medium|high --via localimage`. **Não executei o sd-cli aqui** (ambiente bloqueou): se o primeiro teste falhar, a mensagem de erro traz a saída do programa.
- **Exportação**: já usa vários navegadores em paralelo + codificação por GPU (NVENC na sua placa) com limites medidos pelos autores; não alterei às cegas. Use `--workers N` para testar.
- **Interface**: desenhada no Figma (arquivo "Lopes.Film — Interface estilo Resolve", https://www.figma.com/design/1Xeh8PeIi3uS1sSm7xrsoU); aplicada como novo tema escuro (carvão + linhas finas + lima, playhead com brilho, botão primário em gradiente, abas com sublinhado) em `studio/ui/src/globals.css`. As abas de página (Mídia/Corte/Cor/Áudio/Entrega) ficaram só no desenho, ainda não no código.

- **Layout do viewer**: os dois espectrogramas (cinza e cor) ficam abertos na lateral direita do viewport (botão SPEC fecha/abre) e uma barra acima do viewport escolhe o formato (16:9, 9:16, 1:1, 4:3 + menu com todos). Não vi a tela rodando.

## Novidades (4ª leva)
- **Interface em português (Brasil)**: Studio (`studio/ui/src/i18n/pt-BR.ts`, 2.9 mil textos), chat do app e menus/diálogos do app desktop. É escolhida sozinha quando o sistema está em `pt*`; também em Configurações → Geral → Idioma.
- **Mais buscas abertas/gratuitas**: imagem — Unsplash (chave grátis), Openverse e Wikimedia Commons (sem chave), NASA (sem chave); vídeo — Coverr (chave grátis), Wikimedia, NASA; web — Jina (chave), SearXNG (seu servidor, `LOPESFILM_SEARXNG_URL`), Wikipédia (sem chave); música — Openverse + Jamendo. Cada resultado traz o crédito/licença.
- **Geração de música local: ACE-Step** (`provider acestep`, sem chave): rode o servidor dele (`uv run acestep-api`, porta 8001 ou `LOPESFILM_ACESTEP_URL`). Na RTX 3050 de 6 GB use o modelo turbo (DiT, sem LM). Não testado contra o servidor real, só contra um falso.
- **Busca na biblioteca**: além do serviço vetorial, há a busca vetorial neste computador (multilingual-e5-small int8, ~120 MB, baixado uma vez em `~/.lopesfilm/models/library`); até baixar, a busca é por palavras.
- **Skills → "Skills GitHub"**: o grupo antes chamado Comunidade, para separar as skills que você trouxe do GitHub das criadas a partir de vídeos.
- **Texto/legendas**: +21 looks (cromo, ouro-rosa, esmeralda, lava, tóxico, sangue, cyberpunk, holograma, pastel, jornal, adesivo, neons verde/laranja/roxo, grafite, etiqueta de papel, código, legenda limpa/grossa, karaokê verde, marca-texto) e +21 movimentos (8 de entrada, 6 em loop, 7 de saída). Esses itens ainda não têm vetor semântico (precisam do modelo em `library/models`); a busca por palavras já os acha.
- **Linha do tempo**: menu de ferramentas (chave inglesa) com ~20 ações (dividir tudo, aparar com ondulação, fechar lacuna, vincular, sobrescrever, empurrar 1/10 quadros, selecionar antes/depois, ajustar zoom, ímãs).
- **Cursor do agente**: enquanto o agente edita, um cursor lima desliza até o clipe e mostra cortar/mover/aparar/digitar/ajustar/criar/excluir (`components/AgentCursor.tsx`, `lib/agent-cursor.ts`). Deduz a ação comparando a linha do tempo antes/depois; não foi visto rodando.
- **Menu do app** (logo): novo, com cabeçalho da marca e atalhos para cada seção das Configurações; sem Comunidade, Feedback ou GitHub.
- Removidos: entradas Lopes.Film hospedadas de Agentes/Serviços e o chip "Replicate a video".


## Novidades (5ª leva)
- Sem verificador de atualizações (app e Studio).
- Ferramentas de edição da timeline (dividir tudo, aparar, fechar lacuna, recortar, vincular, desvincular, sobrescrever) agora são botões diretos na barra; a chave inglesa guarda o resto.
- Áudio do clipe (Inspetor → Som): remover ruído (leve/médio/forte, RNNoise) e Isolar voz, feitos no computador com ffmpeg; o arquivo limpo assume o lugar do clipe (Desfazer volta).
- "Importar skills do GitHub" abre o card de importar por link.
- COMPILAR.bat e workflow do GitHub Actions (Mac + Windows).


## Novidades (6ª leva)
- Versão muda a cada compilação (contador em ~/.lopesfilm-build.json): 0.3.3, 0.3.4… no app e no Studio; o instalador pergunta "Atualizar" quando já existe uma versão instalada.
- Conjunto próprio de ícones (lib/icons.tsx, UI e chat) no lugar dos genéricos mais usados.
- Waveform espelhada estilo Resolve/Premiere.
- Cursor do agente mais robusto (não depende só do sinal da aba; portal no body).
- Redesenho (Projetos e Edição) no Figma: https://www.figma.com/design/lhzGDyFodxLjvxV0GXpEpl


## Novidades (7ª leva)
- Notificação do Windows + som próprio (src/sounds: done, export, ask, failed) quando uma exportação termina/falha e quando o agente termina/pergunta/falha; chave "Som" em Configurações → Notificações.
- Efeitos de hover/press em botões, cartões, clipes, menus e switches (globals.css, fim do arquivo).
- Paleta do redesenho (Figma) aplicada ao tema escuro; Projetos ganhou saudação + "Continuar editando".

## Novidades (8ª leva): Lopes.Film é o projeto principal, com duas variações
O código-fonte é o da **Lopes.Film** (pacote `lopesfilm`, comando `lopesfilm`, variáveis `LOPESFILM_*`, pastas `packages/lopesfilm`, `apps/desktop`). GlobalFilm e VerkzFilm são variações montadas a partir dele (pasta `brands/`):

| Versão | Nome | appId | Pasta de dados | Projetos | Visual |
|---|---|---|---|---|---|
| 1 (principal) | Lopes.Film | dev.lopesfilm.desktop | ~/.lopesfilm | ~/Videos/Lopes.Film/Projects | grafite + carmesim, ícone LS (manual de marca LOPES) |
| 2 | GlobalFilm | dev.globalfilm.desktop | ~/.globalfilm | ~/Videos/GlobalFilm/Projects | azul-marinho + globo com cruz (Global Medicina Jurídica) |
| 3 | VerkzFilm | dev.verkzfilm.desktop | ~/.verkzfilm | ~/Videos/VerkzFilm/Projects | lima |

- Cada uma tem nome, janela, menus, notificações, instalador, ícone do .exe, logo, cores do tema (claro e escuro), porta do Studio e pastas próprias: podem ser instaladas lado a lado.
- Nomes internos também são de cada marca, no app compilado (`apps/desktop/scripts/rebrand.mjs`, passo 2c do release): na GlobalFilm o comando é `globalfilm`, as variáveis `GLOBALFILM_*`, o pacote `globalfilm`; na VerkzFilm, `verkzfilm`, `VERKZFILM_*`. Na Lopes.Film nada é renomeado. Endereços (https://…) e o repositório `openfilm/verkzfilm` não mudam.
- Compilar: `COMPILAR.bat` pergunta 1 (Lopes.Film), 2 (GlobalFilm), 3 (VerkzFilm) ou 4 (as três) e junta os instaladores em `INSTALADORES\`. Direto: `pnpm release:win --brand=global` (ou `LOPESFILM_BRAND=verkz`).
- Trocar logo/cores: edite `brands/<marca>/brand.json` (mark = desenho do logo; theme = cores) e rode `python3 brands/make-icons.py lopes global` para refazer os ícones (.ico/.icns/.png).
- Ao escrever texto novo no código, use "Lopes.Film" (com ponto) para o nome que aparece na tela e `lopesfilm`/`LopesFilm` para nomes de código: é isso que o rebrand troca em cada marca.

## v22
- Guia: fundo fluido animado; nova etapa opcional "Packs grátis" (efeitos sonoros CC0, sprites de efeitos CC0, fontes OFL).
- Exportar: visual novo (Figma "Exportar"), animações, opção "Melhorar para 4K com IA" (H.264) e presets de x264/x265 mais rápidos.
- Skills: "Replicate a video" removido do Discover.

## v25 — packs de som
- **Sound Pack do Lucas** (99 WAV, categorias Braam/Downer/Drone/Impact/Metal/Noise/Punch/Retro/Riser/Short/Sub/Swish/Texture/Whoosh): convertido para MP3 (VBR q2, 22 MB), em `library/sounds/lopes-*.mp3`, catalogado em `library/catalogs/sounds-lopes.json` (grupos "Lopes Pack · <categoria>", com duração). Vai embutido no instalador. Sem licença no zip original: se o instalador for distribuído a terceiros, confirme que você pode redistribuir.
- **Kenney UI Sounds** (CC0, 150 WAV: Interface Sounds + UI Audio): novo pack baixável `ui` em `packs-manifest.json` (commits fixados + sha256), aparece no guia "Packs grátis" e na aba Sons (grupos "Kenney · Interface" / "Kenney · UI Audio").
- `library.mjs`: `SOUND_PACKS` generaliza o catálogo de packs de som (sfx, ui).

## v26 — UISFX
- **UISFX** (romainsimon/uisfx 0.4.0, áudio CC0): 936 sons de interface em MP3 (12 estilos × 78 cues, ~5 MB) embutidos em `library/sounds/uisfx-<estilo>-<cue>.mp3`, catalogados em `library/catalogs/sounds-uisfx.json` (grupos "UI SFX · <estilo>", com duração). Licença em `library/LICENSE-UISFX.txt`.
- VFX: nenhuma fonte CC0 nova verificável no GitHub além do Kenney Particle Pack (já no pack `vfx`); ver mensagem de entrega.

## v27 — Kenney Sci-Fi + Smoke (via OpenGameArt)
- O shell do sandbox alcança opengameart.org (kenney.nl dá 403). Baixados de lá, licença CC0 conferida na página de cada item.
- **Kenney Sci-Fi Sounds** (73 ogg → mp3): `library/sounds/kenney-scifi-*.mp3`, catálogo `library/catalogs/sounds-kenney-scifi.json`, grupo "Kenney · Sci-Fi".
- **Kenney Smoke Particles** (68 PNG: Black smoke, Explosion, Flash, White puff; sem a pasta "Fart"): `library/vfx/smoke/` com LICENSE.txt. Só arquivos; ainda não há aba de VFX que os liste.
- Não incluídos: pacotes Reactorcore (sprites pixel-art minúsculos, pouco úteis em vídeo).

## v28 — packs 3D opcionais (OpenGameArt, CC0)
- 51 zips CC0 do OpenGameArt (licença conferida na página de cada item; sha256 e tamanho fixados) viram dois packs opcionais no guia "Packs grátis": `models3d-kits` (9 kits Kenney: castle, fantasy-town, food, furniture, graveyard, nature, pirate, racing, space; GLB/OBJ/FBX; ~43 MB) e `models3d-more` (42 pacotes: prédios modulares, masmorras, estradas, veículos, personagens, rochas, plantas...; ~305 MB).
- `packs.mjs`: entradas com `unzip: true` baixam o zip, conferem o sha256, extraem (`tar -xf`, ou `unzip`) em `<pack>/<nome>/`, marcam `.unpacked` e apagam o zip; `CREDITS.txt` lista a página de origem de cada pasta. Destinos aceitos: raw.githubusercontent.com e opengameart.org/sites/default/files.
- Lista e script: `scripts/packs-oga-list.json`, `scripts/packs-oga.mjs`. Ficaram de fora: >60 MB, .7z/.rar, e o que não é CC0 (armas, CC-BY).
- Pastas em `~/.lopesfilm/packs/models3d-*/` (ou `LOPESFILM_PACKS_DIR`). Ainda não há aba de modelos 3D que as liste.

## v29 — corte no hover dos cards de projeto
- Causa: `.pv-grid>*{animation:… both}` mantém contexto de empilhamento (transform/opacity) em cada card; o card de baixo pintava por cima da sombra/elevação do card de cima, cortando-a em linha reta. Agora `backwards` (sem fill depois da entrada) e `.pv-grid>*:hover{position:relative;z-index:3}`. Reproduzido e verificado numa página CSS isolada; não verificado no app.

## v30 — espaçamento do botão "Adicionar um serviço personalizado"
- `CustomServices.tsx`: o botão (e o formulário) dentro do `SettingsGroup` ficavam sem `px-5`, colados na borda do card; agora `px-5 py-4`, como os itens.
- Removido o painel "Versões automáticas" de Configurações > Avançado (`VersionsGroup` em `SettingsModal.tsx`). A preferência `autoVersions` continua existindo no servidor (padrão desligado); só a opção sumiu da interface.

## v31 — ícones das categorias da biblioteca
- `library/icons.tsx`: o `<svg>` do `CategoryIcon` ganha `shrink-0` (em coluna flex ele encolhia até virar um ponto quando a altura da aba apertava); `LibraryDrawer.tsx`: ícone 17 px, `leading-[12px]`, margem vertical da aba `my-0.5` (aba de 36 px em vez de 32). Reproduzido só numa página CSS isolada (o ícone encolhia); não verificado no app.

## v32 — mais textos, "Instalados pelo usuário", Descobrir
- **Textos**: +70 estilos de texto (neon em mais cores, metais, extrusões, etiquetas, pílulas, vidro, estilos de filme/jornal/terminal, pesos e espaçamentos). Em `scripts/library-text.mjs` (WORDART) + nomes em 5 idiomas em `library-text-names.json`; posters e prévias gerados com o renderer. Agora 132 estilos de texto (eram 62).
- **Sons**: novo filtro de origem "Instalados pelo usuário" (`installed`, `SourceChips.tsx`): sons de `packs/…` (SFX Kit, Kenney UI) saem de "Oficial" e vão para ele; o chip aparece quando há packs instalados.
- **Descobrir**: removido o aviso "Não foi possível ler o Descobrir agora…" (só resta o aviso de leitura parcial). Causa raiz: o índice `verkzfilm/skills/main/index.json` dá 404 e o snapshot offline estava vazio. Agora `studio/server/skill-curated.json` (gerado por `scripts/skill-curated.mjs` dos clones) lista 16 skills de repositórios públicos, fixadas em commit + sha256 de cada arquivo: 8 de GSAP (greensock/gsap-skills, MIT), frontend-design, canvas-design, algorithmic-art, theme-factory, brand-guidelines, slack-gif-creator, skill-creator (anthropics/skills, Apache-2.0) e web-design-guidelines (vercel-labs/agent-skills, MIT). `refresh()` as junta ao índice (se o índice cair, segue só com elas; só falha se nada puder ser lido). Verificado com rede real: 16/16 baixadas e conferidas.

## v33 — (substituído no v35) skills do Remotion no Descobrir
- As 13 skills de `remotion-dev/skills` foram retiradas do Descobrir no v35 (16 curadas restam: gsap ×8, anthropics ×7, vercel ×1).

## v34 — camada de compatibilidade (React, Remotion, GSAP, anime.js, Lottie, Three)
- Fonte em `packages/lopesfilm/src/compat/` (`core`, `adapters`, `react`, `remotion`, `film`, `global`); saída empacotada em `src/compat/built/` por `node scripts/build-compat.mjs` (esbuild; React 19 incluído). Servida pelo host em `__film/compat.js` (um script, globais `React`, `ReactDOM`, `Remotion`, `FilmCompat`, `htm`) e `__film/compat/*.mjs` (módulos para import map: `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`, `remotion`, `film-compat`). Só carrega se a página pedir.
- `FilmCompat.mount(Componente, { fps, duration, … })`: renderiza o React de forma síncrona (`flushSync`) a cada `film.frame(t)` no quadro `t × fps`, define `film.duration`, espera `delayRender`. Sem host, a página toca sozinha em loop.
- API do Remotion: hooks, `AbsoluteFill`, `Sequence`, `Series`, `Freeze`, `Loop`, `interpolate`, `interpolateColors`, `spring`, `measureSpring`, `Easing`, `random`, `Img`, `Video`, `registerRoot`/`Composition` (desenha a composição no tamanho dela, escalada para caber). `Audio` não desenha nada (som é da timeline). Não há `@remotion/*`, `<Player>`, JSX.
- Adaptadores: `gsap(timeline?)`, `anime(...)`, `lottie(anim)`, `three(renderer, scene, camera, update?)`, `onFrame(fn)`. htm (MIT) vendorizado em `src/compat/vendor`.
- Documentação: `COMPAT.md` (no pacote, citado no `SPEC.md` e na skill `lopesfilm-3d`). Teste: `src/compat.test.mjs`.
- Verificado aqui com Chromium real e as bibliotecas reais (gsap 3.15, animejs, lottie-web, three): posições exatas em t=0/1/2, ida e volta no tempo dá o mesmo resultado; three desenha em WebGL (SwiftShader). Não verificado: Windows/GPU, projeto Remotion real compilado, vídeo (`Video`), Studio exportando um filme com esses clips.

## v35 — skill própria "Motion" no lugar das do Remotion
- Removidas as 13 skills do Remotion (`skill-curated.json` e `scripts/skill-curated.mjs`).
- Nova skill própria `manual/motion` (`lopesfilm skill motion`, aparece em Skills do app com título em 5 idiomas): escolha da ferramenta (React, GSAP, CSS, Lottie, three.js), regras de qualidade de movimento (easing, stagger, hold, hierarquia, tipografia, números), estrutura de composição por cenas, regras de correção (função de t) e checklist de verificação com `lopesfilm look`. Texto original, usa a camada de compatibilidade do v34.
- Registrada em `CORE_SKILLS` (depois de `design`), `MANUAL.md` e no teste de ordem das skills próprias.

## v36 — 6 skills próprias novas
- `manual/shorts` (vídeos verticais 9:16), `ads` (anúncios), `explainer` (explicativos/tutoriais), `grading` (cor), `sound` (som e mixagem), `dataviz` (gráficos e dados animados). Texto original, em inglês como as demais; título/resumo nos 5 idiomas (os detalhes em zh-CN/ja/ko/es são curtos, derivados do resumo).
- Registradas em `CORE_SKILLS`, `MANUAL.md` e no teste de ordem. Total de skills próprias: 13.
- Não verificado: nenhum agente real usando essas skills; a exatidão de comandos/filtros citados (a skill `grading` fala em controles de brilho/contraste/filtros do filme em termos gerais); como elas aparecem na tela de Skills.

## v37 — skills sempre ativas, GitHub, "a partir de vídeo", caveman, Como usar
- **Skills do GitHub** agora ficam em "Skills GitHub" (origem `link`), não em "Importadas".
- **Skills sempre ativas** (`ALWAYS_BY_DEFAULT`: economy, caveman, ponytail, cutting, design): o texto delas entra nas instruções de toda sessão do agente (limite 24 KB, sem duplicar nomes). Cada skill tem um interruptor "sempre ativa" na página dela (`PUT /api/skills/:uid/always`).
- **Skill a partir de vídeo de referência**: skill própria `from-video` + botão com ícone de filme na Biblioteca ("Skill de um vídeo") que manda o vídeo ao chat.
- **Caveman** (Apache-2.0, Julius Brussee) empacotada como skill própria, com LICENSE/NOTICE e entrada em THIRD_PARTY_NOTICES.
- **Como usar**: terceira aba do launcher com vídeo de 64 s (pt-BR e en) feito com o próprio Lopes.Film (`scripts/howto.mjs` → `library/howto/`, servido por `/api/howto/video|poster?lang=`), mais 5 passos nos 6 idiomas. O vídeo só tem legendas, sem voz.
- Não verificado: nada visto no app real (Windows/Electron); rota `/api/howto` só conferida por caminho de arquivo; nenhum agente real com as skills sempre ativas ou `from-video`; suíte completa não terminou aqui (rodei skills, compat, agent-skills e `tsc` da UI).

## v38 — engenharia reversa de vídeo: `lopesfilm measure` + skill `recreate`
Ideia vinda do OpenMotion (nexu-io/openmotion, Apache-2.0): recriar um vídeo de referência medindo-o, não "no olho". Nenhum código ou texto dele foi copiado; o comando e as skills são escritos aqui, só com ffmpeg/ffprobe.
- **`lopesfilm measure <o quê> <vídeo>`** (`src/measure.mjs`): `probe` (tamanho, fps, duração, som), `cuts` (cortes duros e mudanças suaves, duração dos planos), `events` (mapa de atividade, paradas, inícios de som, cortes "no beat"), `shots` (planos com cores e movimento + folha de movimento `.motion.md` para completar), `frames` (imagens consecutivas de um trecho/recorte), `curve` (início, duração, overshoot e **easing mais próximo** de um movimento, com `cubic-bezier` CSS), `ink` (altura/posição/cor de um texto ou logo), `colors` (paleta e gradiente de luz), `extract` (imagem/recorte), `compare` (referência × refilmagem: brilho, detalhe, cor, altura do elemento, corte na borda; sai com status 1 se falhar).
- **Skill própria `recreate`** (14ª): método completo — desmontar com `measure`, reconstruir com a densidade/tipo/movimento medidos, verificar cada plano com `measure compare` e `measure curve`, e dizer honestamente o que ficou de fora. `from-video` e `motion` agora mandam usar os números do `measure`.
- Verificado: easing, duração e início recuperados exatamente em vídeos sintéticos (power2.out, power3.inOut, back.out); cortes do vídeo "Como usar" achados nos tempos certos (4, 15, 26, 37, 48, 58 s); 55 testes (skills, measure, compat, agent-skills, catálogo).
- Não verificado: com vídeos reais de terceiros (ruído de compressão, câmera, 3D, filmagem), o limiar de corte (4) e os de brilho/detalhe podem precisar de ajuste; `curve` mede um objeto de cada vez (movimentos combinados exigem várias regiões); nenhum agente real seguiu a skill `recreate` ainda; no Windows não foi testado (usa só `ffmpeg`/`ffprobe` do PATH).

## v39 — Sobre, legendas com Whisper embutido, bancada 3D
- **Janela "Sobre"** (menu da logo → Sobre; também em Ajustes → Ajuda): foto e nome do criador (Lopes), resumo do sistema e 5 destaques, nos 6 idiomas. A foto fica em `studio/ui/src/assets/creator.jpg` (trocar o arquivo troca a foto). Sem menção a outros projetos.
- **Legendas/transcrição sem Voice Studio**: `asr` agora sempre está disponível. Ordem: serviço escolhido pela pessoa → Voice Studio → Whisper Large v3 Turbo embutido (~1,1 GB, baixado uma vez, `providers/whisper-fallback.mjs`). Se o serviço falha (fora do ar, sem saldo), a transcrição é refeita no computador e o recibo diz isso. Os padrões automáticos (`fill()`) preferem o Whisper local e depois o Voice Studio.
- **Narração**: sem mudança de propósito. Usa só o modelo escolhido ou o Voice Studio; não há troca automática para outra voz.
- **Bancada 3D** (`skills/lopesfilm-3d/templates/workbench.html` + seção na skill `lopesfilm-3d`): terminal digitando comandos ao lado de um modelador estilo Blender (cubo, modo de edição, extrusão, chanfro, sombreado suave, órbita), com cursor que se move/clica e teclas na tela. Tudo em canvas 2D, função pura de t; o agente só edita o `SCRIPT`.
- Testes de `get` atualizados (asr listado sem nada conectado).
- Não verificado: download real do Whisper (1,1 GB) e a transcrição ponta a ponta; janela Sobre no app real (só tsc, testes e build); bancada vista apenas em 4 frames estáticos com Chrome, sem render em vídeo nem cursor sobre cliques reais; Windows.

## v40 — Remotion direto no chat: TSX/JSX sem compilar + `@remotion/*`
- **O navegador (a página do filme) passa a "entender" TSX, JSX e TypeScript**: o servidor traduz `.tsx/.jsx/.ts` (e `.js` que importa React/Remotion) na hora em que a página pede (`src/code-modules.mjs`; sucrase empacotado em `src/compat/vendor/sucrase.mjs`, MIT, sem dependência nova). Vale no preview do Studio e no render. Também: `react`, `remotion` e `@remotion/*` resolvem sozinhos (importmap injetado se a página não tem um), `./Titulo` acha `Titulo.tsx`, `import './x.css'` / `.json` / imagens funcionam, `staticFile()` lê de `public/` (achado também em `assets/`), `<script type="text/tsx">` inline, e pacotes do projeto em `assets/vendor/<nome>.module.js` (ex.: `three`).
- **API do Remotion ampliada** (`src/compat/*.mjs`, build em `compat/built`): núcleo (`getInputProps` via `?props=`, `staticFile`, `Html5Video`, `useCurrentScale`…), `@remotion/transitions` (+ fade, slide, wipe, flip, clock-wipe, iris, none; `linearTiming`, `springTiming`), `shapes`, `paths`, `noise`, `media-utils` (inclui `visualizeAudio`), `layout-utils`, `animation-utils`, `captions`, `motion-blur`, `lottie` (lottie-web light, MIT, empacotado), `gif`, `preload`, e `google-fonts/<Nome>` (baixa a fonte uma vez para `~/.lopesfilm/cache/gfonts` e depois renderiza offline: `src/gfonts.mjs`). Pacote `@remotion/*` fora da lista falha no import com mensagem dizendo que não está na camada.
- **Skills do Remotion de volta**: as 13 oficiais (remotion-dev/skills, commit 7e541aa) em Skills → Descobrir (apontadas, nunca embutidas: o repositório não declara licença), e a skill própria **`remotion`** (17ª core): como montar o projeto no chat, o que existe e o que não existe. `motion`, `MANUAL.md`, `COMPAT.md` e `THIRD_PARTY_NOTICES.md` atualizados.
- Corrigido de passagem: `library/search.json` regenerado (o teste de índice falhava); `core-skills.test` esperava 6 skills core.
- Testes novos (`src/code-modules.test.mjs`, 7): tradução e resolução de imports, import map, TSX inline, fontes Google (com servidor simulado), um projeto Remotion TSX completo rodado no Chrome (Root, componentes, CSS, JSON, `public/`→`assets/`, TransitionSeries, shapes) e Lottie + captions + pacote desconhecido.
- Não verificado: nenhum projeto/template Remotion real de terceiros (só os de teste que escrevi); comparação frame a frame com o Remotion de verdade (o `fade` mantém a cena que sai opaca, pode diferir do original em detalhes; `noise` e `visualizeAudio` dão valores diferentes dos do Remotion); `<Audio>` não toca (o som é da linha do tempo do filme); Tailwind, React Three Fiber, Rive, Skia, `@remotion/player` não existem; fontes Google exigem internet na primeira vez (testado aqui com a rede real só para a Inter; no Windows não); `iris`, `flip`, `clock-wipe`, `gif` e `media-utils` não foram vistos em quadros; Windows não testado; dois testes da biblioteca (`library-words`: `text/text` sem `about`) já falhavam antes e não foram mexidos.

## v54 — FigCraft, VectorCraft, RIFE e auto-editor

Quatro motores locais novos, instalados pelo guia de configuração (Modelos locais) e chamados pelo agente com `lopesfilm get`:

- `figcraft` (v0.13.1) e `vectorcraft` (v0.11.0), do ArtCraft/storytold (Apache-2.0/MIT): desenho de interface e desenho vetorial sem janela. `--steps` (lista JSON de comandos) → PNG/WebP/JPG/SVG/PDF com fundo transparente em `assets/image`; o projeto fica em `assets/design/<nome>.figcraft|.vectorcraft` e é reaberto. `--commands <palavra>` lista os comandos. Código: `studio/server/designcraft.mjs`.
- `interpolate` (RIFE v4.6 via rife-ncnn-vulkan 20221029, MIT): câmera lenta suave (`--mode slow --factor 2..8`, sem som) ou aumento de fps (`--mode fps --fps 60`, som mantido). Até 600 quadros. Só o programa e o modelo v4.6 são extraídos do pacote de 430 MB. Código: `studio/server/interpolate.mjs`.
- `autoedit` (auto-editor 31.6.0): corta silêncios/trechos parados (`--threshold`, `--margin`, `--speedup`, `--edit`). Binário único de ~45 MB. Código: `studio/server/autoedit.mjs`.
- Skills novas: `craft` e `smooth` (manual/). Todos têm checagem de tamanho e sha256 no download.

Testado aqui (Linux): FigCraft e VectorCraft reais (cartela com fundo transparente em PNG/WebP, logo PNG/SVG, reabrir projeto, listar comandos); auto-editor real (clipe de 3 s → 1,2 s); download e sha256 dos pacotes; testes com programas falsos para o encadeamento; tsc da UI e build da UI. Também regenerado `library/search.json`, que estava defasado desde a v52.

NÃO testado: nada rodou no Electron nem no Windows; o RIFE nunca rodou de verdade (sem placa Vulkan aqui; só o encadeamento com um programa falso); a extração por `tar -xf` de membros do .zip no Windows (FigCraft, VectorCraft, RIFE) não foi exercitada, só a do Linux; o sha256 do Windows do auto-editor veio da página de releases (não baixei o .exe). FigCraft/VectorCraft são alfa: comandos podem mudar entre versões (versão fixada). Sem pacote para macOS nos dois (só há CLI em zip universal, sem hash conferido) e sem Windows ARM.
SoundCraft e AniCraft: ainda não têm release publicado no GitHub (nenhum binário), então não entraram. HyperFrames não entrou: exige Node + Chrome extras e o Lopes.Film já renderiza páginas HTML.

## v55 — o app continua fixado na barra de tarefas após atualizar

Causa provável: o app já guardava uma cópia do atalho fixado (`User Pinned\TaskBar`) e a punha de volta, mas o Explorer só lê o atalho e a chave `Taskband` quando inicia, então o ícone continuava sem fixar. Agora, junto da cópia do atalho, também se guarda a chave `Taskband` (`reg export`) — no instalador (`build/installer.nsh`) e a cada abertura do app (`refreshTaskband` em `apps/desktop/src/main.mjs`). Se a atualização levou o pin, o Explorer é fechado, a chave é importada e o Explorer abre de novo (um segundo de pisca na barra, uma vez por atualização, só quando o pin foi perdido).
NÃO testado: nada disso rodou no Windows (só o teste da cópia do atalho e a sintaxe). Se continuar desafixando, o log do app (`taskbar:`) diz o que houve.

## v56 — SoundCraft (mixagem de som)

Verbo `soundcraft` (SoundCraft v0.12.1, MIT/Apache-2.0, ~15 MB, Windows x64 e Linux x64): `--steps` (lista JSON de comandos: session.new, file.import_audio, mix.volume com `tracks:[id]`, mix.insert com plugins de EQ/compressor/reverb…) → mixagem em `assets/audio/mix/<nome>.wav|flac` com LUFS, pico e pico real medidos; a sessão `.scraft` fica em `assets/audio/sessions` e é reaberta. `--commands <palavra>` / `--commands plugins` listam. Instalável pelo guia de modelos locais; instruções na skill `sound`. Código: `studio/server/soundcraft.mjs`.
Testado aqui com o programa real (Linux): duas faixas importadas e mixadas, WAV de 5 s com LUFS medido, volume por faixa, listagem de plugins; teste com programa falso para o encadeamento. NÃO testado: Windows/Electron; efeitos (mix.insert) e fades nunca foram chamados de verdade; é pré-alfa (o próprio projeto diz ~40% de um Pro Tools).
AniCraft: o repositório está vazio (sem código nem release), então não entrou.

## v57 — AniCraft (animação 2D)

Verbo `anicraft` (AniCraft v0.2.1, MIT/Apache-2.0, ~20 MB, Windows x64 e Linux x64): estúdio de animação vetorial 2D no estilo Adobe Animate, sem janela. `--steps` (lista JSON: draw.rect, text.create, modify.convert_to_symbol, timeline.insert_keyframe, timeline.create_tween…) → WebM com fundo transparente (padrão), MP4, GIF, Lottie (.json, transparente) ou um PNG. O projeto fica em `assets/design/<nome>.anicraft` e é reaberto. `--commands <palavras>` lista os comandos (são ~1900). Código: `studio/server/anicraft.mjs`; skill `craft`.
Erro meu corrigido: eu tinha dito que o repositório estava vazio (leitura de uma captura velha da página); o zip enviado pelo usuário mostrou o projeto real.
Testado aqui com o programa real (Linux): quadrado com tween clássico e easing, exportado em WebM (canto transparente, quadrado indo de x=20 a x=450), MP4, GIF, Lottie e PNG; intervalo de quadros; teste com programa falso. NÃO testado: Windows/Electron; WebM transparente é feito por chave verde #00FF00 (bordas suaves podem ter halo; sombras/brilhos translúcidos pedem Lottie ou MP4 com fundo); texto, filtros, formas (shape tween) e movimento (motion tween) não foram exercitados. O programa é alfa.

## v58 — limpeza do OpenFilm, etapa 1 + capas novas

Removido (sem afetar o funcionamento): provedor "Lopes.Film" (conta/serviço de mídia) da lista de serviços; agente hospedado do Lopes.Film fora da lista de agentes (ficam Claude, Codex, os demais e "Own key", com vários modelos próprios); busca semântica da biblioteca não envia mais nada à internet (só palavras, ou o modelo local; um servidor próprio vale se `LOPESFILM_API_URL` estiver definido); filmes de exemplo de terceiros (o card com a logo do OpenFilm) fora; `homepage`/`repository`/`bugs` e links dos manuais que apontavam ao OpenFilm; feed de atualização do `product.official.json` zerado (atualizações já eram desligadas).
Capas: todas as imagens-base (cenas de efeitos, fotos dos filtros, exemplos dos 14 modelos, amostras a/b/c) foram trocadas por cenas geradas (paisagens, cidade, aurora, abstratas; sem personagens), e os posters/previews de efeitos, transições, modelos, textos, adesivos e movimentos foram redesenhados (`scripts/library-previews.mjs`). Cenas feitas por `scripts/library-scenes.py`.
NÃO mexido por pedido: modelos locais (Whisper, BiRefNet) e partes publicadas da biblioteca (áudio, voz, emoji), que ainda baixam de openfilm.dev/library. Sem tocar: capas de vozes (não existem na cópia local) e o "example mp4" de cada modelo (parte publicada).
Não testado: Windows/Electron; os testes de preview/transcript/doubao já falhavam antes. Código morto que sobra: `providers/lopesfilm.mjs`, `account.mjs`, `lopesfilm-agent.mjs` (não aparecem mais).

## v59 — código morto do OpenFilm removido

Apagados: provedor/serviço "Lopes.Film" (providers/lopesfilm.mjs, account.mjs, export desktop-account), agente hospedado do desktop (lopesfilm-agent, lopesfilm-models, leitura de conta entre processos), link de conta, textos de ajuda que citavam openfilm.dev (agora: servidor próprio via LOPESFILM_API_URL e LOPESFILM_LIBRARY_URL). Ficam: biblioteca publicada e modelos locais (openfilm.dev/library, por decisão), textos legais (LICENSE, TRADEMARK).
Não testado em Electron/Windows. Testes que rodei: pi-agent, roster, studio, rebrand, providers, keys, library.

## v60 — modelos locais fora do openfilm.dev

Whisper Small (Xenova/whisper-small), Whisper Large v3 Turbo (onnx-community/whisper-large-v3-turbo_timestamped: o export normal não tem as atenções que dão o tempo de cada palavra), onnxruntime-web 1.31.1 e transformers.js 4.3.2 (jsDelivr/npm) agora baixam da casa de cada um (library/model-sources.json; sha256 e tamanhos em library/local-models.json, refeitos por scripts/local-models-sources.mjs). Tudo conferido pelo sha256 do app.
Recorte de fundo: BiRefNet-lite sai, IS-Net general-use int8 (Ko033/isnet-general-use-onnx, Apache-2.0, 46 MB) entra: o BiRefNet do Hugging Face roda a 1024 px e estoura a memória do WebAssembly (bad_alloc, 4 GB). `src/local-cutout.mjs` lê o lado do modelo e tem um perfil por modelo.
Testado de verdade aqui (Linux): baixou e conferiu os 3 modelos; Whisper Small e Large v3 Turbo transcreveram um áudio em inglês com tempo por palavra; IS-Net recortou duas fotos (tigre, carro) bem. NÃO testado: Windows (o runtime roda em 1 thread lá), nem português/chinês, nem a barra de instalação no Studio.
Sons, músicas, vozes e emojis continuam no host da biblioteca (de fora, por decisão).

## v61 — correção do build do desktop

A v59 apagou `apps/desktop/src/lopesfilm-models.mjs`, mas `chat/src/state/local-agent-store.ts` ainda o importava (o COMPILAR.bat quebrou: "Could not resolve ../../../src/lopesfilm-models.mjs"). Removidos os ramos mortos do agente hospedado nesse arquivo. Agora rodei `tsc -p chat`, `tsc -p shell` e `vite build` do shell aqui (não tinha rodado antes: erro meu) e conferi todos os imports relativos de apps/desktop e packages/lopesfilm.

## v62 — download dos modelos mais robusto

`fetchModel` (src/local-models.mjs): cada arquivo tem 3 tentativas; uma cópia antiga no cache com tamanho diferente do esperado é apagada antes (sobra de lista anterior fazia o Whisper Large v3 Turbo falhar com "tente de novo"); o motivo do erro agora vai para stderr e para o arquivo de estado (`why`). `fetchLibrary` guarda o erro (`fetchError`). Testado aqui com cópia velha plantada: foi substituída e o modelo conferiu. NÃO reproduzi a falha no Windows do usuário (causa exata não confirmada).

Vídeos de modelos/efeitos: inspecionados os 14 vídeos de exemplo dos modelos. Os fundos são paisagens/cidades procedurais repetidas e as composições (BAM!, Happy Birthday, tarja de notícia) são desenhos herdados; NÃO alterados ainda (549 vídeos de pré-visualização no total).

## v63 — fotos reais nas prévias e erro do download visível

Fotos de exemplo do Unsplash (licença livre, via Lorem Picsum; créditos em library/PHOTO-CREDITS.md) no lugar das paisagens procedurais: 57 imagens dos 14 modelos, 66 dos filtros, 70 dos efeitos, scripts/library-samples/a,b,c e library/filters/sample.jpg. Refeitos com `node scripts/library-previews.mjs` os 349 posters/prévias/exemplos (os 14 vídeos de exemplo dos modelos inclusive). Vistos por quadros: modelos, aurora, confete, transição clock. NÃO refeitos: os desenhos dos textos, adesivos e composições herdadas (BAM!, tarja de notícia etc.) e as prévias de texto (fundo liso).
Modelos locais: quando o download falha, o motivo agora aparece em vermelho na tela de instalação (`why`).

## v64 — causa do Whisper no Windows do usuário

Lido de ~/.lopesfilm/library/models/whisper-large-v3-turbo.json: "fetch failed (self signed certificate in certificate chain)" já no config.json: algo no computador (antivírus que lê HTTPS ou proxy) responde no lugar do huggingface.co e o Node não confia no certificado. Correção: o processo de download roda com NODE_USE_SYSTEM_CA=1 (certificados do Windows, como um navegador) e o erro de certificado explica o que liberar. NÃO testado no Windows dele. Se ainda falhar: liberar huggingface.co e cdn.jsdelivr.net no antivírus.

## v65 — textos do projeto

README (en e zh-CN), CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, TRADEMARK, modelos do GitHub e changeset sem links/e-mails do OpenFilm; README ganhou a seção "Origin" (fork do OpenFilm, MIT, crédito exigido pela licença) e o crédito das fotos Unsplash. FALTA VOCÊ PREENCHER: `[CONTACT EMAIL]` em SECURITY.md, CODE_OF_CONDUCT.md e TRADEMARK.md (2 cópias), e o endereço do repositório no `git clone <...>` do README/CONTRIBUTING (não inventei nenhum).

## v66 — remover ruído e correção dos olhos

Erro "…\\Programs\\VerkzFilm\\<id> is not a project": ProjectView.tsx chamava `api.make(projectId, ...)` (o ID do projeto) onde o servidor espera o CAMINHO da pasta; afetava `audio-clean` (remover ruído) e `eyes` (olhos). Agora passa `loaded.project.path`. Segundo bug achado ao testar: a tela manda `voice: false` e `checkArgs` (get.mjs) respondia "--voice takes no value"; agora um interruptor `false` vale como não dado. Testado aqui: audio-clean em .m4a e em .mp4 com vídeo (get.test.mjs: 19 ok). NÃO testado: a tela no Electron/Windows.

## v67 — aviso de versão nova dos engines

`studio/server/engine-updates.mjs`: consulta api.github.com/repos/<repo>/releases/latest dos 8 programas baixados do GitHub (AniCraft, EffectCraft, FigCraft, VectorCraft, SoundCraft, auto-editor, Real-ESRGAN, RIFE), no máximo a cada 12 h (cache em ~/.lopesfilm/engine-updates.json; LOPESFILM_ENGINE_UPDATES=off desliga). Só AVISA ("↑ vX.Y.Z" na linha do engine instalado, na lista de modelos): não baixa sozinho, porque cada instalação confere um sha256 fixado no código; subir de versão = trocar versão e hashes no módulo (o teste engine-updates.test.mjs garante que a tabela bate com os módulos). Testado com GitHub simulado (3 testes). NÃO testado ao vivo: o GitHub é bloqueado neste ambiente (403); funciona se o seu Windows alcançar api.github.com (limite de 60 consultas/h sem login, usamos poucas).

## v68 — engines se atualizam sozinhos, com proteção

`studio/server/engine-updates.mjs` + `engine-current.mjs`. AniCraft, EffectCraft, FigCraft, VectorCraft e SoundCraft (só os JÁ instalados) se atualizam em silêncio: 1 min após abrir o Studio e a cada 12 h, consulta api.github.com; baixa a versão nova para uma PASTA AO LADO (`<engine>-<versão>`), confere o sha256 que o próprio GitHub publica para o arquivo (release sem digest é ignorada), roda o TESTE DE COMPATIBILIDADE (o programa precisa abrir e o --help precisar citar todos os comandos que o app usa: `needs` em SOURCES) e só então troca o ponteiro (`<engine>.current.json`). Comandos NOVOS que a versão adicione não atrapalham (o app só chama os que conhece); comando que o app usa e sumiu = versão recusada e nunca mais tentada. A versão anterior fica; a nova fica "em teste" e, se 3 comandos falharem antes de algum funcionar (hook em `exec`, localimage.mjs), o ponteiro volta sozinho e aquela versão é marcada como ruim. `LOPESFILM_ENGINE_UPDATES=off` desliga; variável `LOPESFILM_<ENGINE>_DIR` (pasta fixa do usuário) nunca é atualizada. Auto-editor, Real-ESRGAN e RIFE só avisam (ferramentas de terceiros, paradas há anos). Testado (9 testes, GitHub e downloads simulados em servidor local, engine falso em shell): atualiza ao lado, recusa sem comando, recusa sha errado, recusa sem digest, rollback e fim de teste. NÃO testado: contra os binários reais do ArtCraft (GitHub bloqueado aqui; o teste lê `--help`, `help` ou `-h`, e se algum desses não listar os subcomandos a atualização é recusada e fica na versão antiga, sem dano) e no Windows. localimage.test.mjs tem um teste de rede que trava neste ambiente (já travava antes; não relacionado).

## v69 — atualização pelo site da Lopes, novidades, cores de destaque
- **Site de atualizações** (`lopes-updates/`, PHP + JSON, para a Hostinger): você sobe o `.exe` num painel (`/admin`), o site gera `latest.yml`/`beta.yml` com SHA-512 e publica uma página de downloads com o histórico. Passo a passo em `lopes-updates/README-HOSTINGER.md`.
- **Apps verificam e baixam sozinhos**: o endereço do feed vem de `"updates"` no `brand.json` (ou `LOPESFILM_UPDATE_FEED` ao compilar). Sem endereço, nenhuma atualização é procurada (nunca o feed do projeto original).
- **Janela "Atualizar agora / Depois"** quando a versão nova já está baixada; "Depois" instala ao fechar e avisa de novo ao abrir.
- **Janela de novidades** na primeira abertura após atualizar, com as notas escritas no painel (`+` novo, `~` melhorado, `!` corrigido).
- **Cor de destaque** em Configurações → Geral → Aparência (marca, azul, verde, âmbar, violeta, ciano, rosa, lima), independente de claro/escuro.
- Correções de front-end: contorno duplo dentro dos campos de busca (o foco aparecia como uma segunda caixa), margens laterais do viewer/barra de formato.
