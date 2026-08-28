@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "BASE=http://localhost:3002"

set "TMP_BODY=%TEMP%\acquireiq-status-body.tmp"
set "SEQ_CREATE=%TEMP%\acquireiq-seq-create.tmp"
set "CON_CREATE=%TEMP%\acquireiq-con-create.tmp"
set "CON_A=%TEMP%\acquireiq-con-a.tmp"
set "CON_B=%TEMP%\acquireiq-con-b.tmp"

set /a PASS=0
set /a FAIL=0

call :CLEANUP

echo ============================================================
echo AcquireIQ Stage 2 Status Workflow Tests
echo Fresh test data - CMD and curl only
echo ============================================================
echo.

rem ============================================================
rem BASIC VALIDATION TESTS
rem ============================================================

for /f %%H in ('curl.exe -s -o "%TMP_BODY%" -w "%%{http_code}" "%BASE%/api/health"') do set "CODE=%%H"
call :CHECK "Backend health" 200 "!CODE!"

for /f %%H in ('curl.exe -s -o "%TMP_BODY%" -w "%%{http_code}" -X PATCH "%BASE%/requests/1/status" -H "Content-Type: application/json" -d "{\"status\":\"banana\"}"') do set "CODE=%%H"
call :CHECK "Invalid status" 400 "!CODE!"

for /f %%H in ('curl.exe -s -o "%TMP_BODY%" -w "%%{http_code}" -X PATCH "%BASE%/requests/999999/status" -H "Content-Type: application/json" -d "{\"status\":\"submitted\"}"') do set "CODE=%%H"
call :CHECK "Nonexistent request" 404 "!CODE!"

for /f %%H in ('curl.exe -s -o "%TMP_BODY%" -w "%%{http_code}" -X PATCH "%BASE%/requests/abc/status" -H "Content-Type: application/json" -d "{\"status\":\"submitted\"}"') do set "CODE=%%H"
call :CHECK "Malformed request ID" 400 "!CODE!"

for /f %%H in ('curl.exe -s -o "%TMP_BODY%" -w "%%{http_code}" -X PATCH "%BASE%/requests/0/status" -H "Content-Type: application/json" -d "{\"status\":\"submitted\"}"') do set "CODE=%%H"
call :CHECK "Zero request ID" 400 "!CODE!"

for /f %%H in ('curl.exe -s -o "%TMP_BODY%" -w "%%{http_code}" -X PATCH "%BASE%/requests/1/status" -H "Content-Type: application/json" -d "{}"') do set "CODE=%%H"
call :CHECK "Missing status property" 400 "!CODE!"

rem ============================================================
rem MALFORMED JSON
rem
rem This currently exposes the known backend bug:
rem malformed JSON is returning 500 instead of 400.
rem ============================================================

for /f %%H in ('curl.exe -s -o "%TMP_BODY%" -w "%%{http_code}" -X PATCH "%BASE%/requests/1/status" -H "Content-Type: application/json" -d "{\"status\":\"submitted\""') do set "CODE=%%H"
call :CHECK "Malformed JSON body" 400 "!CODE!"

rem ============================================================
rem SEEDED SPECIAL-STATE TESTS
rem
rem These use seeded records because they require existing
rem approval/rejected/awarded fixture states.
rem They do NOT mutate those records when the API is correct.
rem ============================================================

for /f %%H in ('curl.exe -s -o "%TMP_BODY%" -w "%%{http_code}" -X PATCH "%BASE%/requests/1/status" -H "Content-Type: application/json" -d "{\"status\":\"approved\"}"') do set "CODE=%%H"
call :CHECK "Pending approvals block approval" 422 "!CODE!"

for /f %%H in ('curl.exe -s -o "%TMP_BODY%" -w "%%{http_code}" -X PATCH "%BASE%/requests/6/status" -H "Content-Type: application/json" -d "{\"status\":\"submitted\"}"') do set "CODE=%%H"
call :CHECK "Rejected request cannot be revived" 422 "!CODE!"

for /f %%H in ('curl.exe -s -o "%TMP_BODY%" -w "%%{http_code}" -X PATCH "%BASE%/requests/3/status" -H "Content-Type: application/json" -d "{\"status\":\"approved\"}"') do set "CODE=%%H"
call :CHECK "Awarded request cannot move backward" 422 "!CODE!"

rem ============================================================
rem CREATE FRESH REQUEST FOR SEQUENTIAL WORKFLOW
rem ============================================================

echo.
echo ============================================================
echo Creating fresh sequential workflow request
echo ============================================================

set "SEQ_ID="
set "SEQ_TITLE=Workflow Sequential %RANDOM%-%RANDOM%"

for /f %%H in ('curl.exe -s -o "%SEQ_CREATE%" -w "%%{http_code}" -X POST "%BASE%/requests" -H "Content-Type: application/json" -d "{\"title\":\"!SEQ_TITLE!\",\"description\":\"Automated Stage 2 sequential workflow test.\",\"requestorId\":1,\"priority\":\"medium\",\"budgetCeiling\":\"1000.00\",\"fiscalYear\":2027}"') do set "CODE=%%H"

