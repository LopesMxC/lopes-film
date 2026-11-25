@echo off
chcp 65001 >nul
rem Roda uma COPIA deste arquivo: o git reescreve o COMPILAR.bat da pasta durante o envio, e o cmd le o .bat
rem por posicao, entao mexer nele com o script rodando quebra os comandos no meio.
if not defined LF_COPIA (
  set "LF_COPIA=1"
  set "LF_PASTA=%~dp0"
  copy /y "%~f0" "%TEMP%\lopesfilm-compilar.bat" >nul
  call "%TEMP%\lopesfilm-compilar.bat"
  exit /b
)
setlocal EnableExtensions EnableDelayedExpansion
title Lopes.Film - Compilador
cd /d "%LF_PASTA%"

echo.
echo  ===============================================
echo    Lopes.Film - gerar instaladores
echo  ===============================================
echo.
echo    Qual sistema?
echo      [1] Windows   ^(compila aqui neste PC^)
echo      [2] Mac       ^(compila no GitHub, nao precisa de Mac^)
echo      [3] Os dois   ^(Windows aqui; o Mac vai para o GitHub^)
echo.
choice /c 123 /n /m "  Escolha 1, 2 ou 3: "
set "OPCAO=%errorlevel%"
set "FAZ_WIN="
set "FAZ_MAC="
if "%OPCAO%"=="1" set "FAZ_WIN=1"
if "%OPCAO%"=="2" set "FAZ_MAC=1"
if "%OPCAO%"=="3" (
  set "FAZ_WIN=1"
  set "FAZ_MAC=1"
)

echo.
echo    Qual versao do programa?
echo      [1] Lopes.Film
echo      [2] GlobalFilm
echo      [3] VerkzFilm
echo      [4] As tres
echo.
choice /c 1234 /n /m "  Escolha 1, 2, 3 ou 4: "
set "MARCA_OP=%errorlevel%"
if "%MARCA_OP%"=="1" ( set "MARCA=lopes" & set "MARCAS=lopes" )
if "%MARCA_OP%"=="2" ( set "MARCA=global" & set "MARCAS=global" )
if "%MARCA_OP%"=="3" ( set "MARCA=verkz" & set "MARCAS=verkz" )
if "%MARCA_OP%"=="4" ( set "MARCA=todas" & set "MARCAS=lopes global verkz" )
echo.

rem ---------------------------------------------------------------
rem 1) Ferramentas necessarias (instala com winget se faltar)
rem ---------------------------------------------------------------
set "FALTOU="
if defined FAZ_WIN call :ferramentas_windows
if defined FAZ_MAC call :ferramentas_github
if defined FALTOU (
  echo.
  echo  Instalei o que faltava. FECHE esta janela e rode o COMPILAR.bat de novo.
  echo.
  pause
  exit /b 0
)

rem ---------------------------------------------------------------
rem 2) Compilar (o Mac sai primeiro para o GitHub trabalhar em paralelo)
rem ---------------------------------------------------------------
if not exist "INSTALADORES" mkdir "INSTALADORES"
if defined FAZ_MAC (
  call :mac_pedir
  if errorlevel 1 goto :erro_mac
)
if defined FAZ_WIN (
  call :windows_compilar
  if errorlevel 1 goto :erro
)
if defined FAZ_MAC (
  call :mac_baixar
  if errorlevel 1 goto :erro_mac
)

echo.
echo  ===============================================
echo    Pronto! Instaladores em: %CD%\INSTALADORES
echo  ===============================================
echo.
echo  Envie para as outras pessoas so o instalador da versao desejada:
echo    Windows: o arquivo .exe
echo    Mac:     o arquivo .dmg ^(Apple Silicon = arm64, Intel = x64^)
echo.
echo  O app do Mac sai sem assinatura da Apple. Na primeira vez: botao direito no app
echo  ^> Abrir, ou no Terminal: xattr -dr com.apple.quarantine /Applications/Lopes.Film.app
echo.
start "" explorer "%CD%\INSTALADORES"
pause
exit /b 0

:erro
echo.
echo  [ERRO] A compilacao falhou. Role a janela para cima para ver o motivo.
echo  Dica: rode de novo; se persistir, mande o texto do erro para o Claude.
pause
exit /b 1

:erro_mac
echo.
echo  [ERRO] O instalador do Mac nao ficou pronto. Role a janela para cima para ver o motivo.
if defined RUN_URL echo  Detalhes do build no GitHub: %RUN_URL%
if exist "INSTALADORES\*.exe" echo  O instalador do Windows esta em: %CD%\INSTALADORES
echo  Dica: rode de novo; se persistir, mande o texto do erro para o Claude.
pause
exit /b 1


