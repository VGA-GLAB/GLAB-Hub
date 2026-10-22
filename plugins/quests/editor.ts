import { el } from '../panel-kit.ts';
import type { QuestInput } from './model.ts';

export function questEditor(initial: QuestInput, projects: Array<{id:string;name:string}>, save: (value: QuestInput) => Promise<void>): HTMLFormElement {
  const form=el('form','gl-col');
  const field=(caption:string, multiline:boolean, value:string, limit:number): HTMLInputElement | HTMLTextAreaElement => {
    const label=el('label','gl-col',caption);
    const control=multiline ? el('textarea','gl-textarea') : el('input','gl-input');
    control.value=value; control.maxLength=limit; control.style.width='100%';
    label.style.width='100%';label.append(control);form.append(label);return control;
  };
  const title=field('募集タイトル',false,initial.title,120);title.required=true;
  const description=field('依頼内容・期間・条件（報酬やクレジットを含む）',true,initial.description,5000);
  const contact=field('公開する連絡先（Discord名・メール・URLなど）',false,initial.contact,500);
  const category=el('select','gl-select');
  for(const [value,label] of [['team','チーム募集'],['urgent','急募・ピンポイント'],['personal','個人制作']] as const) {
    const option=el('option',undefined,label);option.value=value;category.append(option);
  }
  category.value=initial.category;
  const categoryLabel=el('label','gl-col','募集の種類');categoryLabel.append(category);form.append(categoryLabel);
  const project=el('select','gl-select');
  const none=el('option',undefined,'プロジェクトに紐づけない');none.value='';project.append(none);
  for(const row of projects){const option=el('option',undefined,row.name);option.value=row.id;project.append(option);}
  project.value=initial.projectId ?? '';
  const projectLabel=el('label','gl-col','既存プロジェクト（任意）');projectLabel.append(project);form.append(projectLabel);
  form.append(el('p','gl-muted','承認後は依頼内容と連絡先が未登録者にも公開されます。個人情報の掲載範囲を確認してください。公開済みの掲示を保存すると公開を停止し、再承認が必要です。'));
  const button=el('button','gl-btn','下書きを保存');button.type='submit';
  const message=el('p','gl-notice');message.setAttribute('role','status');form.append(button,message);
  form.addEventListener('submit',event=>{
    event.preventDefault();button.disabled=true;
    void save({title:title.value,description:description.value,contact:contact.value,category:category.value as QuestInput['category'],projectId:project.value || null})
      .catch(error=>{message.textContent=error instanceof Error ? error.message : '保存できませんでした。';})
      .finally(()=>{button.disabled=false;});
  });
  return form;
}
