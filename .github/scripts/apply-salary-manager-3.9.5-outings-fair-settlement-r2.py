from pathlib import Path
import re

INDEX = Path('public/index.html')
WORKER = Path('src/worker.js')
SW = Path('public/sw.js')
OLD = '3.9.5-balance-integrity-outings-r1'
NEW = '3.9.5-outings-fair-settlement-r2'

def read(p):
    return p.read_text(encoding='utf-8')

def write(p, t):
    p.write_text(t, encoding='utf-8')

def require(t, s, label):
    if s not in t:
        raise SystemExit('Missing anchor: ' + label)

index = read(INDEX)
require(index, OLD, 'r1 release id in index')
require(index, 'function outingLedger(outing)', 'outing ledger')
require(index, 'function renderOutings()', 'outing renderer')
require(index, 'class="outing-check-grid" id="outingPurchaseParticipants"', 'outing participant chooser')
index = index.replace(OLD, NEW)

css_anchor = '    .statement-list { display:grid; gap:18px; }'
require(index, css_anchor, 'statement css anchor')
css = r'''
    /* 3.9.5 r2 — جمعية الطلعات: وضوح أعلى + اختيار أشخاص مناسب للجوال */
    #outingsView .section-heading{align-items:center;padding:18px 18px 8px;border-radius:24px;background:linear-gradient(135deg,rgba(20,117,108,.08),rgba(212,168,79,.06));border:1px solid rgba(20,117,108,.10)}
    #outingsView .section-heading h2{margin-bottom:5px;font-size:clamp(22px,5vw,30px)}
    #outingsView .section-heading p{max-width:720px;line-height:1.85}
    .outing-note{margin:12px 0 16px;padding:13px 15px;border-radius:16px;font-size:10px;font-weight:750}
    .outing-list{display:grid;gap:14px}
    .outing-card{border:1px solid rgba(20,117,108,.14);border-radius:26px;background:linear-gradient(180deg,rgba(255,253,249,.98),rgba(248,250,247,.96));box-shadow:0 18px 45px rgba(21,49,46,.08);overflow:hidden}
    .outing-card[open]{box-shadow:0 22px 60px rgba(21,49,46,.12)}
    .outing-card>summary{padding:19px 20px;background:linear-gradient(135deg,rgba(223,242,237,.66),rgba(255,253,249,.82))}
    .outing-card-title strong{font-size:19px;letter-spacing:-.2px}.outing-card-title small{font-size:10px;line-height:1.6}
    .outing-total{padding:8px 11px;border-radius:14px;background:rgba(255,255,255,.72);border:1px solid rgba(20,117,108,.10)}
    .outing-body{padding:14px 18px 20px}
    .outing-quick-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:2px 0 14px}
    .outing-stat{padding:10px 9px;border-radius:15px;background:#f6f8f5;border:1px solid rgba(20,117,108,.09);text-align:center;min-width:0}
    .outing-stat small{display:block;color:var(--muted);font-size:8px;margin-bottom:4px}.outing-stat strong{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .outing-participants{gap:8px;margin:4px 0 12px}.outing-chip{font-size:11px;padding:8px 12px;background:#e4f4ef;color:#0c665e;border:1px solid rgba(20,117,108,.10)}
    .outing-actions{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr) auto;gap:8px;margin:12px 0 4px}.outing-actions button{min-height:44px}
    .outing-subtitle{margin:21px 0 9px;padding-top:3px}.outing-subtitle h4{font-size:15px}.outing-subtitle small{font-size:9px}
    .outing-purchase,.outing-transfer,.outing-payment{padding:14px 15px;border-radius:18px;box-shadow:0 8px 24px rgba(21,49,46,.035)}
    .outing-purchase{background:#fffdf9}.outing-purchase-main strong{font-size:14px}.outing-purchase-main small{font-size:10px;line-height:1.75}
    .outing-purchase-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.outing-mini-chip{display:inline-flex;align-items:center;gap:4px;padding:5px 8px;border-radius:999px;background:#f1f6f3;color:#49645f;border:1px solid rgba(20,117,108,.08);font-size:9px;font-weight:800}
    .outing-transfer{grid-template-columns:minmax(0,1fr) auto;background:linear-gradient(135deg,rgba(223,242,237,.72),rgba(244,250,247,.9));border-color:rgba(20,117,108,.22)}
    .outing-transfer-route{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-weight:900;font-size:15px}.outing-transfer-route .person{padding:6px 9px;border-radius:10px;background:rgba(255,255,255,.76);border:1px solid rgba(20,117,108,.12)}.outing-transfer-route .arrow{color:var(--teal);font-size:17px}
    .outing-transfer-amount{font-size:18px;color:var(--forest)}
    .outing-payment{opacity:.82}
    .outing-balance-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:8px;margin:10px 0 4px}
    .outing-balance-person{display:grid;gap:3px;padding:10px 11px;border-radius:15px;border:1px solid var(--line);background:#fff}.outing-balance-person span{font-weight:900;font-size:11px}.outing-balance-person small{font-size:9px;font-weight:800}.outing-balance-person.is-credit small{color:#167247}.outing-balance-person.is-debt small{color:#a35440}.outing-balance-person.is-even small{color:var(--muted)}
    .outing-calc-note{margin:9px 0 2px;padding:10px 12px;border-radius:13px;background:rgba(20,117,108,.055);color:#44625d;font-size:9px;line-height:1.7}

    .outing-check-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:9px}
    .outing-check{position:relative;display:block;padding:0!important;border:0!important;border-radius:15px;background:transparent!important;min-width:0;cursor:pointer}
    .outing-check input{position:absolute!important;inline-size:1px!important;block-size:1px!important;opacity:0!important;pointer-events:none!important;margin:0!important;padding:0!important}
    .outing-check span{min-height:54px;display:flex;align-items:center;justify-content:flex-start;gap:10px;padding:10px 12px;border:1.5px solid #d9ddd7;border-radius:15px;background:#fffdf9;color:var(--ink);font-size:13px;font-weight:900;line-height:1.25;overflow:hidden}
    .outing-check span::before{content:"";flex:0 0 24px;width:24px;height:24px;display:grid;place-items:center;border-radius:8px;border:1.5px solid #b8c5c0;background:#fff;color:#fff;font-size:15px;font-weight:1000}
    .outing-check input:checked + span{border-color:rgba(20,117,108,.52);background:#e7f5f1;color:#0c5f57;box-shadow:0 5px 15px rgba(20,117,108,.08)}
    .outing-check input:checked + span::before{content:"✓";background:#14756c;border-color:#14756c}
    .outing-check input:focus-visible + span{outline:3px solid rgba(20,117,108,.16);outline-offset:2px}

    html[data-app-theme="dark"] #outingsView .section-heading{background:linear-gradient(135deg,#102421,#171f1c);border-color:#2b403b}
    html[data-app-theme="dark"] .outing-card{background:linear-gradient(180deg,#111e1c,#0e1917);border-color:#2d403c}
    html[data-app-theme="dark"] .outing-card>summary{background:linear-gradient(135deg,#15302b,#111e1c)}
    html[data-app-theme="dark"] .outing-total,html[data-app-theme="dark"] .outing-stat,html[data-app-theme="dark"] .outing-balance-person{background:#14211f;border-color:#2d403c;color:#edf5f2}
    html[data-app-theme="dark"] .outing-purchase{background:#111e1c;border-color:#2d403c}
    html[data-app-theme="dark"] .outing-mini-chip{background:#172825;color:#b9d0ca;border-color:#2d403c}
    html[data-app-theme="dark"] .outing-check span{background:#111e1c;color:#edf5f2;border-color:#344743}
    html[data-app-theme="dark"] .outing-check span::before{background:#0d1816;border-color:#50635e}
    html[data-app-theme="dark"] .outing-check input:checked + span{background:#15312c;color:#dff6f0;border-color:#3a6f65}
    html[data-app-theme="dark"] .outing-calc-note{background:#132621;color:#adc5bf}

    @media(max-width:620px){
      #outingsView .section-heading{padding:16px 14px 8px}.outing-card>summary{align-items:flex-start}.outing-total{min-width:108px}.outing-body{padding:12px 13px 18px}.outing-quick-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.outing-actions{grid-template-columns:1fr 1fr}.outing-actions .ghost-btn{grid-column:1/-1}.outing-transfer{grid-template-columns:1fr}.outing-transfer>div:last-child{display:flex;align-items:center;justify-content:space-between;gap:10px}.outing-check-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.outing-check span{font-size:12px;padding:9px 10px}.outing-balance-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
'''
index = index.replace(css_anchor, css + '\n' + css_anchor, 1)