call :CHECK_FILE "Create fresh sequential request" 201 "!CODE!" "%SEQ_CREATE%"

if not "!CODE!"=="201" goto SEQUENTIAL_DONE

call :PARSE_ID "%SEQ_CREATE%" SEQ_ID

if not defined SEQ_ID (
    echo [FAIL] Parse sequential request ID
    echo Response:
    type "%SEQ_CREATE%"
    echo.
    set /a FAIL+=1
    goto SEQUENTIAL_DONE
)

echo Sequential request ID: !SEQ_ID!

rem ============================================================
rem SEQUENTIAL STATE-MACHINE TEST
rem ============================================================

for /f %%H in ('curl.exe -s -o "%TMP_BODY%" -w "%%{http_code}" -X PATCH "%BASE%/requests/!SEQ_ID!/status" -H "Content-Type: application/json" -d "{\"status\":\"submitted\"}"') do set "CODE=%%H"
call :CHECK "Valid draft to submitted" 200 "!CODE!"

for /f %%H in ('curl.exe -s -o "%TMP_BODY%" -w "%%{http_code}" -X PATCH "%BASE%/requests/!SEQ_ID!/status" -H "Content-Type: application/json" -d "{\"status\":\"awarded\"}"') do set "CODE=%%H"
call :CHECK "Reject submitted to awarded skip" 422 "!CODE!"

for /f %%H in ('curl.exe -s -o "%TMP_BODY%" -w "%%{http_code}" -X PATCH "%BASE%/requests/!SEQ_ID!/status" -H "Content-Type: application/json" -d "{\"status\":\"in_review\"}"') do set "CODE=%%H"
call :CHECK "Valid submitted to in_review" 200 "!CODE!"

for /f %%H in ('curl.exe -s -o "%TMP_BODY%" -w "%%{http_code}" -X PATCH "%BASE%/requests/!SEQ_ID!/status" -H "Content-Type: application/json" -d "{\"status\":\"approved\"}"') do set "CODE=%%H"
call :CHECK "Valid in_review to approved with no approval rows" 200 "!CODE!"

for /f %%H in ('curl.exe -s -o "%TMP_BODY%" -w "%%{http_code}" -X PATCH "%BASE%/requests/!SEQ_ID!/status" -H "Content-Type: application/json" -d "{\"status\":\"awarded\"}"') do set "CODE=%%H"
call :CHECK "Valid approved to awarded" 200 "!CODE!"

for /f %%H in ('curl.exe -s -o "%TMP_BODY%" -w "%%{http_code}" -X PATCH "%BASE%/requests/!SEQ_ID!/status" -H "Content-Type: application/json" -d "{\"status\":\"approved\"}"') do set "CODE=%%H"
call :CHECK "Fresh awarded request is terminal" 422 "!CODE!"

curl.exe -s "%BASE%/requests/!SEQ_ID!" -o "%TMP_BODY%"

findstr /C:"\"status\":\"awarded\"" "%TMP_BODY%" >nul

if errorlevel 1 (
    echo [FAIL] Sequential request final status - expected awarded
    echo Response:
    type "%TMP_BODY%"
    echo.
    set /a FAIL+=1
) else (
    echo [PASS] Sequential request final status - awarded
    set /a PASS+=1
)

:SEQUENTIAL_DONE

rem ============================================================
rem CREATE FRESH REQUEST FOR CONCURRENCY TEST
rem ============================================================

echo.
echo ============================================================
echo Creating fresh concurrency workflow request
echo ============================================================

set "CON_ID="
set "CON_TITLE=Workflow Concurrency %RANDOM%-%RANDOM%"

for /f %%H in ('curl.exe -s -o "%CON_CREATE%" -w "%%{http_code}" -X POST "%BASE%/requests" -H "Content-Type: application/json" -d "{\"title\":\"!CON_TITLE!\",\"description\":\"Automated Stage 2 concurrency workflow test.\",\"requestorId\":1,\"priority\":\"medium\",\"budgetCeiling\":\"1000.00\",\"fiscalYear\":2027}"') do set "CODE=%%H"

call :CHECK_FILE "Create fresh concurrency request" 201 "!CODE!" "%CON_CREATE%"

if not "!CODE!"=="201" goto FINAL_RESULTS

call :PARSE_ID "%CON_CREATE%" CON_ID

if not defined CON_ID (
    echo [FAIL] Parse concurrency request ID
    echo Response:
    type "%CON_CREATE%"
    echo.
    set /a FAIL+=1
    goto FINAL_RESULTS
)

echo Concurrency request ID: !CON_ID!
echo.
echo Launching two simultaneous draft-to-submitted requests...
echo.

del /q "%CON_A%" "%CON_B%" 2>nul

rem ============================================================
rem CONCURRENT PATCH REQUESTS
rem
rem START launches curl.exe directly.
rem No nested CMD /C.
rem Each process writes its complete HTTP response to its own file.
rem ============================================================

