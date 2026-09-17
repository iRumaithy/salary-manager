from pathlib import Path
import json, re

INDEX = Path('public/index.html')
WORKER = Path('src/worker.js')
SW = Path('public/sw.js')
PACKAGE = Path('package.json')
OLD = '3.9.4-automation-review-edit-r14'
NEW = '3.9.5-balance-integrity-outings-r1'

def read(p): return p.read_text(encoding='utf-8')
def write(p, s): p.write_text(s, encoding='utf-8')
def require(s, needle, label):
    if needle not in s: raise SystemExit('Missing anchor: ' + label)
def replace_once(s, old, new, label):
    require(s, old, label)
    return s.replace(old, new, 1)

index = read(INDEX)
require(index, 'var APP_VERSION = "3.9.4";', 'app version')
require(index, 'var APP_RELEASE_ID = "' + OLD + '";', 'r14 release')
index = index.replace('var APP_VERSION = "3.9.4";', 'var APP_VERSION = "3.9.5";', 1)
index = index.replace('var APP_RELEASE_ID = "' + OLD + '";', 'var APP_RELEASE_ID = "' + NEW + '";', 1)
index = index.replace(OLD, NEW)

# ---------------- state ----------------
state_anchor = '''          recurringPayments: [],\n          expenses: [],\n          deposits: []\n        };'''
state_new = '''          recurringPayments: [],\n          expenses: [],\n          deposits: [],\n          outings: []\n        };'''
index = replace_once(index, state_anchor, state_new, 'fresh state outings')
index = replace_once(
    index,
    '      var state = makeFreshState();\n      var activeView = "overviewView";',
    '      var state = makeFreshState();\n      var activeView = "overviewView";\n      var statementSearchQuery = "";\n      var activeOutingId = "";',
    'global outing/search state'
)

# ---------------- CSS ----------------
css_anchor = '    .statement-list { display:grid; gap:18px; }'
require(index, css_anchor, 'statement css')
css = r'''
    .statement-search-wrap{display:flex;align-items:center;gap:10px;margin:0 0 16px;padding:10px 12px;border:1px solid var(--line);border-radius:16px;background:var(--paper)}
    .statement-search-wrap input{width:100%;min-height:42px;border:0;outline:0;background:transparent;color:var(--ink);font:inherit}
    .statement-search-wrap .search-mark{width:34px;height:34px;display:grid;place-items:center;border-radius:11px;background:var(--teal-soft);color:var(--teal);font-weight:900}
    .outing-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .outing-list{display:grid;gap:16px}
    .outing-card{border:1px solid rgba(20,117,108,.15);border-radius:24px;background:linear-gradient(180deg,var(--paper),rgba(255,253,249,.82));box-shadow:0 14px 36px rgba(21,49,46,.07);overflow:hidden}
    .outing-card>summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:14px;align-items:center;padding:18px}
    .outing-card>summary::-webkit-details-marker{display:none}
    .outing-card-title{display:grid;gap:5px}.outing-card-title strong{font-size:17px}.outing-card-title small{color:var(--muted)}
    .outing-total{text-align:left}.outing-total small{display:block;color:var(--muted);font-size:9px}.outing-total strong{color:var(--forest);font-size:18px}
    .outing-body{padding:0 18px 18px;border-top:1px solid var(--line)}
    .outing-participants{display:flex;flex-wrap:wrap;gap:7px;margin:14px 0}
    .outing-chip{padding:7px 10px;border-radius:999px;background:var(--teal-soft);color:var(--teal);font-size:10px;font-weight:850}
    .outing-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
    .outing-subtitle{display:flex;justify-content:space-between;gap:10px;align-items:end;margin:18px 0 8px}.outing-subtitle h4{margin:0;font-size:14px}.outing-subtitle small{color:var(--muted)}
    .outing-purchase,.outing-transfer,.outing-payment{display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:center;padding:12px;border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.6);margin-top:8px}
    .outing-purchase-main,.outing-transfer-main{display:grid;gap:4px}.outing-purchase-main small,.outing-transfer-main small{color:var(--muted);font-size:9px;line-height:1.55}
    .outing-purchase-amount,.outing-transfer-amount{font-weight:900;white-space:nowrap}
    .outing-transfer{border-color:rgba(20,117,108,.20);background:rgba(223,242,237,.42)}
    .outing-payment{border-color:rgba(40,145,94,.24);background:rgba(224,246,233,.7)}
    .outing-payment strong{color:#167247}
    .outing-empty{padding:18px;border:1px dashed var(--line);border-radius:16px;text-align:center;color:var(--muted)}
    .outing-check-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px;margin-top:8px}
    .outing-check{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--paper)}
    .outing-note{padding:11px 12px;border-radius:13px;background:var(--gold-soft);color:#70551e;font-size:9px;line-height:1.7}
    html[data-app-theme="dark"] .statement-search-wrap,html[data-app-theme="dark"] .outing-card,html[data-app-theme="dark"] .outing-purchase,html[data-app-theme="dark"] .outing-check{background:#111e1c;border-color:#2d403c;color:#edf5f2}
    html[data-app-theme="dark"] .outing-transfer{background:#142723;border-color:#315149}
    html[data-app-theme="dark"] .outing-payment{background:#10281d;border-color:#29573c}
    html[data-app-theme="dark"] .outing-note{background:#2b2517;color:#e9d59e}
    @media(max-width:620px){.outing-purchase,.outing-transfer,.outing-payment{grid-template-columns:1fr}.outing-total{text-align:right}.outing-check-grid{grid-template-columns:1fr 1fr}}
'''
index = index.replace(css_anchor, css + '\n' + css_anchor, 1)

# ---------------- nav + sections ----------------
tab_anchor = '        <button class="tab" type="button" role="tab" aria-selected="false" aria-controls="statementsView" data-view="statementsView">كشف الحساب</button>'
index = replace_once(index, tab_anchor, tab_anchor + '\n        <button class="tab" type="button" role="tab" aria-selected="false" aria-controls="outingsView" data-view="outingsView">جمعية الطلعات</button>', 'outings tab')

