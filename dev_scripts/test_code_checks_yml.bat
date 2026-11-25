@echo off
REM ============================================================
REM  test_code_checks_yml.bat
REM  Runs the boot-test job (and its type-check dependency)
REM  from code-checks.yml locally via act. Safe: this workflow
REM  never touches a server or any secrets. The boot test starts
REM  its own disposable PostgreSQL container, published on host
REM  port 55432 so it cannot clash with a local PostgreSQL on 5432.
REM
REM  act treats whatever directory it's run FROM as the repo
REM  root, there is no separate flag to decouple that. This
REM  script cd's to the actual repo root internally first, so it
REM  works correctly regardless of which folder you started in.
REM ============================================================

cd /d "%~dp0.."

call "%~dp0act.bat" push -j boot-test -W .github/workflows/code-checks.yml

echo.
pause
