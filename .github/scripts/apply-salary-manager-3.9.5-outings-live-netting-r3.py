from pathlib import Path
import re

INDEX = Path("public/index.html")
WORKER = Path("src/worker.js")
SW = Path("public/sw.js")

OLD = "3.9.5-outings-fair-settlement-r2"
NEW = "3.9.5-outings-live-netting-r3"

def read(path):
    return path.read_text(encoding="utf-8")

def write(path, text):
    path.write_text(text, encoding="utf-8")

def require(text, needle, label):
    if needle not in text:
        raise SystemExit("Missing anchor: " + label)

index = read(INDEX)
require(index, OLD, "r2 release id in index")
require(index, 'settlementModel:"direct-payer-v2"', "r2 settlement model")
require(index, "function outingLedger(outing)", "outing ledger")
require(index, "function renderOutings()", "outing renderer")
index = index.replace(OLD, NEW)

ledger_pattern = re.compile(
    r'      function outingLedger\(outing\) \{.*?\n      function outingPerson\(outing,id\)\{',
    re.S,
)

ledger = r'''      function outingLedger(outing) {
        outing = normalizeOutingRecord(outing);
        var participants = outing.participants || [];
        var participantIds = participants.map(function(p){ return String(p.id); });
        var validIds = new Set(participantIds);
        var order = {};
        participantIds.forEach(function(id,i){ order[id]=i; });

        var purchaseDebts = Object.create(null);
        var paymentByPair = Object.create(null);
        var total = 0;

        function debtKey(fromId,toId){ return String(fromId)+">"+String(toId); }
        function readCents(map,fromId,toId){
          return Math.max(0,Math.round(Number(map[debtKey(fromId,toId)]||0)));
        }
        function addToMap(map,fromId,toId,cents){
          fromId=String(fromId||"");toId=String(toId||"");
          cents=Math.max(0,Math.round(Number(cents)||0));
          if(!cents||fromId===toId||!validIds.has(fromId)||!validIds.has(toId))return;
          var key=debtKey(fromId,toId);
          map[key]=(map[key]||0)+cents;
        }

        outing.purchases.forEach(function(p){
          var payerId=String(p.payerId||"");
          var ids=Array.from(new Set((p.participantIds||[]).map(String).filter(function(id){return validIds.has(id);})));
          if(!ids.length||!validIds.has(payerId))return;
          var amount=Math.max(0,Math.round(Number(p.amountCents)||0));
          if(!amount)return;
          var shares=splitOutingCents(amount,ids);
          ids.forEach(function(id){
            if(id!==payerId) addToMap(purchaseDebts,id,payerId,shares[id]||0);
          });
          total+=amount;
        });

        (outing.payments||[]).forEach(function(p){
          addToMap(paymentByPair,String(p.fromId||""),String(p.toId||""),p.amountCents);
        });

        var purchaseBalances={};
        var balances={};
        participantIds.forEach(function(id){
          purchaseBalances[id]=0;
          balances[id]=0;
        });

        var transfers=[];
        var pairBreakdown=[];

        for(var i=0;i<participantIds.length;i++){
          for(var j=i+1;j<participantIds.length;j++){
            var a=participantIds[i], b=participantIds[j];

            var debtAB=readCents(purchaseDebts,a,b);
            var debtBA=readCents(purchaseDebts,b,a);
            var paidAB=readCents(paymentByPair,a,b);
            var paidBA=readCents(paymentByPair,b,a);

            var purchaseNet=debtAB-debtBA;

            // Running net after money that actually moved.
            // If Khalid owes me 100, then I owe him 25:
            // before payment => 75 Khalid owes me.
            // after Khalid already paid 100 => -25, so I owe Khalid 25.
            var outstandingNet=purchaseNet-paidAB+paidBA;

            if(purchaseNet>0){
              purchaseBalances[a]-=purchaseNet;
              purchaseBalances[b]+=purchaseNet;
            }else if(purchaseNet<0){
              purchaseBalances[a]+=(-purchaseNet);
              purchaseBalances[b]-=(-purchaseNet);
            }

            if(outstandingNet>0){
              balances[a]-=outstandingNet;
              balances[b]+=outstandingNet;
              transfers.push({
                fromId:a,toId:b,amountCents:outstandingNet,
                purchaseNetCents:purchaseNet,
                paidAB:paidAB,paidBA:paidBA
              });
            }else if(outstandingNet<0){
              var reverse=-outstandingNet;
              balances[b]-=reverse;
              balances[a]+=reverse;
              transfers.push({
                fromId:b,toId:a,amountCents:reverse,
                purchaseNetCents:purchaseNet,
                paidAB:paidAB,paidBA:paidBA
              });
            }

            if(debtAB||debtBA||paidAB||paidBA){
              pairBreakdown.push({
                aId:a,bId:b,
                debtAB:debtAB,debtBA:debtBA,
                paidAB:paidAB,paidBA:paidBA,
                purchaseNetCents:purchaseNet,
                outstandingNetCents:outstandingNet
              });
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

        return {
          balances:balances,
          purchaseBalances:purchaseBalances,
          transfers:transfers,
          totalCents:total,
          purchaseDebts:purchaseDebts,
          paymentByPair:paymentByPair,
          pairBreakdown:pairBreakdown,
          settlementModel:"running-net-v3"
        };
      }
      function outingPerson(outing,id){'''