statement_panel = '''        <article class="panel panel-pad">\n          <div class="statement-list" id="statementList"></div>\n        </article>'''
statement_panel_new = '''        <article class="panel panel-pad">\n          <div class="statement-search-wrap"><span class="search-mark" aria-hidden="true">⌕</span><input id="statementSearchInput" type="search" autocomplete="off" placeholder="ابحث باسم العملية أو المبلغ أو التاريخ…" aria-label="بحث في كشف الحساب"></div>\n          <div class="statement-list" id="statementList"></div>\n        </article>'''
index = replace_once(index, statement_panel, statement_panel_new, 'statement search field')

guide_anchor = '      <section class="view" id="guideView" role="tabpanel" hidden>'
outings_section = r'''      <section class="view" id="outingsView" role="tabpanel" hidden>
        <div class="section-heading">
<div>
  <h2>جمعية الطلعات</h2>
  <p>قسّم تكاليف الرحلات والطلعات بدقة، حتى لو دفع شخص مختلف في كل عملية. الحساب يتم بالفلس لتفادي فروقات التقريب.</p>
</div>
<div class="outing-toolbar"><button class="primary-btn" id="addOutingButton" type="button">+ إضافة طلعة</button></div>
        </div>
        <div class="outing-note">جمعية الطلعات مستقلة عن رصيد البنك لمنع التكرار مع الأتمتة. عند تسجيل عملية دفعتها أنت يمكنك اختيار إضافتها أيضًا كمصروف في مدير الراتب.</div>
        <div class="outing-list" id="outingList"></div>
      </section>

'''
index = replace_once(index, guide_anchor, outings_section + guide_anchor, 'outings section')

# ---------------- dialogs ----------------
dialog_anchor = '  <dialog class="modal" id="currentBalanceDialog">'
dialogs = r'''  <dialog class="modal" id="outingDialog">
    <form id="outingForm">
      <div class="modal-head"><h2 id="outingDialogTitle">إضافة طلعة</h2><button class="close-btn" type="button" data-close-dialog="outingDialog" aria-label="إغلاق">×</button></div>
      <div class="modal-body">
        <input id="outingEditId" name="id" type="hidden">
        <div class="form-grid">
<div class="field span-2"><label for="outingTitle">اسم الرحلة أو الطلعة</label><input id="outingTitle" name="title" type="text" maxlength="80" placeholder="مثال: طلعة البر" required></div>
<div class="field"><label for="outingDate">التاريخ</label><input id="outingDate" name="date" type="date" required></div>
<div class="field span-2"><label for="outingParticipantsInput">الأشخاص</label><textarea id="outingParticipantsInput" name="participants" rows="5" placeholder="اكتب كل اسم في سطر مستقل&#10;أحمد&#10;محمد"></textarea><p class="helper">سيتم إضافة «أنا» تلقائيًا. يمكنك أيضًا فصل الأسماء بفاصلة.</p></div>
        </div>
      </div>
      <div class="modal-foot"><button class="ghost-btn" type="button" data-close-dialog="outingDialog">إلغاء</button><button class="primary-btn" type="submit">حفظ الطلعة</button></div>
    </form>
  </dialog>

  <dialog class="modal" id="outingPurchaseDialog">
    <form id="outingPurchaseForm">
      <div class="modal-head"><h2>إضافة عملية شراء</h2><button class="close-btn" type="button" data-close-dialog="outingPurchaseDialog" aria-label="إغلاق">×</button></div>
      <div class="modal-body">
        <input id="outingPurchaseOutingId" name="outingId" type="hidden">
        <div class="form-grid">
<div class="field span-2"><label for="outingPurchaseTitle">وصف العملية</label><input id="outingPurchaseTitle" name="title" type="text" maxlength="80" placeholder="مثال: عشاء" required></div>
<div class="field"><label for="outingPurchaseAmount">المبلغ</label><input id="outingPurchaseAmount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></div>
<div class="field"><label for="outingPurchaseDate">التاريخ</label><input id="outingPurchaseDate" name="date" type="date" required></div>
<div class="field span-2"><label for="outingPurchasePayer">من دفع؟</label><select id="outingPurchasePayer" name="payerId" required></select></div>
<div class="field span-2"><label>من يشترك في هذه العملية؟</label><div class="outing-check-grid" id="outingPurchaseParticipants"></div></div>
<label class="toggle-row span-2" id="outingRecordExpenseRow"><span><strong>سجّلها أيضًا كمصروف في مدير الراتب</strong><small>فعّلها فقط إذا دفعت أنت ولم تكن العملية مسجلة مسبقًا عبر البنك/Wallet.</small></span><input id="outingRecordExpense" name="recordExpense" type="checkbox"></label>
        </div>
      </div>
      <div class="modal-foot"><button class="ghost-btn" type="button" data-close-dialog="outingPurchaseDialog">إلغاء</button><button class="primary-btn" type="submit">إضافة العملية</button></div>
    </form>
  </dialog>

'''
index = replace_once(index, dialog_anchor, dialogs + dialog_anchor, 'outings dialogs')

