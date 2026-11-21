Option Explicit
Dim shell, fso, folder, scriptPath, command, result
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
scriptPath = fso.BuildPath(folder, "Start-System.ps1")
command = "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & scriptPath & Chr(34)
result = shell.Run(command, 0, True)
WScript.Quit result
