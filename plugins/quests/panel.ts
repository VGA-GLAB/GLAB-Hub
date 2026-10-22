import { el, ensureStyles, type PanelContext } from '../panel-kit.ts';
import type { QuestInput, QuestRow } from './model.ts';
import { questEditor } from './editor.ts';

interface Mine { quests:QuestRow[];canApprove:boolean;templates:Array<QuestInput & {id:string;label:string}>;projects:Array<{id:string;name:string}>; }
const states={draft:'下書き',pending:'承認待ち',published:'公開中',withdrawn:'取り下げ済み'};

export async function mount(container:HTMLElement,ctx:PanelContext):Promise<void> {
  ensureStyles();
  const mutate=async(path:string,method:string,body:unknown):Promise<void>=>{
    const response=await ctx.api(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!response.ok){
      const result=await response.json().catch(()=>null) as {error?:string}|null;
      const messages:Record<string,string>={invalid_quest:'内容・期間・条件と連絡先を確認してください。Discordは数字のユーザーIDを入力します。',member_required:'GLabの利用承認後に作成できます。',project_membership_required:'選択したプロジェクトへの所属が必要です。',approver_required:'承認には運営または講師の権限が必要です。',quest_changed_reload:'掲示が更新されました。再読込してやり直してください。',quest_changed_or_incomplete:'掲示が更新されたか必須項目が未入力です。編集画面で確認してください。'};
      throw new Error(messages[result?.error ?? ''] ?? `保存できませんでした（HTTP ${response.status}）。入力内容を保持しています。`);
    }
    await refresh();
  };
  const action=(parent:HTMLElement,label:string,work:()=>Promise<void>):void=>{
    const button=el('button','gl-btn',label);button.type='button';parent.append(button);
    button.addEventListener('click',()=>{
      button.disabled=true;
      void work().catch(error=>{parent.append(el('p','gl-notice gl-notice-error',String(error)));}).finally(()=>{button.disabled=false;});
    });
  };
  const refresh=async():Promise<void>=>{
    container.replaceChildren(el('h2',undefined,'📜 クエストボード'));
    const toolbar=el('div','gl-row');container.append(toolbar);
    const board=el('iframe');board.title='公開中のクエスト一覧';board.src='/public/quests?embed=1';
    board.style.cssText='width:100%;height:70vh;min-height:400px;border:0;border-radius:12px;margin-top:16px';container.append(board);
    const response=await ctx.api('/mine');
    if(!response.ok){container.append(el('p','gl-notice','GLabの利用承認後に掲示を依頼できます。'));return;}
    const data=await response.json() as Mine;
    const publicLink=el('a','gl-btn','公開ボードを見る（登録不要）');publicLink.href='/public/quests';publicLink.target='_blank';publicLink.rel='noopener';container.append(publicLink);
    container.append(el('p','gl-muted','掲示には運営または講師の許可が必要です。参加希望者は公開された連絡先へ直接連絡します。'));
    const editorHost=el('div');
    const templates=el('div','gl-row');templates.style.display='none';
    const chooser=el('div','gl-row');chooser.style.display='none';
    toolbar.append(chooser);container.insertBefore(templates,board);container.insertBefore(editorHost,board);
    action(toolbar,'作成',async()=>{chooser.style.display=chooser.style.display==='none'?'flex':'none';templates.style.display='none';});
    const openEditor=(value:QuestInput,row?:QuestRow):void=>{
      templates.style.display='none';chooser.style.display='none';
      editorHost.replaceChildren(questEditor(value,data.projects,input=>mutate(row ? `/${row.id}` : '/',row?'PUT':'POST',row?{...input,revision:row.revision}:input)));
      action(editorHost,'一覧に戻る',async()=>{editorHost.replaceChildren();});
      editorHost.scrollIntoView({block:'nearest'});
    };
    action(chooser,'白紙から作る',async()=>{templates.style.display='none';openEditor({title:'',description:'',period:'',conditions:'',contactType:'text',contact:'',category:'team',projectId:null});});
    action(chooser,'テンプレートから作る',async()=>{editorHost.replaceChildren();templates.style.display='flex';});
    for(const template of data.templates) action(templates,template.label,async()=>openEditor(template));
    container.append(el('h3',undefined,'自分の掲示'));
    for(const quest of data.quests){
      const card=el('section','gl-section');card.append(el('h4',undefined,`${quest.title} — ${states[quest.status]}`));
      const actions=el('div','gl-row');card.append(actions);container.append(card);
      action(actions,quest.status==='withdrawn'?'編集して再掲申請':'編集',async()=>openEditor({title:quest.title,description:quest.description,period:quest.period,conditions:quest.conditions,contactType:quest.contact_type,contact:quest.contact,category:quest.category,projectId:quest.project_id},quest));
      if(quest.status==='draft') action(actions,'連絡先の公開に同意して承認申請',()=>mutate(`/${quest.id}/submit`,'POST',{revision:quest.revision}));
      if(quest.status!=='withdrawn') action(actions,'取り下げる',()=>mutate(`/${quest.id}/withdraw`,'POST',{revision:quest.revision}));
    }
    if(data.canApprove){
      container.append(el('h3',undefined,'張り出しの承認'));
      const pending=await ctx.api('/pending');
      if(!pending.ok){container.append(el('p','gl-notice','承認待ちを取得できませんでした。'));return;}
      for(const quest of (await pending.json() as {quests:QuestRow[]}).quests){
        const card=el('section','gl-section');card.append(el('h4',undefined,quest.title));
        const body=el('p',undefined,quest.description);body.style.whiteSpace='pre-wrap';card.append(body,el('p',undefined,`公開連絡先：${quest.contact}`));
        card.append(el('p',undefined,`期間・締切：${quest.period}`),el('p',undefined,`条件：${quest.conditions}`));
        action(card,'承認して掲示する',()=>mutate(`/${quest.id}/decision`,'POST',{revision:quest.revision,approve:true}));
        action(card,'下書きに戻す',()=>mutate(`/${quest.id}/decision`,'POST',{revision:quest.revision,approve:false}));container.append(card);
      }
    }
  };
  await refresh();
}
