@echo off
REM Builds the mod outside Claude's MSIX process tree (see docs/troubleshooting.md).
REM Run via Task Scheduler; writes a ===EXITCODE=n=== marker for the caller to poll.
set "JAVA_HOME=C:\Users\FluffyBacon\.jdks\jdk-21.0.11+10"
cd /d "H:\Game\minecraftstreamdeck\minecraft-fabric"
call gradlew.bat build --no-daemon
echo ===EXITCODE=%ERRORLEVEL%===
