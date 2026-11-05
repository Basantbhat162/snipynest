const names={'capture-full-page':'Visible-area PNG','capture-long-page':'Full-page PNG','capture-full-page-pdf':'Full-page PDF + PNG'};
async function shortcuts(){
  const commands=await chrome.commands.getAll();const list=document.getElementById('commandList');list.replaceChildren();
  for(const [name,title]of Object.entries(names)){
    const row=document.createElement('div'),term=document.createElement('dt'),value=document.createElement('dd');
    term.textContent=title;value.textContent=commands.find(command=>command.name===name)?.shortcut||'Not assigned';row.append(term,value);list.append(row);
  }
}
const status=document.getElementById('desktopStatus');
async function connection(){try{const result=await chrome.runtime.sendMessage({action:'desktop-control-status'});status.textContent=result.message;document.getElementById('disconnectDesktop').disabled=!result.enabled;}catch{status.textContent='Reload Companion, then try again.';}}
document.getElementById('editShortcuts').addEventListener('click',()=>void chrome.tabs.create({url:'chrome://extensions/shortcuts'}));
document.getElementById('refreshShortcuts').addEventListener('click',()=>void shortcuts().catch(error=>status.textContent=error.message));
document.getElementById('connectDesktop').addEventListener('click',async()=>{
  try{
    const granted=await chrome.permissions.request({permissions:['nativeMessaging'],origins:['<all_urls>']});
    if(!granted){status.textContent='Access was not granted. Standard captures and shortcuts remain available.';return;}
    await chrome.runtime.sendMessage({action:'desktop-control-set',enabled:true});await connection();
  }catch(error){status.textContent=error.message||String(error);}
});
document.getElementById('disconnectDesktop').addEventListener('click',async()=>{
  try{await chrome.runtime.sendMessage({action:'desktop-control-set',enabled:false});await chrome.permissions.remove({permissions:['nativeMessaging'],origins:['<all_urls>']});await connection();}catch(error){status.textContent=error.message||String(error);}
});
window.addEventListener('focus',()=>{void shortcuts();void connection();});
void shortcuts();void connection();const timer=setInterval(()=>void connection(),2000);window.addEventListener('pagehide',()=>clearInterval(timer));