start "" /b curl.exe -s -i -X PATCH "%BASE%/requests/!CON_ID!/status" -H "Content-Type: application/json" -d "{\"status\":\"submitted\"}" > "%CON_A%"

start "" /b curl.exe -s -i -X PATCH "%BASE%/requests/!CON_ID!/status" -H "Content-Type: application/json" -d "{\"status\":\"submitted\"}" > "%CON_B%"

rem Give both local requests time to complete.
timeout /t 3 /nobreak >nul

rem ============================================================
rem VERIFY CONCURRENCY OUTPUT FILES EXIST
rem ============================================================

if not exist "%CON_A%" (
    echo [FAIL] Concurrent request A did not create an output file
    set /a FAIL+=1
    goto CONCURRENCY_FINAL_STATE
)

if not exist "%CON_B%" (
    echo [FAIL] Concurrent request B did not create an output file
    set /a FAIL+=1
    goto CONCURRENCY_FINAL_STATE
)

echo ----- CONCURRENT REQUEST A -----
type "%CON_A%"
echo.
echo.

echo ----- CONCURRENT REQUEST B -----
type "%CON_B%"
echo.
echo.

rem ============================================================
rem EXACTLY ONE MUST SUCCEED AND ONE MUST BE REJECTED
rem ============================================================

set /a COUNT_200=0
set /a COUNT_422=0

findstr /C:"HTTP/1.1 200" "%CON_A%" >nul
if not errorlevel 1 set /a COUNT_200+=1

findstr /C:"HTTP/1.1 422" "%CON_A%" >nul
if not errorlevel 1 set /a COUNT_422+=1

findstr /C:"HTTP/1.1 200" "%CON_B%" >nul
if not errorlevel 1 set /a COUNT_200+=1

findstr /C:"HTTP/1.1 422" "%CON_B%" >nul
if not errorlevel 1 set /a COUNT_422+=1

if "!COUNT_200!"=="1" (
    if "!COUNT_422!"=="1" (
        echo [PASS] Concurrent transition - exactly one 200 and one 422
        set /a PASS+=1
    ) else (
        echo [FAIL] Concurrent transition - expected one 422, found !COUNT_422!
        set /a FAIL+=1
    )
) else (
    echo [FAIL] Concurrent transition - expected one 200, found !COUNT_200!
    set /a FAIL+=1
)

:CONCURRENCY_FINAL_STATE

rem ============================================================
rem FINAL DATABASE STATE MUST BE SUBMITTED
rem ============================================================

curl.exe -s "%BASE%/requests/!CON_ID!" -o "%TMP_BODY%"

findstr /C:"\"status\":\"submitted\"" "%TMP_BODY%" >nul

if errorlevel 1 (
    echo [FAIL] Concurrent request final status - expected submitted
    echo Response:
    type "%TMP_BODY%"
    echo.
    set /a FAIL+=1
) else (
    echo [PASS] Concurrent request final status - submitted
    set /a PASS+=1
)

:FINAL_RESULTS

echo.
echo ============================================================
echo FINAL RESULTS
echo ============================================================
echo PASS: !PASS!
echo FAIL: !FAIL!

set /a TOTAL=PASS+FAIL

echo TOTAL: !TOTAL!
echo ============================================================

if !FAIL! EQU 0 (
    echo ALL STAGE 2 WORKFLOW TESTS PASSED.
    call :CLEANUP
    endlocal
    exit /b 0
) else (
    echo ONE OR MORE STAGE 2 WORKFLOW TESTS FAILED.
    call :CLEANUP
    endlocal
    exit /b 1
)

rem ============================================================
rem SUBROUTINES
rem ============================================================

:CHECK

if "%~2"=="%~3" (
    echo [PASS] %~1 - HTTP %~3
    set /a PASS+=1
) else (
    echo [FAIL] %~1 - expected HTTP %~2, got %~3
    if exist "%TMP_BODY%" (
        echo Response:
        type "%TMP_BODY%"
        echo.
    )
    set /a FAIL+=1
)

exit /b


:CHECK_FILE

if "%~2"=="%~3" (
    echo [PASS] %~1 - HTTP %~3
    set /a PASS+=1
) else (
    echo [FAIL] %~1 - expected HTTP %~2, got %~3
    if exist "%~4" (
        echo Response:
        type "%~4"
        echo.
    )
    set /a FAIL+=1
)

exit /b


:PARSE_ID

set "PARSE_FILE=%~1"
set "PARSE_VAR=%~2"
set "PARSED_ID="

for /f "tokens=2 delims=:," %%A in ('findstr /R /C:"\"id\":[0-9][0-9]*" "%PARSE_FILE%"') do (
    if not defined PARSED_ID set "PARSED_ID=%%A"
)

set "PARSED_ID=!PARSED_ID: =!"

if defined PARSED_ID (
    set "%PARSE_VAR%=!PARSED_ID!"
)

exit /b


:CLEANUP

del /q "%TMP_BODY%" 2>nul
del /q "%SEQ_CREATE%" 2>nul
del /q "%CON_CREATE%" 2>nul
del /q "%CON_A%" 2>nul
del /q "%CON_B%" 2>nul

exit /b