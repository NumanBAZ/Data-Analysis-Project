# Rakip Analizi

Helium 10 Excel/CSV dosyalarıyla Amazon rakip analizi yapan Windows masaüstü uygulaması (Tauri + React).

## Geliştirme

```
pnpm install
pnpm tauri dev
```

## Yeni sürüm yayınlama

Değişiklikleri commit edin, sonra:

```
pnpm release
```

Sürüm numarası otomatik artar, imzalı kurulum dosyası GitHub Releases'a yüklenir.
Kurulu uygulamalar açılışta yeni sürümü görüp "Güncelle" butonu gösterir.

İmza anahtarı: `~/.tauri/rakip-analizi.key` (repoda değil; kaybolursa güncellemeler çalışmaz, yedekleyin).

## Lisans

Arayüz iskeleti MIT lisanslı [shadcn-admin](https://github.com/satnaing/shadcn-admin) üzerine kuruludur; lisans metni `LICENSE` dosyasındadır.