rem ===============================================================
rem Sub-rotinas
rem ===============================================================

:ferramentas_windows
where node >nul 2>nul
if errorlevel 1 (
  echo [..] Node.js nao encontrado. Instalando...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  set "FALTOU=1"
)
exit /b 0

:ferramentas_github
where git >nul 2>nul
if errorlevel 1 (
  echo [..] Git nao encontrado. Instalando...
  winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
  set "FALTOU=1"
)
where gh >nul 2>nul
if errorlevel 1 (
  echo [..] GitHub CLI nao encontrado. Instalando...
  winget install -e --id GitHub.cli --accept-source-agreements --accept-package-agreements
  set "FALTOU=1"
)
exit /b 0

rem ---------------------------------------------------------------
rem Windows: compila aqui, uma versao por vez
rem ---------------------------------------------------------------
:windows_compilar
where pnpm >nul 2>nul
if errorlevel 1 (
  echo [..] Instalando pnpm...
  call npm install -g pnpm@9.15.9
  if errorlevel 1 exit /b 1
)
echo.
echo [..] Instalando dependencias...
call pnpm install --frozen-lockfile
if errorlevel 1 (
  call pnpm install
  if errorlevel 1 exit /b 1
)
for %%M in (%MARCAS%) do (
  echo.
  echo ---------- Windows: %%M ----------
  set "LOPESFILM_BRAND=%%M"
  call :windows_gerar
  if errorlevel 1 exit /b 1
  for %%F in (apps\desktop\.release\win-x64\out\*-Setup-x64.exe) do copy /y "%%F" "INSTALADORES\" >nul
)
echo [ok] Instaladores do Windows prontos.
exit /b 0

:windows_gerar
rem O antivirus as vezes segura o .exe recem-criado (EBUSY): limpa a saida e tenta de novo (ate 3 vezes)
set "TENTATIVA=0"
:windows_tentar
set /a TENTATIVA+=1
if exist "apps\desktop\.release\win-x64\out" rmdir /s /q "apps\desktop\.release\win-x64\out" >nul 2>nul
pushd apps\desktop
call pnpm release:win
set "RESULTADO=!errorlevel!"
popd
if not "!RESULTADO!"=="0" if !TENTATIVA! LSS 3 (
  echo Falhou - tentativa !TENTATIVA! de 3. Esperando 15 s e tentando de novo...
  timeout /t 15 /nobreak >nul
  goto :windows_tentar
)
exit /b !RESULTADO!

rem ---------------------------------------------------------------
rem Mac pelo GitHub: envia o codigo, pede o build e depois baixa o .dmg
rem ---------------------------------------------------------------
:mac_pedir
echo.
echo [..] Conectando no GitHub...
gh auth status >nul 2>nul
if errorlevel 1 (
  echo     Vai abrir o navegador para voce entrar na sua conta do GitHub.
  echo     Copie o codigo que aparecer aqui e cole na pagina.
  gh auth login --hostname github.com --git-protocol https --web --scopes workflow
  if errorlevel 1 exit /b 1
)
gh auth setup-git >nul 2>nul
set "GHUSER="
for /f "usebackq delims=" %%u in (`gh api user --jq .login`) do set "GHUSER=%%u"
if not defined GHUSER (
  echo [ERRO] Nao consegui ler seu usuario do GitHub.
  exit /b 1
)
echo [ok] Conta do GitHub: %GHUSER%

rem Repositorio local e identidade dos commits
if not exist ".git" git init -q -b main
git config user.name >nul 2>nul
if errorlevel 1 git config user.name "%GHUSER%"
git config user.email >nul 2>nul
if errorlevel 1 git config user.email "%GHUSER%@users.noreply.github.com"

rem Repositorio publico no GitHub (cria na primeira vez; publico = minutos de Mac gratis)
set "REPO=lopes-film"
set "REMOTO="
for /f "usebackq delims=" %%r in (`git remote get-url origin 2^>nul`) do set "REMOTO=%%r"
if not defined REMOTO (
  gh repo view "%GHUSER%/%REPO%" >nul 2>nul
  if errorlevel 1 (
    echo [..] Criando o repositorio publico %GHUSER%/%REPO% no GitHub...
    gh repo create %REPO% --public --description "Lopes.Film" >nul
    if errorlevel 1 exit /b 1
  )
  git remote add origin "https://github.com/%GHUSER%/%REPO%.git"
)
rem Garante que o repositorio e publico (privado gasta os minutos de Mac do plano)
set "VISIB="
for /f "usebackq delims=" %%v in (`gh repo view "%GHUSER%/%REPO%" --json visibility --jq .visibility 2^>nul`) do set "VISIB=%%v"
if /i "%VISIB%"=="PRIVATE" (
  echo [..] O repositorio estava privado. Mudando para publico...
  gh repo edit "%GHUSER%/%REPO%" --visibility public --accept-visibility-change-consequences
  if errorlevel 1 exit /b 1
)

