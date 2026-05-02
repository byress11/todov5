# TaskMaster Pro Performance Diagnose

Bu dokuman, yuksek CPU/RAM/disk kullanimini olcmek ve "oncesi/sonrasi" karsilastirmasi yapmak icin standart bir akis tanimlar.

## 1) Olcum Profili (Before)

1. Uygulamayi acin.
2. Tarayici sekmesinde YouTube acin ve 5 dakika bekletin.
3. En az 3 sekme acik kalsin (1 aktif, 2 idle).

### A) Electron Task Manager

- Uygulamada DevTools acin.
- `Shift+Esc` ile Electron Task Manager acin.
- Su degerleri not edin:
  - Main process CPU/RAM
  - Her BrowserView renderer CPU/RAM
  - Toplam process sayisi

### B) DevTools Performance Monitor

- DevTools -> More tools -> Performance monitor
- Not edin:
  - CPU usage
  - JS heap size
  - DOM nodes
  - Event listeners

### C) Windows Task Manager

- Gorev Yoneticisi'nde `TaskMaster Pro` alt processlerini acin.
- Not edin:
  - Toplam bellek
  - Toplam CPU
  - GPU usage
  - Disk usage

### D) Cache Klasoru Boyutu

- `%APPDATA%/<uygulama>/` altinda `Cache` ve `GPUCache` klasor boyutlarini kaydedin.

## 2) Olcum Profili (After)

Ayni adimlari kod degisikliklerinden sonra tekrar edin.

## 3) Before/After Tablosu

| Metric | Before | After | Delta |
| --- | --- | --- | --- |
| Main process CPU (%) | TBD | TBD | TBD |
| Browser renderer CPU (%) | TBD | TBD | TBD |
| Total RAM (MB) | TBD | TBD | TBD |
| Browser tab count | TBD | TBD | TBD |
| GPU usage (%) | TBD | TBD | TBD |
| Disk usage (MB/s) | TBD | TBD | TBD |
| Cache folder size (MB) | TBD | TBD | TBD |

Not: Bu tabloda degerler manuel olcumle doldurulur.
