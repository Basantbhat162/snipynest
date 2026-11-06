//! Transient main-WebView presentation and one-shot destination session.
use parking_lot::Mutex;
use tauri::{Emitter, Manager};
use std::sync::atomic::Ordering;
use crate::{AppState, paste::Destination};
#[derive(Clone, serde::Serialize)]
pub struct QuickSession { pub id:String, pub can_paste:bool, pub message:Option<String> }
struct Session {
    public:QuickSession, destination:Option<Destination>, claimed:bool,
    presented:bool,
    active:std::sync::Arc<std::sync::atomic::AtomicBool>,
    position:tauri::PhysicalPosition<i32>, size:tauri::PhysicalSize<u32>,
}
#[derive(Default)]
pub struct State(Mutex<Option<Session>>);
fn require_main(window:&tauri::WebviewWindow)->Result<(),String> {
    if window.label()=="main" {Ok(())} else {Err("This action belongs to Quick Clipboard".into())}
}
pub fn active(app:&tauri::AppHandle)->bool { app.state::<State>().0.lock().is_some() }
pub fn presented(app:&tauri::AppHandle)->bool { app.state::<State>().0.lock().as_ref().is_some_and(|s|s.presented) }
pub fn toggle(app:&tauri::AppHandle)->Result<(),String> {
    if active(app) { return dismiss(app,None); }
    open(app,None)
}
pub fn from_tray(app:&tauri::AppHandle)->Result<(),String>{
    if active(app){return dismiss(app,None);}
    // Opening the tray changes foreground ownership; do not guess its former destination.
    open(app,Some("Choose a Clip to copy. Use the Quick Clipboard shortcut to paste directly into an app.".into()))
}
fn open(app:&tauri::AppHandle,message:Option<String>)->Result<(),String> {
    let state=app.state::<AppState>();
    if crate::screen_capture::in_progress() || state.interaction_active.load(Ordering::Relaxed) || state.native_drag_active.load(Ordering::Relaxed) || state.window_move_active.load(Ordering::Relaxed) || state.editor_expanded.load(Ordering::Relaxed) {
        return Err("Finish the current edit or drag before opening Quick Clipboard".into());
    }
    let window=app.get_webview_window("main").ok_or("Clipboard window is unavailable")?;
    let destination=if message.is_some(){None}else{Destination::current()};
    let session=Session {public:QuickSession{id:uuid::Uuid::new_v4().to_string(),can_paste:destination.is_some(),message},destination,claimed:false,presented:false,active:std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true)),position:window.outer_position().map_err(|e|e.to_string())?,size:window.inner_size().map_err(|e|e.to_string())?};
    crate::window::motion::disable_transitions(&window)?;
    crate::commands::hide_history_window(&window)?;
    let result=(||{
        window.set_min_size(Some(tauri::PhysicalSize::new(1,1))).map_err(|e|e.to_string())?;
        let area=crate::window::active_monitor_work_area();
        let mut pointer=windows_sys::Win32::Foundation::POINT{x:area.x,y:area.y};
        unsafe {windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut pointer);}
        let (x,y,width,height)=placement(area,(pointer.x,pointer.y));
        window.set_position(tauri::PhysicalPosition::new(x,y)).map_err(|e|e.to_string())?;
        window.set_size(tauri::PhysicalSize::new(width,height)).map_err(|e|e.to_string())?;
        window.set_resizable(false).map_err(|e|e.to_string())?;
        crate::window::hide_pad_native(app)?;
        Ok::<_,String>(())
    })();
    if let Err(error)=result { let _=restore(&window,&session);return Err(error); }
    let public=session.public.clone();
    *app.state::<State>().0.lock()=Some(session);
    if let Err(error)=window.emit("quick-clipboard-changed",Some(&public)) { let _=dismiss(app,None);return Err(error.to_string()); }
    Ok(())
}
pub fn placement(area:crate::window::MonitorBounds,pointer:(i32,i32))->(i32,i32,u32,u32){
    let width=(360.*area.scale_factor).round().max(1.).min(area.width as f64) as i32;
    let height=(480.*area.scale_factor).round().max(1.).min(area.height as f64) as i32;
    let margin=(12.*area.scale_factor).round() as i32;
    ((pointer.0+margin).clamp(area.x,(area.x+area.width-width).max(area.x)),
     (pointer.1+margin).clamp(area.y,(area.y+area.height-height).max(area.y)),width as u32,height as u32)
}
fn restore(window:&tauri::WebviewWindow,session:&Session)->Result<(),String>{
    window.set_min_size(Some(tauri::LogicalSize::new(320.,480.))).map_err(|e|e.to_string())?;
    window.set_resizable(true).map_err(|e|e.to_string())?;
    window.set_position(session.position).map_err(|e|e.to_string())?;
    window.set_size(session.size).map_err(|e|e.to_string())
}
pub fn dismiss(app:&tauri::AppHandle,id:Option<&str>)->Result<(),String>{
    let session={
        let state=app.state::<State>();let mut current=state.0.lock();
        if id.is_some_and(|id|current.as_ref().is_none_or(|s|s.public.id!=id)){return Ok(());}
        current.take()
    };
    if let Some(session)=session {
        session.active.store(false,Ordering::SeqCst);
        let window=app.get_webview_window("main").ok_or("Clipboard window is unavailable")?;
        let hidden=crate::commands::hide_history_window(&window);
        let restored=restore(&window,&session);
        let _=window.emit("quick-clipboard-changed",Option::<QuickSession>::None);
        hidden?;restored?;
    }
    Ok(())
}
#[tauri::command]
pub fn get_quick_session(window:tauri::WebviewWindow,state:tauri::State<'_,State>)->Result<Option<QuickSession>,String>{
    require_main(&window)?;Ok(state.0.lock().as_ref().map(|s|s.public.clone()))
}
#[tauri::command]
pub fn show_quick_clipboard(window:tauri::WebviewWindow,state:tauri::State<'_,State>,id:String)->Result<(),String>{
    require_main(&window)?;
    {
        let mut current=state.0.lock();
        let session=current.as_mut().filter(|s|s.public.id==id).ok_or("Quick Clipboard has closed")?;
        session.presented=true;
    }
    window.show().map_err(|e|e.to_string())?;window.set_focus().map_err(|e|e.to_string())
}
#[tauri::command]
pub fn dismiss_quick_clipboard(app:tauri::AppHandle,window:tauri::WebviewWindow,id:String)->Result<(),String>{
    require_main(&window)?;dismiss(&app,Some(&id))
}
#[tauri::command]
pub fn open_quick_workspace(app:tauri::AppHandle,window:tauri::WebviewWindow,id:String,clip_id:Option<String>)->Result<(),String>{
    require_main(&window)?;
    if !app.state::<State>().0.lock().as_ref().is_some_and(|s|s.public.id==id){return Err("Quick Clipboard has closed".into());}
    dismiss(&app,Some(&id))?;
    crate::commands::reposition_sidebar_to_active_display(&window);
    window.show().map_err(|e|e.to_string())?;window.set_focus().map_err(|e|e.to_string())?;
    if let Some(id)=clip_id {let _=window.emit("reveal-clip",id);}
    Ok(())
}
#[tauri::command]
pub async fn get_quick_clips(app:tauri::AppHandle,search:String,kind:Option<String>,pinned:bool,offset:usize)->Result<Vec<crate::storage::Clip>,String>{
    let db=app.state::<AppState>().db.clone();
    tauri::async_runtime::spawn_blocking(move||db.quick_clips(&search,kind.as_deref(),pinned,offset).map_err(|e|e.to_string())).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn get_quick_preview(app:tauri::AppHandle,id:String)->Result<Option<String>,String>{
    let db=app.state::<AppState>().db.clone();
    tauri::async_runtime::spawn_blocking(move||db.quick_preview(&id).map_err(|e|e.to_string())).await.map_err(|e|e.to_string())?
}
#[derive(serde::Serialize)]
pub struct PasteResult { pub pasted:bool, pub message:Option<String> }
#[tauri::command]
pub async fn paste_quick_clip(app:tauri::AppHandle,window:tauri::WebviewWindow,id:String,clip_id:String,copy_only:bool)->Result<PasteResult,String>{
    require_main(&window)?;
    {
        let state=app.state::<State>();let mut current=state.0.lock();
        let session=current.as_mut().filter(|s|s.public.id==id && !s.claimed).ok_or("This selection has already finished")?;
        session.claimed=true;
    }
    let request_id=id.clone();
    let popup_hwnd=window.hwnd().map_err(|e|e.to_string())?.0 as usize;
    let handle=app.clone();
    let result=tauri::async_runtime::spawn_blocking(move||{
        let state=handle.state::<AppState>();
        let current=handle.state::<State>();
        let (destination,active)={
            let session=current.0.lock();
            let session=session.as_ref().filter(|s|s.public.id==id).ok_or("Quick Clipboard has closed")?;
            (session.destination,session.active.clone())
        };
        // Decode/file I/O and bounded clipboard retries never hold the native UI session lock.
        let allowed=||active.load(Ordering::SeqCst) && unsafe {windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow() as usize==popup_hwnd};
        if !crate::commands::copy_stored_clip_if(&state.db,&state.stager,&clip_id,allowed)? {return Err("The Clip could not be copied, or Quick Clipboard lost focus. Try again.".into());}
        let sequence=crate::clipboard::win32::last_write_sequence();
        if copy_only {return Ok((id,destination,sequence,false));}
        let deadline=std::time::Instant::now()+std::time::Duration::from_millis(1200);
        while !crate::paste::keys_released() && std::time::Instant::now()<deadline {
            if !current.0.lock().as_ref().is_some_and(|s|s.public.id==id){return Err("Automatic paste cancelled because Quick Clipboard closed".into());}
            std::thread::sleep(std::time::Duration::from_millis(8));
        }
        Ok::<_,String>((id,destination,sequence,crate::paste::keys_released()))
    }).await.map_err(|e|e.to_string())?;
    let (id,destination,sequence,released)=match result{
        Ok(value)=>value,
        Err(error)=>{if let Some(s)=app.state::<State>().0.lock().as_mut(){if s.public.id==request_id{s.claimed=false;}}return Err(error);}
    };
    if copy_only {
        if let Some(s)=app.state::<State>().0.lock().as_mut(){if s.public.id==id{s.claimed=false;}}
        return Ok(PasteResult{pasted:false,message:Some("Copied. Paste with Ctrl+V.".into())});
    }
    let (sent,received)=std::sync::mpsc::channel();
    let handle=app.clone();
    app.run_on_main_thread(move||{
        let result=(||{
            if !handle.state::<State>().0.lock().as_ref().is_some_and(|s|s.public.id==id){return Err("Automatic paste cancelled because Quick Clipboard closed".to_string());}
            if !released || destination.is_none(){
                if let Some(s)=handle.state::<State>().0.lock().as_mut(){s.claimed=false;}
                return Ok(PasteResult{pasted:false,message:Some("Copied. Release the shortcut keys and paste with Ctrl+V.".into())});
            }
            let destination=destination.unwrap();
            dismiss(&handle,Some(&id))?;
            if destination.exists(){unsafe {windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow(destination.hwnd as _);}}
            let result=crate::paste::dispatch_once(&mut crate::paste::WindowsAdapter(destination),sequence);
            match result{
                Ok(())=>Ok(PasteResult{pasted:true,message:None}),
                Err(message)=>{
                    let _=handle.emit("quick-paste-fallback",message);
                    // Show a small copy-only session so failure feedback is visible, never silently lost.
                    open(&handle,Some(message.into()))?;
                    Ok(PasteResult{pasted:false,message:Some(message.into())})
                }
            }
        })();let _=sent.send(result);
    }).map_err(|e|e.to_string())?;
    tauri::async_runtime::spawn_blocking(move||received.recv_timeout(std::time::Duration::from_secs(3)).map_err(|_|"Quick Clipboard could not finish closing".to_string())?).await.map_err(|e|e.to_string())?
}
#[cfg(test)]
mod tests{
    #[test]fn compact_bounds_fit_negative_mixed_dpi_work_areas(){
        for scale in [1.,1.25,1.5,2.]{
            let area=crate::window::MonitorBounds{x:-700,y:-500,width:700,height:400,scale_factor:scale};
            let (x,y,w,h)=super::placement(area,(-1,-101));
            assert!(x>=area.x&&y>=area.y&&x+w as i32<=0&&y+h as i32<=-100);
        }
    }
}
