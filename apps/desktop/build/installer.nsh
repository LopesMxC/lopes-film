; Tema do instalador do Lopes.Film (grafite e carmesim).
; ATENÇÃO à ordem: o electron-builder insere as páginas (assistedInstaller.nsh) ANTES de rodar `customHeader`, então
; tudo o que precisa existir antes de uma página (textos, cores, função que pinta a tela) é definido nas macros
; que ele chama junto de cada página: customWelcomePage, customPageAfterChangeDir, customFinishPage e as do desinstalador.
!define LF_TEXT "EFEDE9"
!define LF_MUTED "9A9A9F"
!ifndef LF_BG
  !define LF_BG "101113"
!endif
!ifndef LF_FIELD_BGR
  !define LF_FIELD_BGR "0x1F1C1B"
!endif
!ifndef LF_ACCENT_BGR
  !define LF_ACCENT_BGR "0x4E38E0"
!endif
!ifndef LF_BGR
  !define LF_BGR "0x131110"
!endif
!ifndef LF_FIELD
  !define LF_FIELD "1B1C1F"
!endif

!macro LF_COLOR dlg id fg bg
  GetDlgItem $1 ${dlg} ${id}
  SetCtlColors $1 "${fg}" "${bg}"
!macroend

; Pinta a janela inteira (cabeçalho, rodapé), a tela atual e TODOS os controles dela (acha-os um a um, sem depender de ID).
!macro LF_PAGE un
  Function ${un}LfThemePage
    SetCtlColors $HWNDPARENT "${LF_TEXT}" "${LF_BG}"
    ; a linha clara que separa o rodapé: some (o rodapé é do mesmo fundo, a divisão vem do próprio painel)
    GetDlgItem $1 $HWNDPARENT 1045
    ShowWindow $1 0
    GetDlgItem $1 $HWNDPARENT 1047
    ShowWindow $1 0
    GetDlgItem $1 $HWNDPARENT 1048
    ShowWindow $1 0
    ; as linhas finas (separadores do cabeçalho e do rodapé): qualquer controle da janela com até 3 px de altura some
    StrCpy $2 0
    ${un}LfLine:
      FindWindow $2 "Static" "" $HWNDPARENT $2
      StrCmp $2 0 ${un}LfLineEnd
      System::Call '*(i,i,i,i) p .r4'
      System::Call 'user32::GetClientRect(i $2, p r4)'
      System::Call '*$4(i,i,i,i .r5)'
      System::Free $4
      IntCmp $5 3 +1 +1 +2
        ShowWindow $2 0
      Goto ${un}LfLine
    ${un}LfLineEnd:
    !insertmacro LF_COLOR $HWNDPARENT 1034 "${LF_TEXT}" "${LF_BG}"
    !insertmacro LF_COLOR $HWNDPARENT 1037 "${LF_TEXT}" "${LF_BG}"
    !insertmacro LF_COLOR $HWNDPARENT 1038 "${LF_MUTED}" "${LF_BG}"
    !insertmacro LF_COLOR $HWNDPARENT 1028 "${LF_MUTED}" "${LF_BG}"
    !insertmacro LF_COLOR $HWNDPARENT 1256 "${LF_MUTED}" "${LF_BG}"
    ; as telas que o instalador já abriu (a atual e as anteriores, que ficam escondidas): cada uma, e todos os controles dela
    StrCpy $3 0
    ${un}LfDlg:
      FindWindow $3 "#32770" "" $HWNDPARENT $3
      StrCmp $3 0 ${un}LfEnd
      SetCtlColors $3 "${LF_TEXT}" "${LF_BG}"
      StrCpy $2 0
      ${un}LfNext:
        FindWindow $2 "" "" $3 $2
        StrCmp $2 0 ${un}LfDone
        ; caixas de seleção, botões de opção e molduras seguem o tema do Windows e ignoram a cor do texto (ficava escuro
        ; sobre o fundo escuro): tira o tema só desses, para a cor valer
        System::Call 'user32::GetClassName(i $2, t .r4, i 32)'
        ; a barra de progresso: sem o tema do Windows (o verde padrão), trilho na cor dos campos e preenchimento na cor de destaque da marca
        StrCmp $4 "msctls_progress32" 0 ${un}LfNotBar
          System::Call 'uxtheme::SetWindowTheme(i $2, w " ", w " ")'
          SendMessage $2 0x2001 0 ${LF_FIELD_BGR}
          SendMessage $2 0x0409 0 ${LF_ACCENT_BGR}
          Goto ${un}LfNext
        ${un}LfNotBar:
        StrCmp $4 "Button" 0 ${un}LfPaint
        System::Call 'user32::GetWindowLong(i $2, i -16) i .r5'
        IntOp $5 $5 & 15
        ; a moldura em torno do campo da pasta (caixa de grupo): some, o campo já tem a própria borda
        IntCmp $5 7 +1 +3 +3
          ShowWindow $2 0
          Goto ${un}LfNext
        IntCmp $5 2 +1 ${un}LfPaint +1
        System::Call 'uxtheme::SetWindowTheme(i $2, w " ", w " ")'
        ${un}LfPaint:
        SetCtlColors $2 "${LF_TEXT}" "${LF_BG}"
        Goto ${un}LfNext
      ${un}LfDone:
      ; tipografia das boas-vindas e da tela final: título em semibold, texto maior e na cor suave. Só nelas (têm a imagem
      ; lateral, 1200): em outras telas os mesmos números são outros controles (os botões de opção de "para quem instalar"
      ; ficavam com a fonte do título, enormes e cortados)
      GetDlgItem $1 $3 1200
      StrCmp $1 0 ${un}LfNoType
      GetDlgItem $1 $3 1201
      System::Call 'gdi32::CreateFont(i -22, i 0, i 0, i 0, i 600, i 0, i 0, i 0, i 1, i 0, i 0, i 5, i 0, t "Segoe UI Semibold") i .r6'
      SendMessage $1 48 $6 1
      GetDlgItem $1 $3 1202
      System::Call 'gdi32::CreateFont(i -14, i 0, i 0, i 0, i 400, i 0, i 0, i 0, i 1, i 0, i 0, i 5, i 0, t "Segoe UI") i .r6'
      SendMessage $1 48 $6 1
      !insertmacro LF_COLOR $3 1202 "${LF_MUTED}" "${LF_BG}"
      ${un}LfNoType:
      GetDlgItem $1 $3 1020
      SendMessage $1 0x000C 0 "STR:"
      !insertmacro LF_COLOR $3 1019 "${LF_TEXT}" "${LF_FIELD}"
      !insertmacro LF_COLOR $3 1016 "${LF_TEXT}" "${LF_BG}"
      ; a lista de detalhes da instalação é uma lista do Windows: as cores vão por mensagem (BGR)
      SendMessage $1 0x1001 0 ${LF_BGR}
      SendMessage $1 0x1026 0 ${LF_BGR}
      SendMessage $1 0x1024 0 0xE9EDEF
      Goto ${un}LfDlg
    ${un}LfEnd:
  FunctionEnd