ledger_pattern = re.compile(r'      function outingLedger\(outing\) \{.*?\n      function outingPerson\(outing,id\)\{', re.S)
ledger = r'''      function outingLedger(outing) {
        outing = normalizeOutingRecord(outing);
        var participants = outing.participants || [];
        var participantIds = participants.map(function(p){ return String(p.id); });
        var validIds = new Set(participantIds);
        var order = {};
        participantIds.forEach(function(id,i){ order[id]=i; });
        var purchaseDebts = Object.create(null);
        var total = 0;

        function debtKey(fromId,toId){ return String(fromId)+">"+String(toId); }
        function addDebt(fromId,toId,cents){
          fromId=String(fromId||"");toId=String(toId||"");cents=Math.max(0,Math.round(Number(cents)||0));
          if(!cents||fromId===toId||!validIds.has(fromId)||!validIds.has(toId))return;
          var key=debtKey(fromId,toId);purchaseDebts[key]=(purchaseDebts[key]||0)+cents;
        }

        outing.purchases.forEach(function(p){
          var payerId=String(p.payerId||"");
          var ids=Array.from(new Set((p.participantIds||[]).map(String).filter(function(id){return validIds.has(id);}))); 
          if(!ids.length||!validIds.has(payerId))return;
          var amount=Math.max(0,Math.round(Number(p.amountCents)||0));
          if(!amount)return;
          var shares=splitOutingCents(amount,ids);
          ids.forEach(function(id){ if(id!==payerId) addDebt(id,payerId,shares[id]||0); });
          total+=amount;
        });

        var paymentByPair=Object.create(null);
        (outing.payments||[]).forEach(function(p){
          var fromId=String(p.fromId||""),toId=String(p.toId||"");
          if(!validIds.has(fromId)||!validIds.has(toId)||fromId===toId)return;
          var key=debtKey(fromId,toId);paymentByPair[key]=(paymentByPair[key]||0)+Math.max(0,Math.round(Number(p.amountCents)||0));
        });

        var transfers=[];
        var remainingBalances={};
        participantIds.forEach(function(id){remainingBalances[id]=0;});
        for(var i=0;i<participantIds.length;i++){
          for(var j=i+1;j<participantIds.length;j++){
            var a=participantIds[i],b=participantIds[j];
            var ab=Math.max(0,Math.round(Number(purchaseDebts[debtKey(a,b)]||0)));
            var ba=Math.max(0,Math.round(Number(purchaseDebts[debtKey(b,a)]||0)));
            var net=ab-ba;
            var fromId="",toId="",gross=0;
            if(net>0){fromId=a;toId=b;gross=net;}
            else if(net<0){fromId=b;toId=a;gross=-net;}
            else continue;
            var paid=Math.min(gross,Math.max(0,Math.round(Number(paymentByPair[debtKey(fromId,toId)]||0))));
            var remaining=gross-paid;
            if(remaining>0){
              transfers.push({fromId:fromId,toId:toId,amountCents:remaining,grossCents:gross,paidCents:paid});
              remainingBalances[fromId]-=remaining;
              remainingBalances[toId]+=remaining;
            }
          }
        }
        transfers.sort(function(a,b){
          var af=Object.prototype.hasOwnProperty.call(order,a.fromId)?order[a.fromId]:999;
          var bf=Object.prototype.hasOwnProperty.call(order,b.fromId)?order[b.fromId]:999;
          if(af!==bf)return af-bf;
          var at=Object.prototype.hasOwnProperty.call(order,a.toId)?order[a.toId]:999;
          var bt=Object.prototype.hasOwnProperty.call(order,b.toId)?order[b.toId]:999;
          return at-bt;
        });
        return { balances:remainingBalances, transfers:transfers, totalCents:total, purchaseDebts:purchaseDebts, paymentByPair:paymentByPair, settlementModel:"direct-payer-v2" };
      }
      function outingPerson(outing,id){'''