index, count = ledger_pattern.subn(lambda m: ledger, index, count=1)
if count != 1:
    raise SystemExit("Could not replace outingLedger")

render_pattern = re.compile(
    r'      function renderOutings\(\)\{.*?\n      \}\n\n      function normalizeSavedState\(saved\) \{',
    re.S,
)

render = r'''      function renderOutings(){
        var root=$("#outingList");if(!root)return;
        var list=normalizeOutings(state.outings);state.outings=list;
        if(!list.length){root.innerHTML='<div class="outing-empty">لا توجد طلعات بعد. أضف أول طلعة ثم سجل الأشخاص والعمليات.</div>';return;}

        function outingStatusText(cents){
          cents=Math.round(Number(cents)||0);
          if(cents>0)return "له "+formatMoney(outingMoney(cents));
          if(cents<0)return "عليه "+formatMoney(outingMoney(Math.abs(cents)));
          return "متوازن";
        }

        root.innerHTML=list.map(function(o){
          var ledger=outingLedger(o);

          var balances=o.participants.map(function(person){
            var purchaseCents=Math.round(Number(ledger.purchaseBalances[person.id]||0));
            var remainingCents=Math.round(Number(ledger.balances[person.id]||0));
            var cls=remainingCents>0?"is-credit":remainingCents<0?"is-debt":"is-even";
            return '<div class="outing-balance-person '+cls+'"><span>'+escapeHTML(person.name)+'</span><small>صافي العمليات: '+escapeHTML(outingStatusText(purchaseCents))+'</small><em>بعد التحويلات الفعلية: '+escapeHTML(outingStatusText(remainingCents))+'</em></div>';
          }).join("");

          var purchases=o.purchases.length?o.purchases.map(function(p){
            var payer=outingPerson(o,p.payerId);
            var names=(p.participantIds||[]).map(function(id){return outingPerson(o,id).name;});
            var participantChips=names.map(function(name){return '<span class="outing-mini-chip">'+escapeHTML(name)+'</span>';}).join("");
            return '<div class="outing-purchase"><div class="outing-purchase-main"><strong>'+escapeHTML(p.title)+'</strong><small>دفعها <b>'+escapeHTML(payer.name)+'</b> · '+names.length+' مشاركين'+(p.linkedExpenseId?' · مسجلة في الرصيد':'')+'</small><div class="outing-purchase-meta">'+participantChips+'</div></div><div><div class="outing-purchase-amount">'+moneyHTML(outingMoney(p.amountCents))+'</div><button class="mini-btn" type="button" data-outing-delete-purchase="'+escapeHTML(o.id)+'" data-purchase-id="'+escapeHTML(p.id)+'">حذف</button></div></div>';
          }).join(""):'<div class="outing-empty">لا توجد عمليات شراء بعد.</div>';

          var transfers=ledger.transfers.length?ledger.transfers.map(function(t){
            var from=outingPerson(o,t.fromId),to=outingPerson(o,t.toId);
            return '<div class="outing-transfer"><div class="outing-transfer-main"><div class="outing-transfer-route"><span class="person">'+escapeHTML(from.name)+'</span><span class="arrow">←</span><span>يحوّل إلى</span><span class="arrow">←</span><span class="person">'+escapeHTML(to.name)+'</span></div><small>المتبقي الفعلي بعد صافي جميع العمليات واحتساب التحويلات التي تمت بالفعل.</small></div><div><div class="outing-transfer-amount">'+moneyHTML(outingMoney(t.amountCents))+'</div><button class="mini-btn mark-paid" type="button" data-outing-settle="'+escapeHTML(o.id)+'" data-from-id="'+escapeHTML(t.fromId)+'" data-to-id="'+escapeHTML(t.toId)+'" data-amount-cents="'+t.amountCents+'">✓ تم التحويل</button></div></div>';
          }).join(""):'<div class="outing-empty">✓ لا توجد مبالغ معلقة حاليًا.</div>';

          var payments=o.payments.length?o.payments.slice().reverse().map(function(p){
            return '<div class="outing-payment"><div><strong>✓ تحويل فعلي: '+escapeHTML(outingPerson(o,p.fromId).name)+' → '+escapeHTML(outingPerson(o,p.toId).name)+'</strong><small>'+escapeHTML(formatDateTimeCompact(p.paidAt))+'</small></div><div><strong>'+moneyHTML(outingMoney(p.amountCents))+'</strong> <button class="mini-btn" type="button" data-outing-undo-payment="'+escapeHTML(o.id)+'" data-payment-id="'+escapeHTML(p.id)+'">تراجع</button></div></div>';
          }).join(""):"";

          return '<details class="outing-card" open><summary><div class="outing-card-title"><strong>'+escapeHTML(o.title)+'</strong><small>'+escapeHTML(formatDate(o.date))+' · '+o.participants.length+' أشخاص · '+o.purchases.length+' عمليات</small></div><div class="outing-total"><small>إجمالي الطلعة</small><strong>'+moneyHTML(outingMoney(ledger.totalCents))+'</strong></div></summary><div class="outing-body"><div class="outing-quick-stats"><div class="outing-stat"><small>الأشخاص</small><strong>'+o.participants.length+'</strong></div><div class="outing-stat"><small>العمليات</small><strong>'+o.purchases.length+'</strong></div><div class="outing-stat"><small>التحويلات المعلقة</small><strong>'+ledger.transfers.length+'</strong></div><div class="outing-stat"><small>تحويلات تمت</small><strong>'+o.payments.length+'</strong></div></div><div class="outing-participants">'+o.participants.map(function(p){return '<span class="outing-chip">'+escapeHTML(p.name)+'</span>';}).join("")+'</div><div class="outing-actions"><button class="primary-btn" type="button" data-outing-add-purchase="'+escapeHTML(o.id)+'">+ عملية شراء</button><button class="soft-btn" type="button" data-outing-edit="'+escapeHTML(o.id)+'">تعديل الأشخاص</button><button class="ghost-btn" type="button" data-outing-delete="'+escapeHTML(o.id)+'">حذف الطلعة</button></div><div class="outing-subtitle"><h4>وضع كل شخص</h4><small>صافي العمليات ثم المتبقي بعد التحويلات الفعلية</small></div><div class="outing-balance-grid">'+balances+'</div><div class="outing-calc-note">الحسبة الآن مستمرة طوال الطلعة: إذا كان خالد عليه لك 100 ثم دفعها فعلًا، وبعدها دفع خالد عملية جديدة وأصبحت حصتك له 25، سيظهر أنك تحوّل له 25. أما إذا لم يكن قد حوّل الـ100 أصلًا، فستتم المقاصة ويظهر المتبقي عليه لك 75 فقط.</div><div class="outing-subtitle"><h4>العمليات</h4><small>'+o.purchases.length+' عملية</small></div>'+purchases+'<div class="outing-subtitle"><h4>من يحول لمن؟</h4><small>المتبقي الفعلي الآن</small></div>'+transfers+(payments?'<div class="outing-subtitle"><h4>التحويلات التي تمت فعليًا</h4><small>تبقى محفوظة في السجل وتدخل في أي عملية لاحقة</small></div>'+payments:"")+'</div></details>';
        }).join("");
      }

      function normalizeSavedState(saved) {'''

