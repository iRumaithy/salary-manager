from pathlib import Path
import re

INDEX = Path("public/index.html")
WORKER = Path("src/worker.js")
SW = Path("public/sw.js")
PACKAGE = Path("package.json")

OLD = "3.9.5-outings-live-netting-r3"
NEW = "3.9.6-history-payday-order-r1"

def read(path):
    return path.read_text(encoding="utf-8")

def write(path, text):
    path.write_text(text, encoding="utf-8")

def require(text, needle, label):
    if needle not in text:
        raise SystemExit("Missing anchor: " + label)

index = read(INDEX)

require(index, OLD, "r3 release id")
require(index, "function processPayday(choice)", "processPayday")
require(index, "async function recordAutomationImport(item, kind, options)", "recordAutomationImport")
require(index, "function transactionsForMonth(monthKey)", "transactionsForMonth")
index = index.replace(OLD, NEW)
require(index, 'var APP_VERSION = "3.9.5";', "app version 3.9.5")
index = index.replace('var APP_VERSION = "3.9.5";', 'var APP_VERSION = "3.9.6";', 1)

old_transactions_for_month = '''      function transactionsForMonth(monthKey) {
        return (Array.isArray(state.transactions) ? state.transactions : []).filter(function (tx) { return String(tx.month || calendarMonthForDate(tx.date)) === monthKey; });
      }'''
new_transactions_for_month = '''      function transactionsForMonth(monthKey) {
        return (Array.isArray(state.transactions) ? state.transactions : []).filter(function (tx) {
          if (tx && tx.hiddenFromStatement) return false;
          return String(tx.month || calendarMonthForDate(tx.date)) === monthKey;
        });
      }'''
require(index, old_transactions_for_month, "transactionsForMonth exact block")
index = index.replace(old_transactions_for_month, new_transactions_for_month, 1)

automation_anchor = '''      async function recordAutomationImport(item, kind, options) {'''
require(index, automation_anchor, "automation function anchor")

historical_helpers = r'''
      // r4 — allow previous-month imports after the calendar rolls over.
      function refreshArchivedStatementAfterLateImport(monthKey) {
        monthKey = String(monthKey || "");
        if (!/^\d{4}-\d{2}$/.test(monthKey)) return;
        if (!state.statements || typeof state.statements !== "object") state.statements = {};

        var previous = state.statements[monthKey] ? Object.assign({}, state.statements[monthKey]) : null;
        if (state.statements[monthKey]) delete state.statements[monthKey];
        archiveMonth(monthKey);

        var st = state.statements[monthKey];
        if (!st) return;
        if (previous && previous.archivedAt) st.archivedAt = previous.archivedAt;
        if (previous && Object.prototype.hasOwnProperty.call(previous, "savingsBalanceAtClose")) st.savingsBalanceAtClose = previous.savingsBalanceAtClose;
        if (previous && Object.prototype.hasOwnProperty.call(previous, "pendingReimbursementsAtClose")) st.pendingReimbursementsAtClose = previous.pendingReimbursementsAtClose;

        var opening = signedNumber(st.openingBalance);
        var net = (Array.isArray(st.transactions) ? st.transactions : []).reduce(function(sum, tx) {
          return roundSignedMoney(sum + signedNumber(tx && tx.amount));
        }, 0);
        st.closingBalance = roundSignedMoney(opening + net);
      }

      function applyLatePreviousMonthCashDelta(operationMonth, delta, importId) {
        operationMonth = String(operationMonth || "");
        delta = roundSignedMoney(delta);
        if (!delta || operationMonth === defaultMonth) {
          if (operationMonth && operationMonth !== defaultMonth) refreshArchivedStatementAfterLateImport(operationMonth);
          return;
        }

        if (!state.monthOpeningBalances || typeof state.monthOpeningBalances !== "object") state.monthOpeningBalances = {};
        var currentOpening = state.monthOpeningBalances[defaultMonth];
        if (currentOpening == null) currentOpening = state.walletMonthOpeningBalance;
        state.monthOpeningBalances[defaultMonth] = roundSignedMoney(signedNumber(currentOpening) + delta);
        state.walletMonthOpeningBalance = roundSignedMoney(signedNumber(state.walletMonthOpeningBalance) + delta);

        refreshArchivedStatementAfterLateImport(operationMonth);

        addTransaction("historical_carry_anchor", 0, "تسوية داخلية لعملية من الشهر السابق", toDateInput(new Date()), "", {
          hiddenFromStatement:true,
          balanceAfter:roundSignedMoney(state.walletBalance),
          historicalMonth:operationMonth,
          historicalDelta:delta,
          externalImportId:String(importId || ""),
          carryCorrection:true
        });
      }

'''
index = index.replace(automation_anchor, historical_helpers + automation_anchor, 1)