# ---------------- balance integrity + outings core helpers before normalize ----------------
normalize_anchor = '      function normalizeSavedState(saved) {'
helpers = r'''      function ledgerExpectedWalletBalance() {
        if (!state || !Array.isArray(state.transactions)) return null;
        var month = String(state.currentCalendarMonth || defaultMonth || "");
        var txs = state.transactions;
        var anchorIndex = -1, anchorBalance = 0;
        for (var i = txs.length - 1; i >= 0; i -= 1) {
var tx = txs[i] || {};
var txMonth = String(tx.month || calendarMonthForDate(tx.date));
if (txMonth !== month) continue;
var after = Number(tx.balanceAfter);
if (Number.isFinite(after)) { anchorIndex = i; anchorBalance = after; break; }
        }
        if (anchorIndex < 0) return null;
        var expected = anchorBalance;
        for (var j = anchorIndex + 1; j < txs.length; j += 1) {
var row = txs[j] || {};
if (String(row.month || calendarMonthForDate(row.date)) !== month) continue;
expected += signedNumber(row.amount);
        }
        return roundSignedMoney(expected);
      }

      function repairWalletBalanceIntegrity(reason) {
        var expected = ledgerExpectedWalletBalance();
        if (expected == null) return false;
        var actual = roundSignedMoney(state.walletBalance);
        var diff = roundSignedMoney(expected - actual);
        if (Math.abs(diff) < .005) return false;
        state.walletBalance = expected;
        state.balanceIntegrity = { repairedAt:new Date().toISOString(), reason:String(reason || "audit"), difference:diff, expected:expected, previous:actual };
        return true;
      }

      function outingCents(value) { return Math.max(0, Math.round(safeNumber(value) * 100)); }
      function outingMoney(cents) { return roundMoney((Number(cents || 0)) / 100); }
      function normalizeOutingRecord(raw) {
        raw = raw && typeof raw === "object" ? raw : {};
        var participants = Array.isArray(raw.participants) ? raw.participants.map(function(p, i){ return { id:String(p && p.id || makeId("outing-person")), name:String(p && p.name || (i === 0 ? "أنا" : "شخص")), isMe:Boolean(p && p.isMe) }; }) : [];
        var me = participants.find(function(p){ return p.isMe; });
        if (!me) { me = { id:makeId("outing-me"), name:"أنا", isMe:true }; participants.unshift(me); }
        participants.forEach(function(p){ if (p.isMe) p.name = "أنا"; });
        var ids = new Set(participants.map(function(p){ return p.id; }));
        var purchases = Array.isArray(raw.purchases) ? raw.purchases.map(function(p){
var memberIds = Array.isArray(p && p.participantIds) ? p.participantIds.map(String).filter(function(id){ return ids.has(id); }) : [];
return { id:String(p && p.id || makeId("outing-buy")), title:String(p && p.title || "عملية"), amountCents:Math.max(0, Math.round(Number(p && (p.amountCents != null ? p.amountCents : outingCents(p.amount)) || 0))), payerId:ids.has(String(p && p.payerId || "")) ? String(p.payerId) : me.id, participantIds:memberIds.length ? memberIds : participants.map(function(x){ return x.id; }), date:String(p && p.date || raw.date || toDateInput(new Date())), linkedExpenseId:String(p && p.linkedExpenseId || ""), createdAt:String(p && p.createdAt || new Date().toISOString()) };
        }).filter(function(p){ return p.amountCents > 0; }) : [];
        var payments = Array.isArray(raw.payments) ? raw.payments.map(function(p){ return { id:String(p && p.id || makeId("outing-pay")), fromId:String(p && p.fromId || ""), toId:String(p && p.toId || ""), amountCents:Math.max(0,Math.round(Number(p && p.amountCents || 0))), paidAt:String(p && p.paidAt || new Date().toISOString()) }; }).filter(function(p){ return p.amountCents > 0 && ids.has(p.fromId) && ids.has(p.toId) && p.fromId !== p.toId; }) : [];
        return { id:String(raw.id || makeId("outing")), title:String(raw.title || "طلعة"), date:String(raw.date || toDateInput(new Date())), participants:participants, purchases:purchases, payments:payments, createdAt:String(raw.createdAt || new Date().toISOString()), updatedAt:String(raw.updatedAt || "") };
      }
      function normalizeOutings(value) { return Array.isArray(value) ? value.map(normalizeOutingRecord) : []; }
      function splitOutingCents(total, ids) {
        ids = Array.isArray(ids) ? ids.slice() : [];
        if (!ids.length) return {};
        var base = Math.floor(total / ids.length), rem = total - base * ids.length, out = {};
        ids.forEach(function(id, i){ out[id] = base + (i < rem ? 1 : 0); });
        return out;
      }
      function outingLedger(outing) {
        outing = normalizeOutingRecord(outing);
        var balances = {}, names = {};
        outing.participants.forEach(function(p){ balances[p.id] = 0; names[p.id] = p.name; });
        var total = 0;
        outing.purchases.forEach(function(p){
var ids = p.participantIds.filter(function(id){ return Object.prototype.hasOwnProperty.call(balances,id); });
if (!ids.length || !Object.prototype.hasOwnProperty.call(balances,p.payerId)) return;
var shares = splitOutingCents(p.amountCents, ids);
balances[p.payerId] += p.amountCents;
ids.forEach(function(id){ balances[id] -= shares[id]; });
total += p.amountCents;
        });
        outing.payments.forEach(function(p){ if (balances[p.fromId] == null || balances[p.toId] == null) return; balances[p.fromId] += p.amountCents; balances[p.toId] -= p.amountCents; });
        var creditors = [], debtors = [];
        Object.keys(balances).forEach(function(id){ var v=Math.round(balances[id]); if(v>0) creditors.push({id:id,amount:v}); else if(v<0) debtors.push({id:id,amount:-v}); });
        creditors.sort(function(a,b){return b.amount-a.amount;}); debtors.sort(function(a,b){return b.amount-a.amount;});
        var transfers = [], di=0, ci=0;
        while(di<debtors.length && ci<creditors.length){ var amount=Math.min(debtors[di].amount,creditors[ci].amount); if(amount>0) transfers.push({fromId:debtors[di].id,toId:creditors[ci].id,amountCents:amount}); debtors[di].amount-=amount; creditors[ci].amount-=amount; if(!debtors[di].amount)di++; if(!creditors[ci].amount)ci++; }
        return { balances:balances, names:names, transfers:transfers, totalCents:total };
      }
      function outingPerson(outing,id){ return (outing.participants||[]).find(function(p){return String(p.id)===String(id);}) || {id:id,name:"شخص",isMe:false}; }
      function outingParticipantNames(outing, ids){ return (ids||[]).map(function(id){return outingPerson(outing,id).name;}).join("، "); }
      function outingOpenDialog(item){
        item = item ? normalizeOutingRecord(item) : null;
        $("#outingForm").reset(); $("#outingEditId").value = item ? item.id : ""; $("#outingTitle").value = item ? item.title : ""; $("#outingDate").value = item ? item.date : toDateInput(new Date());
        $("#outingParticipantsInput").value = item ? item.participants.filter(function(p){return !p.isMe;}).map(function(p){return p.name;}).join("\n") : "";
        $("#outingDialogTitle").textContent = item ? "تعديل الطلعة" : "إضافة طلعة"; $("#outingDialog").showModal();
      }
      function submitOuting(event){
        event.preventDefault(); var data=new FormData(event.currentTarget), id=String(data.get("id")||""), existing=(state.outings||[]).find(function(x){return x.id===id;});
        var title=String(data.get("title")||"").trim(), date=String(data.get("date")||""), raw=String(data.get("participants")||"");
        var names=raw.split(/[\n,،]+/).map(function(x){return x.trim();}).filter(Boolean).filter(function(x,i,a){return a.indexOf(x)===i;});
        if(!title||!date){showToast("أكمل اسم الطلعة والتاريخ",true);return;}
        var me=existing&&existing.participants.find(function(p){return p.isMe;}) || {id:makeId("outing-me"),name:"أنا",isMe:true};
        var oldByName={}; if(existing) existing.participants.forEach(function(p){oldByName[p.name]=p;});
        var participants=[me].concat(names.map(function(name){var old=oldByName[name];return old?old:{id:makeId("outing-person"),name:name,isMe:false};}));
        if(existing){
var nextIds=new Set(participants.map(function(p){return p.id;})); var used=new Set(); existing.purchases.forEach(function(p){used.add(p.payerId);(p.participantIds||[]).forEach(function(x){used.add(x);});}); existing.payments.forEach(function(p){used.add(p.fromId);used.add(p.toId);});
var removed=existing.participants.some(function(p){return !nextIds.has(p.id)&&used.has(p.id);}); if(removed){showToast("لا يمكن حذف شخص مرتبط بعملية شراء أو تحويل. احذف العملية المرتبطة أولًا.",true);return;}
existing.title=title;existing.date=date;existing.participants=participants;existing.updatedAt=new Date().toISOString();
        } else { if(!Array.isArray(state.outings))state.outings=[];state.outings.unshift({id:makeId("outing"),title:title,date:date,participants:participants,purchases:[],payments:[],createdAt:new Date().toISOString()}); }
        closeDialog("outingDialog");saveState();renderOutings();showToast(existing?"تم تحديث الطلعة":"تمت إضافة الطلعة");
      }
      function openOutingPurchaseDialog(outingId){
        var outing=(state.outings||[]).find(function(x){return x.id===outingId;});if(!outing)return;activeOutingId=outingId;$("#outingPurchaseForm").reset();$("#outingPurchaseOutingId").value=outingId;$("#outingPurchaseDate").value=outing.date||toDateInput(new Date());
        $("#outingPurchasePayer").innerHTML=outing.participants.map(function(p){return '<option value="'+escapeHTML(p.id)+'">'+escapeHTML(p.name)+'</option>';}).join("");
        $("#outingPurchaseParticipants").innerHTML=outing.participants.map(function(p){return '<label class="outing-check"><input type="checkbox" name="participantId" value="'+escapeHTML(p.id)+'" checked><span>'+escapeHTML(p.name)+'</span></label>';}).join("");
        updateOutingRecordExpenseVisibility();$("#outingPurchaseDialog").showModal();
      }
      function updateOutingRecordExpenseVisibility(){var outing=(state.outings||[]).find(function(x){return x.id===String($("#outingPurchaseOutingId")&&$("#outingPurchaseOutingId").value||activeOutingId);});var payer=outing?outingPerson(outing,$("#outingPurchasePayer").value):null;var row=$("#outingRecordExpenseRow");if(row)row.hidden=!(payer&&payer.isMe);if(!(payer&&payer.isMe)&&$("#outingRecordExpense"))$("#outingRecordExpense").checked=false;}
      function submitOutingPurchase(event){
        event.preventDefault();var data=new FormData(event.currentTarget),outing=(state.outings||[]).find(function(x){return x.id===String(data.get("outingId")||"");});if(!outing)return;
        var title=String(data.get("title")||"").trim(), cents=outingCents(data.get("amount")), payerId=String(data.get("payerId")||""),date=String(data.get("date")||outing.date||"");var participantIds=data.getAll("participantId").map(String);
        if(!title||cents<=0||!payerId||!participantIds.length){showToast("أكمل بيانات العملية وحدد المشاركين",true);return;}
        var purchase={id:makeId("outing-buy"),title:title,amountCents:cents,payerId:payerId,participantIds:participantIds,date:date,linkedExpenseId:"",createdAt:new Date().toISOString()};
        var payer=outingPerson(outing,payerId), record=data.get("recordExpense")==="on"&&payer.isMe;
        if(record){if(calendarMonthForDate(date)!==defaultMonth){showToast("إضافة العملية إلى الرصيد متاحة للشهر الحالي فقط",true);return;}var exp={id:makeId("expense"),title:title+" · "+outing.title,category:"ترفيه",visualIcon:"travel",amount:outingMoney(cents),date:date,excludeFromBudget:false,createdAt:new Date().toISOString(),accountMonth:defaultMonth,outingId:outing.id,outingPurchaseId:purchase.id};state.expenses.push(exp);state.walletBalance=roundSignedMoney(signedNumber(state.walletBalance)-exp.amount);state.walletStarted=true;addTransaction("expense",-exp.amount,exp.title,exp.date,exp.id,{outingId:outing.id,outingPurchaseId:purchase.id});purchase.linkedExpenseId=exp.id;}
        outing.purchases.push(purchase);outing.updatedAt=new Date().toISOString();closeDialog("outingPurchaseDialog");saveState();render();renderOutings();showToast(record?"تمت إضافة العملية وخصمها من الرصيد":"تمت إضافة العملية للجمعية");
      }
      function deleteOutingPurchase(outingId,purchaseId){var outing=(state.outings||[]).find(function(x){return x.id===outingId;});if(!outing)return;var p=outing.purchases.find(function(x){return x.id===purchaseId;});if(!p)return;if(!localizedConfirm('حذف عملية "'+p.title+'"؟'))return;if(p.linkedExpenseId){var exp=state.expenses.find(function(x){return x.id===p.linkedExpenseId;});if(exp&&expenseMonth(exp)===defaultMonth){state.expenses=state.expenses.filter(function(x){return x.id!==exp.id;});state.walletBalance=roundSignedMoney(signedNumber(state.walletBalance)+safeNumber(exp.amount));addTransaction("expense_reversal",safeNumber(exp.amount),"إلغاء مصروف "+exp.title,toDateInput(new Date()),exp.id,{outingId:outing.id,outingPurchaseId:p.id});}}outing.purchases=outing.purchases.filter(function(x){return x.id!==purchaseId;});outing.updatedAt=new Date().toISOString();saveState();render();renderOutings();}
      function settleOutingTransfer(outingId,fromId,toId,amountCents){var outing=(state.outings||[]).find(function(x){return x.id===outingId;});if(!outing)return;var ledger=outingLedger(outing);var match=ledger.transfers.find(function(t){return t.fromId===fromId&&t.toId===toId;});var cents=Math.min(Math.round(Number(amountCents)||0),match?match.amountCents:0);if(cents<=0){showToast("تمت تسوية هذا المبلغ بالفعل",true);return;}outing.payments.push({id:makeId("outing-pay"),fromId:fromId,toId:toId,amountCents:cents,paidAt:new Date().toISOString()});outing.updatedAt=new Date().toISOString();saveState();renderOutings();showToast("تم تسجيل التحويل في الجمعية");}
      function undoOutingPayment(outingId,paymentId){var outing=(state.outings||[]).find(function(x){return x.id===outingId;});if(!outing)return;outing.payments=outing.payments.filter(function(x){return x.id!==paymentId;});outing.updatedAt=new Date().toISOString();saveState();renderOutings();showToast("تم التراجع عن تحديد التحويل");}
      function deleteOuting(outingId){var outing=(state.outings||[]).find(function(x){return x.id===outingId;});if(!outing)return;if(!localizedConfirm('حذف جمعية "'+outing.title+'"؟ ستبقى المصروفات التي سُجلت في مدير الراتب محفوظة لأنها عمليات مالية فعلية.'))return;state.outings=state.outings.filter(function(x){return x.id!==outingId;});saveState();renderOutings();showToast("تم حذف الجمعية");}
      function renderOutings(){
        var root=$("#outingList");if(!root)return;var list=normalizeOutings(state.outings);state.outings=list;if(!list.length){root.innerHTML='<div class="outing-empty">لا توجد طلعات بعد. أضف أول طلعة ثم سجل الأشخاص والعمليات.</div>';return;}
        root.innerHTML=list.map(function(o){var ledger=outingLedger(o);var purchases=o.purchases.length?o.purchases.map(function(p){var payer=outingPerson(o,p.payerId);return '<div class="outing-purchase"><div class="outing-purchase-main"><strong>'+escapeHTML(p.title)+'</strong><small>دفع: '+escapeHTML(payer.name)+' · المشاركون: '+escapeHTML(outingParticipantNames(o,p.participantIds))+(p.linkedExpenseId?' · مسجل في الرصيد':'')+'</small></div><div><div class="outing-purchase-amount">'+moneyHTML(outingMoney(p.amountCents))+'</div><button class="mini-btn" type="button" data-outing-delete-purchase="'+escapeHTML(o.id)+'" data-purchase-id="'+escapeHTML(p.id)+'">حذف</button></div></div>';}).join(''):'<div class="outing-empty">لا توجد عمليات شراء بعد.</div>';
var transfers=ledger.transfers.length?ledger.transfers.map(function(t){return '<div class="outing-transfer"><div class="outing-transfer-main"><strong>'+escapeHTML(outingPerson(o,t.fromId).name)+' ← يحول إلى ← '+escapeHTML(outingPerson(o,t.toId).name)+'</strong><small>المبلغ المتبقي المطلوب تحويله</small></div><div><div class="outing-transfer-amount">'+moneyHTML(outingMoney(t.amountCents))+'</div><button class="mini-btn mark-paid" type="button" data-outing-settle="'+escapeHTML(o.id)+'" data-from-id="'+escapeHTML(t.fromId)+'" data-to-id="'+escapeHTML(t.toId)+'" data-amount-cents="'+t.amountCents+'">✓ تم التحويل</button></div></div>';}).join(''):'<div class="outing-empty">✓ جميع المبالغ متوازنة حاليًا.</div>';
var payments=o.payments.length?o.payments.slice().reverse().map(function(p){return '<div class="outing-payment"><div><strong>✓ '+escapeHTML(outingPerson(o,p.fromId).name)+' → '+escapeHTML(outingPerson(o,p.toId).name)+'</strong><small>'+escapeHTML(formatDateTimeCompact(p.paidAt))+'</small></div><div><strong>'+moneyHTML(outingMoney(p.amountCents))+'</strong> <button class="mini-btn" type="button" data-outing-undo-payment="'+escapeHTML(o.id)+'" data-payment-id="'+escapeHTML(p.id)+'">تراجع</button></div></div>';}).join(''):'';
return '<details class="outing-card"><summary><div class="outing-card-title"><strong>'+escapeHTML(o.title)+'</strong><small>'+escapeHTML(formatDate(o.date))+' · '+o.participants.length+' أشخاص · '+o.purchases.length+' عمليات</small></div><div class="outing-total"><small>إجمالي الطلعة</small><strong>'+moneyHTML(outingMoney(ledger.totalCents))+'</strong></div></summary><div class="outing-body"><div class="outing-participants">'+o.participants.map(function(p){return '<span class="outing-chip">'+escapeHTML(p.name)+'</span>';}).join('')+'</div><div class="outing-actions"><button class="primary-btn" type="button" data-outing-add-purchase="'+escapeHTML(o.id)+'">+ عملية شراء</button><button class="soft-btn" type="button" data-outing-edit="'+escapeHTML(o.id)+'">تعديل الأشخاص</button><button class="ghost-btn" type="button" data-outing-delete="'+escapeHTML(o.id)+'">حذف الطلعة</button></div><div class="outing-subtitle"><h4>العمليات</h4><small>'+o.purchases.length+' عملية</small></div>'+purchases+'<div class="outing-subtitle"><h4>من يحول لمن؟</h4><small>يتحدث فورًا مع كل عملية أو تحويل</small></div>'+transfers+(payments?'<div class="outing-subtitle"><h4>التحويلات المنجزة</h4><small>المبالغ المظللة تم تسجيلها كمحوّلة</small></div>'+payments:'')+'</div></details>';
        }).join('');
      }

'''
index = replace_once(index, normalize_anchor, helpers + normalize_anchor, 'integrity/outings helpers')

