Set WshShell = CreateObject("WScript.Shell")
' Run PM2 resurrect completely hidden (Window Style 0)
WshShell.Run "cmd.exe /c pm2 resurrect", 0
Set WshShell = Nothing