date_anchor = '''        var when = automationImportDate(item);
        var date = toDateInput(when);'''
date_replacement = '''        var when = automationImportDate(item);
        var date = toDateInput(when);
        var operationMonth = calendarMonthForDate(date);
        var previousMonth = shiftMonth(defaultMonth, -1);
        var latePreviousMonth = operationMonth === previousMonth;
        if (operationMonth !== defaultMonth && !latePreviousMonth) {
          if (!options.silent) showToast("يمكن اعتماد عمليات الشهر الحالي أو الشهر السابق فقط.", true);
          return false;
        }'''
require(index, date_anchor, "automation date anchor")
index = index.replace(date_anchor, date_replacement, 1)

salary_confirmation_anchor = '''          var salaryConfirmation = confirmSalaryAutomationLocal(item, date);
          if (!salaryConfirmation) { if (!options.silent) showToast("تم التعرف على راتب. أكمل دورة نزول الراتب أولًا ثم اعتمد رسالة البنك حتى لا يُحتسب مرتين.", true); return false; }
          try { await resolveAutomationImport(importId, "accepted", "deposit"); } catch (_) {}'''
salary_confirmation_replacement = '''          var salaryConfirmation = confirmSalaryAutomationLocal(item, date);
          if (!salaryConfirmation) { if (!options.silent) showToast("تم التعرف على راتب. اختر أولًا إبقاء الرصيد السابق أو تحويله للمدخرات؛ بعدها يُضاف الراتب ثم تُخصم السلف والأقساط، وبعد ذلك اعتمد رسالة البنك للتأكيد فقط.", true); return false; }
          if (latePreviousMonth) {
            if (Math.abs(salaryConfirmation.delta) >= .005) applyLatePreviousMonthCashDelta(operationMonth, salaryConfirmation.delta, importId);
            else refreshArchivedStatementAfterLateImport(operationMonth);
          }
          try { await resolveAutomationImport(importId, "accepted", "deposit"); } catch (_) {}'''
require(index, salary_confirmation_anchor, "salary confirmation block")
index = index.replace(salary_confirmation_anchor, salary_confirmation_replacement, 1)

old_archived_rejection = '''        if (calendarMonthForDate(date) !== defaultMonth) { if (!options.silent) showToast("هذه العملية تخص شهرًا مؤرشفًا. لم يتم تعديل كشف سابق تلقائيًا؛ سجّلها يدويًا إذا لزم.", true); return false; }'''
require(index, old_archived_rejection, "old archived rejection")
index = index.replace(old_archived_rejection, '''        // r4: previous-month dated operations are valid and carried forward safely.''', 1)

commitment_confirm_anchor = '''          confirmAutomationCommitment(item, chosenMatch);
          saveState();
          render();'''
commitment_confirm_replacement = '''          confirmAutomationCommitment(item, chosenMatch);
          if (latePreviousMonth) refreshArchivedStatementAfterLateImport(operationMonth);
          saveState();
          render();'''
require(index, commitment_confirm_anchor, "manual commitment confirmation")
index = index.replace(commitment_confirm_anchor, commitment_confirm_replacement, 1)

auto_commitment_anchor = '''          confirmAutomationCommitment(item, commitmentMatch.strict);
          saveState();
          render();'''
auto_commitment_replacement = '''          confirmAutomationCommitment(item, commitmentMatch.strict);
          if (latePreviousMonth) refreshArchivedStatementAfterLateImport(operationMonth);
          saveState();
          render();'''
require(index, auto_commitment_anchor, "auto commitment confirmation")
index = index.replace(auto_commitment_anchor, auto_commitment_replacement, 1)

expense_account_anchor = '''accountMonth:defaultMonth, externalImportId:importId'''
require(index, expense_account_anchor, "automation expense accountMonth")
index = index.replace(expense_account_anchor, '''accountMonth:operationMonth, externalImportId:importId''', 1)

save_anchor = '''        saveState();
        render();
        try { await resolveAutomationImport(importId, "accepted", kind); }'''
save_replacement = '''        if (latePreviousMonth) {
          applyLatePreviousMonthCashDelta(operationMonth, kind === "deposit" ? amount : -amount, importId);
        }
        saveState();
        render();
        try { await resolveAutomationImport(importId, "accepted", kind); }'''
require(index, save_anchor, "automation final save")
index = index.replace(save_anchor, save_replacement, 1)

