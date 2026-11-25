@echo off
REM ============================================================
REM  deploy_setup.bat
REM  Lives in dev_scripts\, but always operates inside ..\secrets
REM  (a sibling folder at the project root), which is gitignored
REM  and safe to contain real key material. Works correctly no
REM  matter which folder you're standing in when you run it.
REM
REM  Does two things:
REM    1. Generates the deploy_key / deploy_key.pub SSH keypair for
REM       this repo, if it doesn't already exist, inside ..\secrets.
REM    2. Sets the GitHub repository secrets deploy-to-vps.yml
REM       needs, via the gh CLI, prompting for each value. Secret
REM       values are entered at gh's hidden prompt.
REM
REM  Requires: gh (GitHub CLI), authenticated (gh auth login).
REM
REM  Written with simple, single-line IF statements and goto for
REM  branching rather than nested IF/ELSE ( ) blocks, since nested
REM  parenthetical blocks are fragile in cmd.exe.
REM ============================================================

if not exist "%~dp0..\secrets" mkdir "%~dp0..\secrets"
cd /d %~dp0..\secrets

set "REPO=LeeLinkoff/acquireiq"

gh --version >nul 2>&1
if errorlevel 1 goto no_gh
goto have_gh

:no_gh
echo.
echo ERROR: gh (GitHub CLI) not found or not in PATH.
echo Install it first: https://cli.github.com
echo.
pause
exit /b 1

:have_gh
echo ============================================================
echo  Step 1: SSH keypair
echo ============================================================

if exist "deploy_key" goto key_exists
goto generate_key

:key_exists
echo deploy_key already exists here, skipping generation.
goto show_pubkey

:generate_key
echo Generating a new dedicated keypair for this repo...
ssh-keygen -t ed25519 -C "acquireiq-deploy" -f deploy_key -N ""
if errorlevel 1 goto keygen_failed
echo Generated deploy_key and deploy_key.pub.
goto show_pubkey

:keygen_failed
echo.
echo ERROR: ssh-keygen failed. See output above.
pause
exit /b 1

:show_pubkey
echo.
echo Public key, add this line to the VPS's ~/.ssh/authorized_keys
echo if you haven't already:
echo.
type deploy_key.pub
echo.
echo Sanity check once added:
echo   ssh -i deploy_key ^<user^>@^<host^> "echo it works"
echo.
pause

echo.
echo ============================================================
echo  Step 2: Set GitHub repository secrets for %REPO%
echo ============================================================
echo Non-secret settings: press Enter to accept a default shown in
echo brackets, or type a value. Settings without a default must be
echo typed. Secret values ^(DATABASE_URL, OPENAI_API_KEY^) are entered
echo at gh's own hidden prompt, never on the command line.
echo Use letters and digits only in the database password, since it
echo is part of DATABASE_URL.
echo.

set "VPS_HOST="
set /p VPS_HOST=VPS_HOST (server hostname or IP): 
if "%VPS_HOST%"=="" goto missing_value
gh secret set VPS_HOST --repo %REPO% --body "%VPS_HOST%"

set "VPS_USER="
set /p VPS_USER=VPS_USER (SSH user on the server): 
if "%VPS_USER%"=="" goto missing_value
gh secret set VPS_USER --repo %REPO% --body "%VPS_USER%"

if not exist "deploy_key" goto skip_sshkey
echo Setting VPS_SSH_KEY from .\deploy_key ...
gh secret set VPS_SSH_KEY --repo %REPO% < deploy_key
goto sshkey_done
:skip_sshkey
echo No deploy_key found here, skipping VPS_SSH_KEY.
:sshkey_done

set "VPS_PROJECT_PATH=/opt/acquireiq"
set /p VPS_PROJECT_PATH=VPS_PROJECT_PATH [%VPS_PROJECT_PATH%]: 
gh secret set VPS_PROJECT_PATH --repo %REPO% --body "%VPS_PROJECT_PATH%"

set "VPS_STATIC_PATH="
set /p VPS_STATIC_PATH=VPS_STATIC_PATH (folder Apache serves at /mvps/acquireiq/): 
if "%VPS_STATIC_PATH%"=="" goto missing_value
gh secret set VPS_STATIC_PATH --repo %REPO% --body "%VPS_STATIC_PATH%"

set "PUBLIC_HEALTH_URL="
set /p PUBLIC_HEALTH_URL=PUBLIC_HEALTH_URL (https://^<domain^>/mvps/acquireiq/api/health): 
if "%PUBLIC_HEALTH_URL%"=="" goto missing_value
gh secret set PUBLIC_HEALTH_URL --repo %REPO% --body "%PUBLIC_HEALTH_URL%"

echo.
echo DATABASE_URL, for example:
echo   postgresql://acquireiq_app:^<password^>@host.docker.internal:5432/acquireiq
gh secret set DATABASE_URL --repo %REPO%

echo.
echo OPENAI_API_KEY:
gh secret set OPENAI_API_KEY --repo %REPO%

echo.
echo ============================================================
echo  Done. Verify what's set (names only, gh never shows values):
echo    gh secret list --repo %REPO%
echo ============================================================
pause
exit /b 0

:missing_value
echo.
echo ERROR: that setting is required. Nothing further was set.
echo Run this script again when you have the value.
pause
exit /b 1
