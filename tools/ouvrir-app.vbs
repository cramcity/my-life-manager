' Ouvre My Life Manager comme une application (version en ligne).
Set sh = CreateObject("WScript.Shell")
dossier = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run """C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"" --app=https://cramcity.github.io/my-life-manager/", 1, False