!macroend
!ifndef BUILD_UNINSTALLER
  !insertmacro LF_PAGE ""
  ; a tela da pasta não recebe a função de tema pelas macros do electron-builder (a tela "para quem instalar" a consome);
  ; o NSIS chama esta função quando a tela da pasta abre e a cada mudança no campo
  Function .onVerifyInstDir
    Push $0
    Push $1
    Push $2
    Push $3
    Push $4
    Push $5
    Call LfThemePage
    Pop $5
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
  FunctionEnd
!else
  !insertmacro LF_PAGE "un."
!endif

; boas-vindas (com o painel lateral). Os textos e o resto do tema entram aqui porque é a primeira página inserida.
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Bem-vindo ao ${PRODUCT_NAME}"
  !define MUI_WELCOMEPAGE_TEXT "O ${PRODUCT_NAME} monta, ajusta e exporta o seu vídeo com a ajuda de um assistente de IA.$\r$\n$\r$\nEste assistente vai instalar o app no seu computador. Seus projetos ficam com você."
  !define MUI_FINISHPAGE_TITLE "${PRODUCT_NAME} instalado"
  !define MUI_FINISHPAGE_TEXT "Tudo pronto. Você já pode abrir o ${PRODUCT_NAME}."
  !ifdef LF_SITE
    !define MUI_FINISHPAGE_LINK "Abrir o site do desenvolvedor"
    !define MUI_FINISHPAGE_LINK_LOCATION "${LF_SITE}"
  !endif
  BrandingText "${PRODUCT_NAME}"
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW LfThemePage
  !insertmacro MUI_PAGE_WELCOME
  ; a próxima tela do instalador (a da pasta) também
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW LfThemePage
!macroend

