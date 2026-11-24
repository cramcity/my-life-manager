' Ouvre My Life Manager comme une application (lance le serveur s'il ne tourne pas).
Set sh = CreateObject("WScript.Shell")
dossier = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run """C:\Program Files\nodejs\node.exe"" """ & dossier & "\serve.mjs""", 0, False
WScript.Sleep 800
sh.Run """C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"" --app=http://localhost:5178/", 1, False