# Load outings from saved state.
deposit_load = '''        state.deposits = Array.isArray(saved.deposits) ? saved.deposits.map(function (item) {\n          return Object.assign({}, item || {}, { amount: roundMoney(item && item.amount), date: String(item && item.date || ""), source: String(item && item.source || "أخرى") });\n        }).filter(function (item) { return item.amount > 0 && item.date; }) : [];'''
index = replace_once(index, deposit_load, deposit_load + '\n        state.outings = normalizeOutings(saved.outings);', 'load outings')

# Repair only from a trusted running-balance anchor (salary or manual balance adjustment).
norm_marker = '        ensureWalletCalendarCurrent(false);\n        return true;\n      }\n\n      function saveState() {'
index = replace_once(index, norm_marker, '        ensureWalletCalendarCurrent(false);\n        repairWalletBalanceIntegrity("load");\n        return true;\n      }\n\n      function saveState() {', 'normalize integrity repair')
index = replace_once(index, '      function saveState() {\n        try {', '      function saveState() {\n        try {\n          repairWalletBalanceIntegrity("save");', 'save integrity repair')

# ---------------- statement search ----------------
statement_helper_anchor = '      function statementSignedHTML(value, forcePlus) {'
statement_helpers = r'''      function normalizeStatementSearch(value){return String(value||"").toLowerCase().replace(/[أإآ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي").replace(/\s+/g," ").trim();}
      function statementRowMatchesQuery(row,query){if(!query)return true;var item=row&&row.item||{};var hay=normalizeStatementSearch([item.title||"",item.type||"",item.date||"",formatMoney(Math.abs(signedNumber(row&&row.amount))),formatMoney(Math.abs(signedNumber(row&&row.balanceAfter)))].join(" "));return hay.indexOf(query)!==-1;}

'''
index = replace_once(index, statement_helper_anchor, statement_helpers + statement_helper_anchor, 'statement search helpers')
index = replace_once(index, '          var rowsNewest = audit.rows.slice().reverse();\n          var txHtml = rowsNewest.length ? rowsNewest.map(statementTransactionHTML).join("") : \'<p class="item-meta" style="padding:14px">لا توجد حركات مالية مسجلة في هذا الشهر.</p>\';', '          var allRowsNewest = audit.rows.slice().reverse();\n          var query = normalizeStatementSearch(statementSearchQuery);\n          var rowsNewest = query ? allRowsNewest.filter(function(row){ return statementRowMatchesQuery(row, query); }) : allRowsNewest;\n          var txHtml = rowsNewest.length ? rowsNewest.map(statementTransactionHTML).join("") : \'<p class="item-meta" style="padding:14px">\' + (query ? \'لا توجد عمليات مطابقة للبحث في هذا الشهر.\' : \'لا توجد حركات مالية مسجلة في هذا الشهر.\') + \'</p>\';', 'statement rows filtering')

