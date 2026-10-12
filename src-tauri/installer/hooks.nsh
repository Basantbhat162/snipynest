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