payday_phase_pattern = re.compile(
    r'''        // 1\) نحسم مصير الرصيد السابق أولًا، لكن لا نخصم أي قسط بعد\.
        if \(choice === "savings" && carry > 0\) \{
          movedToSavings = carry;
          state\.savingsBalance = roundMoney\(savingsBefore \+ carry\);
          addTransaction\("savings_transfer", -carry, "ترحيل الرصيد السابق إلى المدخرات", paydayKey, "", \{ savingsDelta: carry, source: "payday-carry", paydayKey: paydayKey \}\);
        \}

        // 2\) نسجل الراتب كاملًا أولًا\. هذا الترتيب مقصود لمنع أخطاء الخصم قبل إضافة الراتب\.
        var balanceAfterCarry = choice === "savings" && carry > 0 \? 0 : carry;
        var balanceAfterSalary = roundSignedMoney\(balanceAfterCarry \+ salaryAdded\);
        addTransaction\("salary", salaryAdded, "نزول الراتب", paydayKey, "", \{ paydayKey: paydayKey, balanceBefore:balanceAfterCarry, balanceAfter:balanceAfterSalary \}\);''',
    re.S
)

payday_phase_replacement = '''        // 1) يقرر المستخدم مصير الرصيد السابق أولًا.
        var balanceAfterCarry = carry;
        if (choice === "savings" && carry > 0) {
          movedToSavings = carry;
          state.savingsBalance = roundMoney(savingsBefore + carry);
          balanceAfterCarry = 0;
        }
        state.walletBalance = roundSignedMoney(balanceAfterCarry);
        if (movedToSavings > 0) {
          addTransaction("savings_transfer", -movedToSavings, "ترحيل الرصيد السابق إلى المدخرات", paydayKey, "", {
            savingsDelta:movedToSavings,
            source:"payday-carry",
            paydayKey:paydayKey,
            balanceBefore:carry,
            balanceAfter:state.walletBalance,
            paydayPhase:1
          });
        }

        // 2) بعد تثبيت قرار الرصيد السابق فقط، يضاف الراتب كاملًا.
        var balanceAfterSalary = roundSignedMoney(state.walletBalance + salaryAdded);
        state.walletBalance = balanceAfterSalary;
        addTransaction("salary", salaryAdded, "نزول الراتب", paydayKey, "", {
          paydayKey:paydayKey,
          balanceBefore:balanceAfterCarry,
          balanceAfter:balanceAfterSalary,
          paydayPhase:2,
          paydayOrder:"carry-salary-commitments-v2"
        });'''

index, count = payday_phase_pattern.subn(payday_phase_replacement, index, count=1)
if count != 1:
    raise SystemExit("Could not replace payday phase 1+2 block")

choice_anchor = '''          choice: choice === "savings" ? "savings" : "keep"
        };'''
choice_replacement = '''          choice: choice === "savings" ? "savings" : "keep",
          paydayOrder: "carry-salary-commitments-v2"
        };'''
require(index, choice_anchor, "processed payday choice")
index = index.replace(choice_anchor, choice_replacement, 1)

for needle in [
    '3.9.6-history-payday-order-r1',
    'carry-salary-commitments-v2',
    'applyLatePreviousMonthCashDelta',
    'hiddenFromStatement:true',
    'يمكن اعتماد عمليات الشهر الحالي أو الشهر السابق فقط',
    'accountMonth:operationMonth'
]:
    require(index, needle, needle)

write(INDEX, index)

worker = read(WORKER)
require(worker, 'const VERSION = "3.9.5";', "worker version 3.9.5")
worker = worker.replace('const VERSION = "3.9.5";', 'const VERSION = "3.9.6";', 1)
require(worker, 'const RELEASE_ID = "' + OLD + '";', "worker r3 release")
worker = worker.replace(
    'const RELEASE_ID = "' + OLD + '";',
    'const RELEASE_ID = "' + NEW + '";',
    1
)
worker, n = re.subn(
    r'const UPDATE_SIGNAL_VERSION = "3\.9\.5[^"]*";',
    lambda _: 'const UPDATE_SIGNAL_VERSION = "3.9.6' + chr(0x2067) + '";',
    worker,
    count=1
)
if n != 1:
    raise SystemExit("Could not bump update signal")
write(WORKER, worker)

sw = read(SW)
require(sw, "salary-manager-v3.9.5-outings-live-netting-r3", "sw r3 cache")
sw = sw.replace(
    "salary-manager-v3.9.5-outings-live-netting-r3",
    "salary-manager-v3.9.6-history-payday-order-r1",
    1
)
write(SW, sw)


package = read(PACKAGE)
require(package, '"version": "3.9.5"', "package version 3.9.5")
package = package.replace('"version": "3.9.5"', '"version": "3.9.6"', 1)
write(PACKAGE, package)

print("3.9.6 r1 previous-month imports + strict payday order applied")
