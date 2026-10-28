; Remove only legacy shortcuts that point to the application being upgraded.
!macro NSIS_HOOK_POSTINSTALL
  !insertmacro IsShortcutTarget "$SMPROGRAMS\OmniCopy.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $0
  ${If} $0 == 1
    Delete "$SMPROGRAMS\OmniCopy.lnk"
  ${EndIf}
  !insertmacro IsShortcutTarget "$DESKTOP\OmniCopy.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $0
  ${If} $0 == 1
    Delete "$DESKTOP\OmniCopy.lnk"
  ${EndIf}
!macroend

; Remove our optional per-user control registration only on a real uninstall.
!macro RemoveCompanionHost VENDOR
  ReadRegStr $0 HKCU "Software\${VENDOR}\NativeMessagingHosts\com.snipynest.companion" ""
  ${If} $0 == "$APPDATA\omnicopy\OmniCopy\data\browser-control\host.json"
    DeleteRegKey HKCU "Software\${VENDOR}\NativeMessagingHosts\com.snipynest.companion"
  ${EndIf}
!macroend
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    SetShellVarContext current
    !insertmacro RemoveCompanionHost "Google\Chrome"
    !insertmacro RemoveCompanionHost "Microsoft\Edge"
    !insertmacro RemoveCompanionHost "BraveSoftware\Brave-Browser"
    Delete "$APPDATA\omnicopy\OmniCopy\data\browser-control\endpoint.json"
    Delete "$APPDATA\omnicopy\OmniCopy\data\browser-control\host.json"
    ; Helpers contain no user data. Delete only these known generated filenames.
    FindFirst $0 $1 "$APPDATA\omnicopy\OmniCopy\data\browser-control\*"
    ${DoWhile} $1 != ""
      ${If} $1 != "."
      ${AndIf} $1 != ".."
        Delete /REBOOTOK "$APPDATA\omnicopy\OmniCopy\data\browser-control\$1\SnipyNestBrowserHost.exe"
        RMDir "$APPDATA\omnicopy\OmniCopy\data\browser-control\$1"
      ${EndIf}
      FindNext $0 $1
    ${Loop}
    FindClose $0
    RMDir "$APPDATA\omnicopy\OmniCopy\data\browser-control"
  ${EndIf}
!macroend
