use std::path::{Path, PathBuf};
use tauri::ipc::Response;

const EXTENSIONS: [&str; 4] = ["xlsx", "xlsm", "xls", "csv"];

fn is_spreadsheet(p: &Path) -> bool {
    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
    // Excel açıkken oluşan "~$dosya.xlsx" kilit dosyalarını atla
    if name.starts_with("~$") {
        return false;
    }
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn collect(dir: &Path, out: &mut Vec<PathBuf>, depth: u8) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let mut items: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
    items.sort();
    for p in items {
        if p.is_dir() {
            if depth > 0 {
                collect(&p, out, depth - 1);
            }
        } else if is_spreadsheet(&p) {
            out.push(p);
        }
    }
}

/// Seçilen/bırakılan yolları dosya listesine çevirir; klasörlerin içindeki
/// Excel/CSV dosyalarını (2 alt klasör derinliğe kadar) toplar.
#[tauri::command]
fn expand_paths(paths: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    for p in paths {
        let path = PathBuf::from(&p);
        if path.is_dir() {
            collect(&path, &mut out, 2);
        } else if is_spreadsheet(&path) {
            out.push(path);
        }
    }
    out.into_iter().map(|p| p.to_string_lossy().into_owned()).collect()
}

/// Dosyayı ham bayt olarak döndürür (JSON'a çevirmeden, hızlı).
#[tauri::command]
fn read_file(path: String) -> Result<Response, String> {
    std::fs::read(&path)
        .map(Response::new)
        .map_err(|e| format!("Dosya okunamadı ({path}): {e}"))
}

/// "%C3%BC" gibi yüzde kodlarını çözer (yol, başlıkta ASCII olarak gelir).
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Dosyayı yazar. Veri ham bayt gövdesi olarak, yol "path" başlığında gelir.
#[tauri::command]
fn write_file(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("Dosya verisi alınamadı.".into());
    };
    let path = request
        .headers()
        .get("path")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .ok_or("Dosya yolu alınamadı.")?;
    std::fs::write(&path, data).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            "Dosya yazılamadı. Excel'de açıksa kapatıp tekrar deneyin.".to_string()
        } else {
            format!("Dosya yazılamadı: {e}")
        }
    })
}

/// Dosyayı Windows'taki varsayılan programla açar.
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            expand_paths,
            read_file,
            write_file,
            open_path
        ])
        .run(tauri::generate_context!())
        .expect("uygulama başlatılamadı");
}
