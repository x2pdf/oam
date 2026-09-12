//! Native WebView PDF export for Tauri desktop (Windows + macOS).
//!
//! Renders export HTML in a hidden webview and uses the platform print engine
//! to produce a vector PDF — the same class of pipeline as mobile expo-print.

#[cfg(any(target_os = "windows", target_os = "macos"))]
use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(any(target_os = "windows", target_os = "macos"))]
static EXPORT_SEQ: AtomicU64 = AtomicU64::new(0);

/// A4 width at 96dpi (matches buildExportHtml layout).
#[cfg(any(target_os = "windows", target_os = "macos"))]
const A4_WIDTH_PX: f64 = 794.0;
#[cfg(any(target_os = "windows", target_os = "macos"))]
const A4_HEIGHT_PX: f64 = 1123.0;

#[cfg(any(target_os = "windows", target_os = "macos"))]
#[tauri::command]
pub async fn export_pdf(app: tauri::AppHandle, html: String) -> Result<Vec<u8>, String> {
    use std::sync::{mpsc, Mutex};
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    let seq = EXPORT_SEQ.fetch_add(1, Ordering::Relaxed);

    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut staged: Option<std::path::PathBuf> = None;
    let mut stage_err: Option<std::io::Error> = None;
    for attempt in 0u8..3 {
        let mut candidate = std::env::temp_dir();
        candidate.push(format!(
            "oam-export-{}-{}-{}-{attempt:x}.html",
            std::process::id(),
            seq,
            nanos,
        ));
        match std::fs::File::options()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(mut file) => {
                use std::io::Write as _;
                match file.write_all(html.as_bytes()) {
                    Ok(()) => {
                        staged = Some(candidate);
                        break;
                    }
                    Err(e) => {
                        let _ = std::fs::remove_file(&candidate);
                        stage_err = Some(e);
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                stage_err = Some(e);
            }
            Err(e) => {
                stage_err = Some(e);
                break;
            }
        }
    }
    let temp_html = staged.ok_or_else(|| {
        format!(
            "Failed to stage export HTML: {}",
            stage_err
                .map(|e| e.to_string())
                .unwrap_or_else(|| "no writable name found".to_string())
        )
    })?;

    let mut temp_pdf = std::env::temp_dir();
    temp_pdf.push(format!("oam-export-{}-{}.pdf", std::process::id(), seq));

    let url = tauri::Url::from_file_path(&temp_html)
        .map_err(|_| "Failed to build a URL for the export file".to_string())?;

    let (load_tx, load_rx) = mpsc::channel::<()>();
    let load_tx = Mutex::new(Some(load_tx));

    let label = format!("pdf-export-{seq}");
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
        .visible(false)
        .skip_taskbar(true)
        .title("")
        .inner_size(A4_WIDTH_PX, A4_HEIGHT_PX)
        .on_page_load(move |_w, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                if let Ok(mut guard) = load_tx.lock() {
                    if let Some(tx) = guard.take() {
                        let _ = tx.send(());
                    }
                }
            }
        })
        .build()
        .map_err(|e| format!("Failed to create the export view: {e}"))?;

    if load_rx
        .recv_timeout(std::time::Duration::from_secs(30))
        .is_err()
    {
        cleanup(&window, &temp_html, &temp_pdf);
        return Err("Timed out rendering the document for PDF export".into());
    }

    std::thread::sleep(std::time::Duration::from_millis(250));

    let pdf_path = temp_pdf.to_string_lossy().into_owned();
    let (done_tx, done_rx) = mpsc::channel::<Result<(), String>>();
    if let Err(e) = window.with_webview(move |platform| {
        let result = unsafe { print_to_pdf(platform, &pdf_path) };
        let _ = done_tx.send(result);
    }) {
        cleanup(&window, &temp_html, &temp_pdf);
        return Err(format!("Failed to access the export view: {e}"));
    }

    let outcome = done_rx
        .recv_timeout(std::time::Duration::from_secs(120))
        .unwrap_or_else(|_| Err("Timed out writing the PDF".into()));

    #[cfg(target_os = "macos")]
    let outcome = outcome.and_then(|()| wait_for_written_file(&temp_pdf));

    outcome?;

    let bytes = std::fs::read(&temp_pdf).map_err(|e| format!("Failed to read PDF: {e}"))?;
    cleanup(&window, &temp_html, &temp_pdf);
    if bytes.len() < 500 {
        return Err("Generated PDF is empty".into());
    }
    Ok(bytes)
}