# ---------------- salary automation guard (client) ----------------
record_anchor = '      async function recordAutomationImport(item, kind, options) {'
salary_client = r'''      function automationLooksLikeSalaryLocal(item){var text=normalizeArabicSpeechText(String(item&&item.merchant||"")+" "+String(item&&item.rawText||""));return /(?:^|\s)(?:salary|payroll|راتب|الراتب|رواتب)(?:\s|$)/i.test(text);}
      function salaryTransactionForAutomation(item,date){var month=calendarMonthForDate(date),amount=roundMoney(item&&item.amount);var txs=(state.transactions||[]).filter(function(tx){return (tx.type==="salary"||tx.type==="initial_salary")&&String(tx.month||calendarMonthForDate(tx.date))===month;});if(!txs.length)return null;txs.sort(function(a,b){var aa=Math.abs(roundMoney(a.amount)-amount),bb=Math.abs(roundMoney(b.amount)-amount);if(aa!==bb)return aa-bb;return Math.abs(new Date(a.date||0)-new Date(date||0))-Math.abs(new Date(b.date||0)-new Date(date||0));});return txs[0]||null;}
      function confirmSalaryAutomationLocal(item,date){var tx=salaryTransactionForAutomation(item,date);if(!tx)return null;var imported=roundMoney(item.amount),before=roundMoney(tx.amount),delta=roundSignedMoney(imported-before);tx.amount=imported;tx.bankConfirmed=true;tx.bankConfirmedAt=new Date().toISOString();tx.bankConfirmationDate=date;tx.bankConfirmationMerchant=String(item.merchant||"");tx.externalImportId=tx.externalImportId||String(item.id||"");tx.externalImportIds=Array.from(new Set((Array.isArray(tx.externalImportIds)?tx.externalImportIds:[]).concat([String(item.id||"")])));if(Math.abs(delta)>=.005)state.walletBalance=roundSignedMoney(signedNumber(state.walletBalance)+delta);var key=String(tx.paydayKey||"");if(key&&state.processedPaydays&&state.processedPaydays[key]){var rec=state.processedPaydays[key];rec.salary=imported;if(Number.isFinite(Number(rec.balanceAfterSalary)))rec.balanceAfterSalary=roundSignedMoney(Number(rec.balanceAfterSalary)+delta);if(Number.isFinite(Number(rec.balanceAfterCommitments)))rec.balanceAfterCommitments=roundSignedMoney(Number(rec.balanceAfterCommitments)+delta);rec.bankConfirmedAt=tx.bankConfirmedAt;}return {transaction:tx,delta:delta};}
      function automationBankBalanceLocal(item){var text=String(item&&item.rawText||"").replace(/,/g,"");var m=/(?:available\s+balance|current\s+balance|balance\s+is|الرصيد\s+(?:المتاح|الحالي)|رصيدك\s+(?:المتاح|الحالي))[^0-9]{0,30}([0-9]{1,10}(?:\.\d{1,2})?)/i.exec(text);var n=m?Number(m[1]):NaN;return Number.isFinite(n)?roundMoney(n):null;}

'''
index = replace_once(index, record_anchor, salary_client + record_anchor, 'salary client helpers')
record_date_anchor = '        var date = toDateInput(when);\n        if (calendarMonthForDate(date) !== defaultMonth)'
record_date_new = '        var date = toDateInput(when);\n        if (kind === "deposit" && automationLooksLikeSalaryLocal(item)) {\n          var salaryConfirmation = confirmSalaryAutomationLocal(item, date);\n          if (!salaryConfirmation) { if (!options.silent) showToast("تم التعرف على راتب. أكمل دورة نزول الراتب أولًا ثم اعتمد رسالة البنك حتى لا يُحتسب مرتين.", true); return false; }\n          try { await resolveAutomationImport(importId, "accepted", "deposit"); } catch (_) {}\n          saveState(); render();\n          if (!options.silent) showToast(Math.abs(salaryConfirmation.delta) >= .005 ? "تم تأكيد الراتب من البنك وتطبيق الفرق فقط دون تكرار الراتب" : "تم تأكيد نزول الراتب من البنك دون إضافته مرة ثانية");\n          return true;\n        }\n        if (calendarMonthForDate(date) !== defaultMonth)'
index = replace_once(index, record_date_anchor, record_date_new, 'client salary guard')

