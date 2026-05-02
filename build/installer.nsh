; TaskMaster Pro - NSIS Installer Custom Script
; Türkçe ve İngilizce dil desteği

!macro customHeader
  !system "echo 'TaskMaster Pro Installer Building...'"
!macroend

!macro customInit
  ; Önceki sürüm kontrolü
  ReadRegStr $0 HKCU "Software\TaskMaster Pro" "InstallLocation"
  ${If} $0 != ""
    MessageBox MB_YESNO|MB_ICONQUESTION "TaskMaster Pro zaten kurulu. Devam etmek istiyor musunuz?$\n$\nMevcut konum: $0" IDYES continue IDNO abort
    abort:
      Quit
    continue:
  ${EndIf}
!macroend

!macro customInstall
  ; Kayıt defterine yaz
  WriteRegStr HKCU "Software\TaskMaster Pro" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\TaskMaster Pro" "Version" "${VERSION}"
  
  ; Başlangıçta çalıştır seçeneği (opsiyonel)
  ; WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "TaskMaster Pro" "$INSTDIR\${PRODUCT_FILENAME}.exe"
!macroend

!macro customUnInstall
  ; Kayıt defterinden sil
  DeleteRegKey HKCU "Software\TaskMaster Pro"
  
  ; Başlangıçtan kaldır
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "TaskMaster Pro"
  
  ; Kullanıcı verilerini silme seçeneği
  MessageBox MB_YESNO|MB_ICONQUESTION "Kullanıcı verilerinizi de silmek istiyor musunuz?$\n$\n(Görevler, notlar, ayarlar)" IDYES deleteData IDNO skipDelete
  deleteData:
    RMDir /r "$APPDATA\taskmaster-pro"
  skipDelete:
!macroend

!macro customRemoveFiles
  ; Geçici dosyaları temizle
  Delete "$INSTDIR\*.log"
  Delete "$INSTDIR\*.tmp"
!macroend
