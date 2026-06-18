@echo off
cd /d "%~dp0"
git add biolog.html
git commit -m "fix: remove autosave button, fix github button color"
git push
echo Done!
pause