#[cfg(target_os = "macos")]
fn wait_for_written_file(path: &std::path::Path) -> Result<(), String> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(60);
    let mut last_len: Option<u64> = None;
    while std::time::Instant::now() < deadline {
        std::thread::sleep(std::time::Duration::from_millis(200));
        let len = match std::fs::metadata(path) {
            Ok(meta) if meta.len() > 0 => meta.len(),
            _ => continue,
        };
        if last_len == Some(len) {
            return Ok(());
        }
        last_len = Some(len);
    }
    Err("Timed out writing the PDF".into())
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn cleanup(window: &tauri::WebviewWindow, temp_html: &std::path::Path, temp_pdf: &std::path::Path) {
    let _ = window.close();
    let _ = std::fs::remove_file(temp_html);
    let _ = std::fs::remove_file(temp_pdf);
}

#[cfg(target_os = "windows")]
unsafe fn print_to_pdf(
    platform: tauri::webview::PlatformWebview,
    path: &str,
) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2PrintSettings, ICoreWebView2_7};
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, HSTRING, PCWSTR};

    let webview = platform
        .controller()
        .CoreWebView2()
        .map_err(|e| format!("WebView2 unavailable: {e}"))?;
    let webview7: ICoreWebView2_7 = webview
        .cast()
        .map_err(|e| format!("This WebView2 runtime is too old to export PDF: {e}"))?;

    let path_h = HSTRING::from(path);

    PrintToPdfCompletedHandler::wait_for_async_operation(
        Box::new(move |handler| unsafe {
            webview7
                .PrintToPdf(
                    PCWSTR(path_h.as_ptr()),
                    None::<&ICoreWebView2PrintSettings>,
                    &handler,
                )
                .map_err(Into::into)
        }),
        Box::new(|result, is_success| {
            result?;
            if is_success {
                Ok(())
            } else {
                Err(windows::core::Error::new(
                    windows::core::HRESULT(-1),
                    "WebView2 reported the PDF export failed",
                ))
            }
        }),
    )
    .map_err(|e| format!("PDF export failed: {e}"))
}

#[cfg(target_os = "macos")]
unsafe fn print_to_pdf(
    platform: tauri::webview::PlatformWebview,
    path: &str,
) -> Result<(), String> {
    use objc2::runtime::{AnyObject, ProtocolObject};
    use objc2_app_kit::{
        NSPrintInfo, NSPrintJobSavingURL, NSPrintSaveJob, NSPrintingPaginationMode, NSWindow,
    };
    use objc2_foundation::{NSObjectProtocol, NSString, NSURL};
    use objc2_web_kit::WKWebView;

    let webview = (platform.inner() as *mut WKWebView)
        .as_ref()
        .ok_or("WKWebView unavailable")?;
    let ns_window = (platform.ns_window() as *mut NSWindow)
        .as_ref()
        .ok_or("Export window unavailable")?;

    if !webview.respondsToSelector(objc2::sel!(printOperationWithPrintInfo:)) {
        return Err("PDF export requires macOS 11 or later".into());
    }

    let print_info = NSPrintInfo::new();
    print_info.setJobDisposition(NSPrintSaveJob);
    let url = NSURL::fileURLWithPath(&NSString::from_str(path));
    let url_obj: &AnyObject = &url;
    print_info
        .dictionary()
        .setObject_forKey(url_obj, ProtocolObject::from_ref(NSPrintJobSavingURL));

    // Mirror buildExportHtml `@page { margin: 20mm; }`.
    const MM_TO_PT: f64 = 72.0 / 25.4;
    let margin_pt = 20.0 * MM_TO_PT;
    print_info.setTopMargin(margin_pt);
    print_info.setBottomMargin(margin_pt);
    print_info.setLeftMargin(margin_pt);
    print_info.setRightMargin(margin_pt);
    print_info.setHorizontalPagination(NSPrintingPaginationMode::Fit);
    print_info.setVerticalPagination(NSPrintingPaginationMode::Automatic);

    let op = webview.printOperationWithPrintInfo(&print_info);
    op.setShowsPrintPanel(false);
    op.setShowsProgressPanel(false);
    if let Some(view) = op.view() {
        view.setFrame(webview.frame());
    }

    op.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
        ns_window,
        None,
        None,
        std::ptr::null_mut(),
    );

    Ok(())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
#[tauri::command]
pub async fn export_pdf(_app: tauri::AppHandle, _html: String) -> Result<Vec<u8>, String> {
    Err("Direct PDF export is only available on Windows and macOS".into())
}