rem Envia o codigo atual
git add -A
git diff --cached --quiet
if errorlevel 1 git commit -q -m "Atualizacao para gerar os instaladores"
set "RAMO="
for /f "usebackq delims=" %%b in (`git branch --show-current`) do set "RAMO=%%b"
if not defined RAMO set "RAMO=main"
rem Se o GitHub tem commits que esta pasta nao tem, junta os dois (vale o que esta nesta pasta)
git ls-remote --exit-code --heads origin %RAMO% >nul 2>nul
if not errorlevel 1 (
  git pull -q --rebase -X theirs origin %RAMO%
  if errorlevel 1 (
    git rebase --abort >nul 2>nul
    echo [ERRO] Nao consegui juntar esta pasta com o que ja esta no GitHub.
    exit /b 1
  )
)
echo [..] Enviando o codigo para o GitHub...
git push -q -u origin %RAMO%
if errorlevel 1 (
  echo [ERRO] Nao consegui enviar o codigo para o GitHub. Veja a mensagem acima.
  exit /b 1
)

rem Pede o build so do Mac (guarda o ultimo build antes, para achar o novo depois)
set "ANTES="
for /f "usebackq delims=" %%i in (`gh run list --workflow compilar-lopesfilm.yml --event workflow_dispatch --limit 1 --json databaseId --jq ".[0].databaseId" 2^>nul`) do set "ANTES=%%i"
echo [..] Pedindo o build do Mac no GitHub ^(%MARCA%^)...
set /a TENTATIVA=0
:mac_disparar
set /a TENTATIVA+=1
gh workflow run compilar-lopesfilm.yml --ref %RAMO% -f marca=%MARCA% -f sistema=mac >nul 2>nul
if not errorlevel 1 goto :mac_achar
if %TENTATIVA% GEQ 6 (
  echo [ERRO] O GitHub nao aceitou o pedido de build. Resposta do GitHub:
  gh workflow run compilar-lopesfilm.yml --ref %RAMO% -f marca=%MARCA% -f sistema=mac
  exit /b 1
)
timeout /t 10 /nobreak >nul
goto :mac_disparar

:mac_achar
set "RUNID="
set /a TENTATIVA=0
:mac_achar_loop
set /a TENTATIVA+=1
timeout /t 5 /nobreak >nul
set "ULTIMO="
for /f "usebackq delims=" %%i in (`gh run list --workflow compilar-lopesfilm.yml --event workflow_dispatch --limit 1 --json databaseId --jq ".[0].databaseId" 2^>nul`) do set "ULTIMO=%%i"
if defined ULTIMO if not "%ULTIMO%"=="%ANTES%" if not "%ULTIMO%"=="null" set "RUNID=%ULTIMO%"
if defined RUNID goto :mac_achou
if %TENTATIVA% GEQ 24 (
  echo [ERRO] Pedi o build, mas nao encontrei ele no GitHub.
  exit /b 1
)
goto :mac_achar_loop

:mac_achou
set "RUN_URL="
for /f "usebackq delims=" %%u in (`gh run view %RUNID% --json url --jq .url`) do set "RUN_URL=%%u"
echo [ok] Build rodando no GitHub ^(Mac^). Acompanhe em:
echo     %RUN_URL%
exit /b 0

:mac_baixar
echo.
echo [..] Esperando o GitHub terminar ^(a primeira vez leva uns 15 a 25 minutos por versao^)...
gh run watch %RUNID% --exit-status --interval 30
if errorlevel 1 (
  echo [ERRO] O build falhou no GitHub.
  exit /b 1
)
set "PASTA_MAC=%CD%\INSTALADORES\_download_mac"
if exist "%PASTA_MAC%" rmdir /s /q "%PASTA_MAC%"
gh run download %RUNID% -p "*-mac-*" -D "%PASTA_MAC%"
if errorlevel 1 exit /b 1
for /r "%PASTA_MAC%" %%f in (*.dmg *.zip) do copy /y "%%f" "INSTALADORES\" >nul
rmdir /s /q "%PASTA_MAC%"
if not exist "INSTALADORES\*.dmg" (
  echo [ERRO] O GitHub terminou, mas o .dmg nao veio no download.
  exit /b 1
)
echo [ok] Instaladores do Mac prontos.
exit /b 0