index, count = ledger_pattern.subn(ledger, index, count=1)
if count != 1:
    raise SystemExit('Could not replace outingLedger')

render_pattern = re.compile(r'      function renderOutings\(\)\{.*?\n      \}\n\n      function normalizeSavedState\(saved\) \{', re.S)
render = r'''      function renderOutings(){
        var root=$("#outingList");if(!root)return;
        var list=normalizeOutings(state.outings);state.outings=list;
        if(!list.length){root.innerHTML='<div class="outing-empty">لا توجد طلعات بعد. أضف أول طلعة ثم سجل الأشخاص والعمليات.</div>';return;}
        root.innerHTML=list.map(function(o){
          var ledger=outingLedger(o);
          var balances=o.participants.map(function(person){
            var cents=Math.round(Number(ledger.balances[person.id]||0));
            var cls=cents>0?'is-credit':cents<0?'is-debt':'is-even';
            var label=cents>0?'له '+formatMoney(outingMoney(cents)):cents<0?'عليه '+formatMoney(outingMoney(Math.abs(cents))):'متوازن';
            return '<div class="outing-balance-person '+cls+'"><span>'+escapeHTML(person.name)+'</span><small>'+escapeHTML(label)+'</small></div>';
          }).join('');
          var purchases=o.purchases.length?o.purchases.map(function(p){
            var payer=outingPerson(o,p.payerId);
            var names=(p.participantIds||[]).map(function(id){return outingPerson(o,id).name;});
            var participantChips=names.map(function(name){return '<span class="outing-mini-chip">'+escapeHTML(name)+'</span>';}).join('');
            return '<div class="outing-purchase"><div class="outing-purchase-main"><strong>'+escapeHTML(p.title)+'</strong><small>دفعها <b>'+escapeHTML(payer.name)+'</b> · '+names.length+' مشاركين'+(p.linkedExpenseId?' · مسجلة في الرصيد':'')+'</small><div class="outing-purchase-meta">'+participantChips+'</div></div><div><div class="outing-purchase-amount">'+moneyHTML(outingMoney(p.amountCents))+'</div><button class="mini-btn" type="button" data-outing-delete-purchase="'+escapeHTML(o.id)+'" data-purchase-id="'+escapeHTML(p.id)+'">حذف</button></div></div>';
          }).join(''):'<div class="outing-empty">لا توجد عمليات شراء بعد.</div>';
          var transfers=ledger.transfers.length?ledger.transfers.map(function(t){
            var from=outingPerson(o,t.fromId),to=outingPerson(o,t.toId);
            return '<div class="outing-transfer"><div class="outing-transfer-main"><div class="outing-transfer-route"><span class="person">'+escapeHTML(from.name)+'</span><span class="arrow">←</span><span>يحوّل إلى</span><span class="arrow">←</span><span class="person">'+escapeHTML(to.name)+'</span></div><small>حصته المتبقية مباشرة للشخص الذي دفع، بعد المقاصة بين هذين الشخصين فقط.</small></div><div><div class="outing-transfer-amount">'+moneyHTML(outingMoney(t.amountCents))+'</div><button class="mini-btn mark-paid" type="button" data-outing-settle="'+escapeHTML(o.id)+'" data-from-id="'+escapeHTML(t.fromId)+'" data-to-id="'+escapeHTML(t.toId)+'" data-amount-cents="'+t.amountCents+'">✓ تم التحويل</button></div></div>';
          }).join(''):'<div class="outing-empty">✓ جميع المبالغ متوازنة حاليًا.</div>';
          var payments=o.payments.length?o.payments.slice().reverse().map(function(p){return '<div class="outing-payment"><div><strong>✓ '+escapeHTML(outingPerson(o,p.fromId).name)+' → '+escapeHTML(outingPerson(o,p.toId).name)+'</strong><small>'+escapeHTML(formatDateTimeCompact(p.paidAt))+'</small></div><div><strong>'+moneyHTML(outingMoney(p.amountCents))+'</strong> <button class="mini-btn" type="button" data-outing-undo-payment="'+escapeHTML(o.id)+'" data-payment-id="'+escapeHTML(p.id)+'">تراجع</button></div></div>';}).join(''):'';
          return '<details class="outing-card" open><summary><div class="outing-card-title"><strong>'+escapeHTML(o.title)+'</strong><small>'+escapeHTML(formatDate(o.date))+' · '+o.participants.length+' أشخاص · '+o.purchases.length+' عمليات</small></div><div class="outing-total"><small>إجمالي الطلعة</small><strong>'+moneyHTML(outingMoney(ledger.totalCents))+'</strong></div></summary><div class="outing-body"><div class="outing-quick-stats"><div class="outing-stat"><small>الأشخاص</small><strong>'+o.participants.length+'</strong></div><div class="outing-stat"><small>العمليات</small><strong>'+o.purchases.length+'</strong></div><div class="outing-stat"><small>التحويلات المتبقية</small><strong>'+ledger.transfers.length+'</strong></div><div class="outing-stat"><small>الإجمالي</small><strong>'+formatMoney(outingMoney(ledger.totalCents))+'</strong></div></div><div class="outing-participants">'+o.participants.map(function(p){return '<span class="outing-chip">'+escapeHTML(p.name)+'</span>';}).join('')+'</div><div class="outing-actions"><button class="primary-btn" type="button" data-outing-add-purchase="'+escapeHTML(o.id)+'">+ عملية شراء</button><button class="soft-btn" type="button" data-outing-edit="'+escapeHTML(o.id)+'">تعديل الأشخاص</button><button class="ghost-btn" type="button" data-outing-delete="'+escapeHTML(o.id)+'">حذف الطلعة</button></div><div class="outing-subtitle"><h4>وضع كل شخص</h4><small>يتحدث مباشرة بعد كل عملية وتحويل</small></div><div class="outing-balance-grid">'+balances+'</div><div class="outing-calc-note">الحسبة الجديدة تربط حصة كل شخص مباشرة بمن دفع العملية. إذا دفع شخصان مختلفان في نفس الطلعة، لا يتم تحويل دين شخص إلى طرف ثالث؛ تتم المقاصة فقط بين نفس الشخصين.</div><div class="outing-subtitle"><h4>العمليات</h4><small>'+o.purchases.length+' عملية</small></div>'+purchases+'<div class="outing-subtitle"><h4>من يحول لمن؟</h4><small>تحويلات مباشرة وواضحة حسب الدافع الفعلي</small></div>'+transfers+(payments?'<div class="outing-subtitle"><h4>التحويلات المنجزة</h4><small>يمكن التراجع عن أي تحويل بالخطأ</small></div>'+payments:'')+'</div></details>';
        }).join('');
      }

      function normalizeSavedState(saved) {'''
