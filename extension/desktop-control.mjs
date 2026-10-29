// Optional native control; no page content or pixels enter this channel.
export function createDesktopControl(api, capture, busy, clock=globalThis) {
  let port, timer, enabled=false, status={connected:false,message:'Desktop keys are off.'};
  const access={permissions:['nativeMessaging'],origins:['<all_urls>']};
  function stop(){clock.clearTimeout(timer);const previous=port;port=null;previous?.disconnect();}
  async function context(){
    const window=await api.windows.getLastFocused();
    const [tab]=await api.tabs.query({active:true,windowId:window.id});
    return {focused:window.focused===true,tab,ready:!busy() && /^(https?:|file:)/i.test(tab?.url||'') && await api.permissions.contains(access)};
  }
  async function poll(){
    if(!port||!enabled)return;
    try{const state=await context();port?.postMessage({action:'poll',focused:state.focused,ready:state.ready,tabId:state.tab?.id});}
    catch{timer=clock.setTimeout(poll,1000);}
  }
  async function connect(){
    if(!enabled||port)return;
    if(!await api.permissions.contains(access)){status={connected:false,message:'Enable desktop-key permissions in Settings.'};return;}
    try{
      const current=api.runtime.connectNative('com.snipynest.companion');port=current;
      current.onMessage.addListener(async message=>{
        if(port!==current)return;
        status={connected:message.connected===true,message:message.connected?'Desktop connected.':'Start SnipyNest desktop to use your keys.'};
        if(['visible','full','pdf'].includes(message.capture)) {
          try{const state=await context();if(state.focused&&state.ready&&state.tab?.id===message.tabId)await capture(state.tab,message.capture==='visible'?'visible':'full',false,message.capture==='pdf'?'pdf':'png',false);}
          catch{status={connected:false,message:'The browser tab changed. Try the key again.'};}
        }
        timer=clock.setTimeout(poll,400);
      });
      current.onDisconnect.addListener(()=>{
        if(port!==current)return;
        clock.clearTimeout(timer);port=null;
        status={connected:false,message:api.runtime.lastError?.message||'Browser helper disconnected. Set it up in desktop Settings.'};
        if(enabled)timer=clock.setTimeout(()=>void connect(),10000);
      });
      await poll();
    }catch(error){status={connected:false,message:error.message||String(error)};}
  }
  api.permissions?.onRemoved?.addListener(()=>{void api.permissions.contains(access).then(granted=>{if(!granted){enabled=false;stop();status={connected:false,message:'Desktop-key access was removed. Enable it again in Settings.'};void api.storage.local.set({desktopKeys:false});}});});
  return {
    status:()=>({...status,enabled}),
    async setEnabled(value){enabled=value===true;stop();await api.storage.local.set({desktopKeys:enabled});if(enabled)await connect();else status={connected:false,message:'Desktop keys are off.'};return this.status();},
    async restore(){enabled=(await api.storage.local.get('desktopKeys'))?.desktopKeys===true;if(enabled)await connect();},
  };
}