# Bank balance warning in pending review.
pending_raw = '          var raw = String(item.rawText || "").trim();'
pending_new = pending_raw + '\n          var bankBalance = automationBankBalanceLocal(item);\n          if (bankBalance != null) { var projected = roundSignedMoney(signedNumber(state.walletBalance) + (kind === "expense" ? -amount : kind === "deposit" && !automationLooksLikeSalaryLocal(item) ? amount : 0)); var bankDiff = roundSignedMoney(bankBalance - projected); if (Math.abs(bankDiff) >= .01) meta += " · تنبيه رصيد البنك: " + formatMoney(bankBalance) + " (فرق " + formatMoney(Math.abs(bankDiff)) + ")"; else meta += " · رصيد البنك مطابق"; }'
index = replace_once(index, pending_raw, pending_new, 'bank balance warning')

# ---------------- events ----------------
bind_anchor = '      function bindEvents() {'
index = replace_once(index, bind_anchor, bind_anchor + '\n        $("#outingForm").addEventListener("submit", submitOuting);\n        $("#outingPurchaseForm").addEventListener("submit", submitOutingPurchase);\n        $("#addOutingButton").addEventListener("click", function(){ outingOpenDialog(null); });\n        $("#outingPurchasePayer").addEventListener("change", updateOutingRecordExpenseVisibility);\n        $("#statementSearchInput").addEventListener("input", function(event){ statementSearchQuery=String(event.target.value||""); renderStatements(); });\n        $("#outingList").addEventListener("click", function(event){ var add=event.target.closest("[data-outing-add-purchase]"),edit=event.target.closest("[data-outing-edit]"),del=event.target.closest("[data-outing-delete]"),delp=event.target.closest("[data-outing-delete-purchase]"),settle=event.target.closest("[data-outing-settle]"),undo=event.target.closest("[data-outing-undo-payment]"); if(add){openOutingPurchaseDialog(add.dataset.outingAddPurchase);return;} if(edit){var o=(state.outings||[]).find(function(x){return x.id===edit.dataset.outingEdit;});if(o)outingOpenDialog(o);return;} if(del){deleteOuting(del.dataset.outingDelete);return;} if(delp){deleteOutingPurchase(delp.dataset.outingDeletePurchase,delp.dataset.purchaseId);return;} if(settle){settleOutingTransfer(settle.dataset.outingSettle,settle.dataset.fromId,settle.dataset.toId,Number(settle.dataset.amountCents));return;} if(undo){undoOutingPayment(undo.dataset.outingUndoPayment,undo.dataset.paymentId);return;} });', 'outings/search event bindings')
index = replace_once(index, '          tab.addEventListener("click", function () { setView(tab.dataset.view); });', '          tab.addEventListener("click", function () { setView(tab.dataset.view); if (tab.dataset.view === "outingsView") renderOutings(); });', 'outings tab render')
index = replace_once(index, '          } else if (activeView === "statementsView") {\n            showToast("كشف الحساب يُحفظ تلقائيًا مع بداية كل شهر");', '          } else if (activeView === "statementsView") {\n            $("#statementSearchInput").focus();\n          } else if (activeView === "outingsView") {\n            outingOpenDialog(null);', 'mobile fab outings')