index, count = render_pattern.subn(render, index, count=1)
if count != 1:
    raise SystemExit('Could not replace renderOutings')

old_label = '<div class="field span-2"><label>من يشترك في هذه العملية؟</label><div class="outing-check-grid" id="outingPurchaseParticipants"></div></div>'
new_label = '<div class="field span-2"><label>من يشترك في هذه العملية؟ <small style="display:block;margin-top:4px;color:var(--muted);font-weight:600">اختر الأشخاص الذين تُقسم عليهم هذه العملية فقط</small></label><div class="outing-check-grid" id="outingPurchaseParticipants"></div></div>'
require(index, old_label, 'participant label')
index = index.replace(old_label, new_label, 1)

for needle in ['settlementModel:"direct-payer-v2"', 'outing-balance-grid', 'الحسبة الجديدة تربط حصة كل شخص', 'outing-check input:checked + span']:
    require(index, needle, needle)
write(INDEX, index)

worker = read(WORKER)
require(worker, 'const RELEASE_ID = "' + OLD + '";', 'worker r1 release')
worker = worker.replace('const RELEASE_ID = "' + OLD + '";', 'const RELEASE_ID = "' + NEW + '";', 1)
worker, n = re.subn(r'const UPDATE_SIGNAL_VERSION = "3\.9\.5[^"]*";', lambda _: 'const UPDATE_SIGNAL_VERSION = "3.9.5' + chr(0x2069) + '";', worker, count=1)
if n != 1:
    raise SystemExit('Could not bump update signal')
write(WORKER, worker)

sw = read(SW)
require(sw, 'salary-manager-v3.9.5-balance-integrity-outings-r1', 'sw r1 cache')
sw = sw.replace('salary-manager-v3.9.5-balance-integrity-outings-r1', 'salary-manager-v3.9.5-outings-fair-settlement-r2', 1)
write(SW, sw)
print('r2 outings fair settlement + UI applied')