; depois da escolha da pasta: a tela de instalação
!macro customPageAfterChangeDir
  !ifdef MUI_PAGE_CUSTOMFUNCTION_SHOW
    !undef MUI_PAGE_CUSTOMFUNCTION_SHOW
  !endif
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW LfThemePage
  !define MUI_INSTFILESPAGE_COLORS "${LF_TEXT} ${LF_BG}"
!macroend

; a tela final (a mesma lógica do electron-builder: abrir o app ao terminar), com o tema
!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd
    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW LfThemePage
  !insertmacro MUI_PAGE_FINISH
!macroend

; desinstalador: o mesmo tema (só existe na passada que gera o desinstalador)
!macro customUnWelcomePage
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.LfThemePage
  !insertmacro MUI_UNPAGE_WELCOME
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.LfThemePage
!macroend
!macro customUninstallPage
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.LfThemePage
!macroend

; Instalador (Lopes.Film, GlobalFilm ou VerkzFilm, o nome vem de ${PRODUCT_NAME}): se já houver uma versão instalada, oferece atualizar.
; O atalho fixado na barra de tarefas (User Pinned\TaskBar) é copiado antes de a versão antiga ser removida e posto de volta
; depois, se a atualização o levou: o app continua fixado.
!macro customInit
  CreateDirectory "$TEMP\lopesfilm-pin"
  CopyFiles /SILENT "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${PRODUCT_NAME}*.lnk" "$TEMP\lopesfilm-pin"
  ; a pin on the taskbar is also in the Taskband key, which Explorer reads only when it starts
  ${If} ${FileExists} "$TEMP\lopesfilm-pin\${PRODUCT_NAME}.lnk"
    nsExec::ExecToLog 'reg export "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband" "$TEMP\lopesfilm-pin\taskband.reg" /y'
    Pop $0
  ${EndIf}
  ReadRegStr $0 HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ${If} $0 != ""
    MessageBox MB_YESNO|MB_ICONQUESTION "O ${PRODUCT_NAME} $0 já está instalado.$\n$\nDeseja atualizar para a versão ${VERSION}? Seus projetos e configurações são mantidos." /SD IDYES IDYES lopesfilm_update
    Quit
    lopesfilm_update:
  ${EndIf}
!macroend

; Requisitos do agente de IA, instalados junto com o app (só o que faltar): Git for Windows e Node.js (winget) e Claude Code
; (instalador oficial). Nada disso impede a instalação do app se falhar: o app tenta de novo ao conectar o Claude.
!macro customInstall
  ${IfNot} ${FileExists} "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${PRODUCT_NAME}.lnk"
  ${AndIf} ${FileExists} "$TEMP\lopesfilm-pin\${PRODUCT_NAME}.lnk"
    CreateDirectory "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
    CopyFiles /SILENT "$TEMP\lopesfilm-pin\${PRODUCT_NAME}*.lnk" "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
    ; Explorer shows the pin after it reads the Taskband key again: closed, the key put back, started again (once, only when the update took the pin)
    ${If} ${FileExists} "$TEMP\lopesfilm-pin\taskband.reg"
      nsExec::ExecToLog 'taskkill /F /IM explorer.exe'
      Pop $0
      nsExec::ExecToLog 'reg import "$TEMP\lopesfilm-pin\taskband.reg"'
      Pop $0
      Exec '"$WINDIR\explorer.exe"'
    ${EndIf}
  ${EndIf}
  RMDir /r "$TEMP\lopesfilm-pin"
  DetailPrint "Verificando requisitos (Git, Node.js, Claude Code)..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $$ProgressPreference=$\'SilentlyContinue$\'; if(-not(Get-Command git -ErrorAction SilentlyContinue)){Write-Host $\'Instalando Git...$\'; winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements}; if(-not(Get-Command node -ErrorAction SilentlyContinue)){Write-Host $\'Instalando Node.js...$\'; winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements}; if(-not(Test-Path ($$env:USERPROFILE+$\'\.local\bin\claude.exe$\'))){Write-Host $\'Instalando Claude Code...$\'; irm https://claude.ai/install.ps1 | iex}"'
  Pop $0
  DetailPrint "Requisitos verificados."
!macroend

; sem a tela "para quem instalar" (um diálogo do Windows que não veste o tema): o app fica sempre na pasta da pessoa,
; sem pedir administrador, e as atualizações instalam sem perguntar
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
