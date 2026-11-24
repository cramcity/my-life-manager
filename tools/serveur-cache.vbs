' Lance le serveur local de My Life Manager sans fenêtre (utilisé au démarrage de Windows).
Set sh = CreateObject("WScript.Shell")
dossier = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run """C:\Program Files\nodejs\node.exe"" """ & dossier & "\serve.mjs""", 0, False