index, count = render_pattern.subn(lambda m: render, index, count=1)
if count != 1:
    raise SystemExit("Could not replace renderOutings")

css_anchor = "    .statement-list { display:grid; gap:18px; }"
require(index, css_anchor, "statement css anchor")
r3_css = r'''
    /* 3.9.5 r3 — صافي العمليات مقابل المتبقي بعد التحويلات الفعلية */
    .outing-balance-person em{font-style:normal;font-size:10px;font-weight:900;line-height:1.5;padding-top:5px;margin-top:2px;border-top:1px dashed rgba(23,51,49,.12)}
    .outing-balance-person.is-credit em{color:#167247}
    .outing-balance-person.is-debt em{color:#a35440}
    .outing-balance-person.is-even em{color:var(--muted)}
    html[data-app-theme="dark"] .outing-balance-person em{border-top-color:rgba(220,240,234,.12)}
'''
index = index.replace(css_anchor, r3_css + "\n" + css_anchor, 1)

for needle in [
    'settlementModel:"running-net-v3"',
    'purchaseNet-paidAB+paidBA',
    'صافي العمليات:',
    'بعد التحويلات الفعلية:',
    'إذا كان خالد عليه لك 100'
]:
    require(index, needle, needle)

write(INDEX, index)

worker = read(WORKER)
require(worker, 'const RELEASE_ID = "' + OLD + '";', "worker r2 release")
worker = worker.replace(
    'const RELEASE_ID = "' + OLD + '";',
    'const RELEASE_ID = "' + NEW + '";',
    1
)
worker, n = re.subn(
    r'const UPDATE_SIGNAL_VERSION = "3\.9\.5[^"]*";',
    lambda _: 'const UPDATE_SIGNAL_VERSION = "3.9.5' + chr(0x2066) + '";',
    worker,
    count=1
)
if n != 1:
    raise SystemExit("Could not bump update signal")
write(WORKER, worker)

sw = read(SW)
require(sw, "salary-manager-v3.9.5-outings-fair-settlement-r2", "sw r2 cache")
sw = sw.replace(
    "salary-manager-v3.9.5-outings-fair-settlement-r2",
    "salary-manager-v3.9.5-outings-live-netting-r3",
    1
)
write(SW, sw)

print("r3 outings live netting applied")
