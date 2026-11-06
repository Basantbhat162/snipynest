import type {Clip} from "../types/clip.ts";
export type QuickKind = "all" | "image" | "text" | "code" | "link";
export type QuickQuery = {search:string; kind:QuickKind; pinned:boolean; offset:number};
export type QuickSnapshot = {clips:Clip[]; loading:boolean; error:string|null; query:QuickQuery; hasMore:boolean};
const initialQuery: QuickQuery = {search:"",kind:"all",pinned:false,offset:0};
/** One active query and one latest queued query; stale searches can never become pasteable. */
export class QuickClipboardController {
  private listeners = new Set<()=>void>();
  private revision = 0;
  private running = false;
  private pending: {query:QuickQuery; revision:number; append:boolean}|null = null;
  private cache:Clip[] = [];
  private state:QuickSnapshot = {clips:[],loading:false,error:null,query:initialQuery,hasMore:false};
  private query:(query:QuickQuery)=>Promise<Clip[]>;
  constructor(query:(query:QuickQuery)=>Promise<Clip[]>) {this.query=query;}
  getSnapshot=()=>this.state;
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
  private publish(next:QuickSnapshot){this.state=next;this.listeners.forEach(fn=>fn());}
  open(){
    this.publish({clips:this.cache,query:{...initialQuery},loading:false,error:null,hasMore:this.cache.length===40});
    this.load(initialQuery,false,this.cache.length>0);
  }
  close(){this.revision++;this.pending=null;}
  updatePin(id:string,pinned:boolean){
    const update=(clip:Clip)=>clip.id===id?{...clip,is_pinned:pinned}:clip;
    this.cache=this.cache.map(update);
    this.publish({...this.state,clips:this.state.clips.map(update)});
  }
  load(query:QuickQuery,append=false,keepCached=false){
    const revision=++this.revision;
    this.pending={query:{...query},revision,append};
    this.publish({...this.state,query:{...query},clips:append||keepCached?this.state.clips:[],loading:!keepCached,error:null});
    void this.drain();
  }
  private async drain(){
    if(this.running)return;
    this.running=true;
    try{
      while(this.pending){
        const request=this.pending;this.pending=null;
        try{
          const page=await this.query(request.query);
          if(request.revision!==this.revision)continue;
          const clips=request.append?[...this.state.clips,...page.filter(c=>!this.state.clips.some(old=>old.id===c.id))]:page;
          if(request.query.kind==="all"&&!request.query.pinned&&!request.query.search&&request.query.offset===0)this.cache=page;
          this.publish({clips,query:request.query,loading:false,error:null,hasMore:page.length===40&&clips.length<200});
        }catch(error){
          if(request.revision===this.revision)this.publish({...this.state,clips:[],loading:false,error:String(error),hasMore:false});
        }
      }
    }finally{this.running=false;}
  }
}