# Validate key UI markers in index.
for needle in ['جمعية الطلعات','id="statementSearchInput"','function repairWalletBalanceIntegrity','function outingLedger','function automationLooksLikeSalaryLocal','data-outing-settle','state.outings = normalizeOutings(saved.outings)']:
    require(index, needle, needle)
write(INDEX, index)

# ---------------- worker salary guard + version ----------------
worker = read(WORKER)
require(worker, 'const VERSION = "3.9.4";', 'worker version')
require(worker, 'const RELEASE_ID = "' + OLD + '";', 'worker r14')
worker = worker.replace('const VERSION = "3.9.4";', 'const VERSION = "3.9.5";', 1)
worker = worker.replace('const RELEASE_ID = "' + OLD + '";', 'const RELEASE_ID = "' + NEW + '";', 1)
worker, n = re.subn(r'const UPDATE_SIGNAL_VERSION = "3\.9\.4[^"]*";', lambda m: 'const UPDATE_SIGNAL_VERSION = "3.9.5' + chr(0x2068) + '";', worker, count=1)
if n != 1: raise SystemExit('Could not bump UPDATE_SIGNAL_VERSION')

normalize_payload_anchor = 'function automationSources(item) {'
worker_helpers = r'''function automationLooksLikeSalary(item) {
  const text = normalizeAutomationText(`${item?.merchant || ""} ${item?.rawText || ""}`).toLowerCase();
  return /(?:^|\s)(?:salary|payroll|راتب|الراتب|رواتب)(?:\s|$)/i.test(text);
}

'''
worker = replace_once(worker, normalize_payload_anchor, worker_helpers + normalize_payload_anchor, 'worker salary helper')

