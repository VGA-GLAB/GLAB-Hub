import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb } from '../corpus/server/db.ts';
import { Hono } from '../corpus/server/hub/sdk.ts';
import { ensureSchema } from '../plugins/data.ts';
import { createQuest, editQuest, changeOwnQuest, decideQuest, listPublicQuests, getQuest } from '../plugins/quests/store.ts';
import { createQuestRoutes } from '../plugins/quests/routes.ts';
import { recordRegistration, decideAdmission } from '../plugins/access/store.ts';
import { renderQuestBoard } from '../plugins/quests/public-page.ts';

const input={title:'Motion',description:'Need a walk animation',contact:'Contact requester',category:'urgent' as const,projectId:null};
test('only approved revisions are public; edit and withdrawal hide contact immediately',()=>{
  const db=openDb(':memory:');
  try{
    ensureSchema(db);createQuest(db,'q','owner',input,1);
    assert.deepEqual(listPublicQuests(db),[]);
    assert.equal(changeOwnQuest(db,'q','stranger',0,'submit',2),false);
    assert.equal(changeOwnQuest(db,'q','owner',0,'submit',2),true);
    assert.deepEqual(listPublicQuests(db),[]);
    assert.equal(decideQuest(db,'q',0,'teacher','instructor',true,3),false);
    assert.equal(decideQuest(db,'q',1,'teacher','instructor',true,3),true);
    assert.equal(listPublicQuests(db).length,1);
    assert.equal('owner_id' in listPublicQuests(db)[0],false);
    assert.equal(editQuest(db,'q','owner',2,{...input,contact:'new contact'},4),true);
    assert.deepEqual(listPublicQuests(db),[]);
    assert.equal(decideQuest(db,'q',2,'teacher','instructor',true,5),false);
    assert.equal(changeOwnQuest(db,'q','owner',3,'submit',6),true);
    assert.equal(decideQuest(db,'q',4,'teacher','instructor',true,7),true);
    assert.equal(changeOwnQuest(db,'q','owner',5,'withdraw',8),true);
    assert.deepEqual(listPublicQuests(db),[]);
    assert.equal(getQuest(db,'q')?.status,'withdrawn');
    assert.equal(changeOwnQuest(db,'q','owner',6,'submit',9),false);
  }finally{db.close();}
});

test('approval requires a current lead or instructor role, including for admins',async()=>{
  const db=openDb(':memory:');
  try{
    ensureSchema(db);createQuest(db,'q','owner',input,1);changeOwnQuest(db,'q','owner',0,'submit',2);
    let admin=true;
    const app=new Hono();
    app.use('*',async(c,next)=>{c.set('auth',{userId:'reviewer',externalId:'reviewer',role:admin?'admin':'general',projectKey:null,isAdmin:admin,displayName:null});await next();});
    app.route('/',createQuestRoutes(db));
    const request=()=>app.request('/q/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:1,approve:true})});
    assert.equal((await request()).status,403);
    recordRegistration(db,'reviewer',1);decideAdmission(db,'reviewer','approved',0,'admin',2);admin=false;
    db.prepare("INSERT INTO glab_member_role(user_id,role,created_at) VALUES(?,?,?)").run('reviewer','instructor',3);
    assert.equal((await request()).status,200);
    db.prepare('DELETE FROM glab_member_role WHERE user_id=?').run('reviewer');
    assert.equal((await app.request('/pending')).status,403);
    assert.equal((await app.request('/q/withdraw',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"revision":2}'})).status,409);
  }finally{db.close();}
});

test('public poster escapes user content without scripts or private identity',()=>{
  const html=renderQuestBoard([{id:'q',title:'<script>alert(1)</script>',description:'<img src=x onerror=alert(1)>',contact:'<a href="javascript:evil">contact</a>',category:'team',approved_role:'lead',approved_at:100}]);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('運営承認'));
});