# Support the new accepted kind.
worker = worker.replace('stored.acceptedKind = kind === "commitment_confirmation" ? "commitment_confirmation" : (kind === "deposit" ? "deposit" : "expense");', 'stored.acceptedKind = kind === "salary_confirmation" ? "salary_confirmation" : (kind === "commitment_confirmation" ? "commitment_confirmation" : (kind === "deposit" ? "deposit" : "expense"));', 1)

deposit_apply_anchor = '''      if (kind === "deposit") {\n        const title = merchant || "إيداع من البنك";'''
salary_server = r'''      if (kind === "deposit" && automationLooksLikeSalary(item)) {
        const salaryTxs = state.transactions.filter(tx => (tx?.type === "salary" || tx?.type === "initial_salary") && String(tx?.month || String(tx?.date || "").slice(0,7)) === month);
        if (!salaryTxs.length) return json({ ok:true, applied:false, reason:"SALARY_REQUIRES_REVIEW" });
        salaryTxs.sort((a,b) => Math.abs(Number(a?.amount || 0)-amount) - Math.abs(Number(b?.amount || 0)-amount));
        const salaryTx = salaryTxs[0];
        const previousSalary = Math.round(Number(salaryTx.amount || 0) * 100) / 100;
        const delta = Math.round((amount - previousSalary) * 100) / 100;
        salaryTx.amount = amount;
        salaryTx.bankConfirmed = true;
        salaryTx.bankConfirmedAt = new Date().toISOString();
        salaryTx.bankConfirmationDate = date;
        salaryTx.bankConfirmationMerchant = merchant;
        salaryTx.externalImportId = salaryTx.externalImportId || importId;
        salaryTx.externalImportIds = [...new Set([...(Array.isArray(salaryTx.externalImportIds) ? salaryTx.externalImportIds : []), importId])];
        if (Math.abs(delta) >= .005) state.walletBalance = Math.round((Number(state.walletBalance || 0) + delta) * 100) / 100;
        const paydayKey = String(salaryTx.paydayKey || "");
        if (paydayKey && state.processedPaydays?.[paydayKey]) {
const rec = state.processedPaydays[paydayKey];
rec.salary = amount;
if (Number.isFinite(Number(rec.balanceAfterSalary))) rec.balanceAfterSalary = Math.round((Number(rec.balanceAfterSalary) + delta) * 100) / 100;
if (Number.isFinite(Number(rec.balanceAfterCommitments))) rec.balanceAfterCommitments = Math.round((Number(rec.balanceAfterCommitments) + delta) * 100) / 100;
rec.bankConfirmedAt = salaryTx.bankConfirmedAt;
        }
        const current = await this.ctx.storage.get("state");
        if (current) await this.ctx.storage.put(`history:${Date.now()}:${crypto.randomUUID()}`, current);
        const now = new Date().toISOString();
        const revision = Number(await this.ctx.storage.get("revision") || 0) + 1;
        await this.ctx.storage.put("state", state); await this.ctx.storage.put("updatedAt", now); await this.ctx.storage.put("revision", revision);
        const message = JSON.stringify({ type:"revision", revision, updatedAt:now }); for (const socket of this.ctx.getWebSockets()) { try { socket.send(message); } catch (_) {} }
        return json({ ok:true, applied:true, acceptedKind:"salary_confirmation", salaryConfirmed:true, balanceChanged:Math.abs(delta)>=.005, delta, revision, updatedAt:now });
      }

      if (kind === "deposit") {
        const title = merchant || "إيداع من البنك";'''
worker = replace_once(worker, deposit_apply_anchor, salary_server, 'server salary guard')
require(worker, 'acceptedKind:"salary_confirmation"', 'salary confirmation response')
write(WORKER, worker)

# SW + package
sw = read(SW)
sw = replace_once(sw, 'salary-manager-v3.9.4-automation-review-edit-r14', 'salary-manager-v3.9.5-balance-integrity-outings-r1', 'service worker cache')
write(SW, sw)
pkg = json.loads(read(PACKAGE)); pkg['version'] = '3.9.5'; write(PACKAGE, json.dumps(pkg, ensure_ascii=False, indent=2) + '\n')
print('3.9.5 balance integrity + statement search + outings applied')
